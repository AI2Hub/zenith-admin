import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  cancelReportPublishApprovalSchema,
  cancelReportResourceTransferSchema,
  createReportPublishApprovalSchema,
  createReportResourceTransferSchema,
  decideReportPublishApprovalSchema,
  decideReportResourceTransferSchema,
  grantReportResourceAclSchema,
  reportAclRoleSchema,
  reportApprovalStatusSchema,
  reportResourceTypeSchema,
  reportTransferStatusSchema,
  updateReportResourceAclSchema,
} from '@zenith/shared';
import {
  ReportPublishApprovalDTO,
  ReportResourceAclDTO,
  ReportResourceTransferDTO,
} from '../../lib/openapi-dtos';
import {
  commonErrorResponses,
  IdParam,
  jsonContent,
  ok,
  okBody,
  okMsg,
  okPaginated,
  PaginationQuery,
  validationHook,
} from '../../lib/openapi-schemas';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import {
  checkReportResourceAccess,
  grantReportResourceAcl,
  listReportResourceAcls,
  revokeReportResourceAcl,
  updateReportResourceAcl,
} from '../../services/report/report-resource-acl.service';
import {
  cancelReportPublishApproval,
  cancelReportResourceTransfer,
  createReportPublishApproval,
  createReportResourceTransfer,
  decideReportPublishApproval,
  decideReportResourceTransfer,
  listReportPublishApprovals,
  listReportResourceTransfers,
} from '../../services/report/report-governance.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const resourceRefQuery = z.object({
  resourceType: reportResourceTypeSchema,
  resourceId: z.coerce.number().int().positive(),
  inheritFromFolder: z.coerce.boolean().default(false),
});

const listAclsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/acls', tags: ['报表资源治理'], summary: '资源权限列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:resource:acl' })] as const,
    request: { query: resourceRefQuery },
    responses: { ...commonErrorResponses, ...ok(z.array(ReportResourceAclDTO), 'ok') },
  }),
  handler: async (c) => {
    const query = c.req.valid('query');
    return c.json(okBody(await listReportResourceAcls(query.resourceType, query.resourceId, query.inheritFromFolder)), 200);
  },
});

const grantAclRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/acls', tags: ['报表资源治理'], summary: '授予资源权限',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:resource:acl', audit: { module: '报表资源治理', description: '授予资源权限' } })] as const,
    request: { body: { content: jsonContent(grantReportResourceAclSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportResourceAclDTO, '授权成功') },
  }),
  handler: async (c) => c.json(okBody(await grantReportResourceAcl(c.req.valid('json')), '授权成功'), 200),
});

const updateAclRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/acls/{id}', tags: ['报表资源治理'], summary: '更新资源权限',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:resource:acl', audit: { module: '报表资源治理', description: '更新资源权限' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportResourceAclSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportResourceAclDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(await updateReportResourceAcl(c.req.valid('param').id, c.req.valid('json')), '更新成功'), 200),
});

const revokeAclRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/acls/{id}', tags: ['报表资源治理'], summary: '撤销资源权限',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:resource:acl', audit: { module: '报表资源治理', description: '撤销资源权限' } })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('撤销成功') },
  }),
  handler: async (c) => {
    await revokeReportResourceAcl(c.req.valid('param').id);
    return c.json(okBody(null, '撤销成功'), 200);
  },
});

const checkAccessRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/access/check', tags: ['报表资源治理'], summary: '检查资源权限',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:resource:access' })] as const,
    request: {
      body: {
        content: jsonContent(z.object({
          resourceType: reportResourceTypeSchema,
          resourceId: z.number().int().positive(),
          requiredRole: reportAclRoleSchema,
        })),
        required: true,
      },
    },
    responses: {
      ...commonErrorResponses,
      ...ok(z.object({ allowed: z.boolean(), requiredRole: reportAclRoleSchema }), 'ok'),
    },
  }),
  handler: async (c) => {
    const input = c.req.valid('json');
    return c.json(okBody(await checkReportResourceAccess(input.resourceType, input.resourceId, input.requiredRole)), 200);
  },
});

const listTransfersRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/transfers', tags: ['报表资源治理'], summary: '资源转移列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:resource:transfer' })] as const,
    request: { query: PaginationQuery.extend({ status: reportTransferStatusSchema.optional(), resourceType: reportResourceTypeSchema.optional() }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportResourceTransferDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportResourceTransfers(c.req.valid('query'))), 200),
});

const createTransferRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/transfers', tags: ['报表资源治理'], summary: '申请资源转移',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:resource:transfer', audit: { module: '报表资源治理', description: '申请资源转移' } })] as const,
    request: { body: { content: jsonContent(createReportResourceTransferSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportResourceTransferDTO, '申请成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportResourceTransfer(c.req.valid('json')), '申请成功'), 200),
});

const decideTransferRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/transfers/{id}/decision', tags: ['报表资源治理'], summary: '接受或拒绝资源转移',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:resource:transfer', audit: { module: '报表资源治理', description: '处理资源转移' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(decideReportResourceTransferSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportResourceTransferDTO, '处理成功') },
  }),
  handler: async (c) => c.json(okBody(await decideReportResourceTransfer(c.req.valid('param').id, c.req.valid('json')), '处理成功'), 200),
});

const cancelTransferRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/transfers/{id}/cancel', tags: ['报表资源治理'], summary: '取消资源转移',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:resource:transfer', audit: { module: '报表资源治理', description: '取消资源转移' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(cancelReportResourceTransferSchema), required: false } },
    responses: { ...commonErrorResponses, ...ok(ReportResourceTransferDTO, '取消成功') },
  }),
  handler: async (c) => c.json(okBody(await cancelReportResourceTransfer(c.req.valid('param').id, c.req.valid('json')?.reason), '取消成功'), 200),
});

const listApprovalsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/approvals', tags: ['报表资源治理'], summary: '发布审批列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:approval:list' })] as const,
    request: { query: PaginationQuery.extend({ status: reportApprovalStatusSchema.optional(), resourceType: reportResourceTypeSchema.optional() }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportPublishApprovalDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportPublishApprovals(c.req.valid('query'))), 200),
});

const createApprovalRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/approvals', tags: ['报表资源治理'], summary: '申请发布审批',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:approval:request', audit: { module: '报表资源治理', description: '申请发布审批' } })] as const,
    request: { body: { content: jsonContent(createReportPublishApprovalSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportPublishApprovalDTO, '申请成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportPublishApproval(c.req.valid('json')), '申请成功'), 200),
});

const decideApprovalRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/approvals/{id}/decision', tags: ['报表资源治理'], summary: '通过或拒绝发布审批',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:approval:approve', audit: { module: '报表资源治理', description: '处理发布审批' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(decideReportPublishApprovalSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportPublishApprovalDTO, '处理成功') },
  }),
  handler: async (c) => c.json(okBody(await decideReportPublishApproval(c.req.valid('param').id, c.req.valid('json')), '处理成功'), 200),
});

const cancelApprovalRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/approvals/{id}/cancel', tags: ['报表资源治理'], summary: '取消发布审批',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:approval:request', audit: { module: '报表资源治理', description: '取消发布审批' } })] as const,
    request: { params: IdParam, body: { content: jsonContent(cancelReportPublishApprovalSchema), required: false } },
    responses: { ...commonErrorResponses, ...ok(ReportPublishApprovalDTO, '取消成功') },
  }),
  handler: async (c) => c.json(okBody(await cancelReportPublishApproval(c.req.valid('param').id, c.req.valid('json')?.reason), '取消成功'), 200),
});

router.openapiRoutes([
  listAclsRoute, grantAclRoute, updateAclRoute, revokeAclRoute, checkAccessRoute,
  listTransfersRoute, createTransferRoute, decideTransferRoute, cancelTransferRoute,
  listApprovalsRoute, createApprovalRoute, decideApprovalRoute, cancelApprovalRoute,
] as const);

export default router;
