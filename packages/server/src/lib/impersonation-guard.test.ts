import { describe, expect, it } from 'vitest';
import {
  IMPERSONATION_PERSONAL_STATE_MESSAGE,
  IMPERSONATION_READ_ONLY_MESSAGE,
  IMPERSONATION_SENSITIVE_MESSAGE,
  impersonationWriteDenial,
} from './impersonation-guard';

const readOnly = { id: 1, byUserId: 1, byUsername: 'admin', readOnly: true };
const writable = { ...readOnly, readOnly: false };

describe('impersonationWriteDenial', () => {
  it('读请求一律放行', () => {
    expect(impersonationWriteDenial('GET', '/api/users', readOnly)).toBeNull();
    expect(impersonationWriteDenial('HEAD', '/api/auth/password', readOnly)).toBeNull();
  });

  it('只读模式拒绝普通写请求，但放行结束模拟与退出登录', () => {
    expect(impersonationWriteDenial('POST', '/api/drive/nodes/folder', readOnly)).toBe(IMPERSONATION_READ_ONLY_MESSAGE);
    expect(impersonationWriteDenial('DELETE', '/api/in-app-messages/1', readOnly)).toBe(IMPERSONATION_READ_ONLY_MESSAGE);
    expect(impersonationWriteDenial('POST', '/api/impersonation/end', readOnly)).toBeNull();
    expect(impersonationWriteDenial('POST', '/api/auth/logout', readOnly)).toBeNull();
  });

  it('可操作模式放行普通写请求', () => {
    expect(impersonationWriteDenial('POST', '/api/drive/nodes/folder', writable)).toBeNull();
    expect(impersonationWriteDenial('PUT', '/api/users/2', writable)).toBeNull();
  });

  it('账号安全类写操作在两种模式下都被拒绝，含子路径与嵌套模拟', () => {
    for (const claim of [readOnly, writable]) {
      expect(impersonationWriteDenial('PUT', '/api/auth/password', claim)).toBe(IMPERSONATION_SENSITIVE_MESSAGE);
      expect(impersonationWriteDenial('PUT', '/api/auth/profile', claim)).toBe(IMPERSONATION_SENSITIVE_MESSAGE);
      expect(impersonationWriteDenial('POST', '/api/auth/mfa/totp/setup', claim)).toBe(IMPERSONATION_SENSITIVE_MESSAGE);
      expect(impersonationWriteDenial('DELETE', '/api/auth/trusted-devices/3', claim)).toBe(IMPERSONATION_SENSITIVE_MESSAGE);
      expect(impersonationWriteDenial('POST', '/api/auth/switch-tenant', claim)).toBe(IMPERSONATION_SENSITIVE_MESSAGE);
      expect(impersonationWriteDenial('POST', '/api/api-tokens', claim)).toBe(IMPERSONATION_SENSITIVE_MESSAGE);
      expect(impersonationWriteDenial('POST', '/api/impersonation/start', claim)).toBe(IMPERSONATION_SENSITIVE_MESSAGE);
    }
  });

  it('前缀匹配不会误伤同前缀的其它路径', () => {
    // /api/api-tokens 之外的 /api/api-tokens-xxx 不算子路径
    expect(impersonationWriteDenial('POST', '/api/api-tokens-audit', writable)).toBeNull();
    expect(impersonationWriteDenial('POST', '/api/auth/passwordless', writable)).toBeNull();
  });

  it('被模拟用户的偏好与收藏菜单不可覆盖', () => {
    expect(impersonationWriteDenial('PUT', '/api/auth/preferences', writable)).toBe(IMPERSONATION_PERSONAL_STATE_MESSAGE);
    expect(impersonationWriteDenial('PUT', '/api/auth/favorite-menus', writable)).toBe(IMPERSONATION_PERSONAL_STATE_MESSAGE);
    expect(impersonationWriteDenial('GET', '/api/auth/preferences', readOnly)).toBeNull();
  });
});
