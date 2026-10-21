import { describe, expect, it } from 'vitest';
import { createUserSchema, updateUserSchema, updateUserOrganizationSchema } from './validation';

describe('identity profile authority boundary', () => {
  it.each([
    { roleIds: [1] }, { roleIds: [] }, { departmentId: 1 }, { positionIds: [1] },
    { status: 'enabled' }, { permissionCodes: ['system:user:assign'] }, { dataScope: 'all' },
  ])('rejects authority fields in both ordinary create and update: %j', fields => {
    expect(createUserSchema.safeParse({ username: 'normal', nickname: '普通用户', password: '123456', ...fields }).success).toBe(false);
    expect(updateUserSchema.safeParse({ nickname: '普通用户', ...fields }).success).toBe(false);
  });

  it('keeps profile editing independent from organization changes', () => {
    expect(updateUserSchema.parse({ nickname: '新昵称', email: '' })).toEqual({ nickname: '新昵称', email: null });
    expect(updateUserOrganizationSchema.parse({ departmentId: null, positionIds: [] })).toEqual({ departmentId: null, positionIds: [] });
    expect(updateUserOrganizationSchema.safeParse({ departmentId: 1 }).success).toBe(false);
  });
});
