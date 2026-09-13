import { OpenAPIHono } from '@hono/zod-openapi';
import { opsHostContract } from '@zenith/shared/ops';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { platformHostOnly } from '../../lib/host-access';
import {
  createOpsHost,
  deleteOpsHost,
  getOpsHost,
  importOpsHostFromSshProfile,
  listOpsHosts,
  probeAllOpsHosts,
  probeOpsHost,
  resetOpsHostKey,
  testOpsHostConnection,
  updateOpsHost,
} from '../../services/ops/hosts.service';
import { currentUser } from '../../lib/context';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const VIEW_PERM = 'system:host:view';
const MANAGE_PERM = 'system:host:manage';
const MODULE = '主机管理';

/** 主机注册表只对平台侧账号开放：所有路由在登录后先过 `platformHostOnly` */
const platform = [authMiddleware, platformHostOnly] as const;

const testRoute = defineContractRoute(opsHostContract.test, {
  middleware: [...platform, guard({ permission: MANAGE_PERM })],
  handler: async (c) => c.json(okBody(await testOpsHostConnection(c.req.valid('param').id)), 200),
});

const probeRoute = defineContractRoute(opsHostContract.probe, {
  middleware: [...platform, guard({ permission: VIEW_PERM })],
  handler: async (c) => c.json(okBody(await probeOpsHost(c.req.valid('param').id)), 200),
});

const probeAllRoute = defineContractRoute(opsHostContract.probeAll, {
  middleware: [...platform, guard({ permission: VIEW_PERM })],
  handler: async (c) => {
    await probeAllOpsHosts();
    return c.json(okBody(await listOpsHosts()), 200);
  },
});

const resetKeyRoute = defineContractRoute(opsHostContract.resetHostKey, {
  middleware: [...platform, guard({ permission: MANAGE_PERM, audit: { description: '重置主机指纹', module: MODULE } })],
  handler: async (c) => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await getOpsHost(id));
    await resetOpsHostKey(id);
    return c.json(okBody(null, '已重置,下次连接将重新记录指纹'), 200);
  },
});

const importSshProfileRoute = defineContractRoute(opsHostContract.importSshProfile, {
  middleware: [...platform, guard({
    permission: MANAGE_PERM,
    audit: { description: '从 SSH 配置导入运维主机', module: MODULE, recordBody: false },
  })],
  handler: async (c) => {
    const host = await importOpsHostFromSshProfile(c.req.valid('param').profileId, currentUser().userId);
    return c.json(okBody(host, '已导入'), 200);
  },
});

mountCrud(router, opsHostContract,
  { list: listOpsHosts, get: getOpsHost, create: createOpsHost, update: updateOpsHost, remove: deleteOpsHost },
  {
    // 主机清单对「使用远端主机」的功能页也可见（下拉选择），满足其一即可
    permission: { read: [VIEW_PERM, 'system:host:use'], write: MANAGE_PERM },
    label: '运维主机',
    module: MODULE,
    // 凭据不进审计日志
    audit: { create: { description: '新增运维主机', recordBody: false }, update: { recordBody: false } },
    messages: { create: '已创建', update: '已更新', remove: '已删除' },
    middleware: [platformHostOnly],
  },
  [testRoute, probeRoute, probeAllRoute, resetKeyRoute, importSshProfileRoute],
);

export default router;
