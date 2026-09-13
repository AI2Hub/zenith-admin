import { OpenAPIHono } from '@hono/zod-openapi';
import { loginLogContract } from '@zenith/shared/identity';
import { setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import { listLoginLogs, loginLogStats, cleanLoginLogs, getCleanLoginLogsBeforeAudit } from '../../services/identity/login-logs.service';
import { mountCrud } from '../_crud';

const loginLogsRoute = new OpenAPIHono({ defaultHook: validationHook });

const statsRoute = defineContractRoute(loginLogContract.stats, {
  handler: async (c) => c.json(okBody(await loginLogStats(c.req.valid('query').days)), 200),
});

const cleanRoute = defineContractRoute(loginLogContract.clean, {
  handler: async (c) => {
    const { days } = c.req.valid('query');
    const before = await getCleanLoginLogsBeforeAudit(days);
    setAuditBeforeData(c, before);
    const deleted = await cleanLoginLogs(days);
    setAuditAfterData(c, { days, deleted });
    return c.json(okBody(null, `共删除 ${deleted} 条登录日志`), 200);
  },
});

mountCrud(loginLogsRoute, loginLogContract,
  { list: listLoginLogs },
  {},
  [statsRoute, cleanRoute],
);

export default loginLogsRoute;
