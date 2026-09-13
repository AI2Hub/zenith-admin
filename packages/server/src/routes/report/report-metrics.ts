import { OpenAPIHono } from '@hono/zod-openapi';
import { reportMetricContract } from '@zenith/shared/report';
import { defineContractRoute } from '../../lib/contract-route';
import { ErrorResponse, jsonContent, okBody, validationHook } from '../../lib/openapi-schemas';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import {
  collectReportMetricRefs,
  createReportMetric,
  deleteReportMetric,
  deprecateReportMetric,
  evaluateReportMetric,
  getReportMetric,
  listReportMetricLookup,
  listReportMetrics,
  publishReportMetric,
  updateReportMetric,
} from '../../services/report/report-metric.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });
const conflict = { 409: { content: jsonContent(ErrorResponse), description: '版本冲突' } } as const;
const lookupRoute = defineContractRoute(reportMetricContract.lookup, {
  middleware: [authMiddleware, guard({ permission: 'report:metric:list' })],
  handler: async (c) => c.json(okBody(await listReportMetricLookup(c.req.valid('query'))), 200),
});
const evaluateRoute = defineContractRoute(reportMetricContract.evaluate, {
  middleware: [authMiddleware, guard({ permission: 'report:metric:evaluate' })],
  handler: async (c) => c.json(okBody(await evaluateReportMetric(c.req.valid('param').id, c.req.valid('json').params)), 200),
});

const publishRoute = defineContractRoute(reportMetricContract.publish, {
  middleware: [authMiddleware, guard({ permission: 'report:metric:publish', audit: { module: '报表指标', description: '发布指标' } })],
  responses: conflict,
  handler: async (c) => c.json(okBody(await publishReportMetric(c.req.valid('param').id, c.req.valid('json')), '发布成功'), 200),
});

const deprecateRoute = defineContractRoute(reportMetricContract.deprecate, {
  middleware: [authMiddleware, guard({ permission: 'report:metric:publish', audit: { module: '报表指标', description: '废弃指标' } })],
  responses: conflict,
  handler: async (c) => c.json(okBody(await deprecateReportMetric(c.req.valid('param').id, c.req.valid('json')), '废弃成功'), 200),
});

const refsRoute = defineContractRoute(reportMetricContract.refs, {
  middleware: [authMiddleware, guard({ permission: 'report:metric:list' })],
  handler: async (c) => c.json(okBody(await collectReportMetricRefs(c.req.valid('param').id)), 200),
});

mountCrud(router, reportMetricContract,
  {
    list: listReportMetrics,
    get: getReportMetric,
    create: createReportMetric,
    update: updateReportMetric,
    remove: deleteReportMetric,
  },
  { permission: 'report:metric', label: '指标', module: '报表指标', responses: { update: conflict } },
  [lookupRoute, evaluateRoute, publishRoute, deprecateRoute, refsRoute],
);

export default router;
