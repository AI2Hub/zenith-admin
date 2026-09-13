import { OpenAPIHono } from '@hono/zod-openapi';
import { reportDatasourceContract } from '@zenith/shared/report';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { ErrorResponse, jsonContent, okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listDatasources,
  getDatasource,
  createDatasource,
  updateDatasource,
  deleteDatasource,
  testDatasource,
  batchSetDatasourceStatus,
  cloneDatasource,
  listDatasourceLookup,
} from '../../services/report/report-datasource.service';
import { submitDatasourceHealthCheckTask } from '../../services/report/report-datasource-tasks';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const notFound = { 404: { content: jsonContent(ErrorResponse), description: '不存在' } } as const;
const lookupRoute = defineContractRoute(reportDatasourceContract.lookup, {
  middleware: [authMiddleware, guard({ permission: 'report:datasource:list' })],
  handler: async (c) => c.json(okBody(await listDatasourceLookup(c.req.valid('query'))), 200),
});
const batchStatusRoute = defineContractRoute(reportDatasourceContract.batchStatus, {
  middleware: [authMiddleware, guard({ permission: 'report:datasource:update', audit: { description: '批量更新报表数据源状态', module: '报表数据源' } })],
  handler: async (c) => {
    const { ids, status } = c.req.valid('json');
    const count = await batchSetDatasourceStatus(ids, status);
    return c.json(okBody(null, `已更新 ${count} 个数据源状态`), 200);
  },
});

const testRoute = defineContractRoute(reportDatasourceContract.test, {
  middleware: [authMiddleware, guard({ permission: 'report:datasource:create' })],
  handler: async (c) => c.json(okBody(await testDatasource(c.req.valid('json'))), 200),
});

const testOneRoute = defineContractRoute(reportDatasourceContract.testOne, {
  middleware: [authMiddleware, guard({ permission: 'report:datasource:update', audit: { description: '测试报表数据源连接', module: '报表数据源' } })],
  handler: async (c) => c.json(okBody(await testDatasource({ id: c.req.valid('param').id })), 200),
});

const cloneRoute = defineContractRoute(reportDatasourceContract.clone, {
  middleware: [authMiddleware, guard({ permission: 'report:datasource:create', audit: { description: '复制报表数据源', module: '报表数据源' } })],
  handler: async (c) => c.json(okBody(await cloneDatasource(c.req.valid('param').id, c.req.valid('json')), '复制成功'), 200),
});

const healthCheckRoute = defineContractRoute(reportDatasourceContract.healthCheck, {
  middleware: [authMiddleware, guard({ permission: 'report:datasource:update', audit: { description: '批量检测报表数据源健康状态', module: '报表数据源' } })],
  handler: async (c) => c.json(okBody(await submitDatasourceHealthCheckTask(c.req.valid('json').ids), '任务已提交，可在任务中心查看进度'), 200),
});

mountCrud(router, reportDatasourceContract,
  {
    list: listDatasources,
    get: getDatasource,
    create: createDatasource,
    update: updateDatasource,
    remove: deleteDatasource,
  },
  {
    permission: 'report:datasource',
    label: '报表数据源',
    module: '报表数据源',
    responses: { detail: notFound, update: notFound, remove: notFound },
  },
  [lookupRoute, batchStatusRoute, testRoute, testOneRoute, cloneRoute, healthCheckRoute],
);

export default router;