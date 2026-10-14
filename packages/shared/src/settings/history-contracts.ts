import * as z from 'zod';
import { paginated, paginationQuery } from '../core/api-schemas';
import { defineContract, op } from '../core/contract';
import { SETTINGS_REVISION_ACTIONS } from './constants';
import { settingsEnvelopeMetaSchema, settingsGetOp, type SettingsEnvelope } from './contracts';
import { SETTINGS_MODULE_KEYS, SETTINGS_MODULES, settingsHistoryBasePath, type SettingsModuleKey } from './registry';

export const settingsDocumentSchema = z.record(z.string(), z.unknown());

export const settingsRevisionSummarySchema = z.object({
  id: z.int().min(0).meta({ description: '不可变版本记录 ID；0 为虚拟默认版本' }),
  version: z.int().min(0),
  action: z.enum(SETTINGS_REVISION_ACTIONS),
  restoredFromVersion: z.int().min(0).nullable(),
  note: z.string(),
  actorId: z.int().positive().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string().nullable(),
  changedPaths: z.array(z.string()),
}).meta({ id: 'SettingsRevisionSummary' });
export type SettingsRevisionSummary = z.infer<typeof settingsRevisionSummarySchema>;

export const settingsRevisionDetailSchema = settingsRevisionSummarySchema.extend({
  overrides: settingsDocumentSchema,
  inherited: settingsDocumentSchema,
  effective: settingsDocumentSchema,
  definitionHash: z.string(),
  definition: settingsDocumentSchema,
  inheritedVersion: z.int().min(0),
}).meta({ id: 'SettingsRevisionDetail' });
export type SettingsRevisionDetail = z.infer<typeof settingsRevisionDetailSchema>;

export const settingsFieldChangeSchema = z.object({
  path: z.string(),
  title: z.string(),
  type: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  beforeOverridden: z.boolean(),
  afterOverridden: z.boolean(),
  valueChanged: z.boolean(),
  inheritanceChanged: z.boolean(),
  added: z.array(z.unknown()),
  removed: z.array(z.unknown()),
}).meta({ id: 'SettingsFieldChange' });
export type SettingsFieldChange = z.infer<typeof settingsFieldChangeSchema>;

export const settingsComparisonSchema = z.object({
  fromVersion: z.int().min(0),
  toVersion: z.int().min(0),
  changes: z.array(settingsFieldChangeSchema),
}).meta({ id: 'SettingsComparison' });
export type SettingsComparison = z.infer<typeof settingsComparisonSchema>;

export const settingsRestorePreviewSchema = z.object({
  baseToken: settingsEnvelopeMetaSchema.shape.baseToken,
  currentVersion: z.int().min(0),
  targetVersion: z.int().min(0),
  current: settingsDocumentSchema,
  restored: settingsDocumentSchema,
  changes: z.array(settingsFieldChangeSchema),
  issues: z.array(z.object({ path: z.string(), message: z.string() })),
}).meta({ id: 'SettingsRestorePreview' });
export type SettingsRestorePreview = z.infer<typeof settingsRestorePreviewSchema>;

export const settingsVersionParam = z.object({
  version: z.coerce.number().int().min(0).meta({ description: '配置版本号；0 为默认继承状态' }),
});
export const settingsCompareQuery = z.object({
  from: z.coerce.number().int().min(0).meta({ description: '比较起点版本号；0 为默认继承状态' }),
  to: z.coerce.number().int().min(0).meta({ description: '比较终点版本号；0 为默认继承状态' }),
});
export const settingsRestorePreviewBodySchema = z.strictObject({
  baseToken: settingsEnvelopeMetaSchema.shape.baseToken,
});
export const settingsRestoreBodySchema = settingsRestorePreviewBodySchema.extend({
  note: z.string().trim().min(1, '请填写恢复说明').max(500),
});

function createSettingsHistoryContract<M extends SettingsModuleKey>(module: M) {
  const def = SETTINGS_MODULES[module];
  const platformOnly = def.platformOnly ? { platformOnly: def.platformOnly } : {};
  const readAccess = def.readPermission ? { permission: def.readPermission, ...platformOnly } : def.platformOnly ? { platformOnly: def.platformOnly } : 'authenticated' as const;
  const writeAccess = { permission: def.writePermission, ...platformOnly };
  return defineContract(settingsHistoryBasePath(module), {
    list: op.get('/', {
      access: readAccess,
      query: paginationQuery,
      response: paginated(settingsRevisionSummarySchema),
      summary: `「${def.title}」版本历史`,
    }),
    compare: op.get('/compare', {
      access: readAccess,
      query: settingsCompareQuery,
      response: settingsComparisonSchema,
      summary: `比较「${def.title}」版本`,
    }),
    detail: op.get('/{version}', {
      access: readAccess,
      params: settingsVersionParam,
      response: settingsRevisionDetailSchema,
      summary: `查看「${def.title}」历史版本`,
    }),
    preview: op.post('/{version}/restore-preview', {
      access: writeAccess,
      params: settingsVersionParam,
      body: settingsRestorePreviewBodySchema,
      response: settingsRestorePreviewSchema,
      summary: `预览恢复「${def.title}」历史版本`,
    }),
    restore: op.post('/{version}/restore', {
      access: writeAccess,
      params: settingsVersionParam,
      body: settingsRestoreBodySchema,
      response: settingsGetOp(module).response as z.ZodType<SettingsEnvelope<M>>,
      audit: { description: `恢复「${def.title}」设置版本`, module: '系统设置' },
      summary: `恢复「${def.title}」历史覆盖并创建新版本`,
    }),
  }, { tags: ['Settings'], ...(def.feature ? { feature: def.feature } : {}) });
}

export type SettingsHistoryContract<M extends SettingsModuleKey = SettingsModuleKey> = ReturnType<typeof createSettingsHistoryContract<M>>;

/** 模块特性、平台限制与读写权限从同一注册表派生，不能绕过原设置页面的访问控制。 */
function createHistoryContracts() {
  return Object.fromEntries(SETTINGS_MODULE_KEYS.map((module) => [module, createSettingsHistoryContract(module)])) as {
    [M in SettingsModuleKey]: SettingsHistoryContract<M>;
  };
}
// 仅构造操作元数据；未使用历史的入口无需执行该组初始化。
export const settingsHistoryContracts = /* @__PURE__ */ createHistoryContracts();

export function settingsHistoryOps<M extends SettingsModuleKey>(module: M): SettingsHistoryContract<M> {
  return settingsHistoryContracts[module] as SettingsHistoryContract<M>;
}
