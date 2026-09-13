import { OpenAPIHono } from '@hono/zod-openapi';
import { workflowCategoryContract } from '@zenith/shared/workflow';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listWorkflowCategories,
  listAllWorkflowCategories,
  getWorkflowCategory,
  createWorkflowCategory,
  updateWorkflowCategory,
  deleteWorkflowCategory,
} from '../../services/workflow/workflow-categories.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const allRoute = defineContractRoute(workflowCategoryContract.all, {
  // 发起工作台分组/待办筛选也要读取分类，放行发起与审批权限，避免非管理角色每次 ['workflow'] 缓存广播后 403 toast
  middleware: [authMiddleware, guard({ permission: ['workflow:definition:list', 'workflow:instance:create', 'workflow:task:handle'] })] as const,
  handler: async (c) => c.json(okBody(await listAllWorkflowCategories()), 200),
});

mountCrud(router, workflowCategoryContract,
  {
    list: listWorkflowCategories,
    get: getWorkflowCategory,
    create: createWorkflowCategory,
    update: updateWorkflowCategory,
    remove: deleteWorkflowCategory,
  },
  {
    permission: { read: 'workflow:definition:list', write: 'workflow:definition:edit' },
    label: '流程分类',
    module: '工作流管理',
  },
  [allRoute],
);

export default router;
