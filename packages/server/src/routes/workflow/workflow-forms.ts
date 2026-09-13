import { OpenAPIHono } from '@hono/zod-openapi';
import { workflowFormContract } from '@zenith/shared/workflow';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { conflictResponse, okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listWorkflowForms,
  listEnabledWorkflowForms,
  getWorkflowForm,
  createWorkflowForm,
  duplicateWorkflowForm,
  updateWorkflowForm,
  deleteWorkflowForm,
} from '../../services/workflow/workflow-forms.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'workflow:form:list' })] as const;
const enabledRoute = defineContractRoute(workflowFormContract.enabled, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listEnabledWorkflowForms()), 200),
});
const duplicateRoute = defineContractRoute(workflowFormContract.duplicate, {
  middleware: [authMiddleware, guard({ permission: 'workflow:form:create', audit: { description: '复制表单', module: '工作流管理' } })] as const,
  handler: async (c) => c.json(okBody(await duplicateWorkflowForm(c.req.valid('param').id), '已复制为新表单'), 200),
});

const updateRoute = defineContractRoute(workflowFormContract.update, {
  middleware: [authMiddleware, guard({ permission: 'workflow:form:edit', audit: { description: '更新表单', module: '工作流管理' } })] as const,
  // 乐观锁：expectedRevision 与当前不一致时返回 409
  responses: conflictResponse,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowForm(id).catch(() => null);
    if (before) setAuditBeforeData(c, before);
    return c.json(okBody(await updateWorkflowForm(id, c.req.valid('json')), '更新成功'), 200);
  },
});

const deleteRoute = defineContractRoute(workflowFormContract.remove, {
  middleware: [authMiddleware, guard({ permission: 'workflow:form:delete', audit: { description: '删除表单', module: '工作流管理' } })] as const,
  handler: async (c) => {
    const { id } = c.req.valid('param');
    const before = await getWorkflowForm(id).catch(() => null);
    if (before) setAuditBeforeData(c, before);
    await deleteWorkflowForm(id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

mountCrud(router, workflowFormContract,
  { list: listWorkflowForms, get: getWorkflowForm, create: createWorkflowForm },
  { permission: 'workflow:form', label: '表单', module: '工作流管理', exclude: ['update', 'remove'] },
  [enabledRoute, duplicateRoute, updateRoute, deleteRoute],
);

export default router;
