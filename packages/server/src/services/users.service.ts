import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../db';
import type { DbExecutor } from '../db/types';
import { userRoles, roles, departments, positions, userPositions } from '../db/schema';
import { AppError } from '../lib/errors';
import { tenantCondition } from '../lib/tenant';
import type { JwtPayload } from '../middleware/auth';
import type { User } from '@zenith/shared';

// ─── 关联查询配置 ─────────────────────────────────────────────────────────────

const userRelationConfig = {
  department: { columns: { name: true } },
  userRoles: { columns: {}, with: { role: true } },
  userPositions: { columns: {}, with: { position: true } },
} as const;

type FindManyUsersArgs = NonNullable<Parameters<typeof db.query.users.findMany>[0]>;
type FindFirstUserArgs = NonNullable<Parameters<typeof db.query.users.findFirst>[0]>;

export async function findUsersWithRelations(config: Omit<FindManyUsersArgs, 'with'> = {}) {
  return db.query.users.findMany({ ...config, with: userRelationConfig });
}

export async function findUserWithRelations(config: Omit<FindFirstUserArgs, 'with'>) {
  return db.query.users.findFirst({ ...config, with: userRelationConfig });
}

export type UserWithRelations = Awaited<ReturnType<typeof findUsersWithRelations>>[number];

// ─── 数据映射 ─────────────────────────────────────────────────────────────────

export function mapUser(row: UserWithRelations): User {
  const roleList = row.userRoles.map(({ role: r }) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    description: r.description ?? undefined,
    dataScope: r.dataScope,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
  const positionList = row.userPositions.map(({ position: p }) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    sort: p.sort,
    status: p.status,
    remark: p.remark ?? undefined,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    email: row.email,
    phone: row.phone ?? undefined,
    avatar: row.avatar ?? undefined,
    departmentId: row.departmentId,
    departmentName: row.department?.name ?? null,
    positionIds: positionList.map((p) => p.id),
    positions: positionList,
    roles: roleList,
    status: row.status,
    passwordUpdatedAt: row.passwordUpdatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } satisfies User;
}

export function mapUsers(rows: UserWithRelations[]): User[] {
  return rows.map(mapUser);
}

// ─── 关联关系设置 ─────────────────────────────────────────────────────────────

export async function setUserRoles(executor: DbExecutor, userId: number, roleIds: number[]) {
  await executor.delete(userRoles).where(eq(userRoles.userId, userId));
  if (roleIds.length > 0) {
    await executor.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId })));
  }
}

export async function setUserPositions(executor: DbExecutor, userId: number, positionIds: number[]) {
  await executor.delete(userPositions).where(eq(userPositions.userId, userId));
  if (positionIds.length > 0) {
    await executor.insert(userPositions).values(positionIds.map((positionId) => ({ userId, positionId })));
  }
}

// ─── 参照完整性校验（失败时抛出 AppError）────────────────────────────────────

export async function ensureDepartmentExists(departmentId?: number | null, user?: JwtPayload) {
  if (departmentId === undefined || departmentId === null) return;
  const conditions = [eq(departments.id, departmentId)];
  if (user) {
    const tc = tenantCondition(departments, user);
    if (tc) conditions.push(tc);
  }
  const [d] = await db.select({ id: departments.id }).from(departments).where(and(...conditions)).limit(1);
  if (!d) throw new AppError('所属部门不存在', 400);
}

export async function ensureRoleIdsExist(roleIds: number[], user?: JwtPayload) {
  const uniq = Array.from(new Set(roleIds));
  if (uniq.length === 0) return;
  const conditions = [inArray(roles.id, uniq)];
  if (user) {
    const tc = tenantCondition(roles, user);
    if (tc) conditions.push(tc);
  }
  const rows = await db.select({ id: roles.id }).from(roles).where(and(...conditions));
  if (rows.length !== uniq.length) throw new AppError('存在无效角色', 400);
}

export async function ensurePositionIdsExist(positionIds: number[], user?: JwtPayload) {
  const uniq = Array.from(new Set(positionIds));
  if (uniq.length === 0) return;
  const conditions = [inArray(positions.id, uniq)];
  if (user) {
    const tc = tenantCondition(positions, user);
    if (tc) conditions.push(tc);
  }
  const rows = await db.select({ id: positions.id }).from(positions).where(and(...conditions));
  if (rows.length !== uniq.length) throw new AppError('存在无效岗位', 400);
}
