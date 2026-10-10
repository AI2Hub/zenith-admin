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

业务已有请求幂等/请求内容校验时继续保留，编号幂等不替代业务幂等。相同分配键重试返回原编号；已提交号码作废后也不回收。保存草稿不取号，何时转为正式业务由业务服务决定。

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

## 5. 接入验收

- 同一操作并发重试只产生一条分配记录和一个业务结果；参数不一致被拒绝。
- 不同操作并发不重号，业务事务失败时计数与分配记录一起回滚。
- 租户、业务对象与组织范围隔离；共享全局唯一域的场景也不能重号。
- 日期格式与周期计算使用同一规则时区，验证午夜、月末、年末。
- 版本发布后序列延续，旧快照继续使用固定版本；已生成号码不变。
- 长流水保持精度，达到长度或 bigint 上限时报错而不截断。
- seed、Demo Mock、列表/详情编号展示和业务深链同步接入。

真实数据库并发验证执行 `npm run verify:numbering -w @zenith/server`，脚本使用本机 PostgreSQL 自动创建临时库、执行迁移、运行 `numbering-runtime.postgres.test.ts` 并清理临时库。账号需有建库权限；不会在正常业务库运行测试。
