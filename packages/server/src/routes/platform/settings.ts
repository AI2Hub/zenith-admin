import { OpenAPIHono } from '@hono/zod-openapi';
import type * as z from 'zod';
import type { Operation } from '@zenith/shared/core';
import {
  SETTINGS_MODULE_KEYS,
  settingsContract,
  settingsGetOp,
  settingsUpdateOp,
  settingsHistoryOps,
  type SettingsModuleKey,
} from '@zenith/shared/settings';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  getMySettings,
  getPublicSettings,
  getSettingsEnvelope,
  listSettingsModules,
  saveSettings,
  restoreSettings,
} from '../../lib/settings';
import { listSettingsVersions, getSettingsVersion, compareSettingsVersions, previewSettingsRestore } from '../../services/platform/settings-history.service';

const settingsRoutes = new OpenAPIHono({ defaultHook: validationHook });

const listRoute = defineContractRoute(settingsContract.list, {
  handler: async (c) => c.json(okBody(await listSettingsModules(c.get('user'))), 200),
});

const publicRoute = defineContractRoute(settingsContract.public, {
  middleware: [],
  handler: async (c) => c.json(okBody(await getPublicSettings(c.req.valid('query').tenantCode)), 200),
});

const meRoute = defineContractRoute(settingsContract.me, {
  handler: async (c) => c.json(okBody(await getMySettings()), 200),
});

/**
 * 逐模块 get / update 的**类型视图**：运行时仍使用契约上的精确操作对象（OpenAPI 文档、入参校验、
 * 响应 schema、访问要求与审计全部逐模块强类型），这里只是把 TS 视图放宽到统一的覆盖写入请求，
 * 让所有模块共用同一个循环装配。
 * 响应形状由 `lib/settings` 单一代码路径产出，并由 `settings.test.ts` / 路由测试在运行期校验。
 */
type WideGetOp = Operation<'get', string, undefined, undefined, undefined, z.ZodType<unknown>, 'json', undefined>;
type WideUpdateOp = Operation<'put', string, undefined, undefined, z.ZodType<{ baseToken: string; overrides: Record<string, unknown>; note?: string }>, z.ZodType<unknown>, 'json', undefined>;

function moduleRoutes(module: SettingsModuleKey) {
  const getOp = settingsGetOp(module) as unknown as WideGetOp;
  const updateOp = settingsUpdateOp(module) as unknown as WideUpdateOp;
  return [
    defineContractRoute(getOp, {
      handler: async (c) => c.json(okBody(await getSettingsEnvelope(module)), 200),
    }),
    defineContractRoute(updateOp, {
      handler: async (c) => {
        const body = c.req.valid('json');
        const saved = await saveSettings(module, c.get('user'), body);
        return c.json(okBody(saved, '保存成功'), 200);
      },
    }),
  ] as const;
}

settingsRoutes.openapiRoutes([listRoute, publicRoute, meRoute] as const);
for (const module of SETTINGS_MODULE_KEYS) {
  settingsRoutes.openapiRoutes(moduleRoutes(module));
  const history = settingsHistoryOps(module);
  const router = new OpenAPIHono({ defaultHook: validationHook });
  router.openapiRoutes([
    defineContractRoute(history.list, { handler: async (c) => c.json(okBody(await listSettingsVersions(module, c.get('user'), c.req.valid('query'))), 200) }),
    defineContractRoute(history.compare, { handler: async (c) => c.json(okBody(await compareSettingsVersions(module, c.get('user'), c.req.valid('query'))), 200) }),
    defineContractRoute(history.detail, { handler: async (c) => c.json(okBody(await getSettingsVersion(module, c.get('user'), c.req.valid('param').version)), 200) }),
    defineContractRoute(history.preview, { handler: async (c) => c.json(okBody(await previewSettingsRestore(module, c.get('user'), c.req.valid('param').version, c.req.valid('json'))), 200) }),
    defineContractRoute(history.restore, { handler: async (c) => c.json(okBody(await restoreSettings(module, c.get('user'), c.req.valid('param').version, c.req.valid('json')), '设置版本已恢复'), 200) }),
  ] as const);
  settingsRoutes.route(history.basePath.slice(settingsContract.basePath.length), router);
}

export default settingsRoutes;
