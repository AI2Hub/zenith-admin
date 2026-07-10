import { OpenAPIHono, createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi';
import {
  cancelReportFillRecordSchema,
  cloneReportFillTemplateSchema,
  createReportFillRecordSchema,
  createReportFillTemplateSchema,
  reportFillRecordStatusSchema,
  reportFillTemplateLifecycleActionSchema,
  reportFillTemplateStatusSchema,
  reviewReportFillRecordSchema,
  submitReportFillRecordSchema,
  updateReportFillRecordSchema,
  updateReportFillTemplateSchema,
} from '@zenith/shared';
import { ReportFillRecordDTO, ReportFillTemplateDTO } from '../../lib/openapi-dtos';
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
import { namedRateLimit } from '../../middleware/rate-limit';
import {
  changeReportFillTemplateLifecycle,
  cloneReportFillTemplate,
  createReportFillTemplate,
  deleteReportFillTemplate,
  getReportFillTemplate,
  listReportFillTemplateLookup,
  listReportFillTemplates,
  updateReportFillTemplate,
} from '../../services/report/report-fill-template.service';
import {
  cancelReportFillRecord,
  createReportFillRecord,
  getReportFillRecord,
  listAdminReportFillRecords,
  listMyReportFillRecords,
  reviewReportFillRecord,
  submitReportFillRecord,
  updateReportFillRecord,
} from '../../services/report/report-fill-record.service';

const router = new OpenAPIHono({ defaultHook: validationHook });
const tags = ['报表填报'];
const writeLimit = namedRateLimit('report_fill_write');

const templateListRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/templates', tags, summary: '填报模板列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:fill:template:list' })] as const,
    request: { query: PaginationQuery.extend({
      keyword: z.string().max(128).optional(),
      status: reportFillTemplateStatusSchema.optional(),
      ownerId: z.coerce.number().int().positive().optional(),
      folderId: z.coerce.number().int().positive().optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportFillTemplateDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportFillTemplates(c.req.valid('query'))), 200),
});

const templateLookupRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/templates/lookup', tags, summary: '已发布填报模板选项',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:fill:record:create' })] as const,
    responses: { ...commonErrorResponses, ...ok(z.array(ReportFillTemplateDTO), 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listReportFillTemplateLookup()), 200),
});

const templateCreateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/templates', tags, summary: '创建填报模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, writeLimit, guard({
      permission: 'report:fill:template:create',
      audit: { module: '报表填报', description: '创建填报模板' },
    })] as const,
    request: { body: { content: jsonContent(createReportFillTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFillTemplateDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportFillTemplate(c.req.valid('json')), '创建成功'), 200),
});

const templateDetailRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/templates/{id}', tags, summary: '填报模板详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:fill:template:list' })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportFillTemplateDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportFillTemplate(c.req.valid('param').id)), 200),
});

const templateUpdateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/templates/{id}', tags, summary: '更新填报模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, writeLimit, guard({
      permission: 'report:fill:template:update',
      audit: { module: '报表填报', description: '更新填报模板' },
    })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportFillTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFillTemplateDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(
    await updateReportFillTemplate(c.req.valid('param').id, c.req.valid('json')),
    '更新成功',
  ), 200),
});

const templateLifecycleRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/templates/{id}/lifecycle', tags, summary: '发布或下线填报模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, writeLimit, guard({
      permission: 'report:fill:template:publish',
      audit: { module: '报表填报', description: '变更填报模板生命周期' },
    })] as const,
    request: { params: IdParam, body: { content: jsonContent(reportFillTemplateLifecycleActionSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFillTemplateDTO, '操作成功') },
  }),
  handler: async (c) => c.json(okBody(
    await changeReportFillTemplateLifecycle(c.req.valid('param').id, c.req.valid('json')),
    '操作成功',
  ), 200),
});

const templateCloneRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/templates/{id}/clone', tags, summary: '克隆填报模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, writeLimit, guard({
      permission: 'report:fill:template:clone',
      audit: { module: '报表填报', description: '克隆填报模板' },
    })] as const,
    request: { params: IdParam, body: { content: jsonContent(cloneReportFillTemplateSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFillTemplateDTO, '克隆成功') },
  }),
  handler: async (c) => c.json(okBody(
    await cloneReportFillTemplate(c.req.valid('param').id, c.req.valid('json')),
    '克隆成功',
  ), 200),
});

const templateDeleteRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'delete', path: '/templates/{id}', tags, summary: '删除填报模板',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, writeLimit, guard({
      permission: 'report:fill:template:delete',
      audit: { module: '报表填报', description: '删除填报模板' },
    })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...okMsg('删除成功') },
  }),
  handler: async (c) => {
    await deleteReportFillTemplate(c.req.valid('param').id);
    return c.json(okBody(null, '删除成功'), 200);
  },
});

const mineRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/records/mine', tags, summary: '我的填报记录',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:fill:record:list' })] as const,
    request: { query: PaginationQuery.extend({
      keyword: z.string().max(128).optional(),
      status: reportFillRecordStatusSchema.optional(),
      templateId: z.coerce.number().int().positive().optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportFillRecordDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listMyReportFillRecords(c.req.valid('query'))), 200),
});

const adminRecordsRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/records/admin', tags, summary: '填报记录管理列表',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'report:fill:record:review' })] as const,
    request: { query: PaginationQuery.extend({
      status: reportFillRecordStatusSchema.optional(),
      templateId: z.coerce.number().int().positive().optional(),
      submitterId: z.coerce.number().int().positive().optional(),
    }) },
    responses: { ...commonErrorResponses, ...okPaginated(ReportFillRecordDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await listAdminReportFillRecords(c.req.valid('query'))), 200),
});

const recordCreateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/records', tags, summary: '创建填报草稿',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, writeLimit, guard({
      permission: 'report:fill:record:create',
      audit: { module: '报表填报', description: '创建填报草稿' },
    })] as const,
    request: { body: { content: jsonContent(createReportFillRecordSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFillRecordDTO, '创建成功') },
  }),
  handler: async (c) => c.json(okBody(await createReportFillRecord(c.req.valid('json')), '创建成功'), 200),
});

const recordDetailRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get', path: '/records/{id}', tags, summary: '填报记录详情',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: ['report:fill:record:list', 'report:fill:record:review'] })] as const,
    request: { params: IdParam },
    responses: { ...commonErrorResponses, ...ok(ReportFillRecordDTO, 'ok') },
  }),
  handler: async (c) => c.json(okBody(await getReportFillRecord(c.req.valid('param').id)), 200),
});

const recordUpdateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'put', path: '/records/{id}', tags, summary: '编辑填报草稿',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, writeLimit, guard({
      permission: 'report:fill:record:update',
      audit: { module: '报表填报', description: '编辑填报草稿' },
    })] as const,
    request: { params: IdParam, body: { content: jsonContent(updateReportFillRecordSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFillRecordDTO, '更新成功') },
  }),
  handler: async (c) => c.json(okBody(
    await updateReportFillRecord(c.req.valid('param').id, c.req.valid('json')),
    '更新成功',
  ), 200),
});

const recordSubmitRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/records/{id}/submit', tags, summary: '提交填报记录',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, writeLimit, guard({
      permission: 'report:fill:record:submit',
      audit: { module: '报表填报', description: '提交填报记录' },
    })] as const,
    request: { params: IdParam, body: { content: jsonContent(submitReportFillRecordSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFillRecordDTO, '提交成功') },
  }),
  handler: async (c) => c.json(okBody(
    await submitReportFillRecord(c.req.valid('param').id, c.req.valid('json')),
    '提交成功',
  ), 200),
});

const makeCancelRoute = (path: '/records/{id}/cancel' | '/records/{id}/withdraw', summary: string) => defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path, tags, summary,
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, writeLimit, guard({
      permission: 'report:fill:record:cancel',
      audit: { module: '报表填报', description: summary },
    })] as const,
    request: { params: IdParam, body: { content: jsonContent(cancelReportFillRecordSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFillRecordDTO, '操作成功') },
  }),
  handler: async (c) => c.json(okBody(
    await cancelReportFillRecord(c.req.valid('param').id, c.req.valid('json')),
    '操作成功',
  ), 200),
});

const recordReviewRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post', path: '/records/{id}/review', tags, summary: '人工批准或拒绝填报记录',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, writeLimit, guard({
      permission: 'report:fill:record:review',
      audit: { module: '报表填报', description: '审核填报记录' },
    })] as const,
    request: { params: IdParam, body: { content: jsonContent(reviewReportFillRecordSchema), required: true } },
    responses: { ...commonErrorResponses, ...ok(ReportFillRecordDTO, '审核成功') },
  }),
  handler: async (c) => c.json(okBody(
    await reviewReportFillRecord(c.req.valid('param').id, c.req.valid('json')),
    '审核成功',
  ), 200),
});

router.openapiRoutes([
  templateListRoute,
  templateLookupRoute,
  templateCreateRoute,
  templateDetailRoute,
  templateUpdateRoute,
  templateLifecycleRoute,
  templateCloneRoute,
  templateDeleteRoute,
  mineRoute,
  adminRecordsRoute,
  recordCreateRoute,
  recordDetailRoute,
  recordUpdateRoute,
  recordSubmitRoute,
  makeCancelRoute('/records/{id}/cancel', '取消填报记录'),
  makeCancelRoute('/records/{id}/withdraw', '撤回填报记录'),
  recordReviewRoute,
] as const);

export default router;
