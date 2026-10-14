import {
  SETTINGS_MODULES,
  SETTINGS_MODULE_KEYS,
  SETTINGS_MODULE_PATHS,
  mySettingsSchema,
  pickSettingsFields,
  publicSettingsSchema,
  settingsContract,
  settingsGetOp,
  settingsHistoryOps,
  diffSettingsSnapshots,
  settingsUpdateOp,
  type MySettings,
  type PublicSettings,
  type SettingsGetOperation,
  type SettingsModuleKey,
  type SettingsModuleMeta,
  type SettingsUpdateOperation,
} from '@zenith/shared/settings';
import { mock } from '@/mocks/utils/contract';
import { getMockSettings, mockSettingsEnvelope, mockSettingsRevision, mockSettingsRevisions, previewMockSettingsRestore, putMockSettings } from '@/mocks/data/settings';
import { mockDriveSettings } from '@/mocks/data/drive';
import { mockWikiSettings } from '@/mocks/data/wiki';

/** Demo 站以平台管理员身份运行：全部模块可读可写 */
function moduleMeta(module: SettingsModuleKey): SettingsModuleMeta {
  const def = SETTINGS_MODULES[module];
  const envelope = mockSettingsEnvelope(module);
  return {
    module,
    path: SETTINGS_MODULE_PATHS[module],
    title: def.title,
    description: def.description,
    scope: def.scope,
    feature: def.feature ?? null,
    page: def.page ?? null,
    canWrite: true,
    version: envelope.version,
    overriddenCount: envelope.overriddenPaths.length,
    updatedAt: envelope.updatedAt,
  };
}

/** 网盘 / 知识库的其它 mock handler 直接读 mockDriveSettings / mockWikiSettings：保存后同步过去 */
function syncDomainMirrors(module: SettingsModuleKey) {
  if (module === 'drive') Object.assign(mockDriveSettings, getMockSettings('drive'));
  if (module === 'wiki') Object.assign(mockWikiSettings, getMockSettings('wiki'));
}

function moduleHandlers<M extends SettingsModuleKey>(module: M) {
  const history = settingsHistoryOps(module);
  return [
    mock(settingsGetOp(module) as unknown as SettingsGetOperation<M>, ({ ok }) => ok(mockSettingsEnvelope(module))),
    mock(settingsUpdateOp(module) as unknown as SettingsUpdateOperation<M>, ({ body, ok }) => {
      const saved = putMockSettings(module, body);
      syncDomainMirrors(module);
      return ok(saved, '保存成功');
    }),
    mock(history.list, ({ ok, paginate }) => ok(paginate(mockSettingsRevisions(module)))),
    mock(history.compare, ({ query, ok }) => {
      const from = mockSettingsRevision(module, query.from);
      const to = mockSettingsRevision(module, query.to);
      return ok({ fromVersion: query.from, toVersion: query.to, changes: diffSettingsSnapshots(from, to, to.definition, from.definition) });
    }),
    mock(history.detail, ({ params, ok }) => ok(mockSettingsRevision(module, params.version))),
    mock(history.preview, ({ params, body, ok }) => ok(previewMockSettingsRestore(module, params.version, body.baseToken))),
    mock(history.restore, ({ params, body, ok }) => {
      const saved = putMockSettings(module, { ...body, overrides: {} }, params.version);
      syncDomainMirrors(module);
      return ok(saved, '恢复成功');
    }),
  ];
}

export const settingsHandlers = [
  mock(settingsContract.list, ({ ok }) => ok(SETTINGS_MODULE_KEYS.map(moduleMeta).sort((a, b) => SETTINGS_MODULES[a.module].sort - SETTINGS_MODULES[b.module].sort))),

  mock(settingsContract.public, ({ ok }) => {
    const result: Record<string, unknown> = {};
    for (const module of Object.keys(publicSettingsSchema.shape) as SettingsModuleKey[]) {
      result[module] = pickSettingsFields(module, getMockSettings(module), ['public']);
    }
    return ok(result as PublicSettings);
  }),

  mock(settingsContract.me, ({ ok }) => {
    const result: Record<string, unknown> = {};
    for (const module of Object.keys(mySettingsSchema.shape) as SettingsModuleKey[]) {
      result[module] = pickSettingsFields(module, getMockSettings(module), ['public', 'authenticated']);
    }
    return ok(result as MySettings);
  }),

  ...SETTINGS_MODULE_KEYS.flatMap((module) => moduleHandlers(module)),
];
