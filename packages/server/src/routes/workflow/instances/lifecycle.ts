// ─── 实例生命周期：创建/撤回/取消/删除/草稿/重新提交 ───
import { workflowInstanceContract } from '@zenith/shared/workflow';
import { setAuditBeforeData } from '../../../middleware/guard';
import { idempotencyGuard } from '../../../middleware/idempotency';
import { defineContractRoute } from '../../../lib/contract-route';
import { okBody } from '../../../lib/openapi-schemas';
import { createInstance, withdrawInstance, cancelInstance, deleteInstance, getInstanceForAdminAudit, getWorkflowInstanceBeforeAudit, updateInstanceDraft, submitDraftInstance, resubmitInstance } from '../../../services/workflow/workflow-instances.service';

export const createInstanceRoute = defineContractRoute(workflowInstanceContract.create, {
  middleware: [idempotencyGuard({ ttlSeconds: 10 })],
  handler: async (c) => {
    const body = c.req.valid('json');
    const r = await createInstance(body);
    return c.json(okBody(r, body.asDraft ? '草稿已保存' : '申请已提交'), 200);
  },
});

export const withdrawRoute = defineContractRoute(workflowInstanceContract.withdraw, {
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowInstanceBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await withdrawInstance(id), '已撤回'), 200);
  },
});

export const cancelInstanceRoute = defineContractRoute(workflowInstanceContract.cancel, {
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getInstanceForAdminAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await cancelInstance(id), '已取消'), 200);
  },
});

export const deleteInstanceRoute = defineContractRoute(workflowInstanceContract.remove, {
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getInstanceForAdminAudit(id);
    if (before) setAuditBeforeData(c, before);
    await deleteInstance(id);
    return c.json(okBody(null, '已删除'), 200);
  },
});

export const updateDraftRoute = defineContractRoute(workflowInstanceContract.updateDraft, {
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowInstanceBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await updateInstanceDraft(id, c.req.valid('json')), '草稿已保存'), 200);
  },
});

export const submitDraftRoute = defineContractRoute(workflowInstanceContract.submitDraft, {
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const before = await getWorkflowInstanceBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await submitDraftInstance(id, body), '申请已提交'), 200);
  },
});

export const resubmitRoute = defineContractRoute(workflowInstanceContract.resubmit, {
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowInstanceBeforeAudit(id);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await resubmitInstance(id), '已生成草稿'), 200);
  },
});
