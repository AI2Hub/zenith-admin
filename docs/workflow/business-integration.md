# 业务模块接入工作流

除了「表单库设计器」与「自定义业务表单」（数据存流程 `formData`），工作流还支持**业务系统主导**的接入方式：业务模块拥有自己的实体表、Service、列表页，自己保存业务数据，再利用工作流引擎做审批编排。流程只通过 **businessKey（`bizType` + `bizId`）** 关联业务记录，业务数据**不进入流程**。

这对应流程定义的第三种表单类型 `formType = 'external'`。

## 整体架构

```
业务模块（自有表/Service/列表页）
   │  ① 保存业务数据到自己的表（如 biz_leaves）
   │  ② startWorkflowForBiz(definitionId, bizType, bizId, variables)
   ▼
工作流引擎  ──  workflow_instances 存 bizType + bizId + 路由变量(formData)，不存业务数据
   │  ③ 审批流转（审批人通过 viewComponent 按 bizId 查看业务数据）
   │  ④ instance.approved / rejected / withdrawn 事件
   ▼
业务订阅器 onWorkflowResult(bizType, ...)  ──  ⑤ 回写业务表状态
```

## 提供的 SDK（`packages/server/src/lib/workflow-biz-bridge.ts`）

| 能力 | 函数 | 说明 |
| --- | --- | --- |
| 发起并关联 | `startWorkflowForBiz({ definitionId, title, bizType, bizId, variables?, priority?, caller? })` | 业务保存数据后调用，创建并关联工作流实例；`variables` 写入实例 `formData` 供条件分支/审批人使用 |
| 结果回调 | `onWorkflowResult(bizType, { onApproved, onRejected, onWithdrawn, onCreated })` | 订阅该业务类型流程的生命周期事件，回写业务记录状态（基于 `workflowEventBus`） |
| 状态查询 | `getWorkflowStatusByBiz(bizType, bizIds[])` | 按 businessKey 批量查询流程状态，供业务列表页展示 |

`workflow_instances` 新增 `biz_type` / `biz_id` 两列与 `(biz_type, biz_id)` 索引承载关联关系。

## 接入一个新业务模块（以请假 `biz_leave` 为参考）

参考实现：后端 `services/biz-leave.service.ts` + `services/biz-leave-subscribers.ts` + `routes/biz-leave.ts`；前端 `pages/biz/leave/LeavePage.tsx`（列表页）+ `pages/biz/leave/LeaveApprovalView.tsx`（审批查看组件）。

### 1. 业务实体表 + CRUD

按常规 CRUD 流程创建业务表（如 `biz_leaves`），建议冗余 `workflow_instance_id` 与 `workflow_status` 字段便于列表展示。

### 2. 提交时发起并关联流程

```ts
import { startWorkflowForBiz } from '../lib/workflow-biz-bridge';

const instance = await startWorkflowForBiz({
  definitionId,                 // 已发布的 external 流程定义
  title: `请假申请 - ${applicant}`,
  bizType: 'biz_leave',
  bizId: leave.id,
  variables: { days: leave.days, leaveType: leave.leaveType }, // 供条件分支/审批人
});
await db.update(bizLeaves).set({ status: 'pending', workflowInstanceId: instance.id, workflowStatus: instance.status }).where(eq(bizLeaves.id, id));
```

### 3. 订阅流程结果回写状态

```ts
import { onWorkflowResult } from '../lib/workflow-biz-bridge';

export function registerBizLeaveSubscribers() {
  onWorkflowResult('biz_leave', {
    onApproved: (instance) => updateStatus(instance.bizId, 'approved'),
    onRejected: (instance) => updateStatus(instance.bizId, 'rejected'),
    onWithdrawn: (instance) => updateStatus(instance.bizId, 'cancelled'),
  });
}
```

在 `index.ts` 中调用 `registerBizLeaveSubscribers()`（与 `registerPaymentSubscribers()` 并列）。
事件在请求上下文之外异步触发，审计 Proxy 会自动跳过 `created_by` / `updated_by` 注入，无需 `runAsUser`。

### 4. 流程定义：`formType = 'external'`

发布一个 `formType = 'external'` 的流程定义，配置 `customForm.viewComponent` 指向业务的审批查看组件（如 `biz/leave/LeaveApprovalView`），并声明 `variables`。审批人在「待我审批 / 流程详情」中会通过 `BusinessFormHost(view)` 渲染该组件，组件按 `props.bizId` 拉取业务数据（参与者鉴权见下）。

> 业务查看接口需对**工作流参与者**放开读取权限。参考 `getBizLeaveDetail`：申请人本人，或在关联实例上有任务的人可见。

### 5. 业务列表页展示流程状态 + 跳转流程详情

列表页直接读冗余的 `workflow_status` 字段（或调用 `getWorkflowStatusByBiz`）；「流程详情」跳转到内置整页路由 `/workflow/instance/:id`。

## 两种「自定义」方式对比

| | `custom`（表单中心） | `external`（实体中心 / businessKey） |
| --- | --- | --- |
| 业务数据存哪 | 流程 `workflow_instances.formData` | 业务模块自己的表 |
| 谁保存 | 流程框架统一下单 | 业务模块自己保存后发起 |
| 发起入口 | 工作流发起工作台 | 业务模块列表页（也可两者结合） |
| 适用 | 轻量自定义交互、无独立实体 | 有独立实体/列表页、需复用既有业务页 |

两种方式与 `designer`（表单库）并存，按业务复杂度选择。
