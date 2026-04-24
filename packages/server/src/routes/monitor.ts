import { OpenAPIHono, createRoute, defineOpenAPIRoute } from '@hono/zod-openapi';
import os from 'node:os';
import { authMiddleware } from '../middleware/auth';
import { guard } from '../middleware/guard';
import { validationHook, commonErrorResponses, ok, okBody } from '../lib/openapi-schemas';
import { MonitorDTO } from '../lib/openapi-dtos';
import { getCpuUsage, getDiskInfo, getRedisInfo, getDbInfo } from '../services/monitor.service';

const monitorRouter = new OpenAPIHono({ defaultHook: validationHook });

const statusRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'get',
    path: '/',
    tags: ['Monitor'],
    summary: '获取服务器监控信息',
    security: [{ BearerAuth: [] }],
    middleware: [authMiddleware, guard({ permission: 'system:monitor:view' })] as const,
    responses: { ...ok(MonitorDTO, '监控数据'), ...commonErrorResponses },
  }),
  handler: async (c) => {
    const [cpuUsage, dbInfo, redisInfo] = await Promise.all([getCpuUsage(), getDbInfo(), getRedisInfo()]);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const cpus = os.cpus();
    const disk = getDiskInfo();

    const data = {
      os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        uptimeSeconds: Math.floor(os.uptime()),
      },
      cpu: {
        model: cpus[0]?.model ?? 'Unknown',
        cores: cpus.length,
        speed: cpus[0]?.speed ?? 0,
        loadAvg: os.loadavg(),
        usage: cpuUsage,
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: Math.round((usedMem / totalMem) * 100),
      },
      disk: disk
        ? {
            total: disk.total,
            used: disk.used,
            free: disk.free,
            usagePercent: Math.round((disk.used / disk.total) * 100),
          }
        : null,
      node: {
        version: process.version,
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
      },
      database: dbInfo,
      redis: redisInfo,
    };

    return c.json(okBody(data, 'success'), 200);
  },
});

monitorRouter.openapiRoutes([statusRoute] as const);

export default monitorRouter;
