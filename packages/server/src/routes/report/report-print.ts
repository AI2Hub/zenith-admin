import { OpenAPIHono } from '@hono/zod-openapi';
import { reportPrintContract } from '@zenith/shared/report';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { ErrorResponse, jsonContent, okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listPrintTemplates,
  getPrintTemplate,
  createPrintTemplate,
  updatePrintTemplate,
  deletePrintTemplate,
  renderPrintTemplate,
  batchSetPrintTemplateStatus,
  clonePrintTemplate,
  listPrintTemplateLookup,
} from '../../services/report/report-print.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const notFound = { 404: { content: jsonContent(ErrorResponse), description: '不存在' } } as const;
const lookupRoute = defineContractRoute(reportPrintContract.lookup, {
  middleware: [authMiddleware, guard({ permission: 'report:print:list' })],
  handler: async (c) => c.json(okBody(await listPrintTemplateLookup(c.req.valid('query'))), 200),
});
const batchStatusRoute = defineContractRoute(reportPrintContract.batchStatus, {
  middleware: [authMiddleware, guard({ permission: 'report:print:update', audit: { description: '批量更新打印模板状态', module: '报表打印' } })],
  handler: async (c) => {
    const { ids, status } = c.req.valid('json');
    const count = await batchSetPrintTemplateStatus(ids, status);
    return c.json(okBody(null, `已更新 ${count} 个打印模板状态`), 200);
  },
});

const renderRoute = defineContractRoute(reportPrintContract.render, {
  middleware: [authMiddleware, guard({ permission: 'report:print:list' })],
  responses: notFound,
  handler: async (c) => c.json(okBody(await renderPrintTemplate(c.req.valid('param').id, c.req.valid('json'))), 200),
});

const cloneRoute = defineContractRoute(reportPrintContract.clone, {
  middleware: [authMiddleware, guard({ permission: 'report:print:create', audit: { description: '复制打印模板', module: '报表打印' } })],
  handler: async (c) => c.json(okBody(await clonePrintTemplate(c.req.valid('param').id, c.req.valid('json')), '复制成功'), 200),
});

mountCrud(router, reportPrintContract,
  {
    list: listPrintTemplates,
    get: getPrintTemplate,
    create: createPrintTemplate,
    update: updatePrintTemplate,
    remove: deletePrintTemplate,
  },
  {
    permission: 'report:print',
    label: '打印报表',
    module: '报表打印',
    responses: { detail: notFound, update: notFound, remove: notFound },
  },
  [lookupRoute, batchStatusRoute, renderRoute, cloneRoute],
);

export default router;
