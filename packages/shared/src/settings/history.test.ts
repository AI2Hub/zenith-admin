import { describe, expect, it } from 'vitest';
import { accessPermissions, accessPlatformOnly } from '../core/contract';
import { getSettingsDefinition } from './definition';
import { diffSettingsSnapshots } from './history';
import { settingsHistoryOps, settingsRestoreBodySchema, settingsRevisionDetailSchema } from './history-contracts';
import { SETTINGS_MODULE_KEYS, SETTINGS_MODULE_PATHS, SETTINGS_MODULES } from './registry';

describe('settings version contracts', () => {
  it('所有历史操作沿用模块权限、平台限制与特性门控', () => {
    for (const module of SETTINGS_MODULE_KEYS) {
      const def = SETTINGS_MODULES[module];
      const ops = settingsHistoryOps(module);
      for (const operation of [ops.list, ops.detail, ops.compare]) {
        expect(accessPermissions(operation.access)).toEqual(def.readPermission ? [def.readPermission] : []);
        expect(accessPlatformOnly(operation.access)).toBe(def.platformOnly ?? false);
        expect(operation.feature).toBe(def.feature);
      }
      for (const operation of [ops.preview, ops.restore]) {
        expect(accessPermissions(operation.access)).toEqual([def.writePermission]);
        expect(accessPlatformOnly(operation.access)).toBe(def.platformOnly ?? false);
        expect(operation.feature).toBe(def.feature);
      }
      expect(ops.list.fullPath).toBe(`/api/settings${SETTINGS_MODULE_PATHS[module]}/versions`);
      expect(ops.detail.params.parse({ version: '0' })).toEqual({ version: 0 });
      expect(ops.list.query.parse({})).toEqual({ page: 1, pageSize: 10 });
    }
  });

  it('恢复必须携带并发指纹和非空说明', () => {
    expect(settingsRestoreBodySchema.safeParse({ baseToken: 'fingerprint', note: '   ' }).success).toBe(false);
    expect(settingsRestoreBodySchema.safeParse({ note: '恢复' }).success).toBe(false);
    expect(settingsRestoreBodySchema.parse({ baseToken: 'fingerprint', note: ' 恢复上次配置 ' }))
      .toEqual({ baseToken: 'fingerprint', note: '恢复上次配置' });
  });

  it('v0 默认继承状态没有虚构的创建时间', () => {
    expect(settingsRevisionDetailSchema.safeParse({
      id: 0, version: 0, action: 'initial', restoredFromVersion: null,
      note: '', actorId: null, actorName: '系统默认', createdAt: null, changedPaths: [],
      overrides: {}, inherited: {}, effective: {}, definitionHash: '', definition: {}, inheritedVersion: 0,
    }).success).toBe(true);
  });
});

describe('settings version comparison', () => {
  it('同值覆盖与恢复继承仍展示为变更', () => {
    const definition = getSettingsDefinition('identitySecurity');
    const effective = { password: { minLength: 6 } };
    const inherited = { effective, overrides: {} };
    const overridden = { effective, overrides: { password: { minLength: 6 } } };
    expect(diffSettingsSnapshots(inherited, overridden, definition)).toEqual([{
      path: 'password.minLength', title: '密码策略 / 密码最小长度', type: 'integer',
      before: 6, after: 6, beforeOverridden: false, afterOverridden: true,
      valueChanged: false, inheritanceChanged: true, added: [], removed: [],
    }]);
    expect(diffSettingsSnapshots(overridden, inherited, definition)[0]).toMatchObject({
      beforeOverridden: true, afterOverridden: false, valueChanged: false, inheritanceChanged: true,
    });
  });

  it('上级变化导致的生效值变化和本层覆盖关系分别记录', () => {
    const changes = diffSettingsSnapshots(
      { effective: { size: 100 }, overrides: {} },
      { effective: { size: 200 }, overrides: {} },
    );
    expect(changes[0]).toMatchObject({ before: 100, after: 200, valueChanged: true, inheritanceChanged: false });
  });

  it('数组整体变更，同时列出新增、删除及重复元素数量', () => {
    const changes = diffSettingsSnapshots(
      { effective: { list: ['a', 'a', 'b'] }, overrides: { list: ['a', 'a', 'b'] } },
      { effective: { list: ['a', 'c'] }, overrides: { list: ['a', 'c'] } },
    );
    expect(changes[0]).toMatchObject({ added: ['c'], removed: ['a', 'b'] });
  });

  it('数组纯排序也算值变化，而对象键顺序不误报新增删除', () => {
    const from = { effective: { list: [{ x: 1, y: 2 }, { x: 3 }] }, overrides: {} };
    const same = { effective: { list: [{ y: 2, x: 1 }, { x: 3 }] }, overrides: {} };
    expect(diffSettingsSnapshots(from, same)).toEqual([]);
    const reordered = { effective: { list: [{ x: 3 }, { x: 1, y: 2 }] }, overrides: {} };
    expect(diffSettingsSnapshots(from, reordered)[0]).toMatchObject({ valueChanged: true, added: [], removed: [] });
  });

  it('历史定义中的已删除字段仍有中文标题且可以看到删除', () => {
    const changes = diffSettingsSnapshots(
      { effective: { retired: true }, overrides: { retired: true } },
      { effective: {}, overrides: {} },
      { type: 'object', properties: { retired: { type: 'boolean', title: '已停用的开关' } } },
    );
    expect(changes[0]).toMatchObject({ title: '已停用的开关', before: true, after: null, inheritanceChanged: true });
  });
});
