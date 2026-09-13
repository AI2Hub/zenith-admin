import { OpenAPIHono } from '@hono/zod-openapi';
import { ipAccessLogContract } from '@zenith/shared/platform';
import { validationHook } from '../../lib/openapi-schemas';
import { listIpAccessLogs } from '../../services/platform/ip-access-logs.service';
import { mountCrud } from '../_crud';

const ipAccessLogsRoute = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(ipAccessLogsRoute, ipAccessLogContract,
  { list: listIpAccessLogs },
  { permission: { read: 'system:ip-access:log' } },
);

export default ipAccessLogsRoute;
