/**
 * 主体活性判定是 JWT 鉴权（middleware/auth）、refresh 续签（auth.service）与 OAuth 授权（oauth2-auth.service）
 * 共用的一段规则；这里锁定判定顺序、状态码与文案，任何一处想改口径都必须先改这里。
 */
import { describe, expect, it } from 'vitest';
import { checkSubjectLiveness, type SubjectRow } from './subject-liveness';

const base: SubjectRow = {
  id: 1, username: 'alice', nickname: 'Alice', email: null, avatar: null,
  status: 'enabled', tenantId: null, tenantStatus: null, tenantExpireAt: null,
};
const tenantUser: SubjectRow = { ...base, tenantId: 7, tenantStatus: 'enabled', tenantExpireAt: null };

describe('checkSubjectLiveness', () => {
  it('用户不存在 → 401 用户不存在', () => {
    expect(checkSubjectLiveness(null)).toEqual({ ok: false, status: 401, message: '用户不存在' });
  });

  it('账号非 enabled → 403 账号已被禁用（优先于租户声明校验）', () => {
    expect(checkSubjectLiveness({ ...tenantUser, status: 'disabled' }, { claimedTenantId: 999 }))
      .toEqual({ ok: false, status: 403, message: '账号已被禁用' });
  });

  it('令牌租户声明与库不一致 → 401 登录状态已失效（含平台账号 null 与租户 ID 的双向不一致）', () => {
    expect(checkSubjectLiveness(tenantUser, { claimedTenantId: null }))
      .toEqual({ ok: false, status: 401, message: '登录状态已失效，请重新登录' });
    expect(checkSubjectLiveness(base, { claimedTenantId: 7 }))
      .toEqual({ ok: false, status: 401, message: '登录状态已失效，请重新登录' });
    expect(checkSubjectLiveness(tenantUser, { claimedTenantId: 8 }).ok).toBe(false);
  });

  it('声明 undefined 视同 null（旧令牌没带 tenantId 字段）', () => {
    expect(checkSubjectLiveness(base, { claimedTenantId: undefined }).ok).toBe(true);
    expect(checkSubjectLiveness(tenantUser, { claimedTenantId: undefined }).ok).toBe(false);
  });

  it('不传 claimedTenantId 则不校验声明（OAuth 用户）', () => {
    expect(checkSubjectLiveness(tenantUser)).toEqual({ ok: true, row: tenantUser, tenantId: 7 });
  });

  it('所属租户禁用或到期 → 403 租户已被禁用或过期；平台账号（tenantId null）不做租户校验', () => {
    expect(checkSubjectLiveness({ ...tenantUser, tenantStatus: 'disabled' }, { claimedTenantId: 7 }))
      .toEqual({ ok: false, status: 403, message: '租户已被禁用或过期' });
    const now = new Date('2026-09-13T00:00:00Z');
    expect(checkSubjectLiveness({ ...tenantUser, tenantExpireAt: new Date('2026-09-12T23:59:59Z') }, { claimedTenantId: 7, now }).ok).toBe(false);
    expect(checkSubjectLiveness({ ...tenantUser, tenantExpireAt: new Date('2026-09-14T00:00:00Z') }, { claimedTenantId: 7, now }).ok).toBe(true);
    expect(checkSubjectLiveness({ ...base, tenantStatus: 'disabled' }, { claimedTenantId: null }).ok).toBe(true);
  });

  it('全部通过 → 返回权威行与库中租户 ID，供调用方回填令牌', () => {
    expect(checkSubjectLiveness(tenantUser, { claimedTenantId: 7 })).toEqual({ ok: true, row: tenantUser, tenantId: 7 });
    expect(checkSubjectLiveness(base, { claimedTenantId: null })).toEqual({ ok: true, row: base, tenantId: null });
  });
});
