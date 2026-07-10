import { describe, expect, it } from 'vitest';
import {
  isReportAclActive,
  reportAclRoleSatisfies,
  resolveReportAclRoleFromEntries,
  type AccessCandidate,
  type AclEvaluationEntry,
  type SubjectSet,
} from './report-resource-acl.service';

const resource: AccessCandidate = {
  id: 10,
  tenantId: 1,
  ownerId: 99,
  folderId: 20,
  createdBy: 99,
};

const subjects: SubjectSet = {
  user: new Set([7]),
  role: new Set([3]),
  department: new Set([4]),
  user_group: new Set([5]),
};

function acl(overrides: Partial<AclEvaluationEntry> = {}): AclEvaluationEntry {
  return {
    tenantId: 1,
    resourceType: 'dashboard',
    resourceId: 10,
    subjectType: 'user',
    subjectId: 7,
    role: 'viewer',
    inheritFromFolder: false,
    expiresAt: null,
    ...overrides,
  };
}

describe('report resource ACL evaluation', () => {
  it('uses viewer < editor < owner hierarchy', () => {
    expect(reportAclRoleSatisfies('owner', 'editor')).toBe(true);
    expect(reportAclRoleSatisfies('editor', 'viewer')).toBe(true);
    expect(reportAclRoleSatisfies('viewer', 'editor')).toBe(false);
  });

  it('fails closed when no owner fallback or matching ACL exists', () => {
    expect(resolveReportAclRoleFromEntries(
      'dashboard', resource, 7, false, subjects, [], [],
    )).toBeNull();
  });

  it('ignores expired grants and chooses the strongest active matching subject grant', () => {
    const now = new Date('2026-04-01T00:00:00Z');
    expect(isReportAclActive(new Date('2026-03-31T23:59:59Z'), now)).toBe(false);
    expect(resolveReportAclRoleFromEntries('dashboard', resource, 7, false, subjects, [], [
      acl({ role: 'owner', expiresAt: new Date('2026-03-31T23:59:59Z') }),
      acl({ subjectType: 'role', subjectId: 3, role: 'editor' }),
      acl({ subjectType: 'department', subjectId: 4, role: 'viewer' }),
    ], now)).toBe('editor');
  });

  it('inherits only grants marked for an ancestor folder', () => {
    expect(resolveReportAclRoleFromEntries('dashboard', resource, 7, false, subjects, [20, 12], [
      acl({ resourceId: 20, inheritFromFolder: true, subjectType: 'user', role: 'editor' }),
      acl({ resourceId: 12, inheritFromFolder: false, subjectType: 'user', role: 'owner' }),
    ])).toBe('editor');
  });

  it('rejects cross-tenant and cross-resource-type grants', () => {
    expect(resolveReportAclRoleFromEntries('dashboard', resource, 7, false, subjects, [20], [
      acl({ tenantId: 2, role: 'owner' }),
      acl({ resourceType: 'dataset', role: 'owner' }),
      acl({ tenantId: 2, resourceId: 20, inheritFromFolder: true, role: 'owner' }),
    ])).toBeNull();
  });

  it('gives explicit owner, createdBy fallback, super admin, and legacy rows owner access', () => {
    expect(resolveReportAclRoleFromEntries('dashboard', { ...resource, ownerId: 7 }, 7, false, subjects, [], [])).toBe('owner');
    expect(resolveReportAclRoleFromEntries('dashboard', { ...resource, ownerId: null, createdBy: 7 }, 7, false, subjects, [], [])).toBe('owner');
    expect(resolveReportAclRoleFromEntries('dashboard', resource, 7, true, subjects, [], [])).toBe('owner');
    expect(resolveReportAclRoleFromEntries(
      'dashboard', { ...resource, ownerId: null, createdBy: null }, 7, false, subjects, [], [],
    )).toBe('owner');
  });
});
