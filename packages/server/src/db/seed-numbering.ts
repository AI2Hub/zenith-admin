import { eq, sql } from 'drizzle-orm';
import { SEED_NUMBERING_RULES } from '@zenith/shared/seed';
import { db } from './index';
import { numberingBindings, numberingRules, numberingVersions } from './schema';
import { requireRow } from '../lib/db-assert';
import { exactTenantCondition } from '../lib/tenant';
import { buildWhere } from '../lib/where-helpers';
import { lockNumberingBinding } from '../services/platform/numbering-binding-lock';

/** 按稳定业务编码查找真实 ID，只补缺项；绝不覆盖管理员发布的规则与业务绑定。 */
export async function seedNumbering() {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('seed:numbering', 0))`);
    for (const seed of SEED_NUMBERING_RULES) {
      await lockNumberingBinding(tx, { tenantId: null, scene: seed.scene, ownerKey: '*' });
      let [rule] = await tx.select().from(numberingRules).where(buildWhere(
        eq(numberingRules.code, seed.code), exactTenantCondition(numberingRules.tenantId, null),
      )).limit(1);
      if (!rule) {
        [rule] = await tx.insert(numberingRules).values({
          code: seed.code, name: seed.name, scene: seed.scene, description: seed.description,
          tenantId: null, isBuiltin: true, status: seed.status, draft: seed.draft,
          revision: 1, currentVersion: 1,
        }).returning();
        await tx.insert(numberingVersions).values({ ruleId: requireRow(rule, '编号规则 seed 失败').id, version: 1, config: seed.draft });
      }
      const existing = requireRow(rule, '编号规则 seed 失败');
      const [version] = await tx.select().from(numberingVersions).where(buildWhere(
        eq(numberingVersions.ruleId, existing.id), eq(numberingVersions.version, existing.currentVersion),
      )).limit(1);
      // 已有同编码草稿或被停用的规则由管理员处理，seed 不擅自发布或重新启用。
      if (!version || existing.status !== 'enabled' || existing.scene !== seed.scene) continue;
      await tx.insert(numberingBindings).values({
        scene: seed.scene, ownerKey: '*', tenantId: null, ruleId: existing.id,
        versionId: version.id, parameterMapping: {},
      }).onConflictDoNothing();
    }
  });
}
