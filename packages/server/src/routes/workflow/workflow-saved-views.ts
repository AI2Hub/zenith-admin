import { OpenAPIHono } from '@hono/zod-openapi';
import { workflowSavedViewContract } from '@zenith/shared/workflow';
import { validationHook } from '../../lib/openapi-schemas';
import { listSavedViews, createSavedView, updateSavedView, deleteSavedView, getSavedView } from '../../services/workflow/workflow-saved-views.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(router, workflowSavedViewContract,
  { list: listSavedViews, get: getSavedView, create: createSavedView, update: updateSavedView, remove: deleteSavedView },
  {
    permission: { read: 'workflow:instance:list', write: 'workflow:instance:list' },
    label: '工作流视图',
    module: '工作流管理',
    audit: { create: '保存工作流视图' },
    messages: { create: '已保存', update: '已更新', remove: '已删除' },
  },
);

export default router;