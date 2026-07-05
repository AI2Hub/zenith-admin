import type { UserGroup } from '@zenith/shared';

interface MockUserGroup extends UserGroup {
  memberIds: number[];
  roleIds: number[];
}

export const mockUserGroups: MockUserGroup[] = [
  {
    id: 1,
    name: '研发部审批组',
    code: 'rd_approver',
    description: '研发部门审批人员组',
    ownerId: 1,
    ownerName: '管理员',
    departmentId: 1,
    departmentName: '研发部',
    memberCount: 3,
    memberIds: [1, 2, 3],
    roleIds: [2],
    roleCount: 1,
    status: 'enabled',
    createdAt: '2026-05-01 09:00:00',
    updatedAt: '2026-05-01 09:00:00',
  },
  {
    id: 2,
    name: '财务复核组',
    code: 'finance_review',
    description: '财务凭证复核人员',
    ownerId: 1,
    ownerName: '管理员',
    departmentId: null,
    departmentName: null,
    memberCount: 2,
    memberIds: [1, 4],
    roleIds: [],
    roleCount: 0,
    status: 'enabled',
    createdAt: '2026-05-02 10:30:00',
    updatedAt: '2026-05-02 10:30:00',
  },
];

let nextId = mockUserGroups.length + 1;
export function getNextUserGroupId() { return nextId++; }
