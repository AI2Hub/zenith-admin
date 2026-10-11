# 业务模块接入编号中心

用于新增单据编号、替换业务内手写编号、配置编号规则、接入流程或支付取号。编号中心属于 `platform`，入口为「系统管理 → 编号规则」。

## 权威位置

| 内容 | 位置 |
| --- | --- |
| 场景约束与允许的参数 | `packages/shared/src/platform/numbering-scenes.ts` |
| 模板解析、校验、预览、日期周期 | `packages/shared/src/platform/numbering.ts` |
| 规则与管理 API | `packages/shared/src/platform/contracts/numbering.ts` |
| 请求校验与配置类型 | `packages/shared/src/platform/numbering-validation.ts`（独立叶子，避免进入首屏公共校验依赖） |
| 数据表 | `packages/server/src/db/schema/numbering.ts` |
| 事务内分配、版本解析与业务关联 | `packages/server/src/services/platform/numbering-runtime.ts` |
| 默认规则与绑定 | `packages/shared/src/seed/numbering.ts` |

开始前按 Zenith 入口读取相应层的 constraints；本文件只补充编号独有约束。

## 1. 声明业务场景

在平台常量 `NUMBERING_SCENE_CODES` 与 `NUMBERING_SCENES` 登记稳定场景码，例如 `biz.contract`。声明显示名、编号唯一命名空间及范围、允许的流水范围、字符集、最大长度、可用参数、是否允许租户自定义。场景是代码契约，管理页面不能创建任意表或放宽这些约束。

**流水范围与唯一范围分开设计**：计数器可按租户/业务对象/组织分开，但最终号码是否允许重复由业务表和场景的唯一范围决定。共享同一编号列的不同操作使用同一 `uniqueNamespace`，例如支付订单、周期扣款、预授权转支付。业务表必须保留与该语义一致的唯一约束。

默认规则在 shared seed 登记；服务端 seed 按规则编码查找实际 ID，再绑定实际发布版本。不要在业务代码内隐式创建默认规则、固定引用 seed 数字 ID、随机兜底或回退旧格式。

## 2. 明确取号时机和幂等身份

编号用于可读的业务单据标识；数据库主键、访问凭证、第三方返回的流水号使用各自既有机制。

为每个会产生新单据的业务操作定义稳定 `allocationKey`：

- 已有主表 ID：`String(entity.id)`。
- 周期执行：协议 ID + 期数，而不是每次执行的时间或随机值。
- 一个主体多次操作：主体 ID + 已持久化的操作/轮次标识。

业务已有请求幂等/请求内容校验时继续保留，编号幂等不替代业务幂等。相同分配键重试返回原编号；已提交号码作废后也不回收。取号时机按实体语义确定：工作流实例的草稿不取号，首次正式提交才取号；请假单创建即形成独立业务单据，虽处于可编辑的 `draft` 状态，仍在创建事务中取得业务单号。不要按名称包含“草稿”就一概延后取号。

## 3. 在业务事务内分配并关联

```ts
import { allocateBusinessNumber, attachBusinessNumber } from '../platform/numbering-runtime';

await db.transaction(async (tx) => {
  // 此处先执行该业务需要的行锁、状态与额度等校验。
  const number = await allocateBusinessNumber(tx, {
    scene: 'your.registered.scene', // 换成已登记的场景码
    tenantId: businessTenantId,
    ownerKey: businessOwnerKey,     // 工作流为流程定义 ID；非 owner 场景可省略
    allocationKey: stableOperationKey,
    context: trustedParameters,
  });
  const [entity] = await tx.insert(businessTable).values({ ...businessValues, number }).returning();
  await attachBusinessNumber(tx, {
    scene: 'your.registered.scene', tenantId: businessTenantId,
    ownerKey: businessOwnerKey, number, businessKey: String(entity.id),
  });
  return entity;
});
```

以上为替换占位符后的接入模式，具体字段依实体契约。主键需要先确定时，可在同一事务先插入尚未取号的草稿/实例，再分配、更新，提交时业务与编号共同可见。

- 调用方必须传 `DbTransaction`；编号服务不能自己开事务或使用全局连接池代替调用方事务。
- `tenantId`、`ownerKey` 和身份参数来自服务端已验证的业务对象与真实发起人。定时/自动/子流程不能依赖当前 HTTP 用户。
- 模板需要的值先经业务适配器解析成声明过的参数；缺失参数报错，不替换成空字符串。
- `attachBusinessNumber` 的 owner 必须与分配时相同；业务关联只能首次设置或以同一业务键重试。
- 外部渠道请求、消息发送等在提交之后执行；调用失败和后续重试使用业务记录中已持久化的号码。
- 编号字符串不得用于反推主体 ID、期数或前缀长度；这些信息使用明确字段或外键。
- 正式取号只供服务端业务调用。浏览器编辑器调用预览接口，不预先占号。

## 4. 固定规则版本

普通业务按已发布的业务绑定取号；需要冻结行为的流程/业务快照，在发布事务中通过 `getNumberingReference(tx, { scene, tenantId, ownerKey, ruleId?, ruleVersionId? })` 解析引用，将返回的 `ruleId`、`versionId` 和参数映射保存进发布快照。实际分配传 `ruleVersionId`，不能临时查询最新规则覆盖快照。

编号参数映射由业务适配器解释。工作流只允许把已声明的业务参数映射到 `formData.字段键`，系统身份参数不能被表单覆盖；映射随流程发布版本固定。

发布版本不可修改，规则发布不会清空计数器。已发布序列的起始值、步长、重置周期、时区与分组口径固定，改变这些属性应新建规则/序列。切换规则仍受最终编号唯一约束校验，不得捕获冲突后静默跳号或更换格式。

编号分配记录是幂等与防重凭据，不能加入普通日志过期清理或在业务撤回时删除。

## 5. 已实现接入：工作流与请假

| 场景 | 接入位置 | 分配身份与取号时机 |
| --- | --- | --- |
| `workflow.instance` | `services/workflow/workflow-numbering.service.ts` 的 `allocateWorkflowInstanceNumber`；`instances/lifecycle.ts` 与 `instances/subprocess.ts` 调用 | `ownerKey = String(definitionId)`，`allocationKey = instance:{instanceId}`；实例创建或草稿首次正式提交的事务内取号，并关联实例 ID |
| `biz.leave` | `services/biz-demo/biz-leave.service.ts` 的 `createBizLeave` | 事务内插入请假单得到 ID，按 `allocationKey = String(leave.id)` 取号、写入 `leaveNo`、关联请假单 ID，再提交 |

本节服务路径均相对于 `packages/server/src/`。后续业务复用公共接入流程，不复制这些业务的专用参数适配器。

工作流发布由 `workflow-definitions.service.ts` 的 `publishDefinition` 调用 `pinWorkflowNumbering`。它在同一发布事务中锁定该定义的 owner 绑定，校验规则、表单参数映射，保存 `numberingBindings` 的定义级引用，同时把 `ruleId`、`versionId`、`parameterMapping` 冻结到 `flowData.settings.numbering` 与流程发布版本。即使使用默认绑定，发布后也必须有明确的定义 owner 绑定，管理页才能展示使用位置。

人工、自动、定时发起与子流程均经公共编号适配器，使用真实发起人、定义、租户与实例 ID；参数不依赖当前 HTTP 会话。实例取号传入已发布快照的 `ruleVersionId`，规则中心发布新版本或修改绑定不会改写既有流程快照；采用新规则需重新发布流程。启用一个已发布定义只校验固定引用，不重新解析最新版本。工作流草稿无编号，同一实例退回重提保留原号与原编号引用，表单流水号控件只读显示该实例编号。

请假业务号 `leaveNo` 与审批实例号 `serialNo` 分属两种实体：请假单创建时取得前者，提交审批时由工作流取得后者。编辑请假单、撤回或重新发起审批均保留 `leaveNo`；新一轮审批实例独立取得流程编号。删除可删除的请假草稿也保留编号分配凭据，不回收号码。新增同类业务时，业务 ID 与审批实例 ID 保持明确关联，不能把审批编号用作业务主键或业务单号。

## 6. 已实现接入：支付 12 个场景

本表路径均相对于 `packages/server/src/services/payment/`。UUID 只用于本次创建操作的分配身份；创建事务提交后，重试加载持久化业务记录并使用原编号，不能为同一单据的渠道重试重新生成 UUID。

| 场景 | 接入服务 / 函数 | `allocationKey` 与取号时机 |
| --- | --- | --- |
| `payment.order` | `payment.service.ts` / `createPayment` | 有请求幂等键时为 `app:{appId}:request:{idempotencyKey}`，无键时为 `request:{UUID}`；订单创建事务内取号，参数摘要为 `context.requestHash` |
| `payment.refund` | `payment.service.ts` / `refund` | `order:{order.id}:request:{idempotencyKey}`；锁订单、查重与校验可退金额后，在退款创建事务内取号，绑定 `requestHash` |
| `payment.transfer` | `payment-transfer.service.ts` / `createTransfer` → `reserveTransferFunds` | `app:{appId}:request:{idempotencyKey}`；编号、资金预占与转账单在同一事务提交，绑定 `requestHash`；需要审批时提交后等待审批 |
| `payment.preauth` | `payment-preauth.service.ts` / `createPreauth` | `request:{UUID}`；预授权单创建事务内取号，提交后才发起冻结 |
| `payment.sharing` | `payment-sharing.service.ts` / `createReservedSharing` | 手动为 `request:{UUID}`，自动为 `order:{order.id}:receiver:{receiver.id}`；锁订单、校验可分配余额并创建分账单的事务内取号；自动事件重放复用分账单并避免重复调用渠道 |
| `payment.settlement` | `payment-settlement.service.ts` / `generateSettlement` | `request:{UUID}`；结算批次与所认领资金分录在同一事务取号、写入，分录唯一约束保护重复认领 |
| `payment.risk` | `payment-risk.service.ts` / `suspendOrderForReview` | `order:{order.id}`；风控命中记录、审核单与订单挂起的事务内取号；同订单复用审核单 |
| `payment.link` | `payment-link.service.ts` / `createLink` | `request:{UUID}`；支付链接创建事务内取号；公开访问 token 仍使用独立随机凭证 |
| `payment.contract` | `payment-contract.service.ts` / `signContract` | `request:{UUID}`；签约协议创建事务内取号，提交后调渠道签约 |
| `payment.dispute` | `payment-dispute.service.ts` / `createMockDispute` | `channel:{channel}:dispute:{channelDisputeNo}`；投诉单与初始回复在同一事务取号、写入；渠道投诉号为外部身份，模拟数据也与本地编号分开 |
| `payment.deduction` | `payment-contract.service.ts` / `executeDeduction` | `contract:{contract.id}:period:{totalDeductCount + 1}`；锁定协议并读取最新成功期数后，在扣款订单创建 / 重试事务取号；绑定金额、币种、应用 ID |
| `payment.capture` | `payment-preauth.service.ts` / `capturePreauth` | `preauth:{preauth.id}`；预授权状态抢占、捕获订单与编号在同一事务写入，绑定 `context.amount`，同一预授权的捕获金额不可变更 |

`payment.order`、`payment.deduction`（周期扣款）、`payment.capture`（预授权转支付）都写入 `paymentOrders.orderNo`，因此三者共享 `payment.order` 全局唯一域。它们的场景和分配键不同，也必须共同防重；不能让扣款与捕获各有独立唯一域。所有支付场景只允许平台级规则、全局计数、最长 32 位字母数字编号，租户不能绕过渠道约束自定义。

扣款与预授权捕获只有在渠道明确失败后才重用原业务订单和原渠道请求编号；结果为 pending / paying / unknown 时优先查单收敛，不能再次扣款或捕获。预授权捕获查单确认失败时，同时把本地捕获订单转为 failed，恢复预授权 frozen，后续才能按原号重试。参数变化由业务请求摘要、编号上下文摘要与原订单校验拒绝。扣款与捕获分配记录的 `businessKey` 关联支付订单 ID，不关联协议 ID 或预授权 ID。

渠道返回的交易号、退款号、授权号等继续由适配器处理，不通过编号中心生成。支付链接的支付业务身份使用 `link:{link.id}:session:{session.id}`，核销通过收银会话的订单号与 `linkId` 关联；不要解析链接编号或拼接已有号码来构造新的业务单号。

## 7. 接入验收

- 同一操作并发重试只产生一条分配记录和一个业务结果；参数不一致被拒绝。
- 不同操作并发不重号，业务事务失败时计数与分配记录一起回滚。
- 租户、业务对象与组织范围隔离；共享全局唯一域的场景也不能重号。
- 日期格式与周期计算使用同一规则时区，验证午夜、月末、年末。
- 版本发布后序列延续，旧快照继续使用固定版本；已生成号码不变。
- 长流水保持精度，达到长度或 bigint 上限时报错而不截断。
- seed、Demo Mock、列表/详情编号展示和业务深链同步接入。

真实数据库验证执行 `npm run verify:numbering -w @zenith/server`。`packages/server/scripts/verify-numbering.mts` 仅使用本机 PostgreSQL，自动创建临时库、执行迁移，并以单 worker 运行以下两组测试，结束后清理临时库；账号需有建库权限，不在正常业务库运行测试。

- `services/platform/numbering-runtime.postgres.test.ts`：真实并发首取号、同键并发重试、参数冲突、事务回滚、租户 / owner 隔离、固定版本与流水延续、时区周期、超长流水，以及 PAY / DED / PAC 跨租户共享唯一域。
- `services/biz-demo/biz-leave-numbering.postgres.test.ts`：调用真实请假创建服务，验证请假单与分配记录同事务持久化、编辑 / 删除草稿保留编号凭据，以及规则不能取号时请假业务行一起回滚。

支付业务测试另覆盖退款幂等、转账资金预占回滚、同周期并发扣款、预授权捕获金额变化拒绝和 unknown 查单后原单重试。页面验收使用真实 API 与 Demo 两种模式核对业务编号、流程编号、绑定引用及生成记录；预览不消耗正式号码。
