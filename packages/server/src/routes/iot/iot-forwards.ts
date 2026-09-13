/**
 * IoT 数据流转规则
 *
 * CRUD + 投递日志查询；运行时派发见 iot-forward.service（挂在遥测/事件/告警/生命周期）。
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { iotForwardRuleContract } from '@zenith/shared/iot';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { ErrorResponse, jsonContent, okBody, validationHook } from '../../lib/openapi-schemas';
import {
  createIotForwardRule,
  deleteIotForwardRule,
  ensureIotForwardRuleExists,
  listIotForwardLogs,
  listIotForwardRules,
  mapIotForwardRule,
  updateIotForwardRule,
} from '../../services/iot/iot-forward.service';
import { mountCrud } from '../_crud';

export const iotForwardRulesRouter = new OpenAPIHono({ defaultHook: validationHook });

const read = [authMiddleware, guard({ permission: 'iot:forward:list' })] as const;
const notFound = { 404: { content: jsonContent(ErrorResponse), description: '不存在' } } as const;
const listLogsRoute = defineContractRoute(iotForwardRuleContract.logs, {
  middleware: read,
  handler: async (c) => c.json(okBody(await listIotForwardLogs(c.req.valid('query'))), 200),
});

mountCrud(iotForwardRulesRouter, iotForwardRuleContract,
  {
    list: listIotForwardRules,
    get: async (id: number) => mapIotForwardRule(await ensureIotForwardRuleExists(id)),
    create: createIotForwardRule,
    update: updateIotForwardRule,
    remove: deleteIotForwardRule,
  },
  {
    permission: 'iot:forward',
    label: ' IoT 流转规则',
    module: 'IoT 数据流转',
    responses: { update: notFound, remove: notFound },
  },
  [listLogsRoute],
);
