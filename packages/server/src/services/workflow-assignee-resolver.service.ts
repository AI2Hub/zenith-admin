/**
 * 工作流审批人解析器
 *
 * 将节点配置中的 assigneeType + 多源 IDs 解析为具体的用户 ID 列表，
 * 用于在创建审批任务时展开为多个 workflow_tasks 行。
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { WorkflowAssigneeType, WorkflowNodeConfig, WorkflowStarterContext } from '@zenith/shared';
import { db } from '../db';
import {
  departments,
  roleDeptScopes,
  userGroupMembers,
  userPositions,
  userRoles,
  users,
  workflowTasks,
} from '../db/schema';
import type { DbExecutor } from '../db/types';
import logger from '../lib/logger';
import { evaluateExpression, ExpressionError } from '../lib/workflow-expression';
import { getDecisionOutputs } from './rules.service';

export interface ResolveAssigneeContext {
  /** 流程发起人 ID（用于 initiator / initiatorLeader / initiatorDept / manager） */
  initiatorId: number;
  /** 数据库执行器，未指定时使用全局 db */
  executor?: DbExecutor;
  /** 表单数据（formUser / formDepartment 等策略使用） */
  formData?: Record<string, unknown>;
  /** 当前流程实例 ID（nodeApprover 策略使用） */
  instanceId?: number;
  /** 上一节点审批人在审批时为本次创建的 approverSelect 节点选择的用户 ID 列表 */
  selectedNextApprovers?: number[];
}

export interface WorkflowSelectableUser {
  id: number;
  name: string;
}

/** 从给定部门开始向上走 levels 层，返回最终所在的部门 ID（找不到则返回 null） */
async function walkDeptUp(exec: DbExecutor, startDeptId: number, levels: number): Promise<number | null> {
  let current: number | null = startDeptId;
  for (let i = 0; i < levels && current !== null; i++) {
    const [parent] = await exec.select({ parentId: departments.parentId })
      .from(departments).where(eq(departments.id, current)).limit(1);
    if (!parent || parent.parentId === 0 || parent.parentId === null) return null;
    current = parent.parentId;
  }
  return current;
}

/** 取得用户所在部门 */
async function getUserDept(exec: DbExecutor, userId: number): Promise<number | null> {
  const [row] = await exec.select({ deptId: users.departmentId })
    .from(users).where(eq(users.id, userId)).limit(1);
  return row?.deptId ?? null;
}

/** 取部门负责人 */
async function getDeptLeader(exec: DbExecutor, deptId: number): Promise<number | null> {
  const [row] = await exec.select({ leaderId: departments.leaderId })
    .from(departments).where(eq(departments.id, deptId)).limit(1);
  return row?.leaderId ?? null;
}

/** 递归收集部门及其所有子部门 ID（含起始部门）。 */
async function collectDeptWithChildren(exec: DbExecutor, rootIds: number[]): Promise<number[]> {
  const all = new Set<number>(rootIds);
  let frontier = [...rootIds];
  while (frontier.length > 0) {
    const rows = await exec.select({ id: departments.id })
      .from(departments).where(inArray(departments.parentId, frontier));
    const next: number[] = [];
    for (const r of rows) {
      if (!all.has(r.id)) {
        all.add(r.id);
        next.push(r.id);
      }
    }
    frontier = next;
  }
  return [...all];
}

/** 收集部门及其所有上级部门 ID（含自身）；用于发起人维度条件「选父部门覆盖子部门」语义 */
async function getDeptAncestors(exec: DbExecutor, deptId: number): Promise<number[]> {
  const chain: number[] = [];
  const seen = new Set<number>();
  let current: number | null = deptId;
  while (current !== null && current !== 0 && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    const [row] = await exec.select({ parentId: departments.parentId })
      .from(departments).where(eq(departments.id, current)).limit(1);
    current = row?.parentId ?? null;
  }
  return chain;
}

function uniquePositiveIds(ids: readonly number[] | null | undefined): number[] {
  return [...new Set((ids ?? []).filter((id) => Number.isInteger(id) && id > 0))];
}

async function enabledUserIds(exec: DbExecutor, ids: readonly number[]): Promise<number[]> {
  const uniq = uniquePositiveIds(ids);
  if (uniq.length === 0) return [];
  const rows = await exec
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, uniq), eq(users.status, 'enabled')));
  return rows.map((row) => row.id);
}

async function userIdsByRoleIds(exec: DbExecutor, roleIds: readonly number[]): Promise<number[]> {
  const uniq = uniquePositiveIds(roleIds);
  if (uniq.length === 0) return [];
  const rows = await exec
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(userRoles.roleId, uniq), eq(users.status, 'enabled')));
  return rows.map((row) => row.id);
}

async function userIdsByDepartmentIds(exec: DbExecutor, deptIds: readonly number[]): Promise<number[]> {
  const uniq = uniquePositiveIds(deptIds);
  if (uniq.length === 0) return [];
  const rows = await exec
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.departmentId, uniq), eq(users.status, 'enabled')));
  return rows.map((row) => row.id);
}

async function userIdsByUserGroupIds(exec: DbExecutor, groupIds: readonly number[]): Promise<number[]> {
  const uniq = uniquePositiveIds(groupIds);
  if (uniq.length === 0) return [];
  const rows = await exec
    .select({ id: users.id })
    .from(users)
    .innerJoin(userGroupMembers, eq(userGroupMembers.userId, users.id))
    .where(and(inArray(userGroupMembers.groupId, uniq), eq(users.status, 'enabled')));
  return rows.map((row) => row.id);
}

export async function resolveSelectScopeUserIds(
  node: WorkflowNodeConfig,
  executor?: DbExecutor,
): Promise<number[] | null> {
  const exec = executor ?? db;
  const scopeIds = uniquePositiveIds(node.selectScopeIds ?? []);
  if (scopeIds.length === 0) return null;
  switch (node.selectScopeType ?? 'user') {
    case 'user':
      return enabledUserIds(exec, scopeIds);
    case 'role':
      return userIdsByRoleIds(exec, scopeIds);
    case 'department':
      return userIdsByDepartmentIds(exec, scopeIds);
    case 'userGroup':
      return userIdsByUserGroupIds(exec, scopeIds);
    default:
      return null;
  }
}

export async function listSelectableApprovers(
  node: WorkflowNodeConfig,
  executor?: DbExecutor,
): Promise<WorkflowSelectableUser[]> {
  const exec = executor ?? db;
  const scopeUserIds = await resolveSelectScopeUserIds(node, exec);
  const where = scopeUserIds
    ? (scopeUserIds.length > 0 ? and(inArray(users.id, scopeUserIds), eq(users.status, 'enabled')) : undefined)
    : eq(users.status, 'enabled');
  if (scopeUserIds && scopeUserIds.length === 0) return [];
  const rows = await exec
    .select({ id: users.id, nickname: users.nickname, username: users.username })
    .from(users)
    .where(where)
    .orderBy(users.id);
  return rows.map((row) => ({ id: row.id, name: row.nickname ?? row.username }));
}

export async function filterSelectedApproverIds(
  node: WorkflowNodeConfig,
  selectedIds: readonly number[] | null | undefined,
  executor?: DbExecutor,
): Promise<number[]> {
  const picked = await enabledUserIds(executor ?? db, selectedIds ?? []);
  if (picked.length === 0) return [];
  const scopeUserIds = await resolveSelectScopeUserIds(node, executor);
  if (!scopeUserIds) return picked;
  const allow = new Set(scopeUserIds);
  return picked.filter((id) => allow.has(id));
}

/**
 * 构建发起人运行时上下文快照（部门祖先链 + 角色 + 岗位），
 * 供条件分支「发起人维度」（user/dept/role/post）求值。
 */
export async function buildStarterContext(
  initiatorId: number,
  executor?: DbExecutor,
): Promise<WorkflowStarterContext> {
  const exec = executor ?? db;
  const deptId = await getUserDept(exec, initiatorId);
  const [deptIds, roleRows, postRows] = await Promise.all([
    deptId ? getDeptAncestors(exec, deptId) : Promise.resolve<number[]>([]),
    exec.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, initiatorId)),
    exec.select({ positionId: userPositions.positionId }).from(userPositions).where(eq(userPositions.userId, initiatorId)),
  ]);
  return {
    userId: initiatorId,
    deptIds,
    roleIds: roleRows.map((r) => r.roleId),
    postIds: postRows.map((r) => r.positionId),
  };
}

/**
 * 解析指定用户的上级（部门负责人）。level=1 取所在部门负责人，level>1 沿部门链向上。
 * 用于超时升级「转交给上级」。找不到返回 null。
 */
export async function resolveUserManagerId(
  userId: number,
  level = 1,
  executor?: DbExecutor,
): Promise<number | null> {
  const exec = executor ?? db;
  const startDeptId = await getUserDept(exec, userId);
  if (!startDeptId) return null;
  const lv = Math.max(1, level);
  const targetDeptId = lv === 1 ? startDeptId : await walkDeptUp(exec, startDeptId, lv - 1);
  if (!targetDeptId) return null;
  return getDeptLeader(exec, targetDeptId);
}

export async function resolveUserDeptHeadId(
  userId: number,
  executor?: DbExecutor,
): Promise<number | null> {
  const exec = executor ?? db;
  const deptId = await getUserDept(exec, userId);
  if (!deptId) return null;
  const leaderId = await getDeptLeader(exec, deptId);
  if (!leaderId || leaderId === userId) return null;
  const [leader] = await exec.select({ id: users.id }).from(users)
    .where(and(eq(users.id, leaderId), eq(users.status, 'enabled')))
    .limit(1);
  return leader?.id ?? null;
}

export async function resolveAdminUserId(executor?: DbExecutor): Promise<number | null> {
  const exec = executor ?? db;
  const [admin] = await exec.select({ id: users.id }).from(users)
    .where(and(eq(users.username, 'admin'), eq(users.status, 'enabled')))
    .limit(1);
  if (admin) return admin.id;
  const [firstEnabled] = await exec.select({ id: users.id }).from(users)
    .where(eq(users.status, 'enabled'))
    .limit(1);
  return firstEnabled?.id ?? null;
}

/** 审批人表达式可引用的根变量 */
export const ASSIGNEE_EXPR_ROOTS = ['form', 'starter'] as const;

/**
 * 安全表达式求值器，作用域限定在 form / starter，返回 user ID 数组。
 * 例如： `form.managerId`, `[form.a, form.b]`, `starter.id`, `form.amount > 1000 ? form.vp : form.lead`
 * 求值经 workflow-expression 的 AST 解释器（无 new Function / 无全局可达），从根本上杜绝 RCE。
 */
function evalAssigneeExpression(
  expr: string,
  ctx: { form: Record<string, unknown>; starter: { id: number }; },
): number[] {
  try {
    const v = evaluateExpression(expr, { form: ctx.form, starter: ctx.starter });
    if (typeof v === 'number' && Number.isFinite(v)) return [v];
    if (Array.isArray(v)) {
      return v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    }
    return [];
  } catch (err) {
    if (err instanceof ExpressionError) {
      logger.warn('[assignee-resolver] 拒绝执行非法的审批人表达式', { expr, error: err.message });
    } else {
      logger.warn('[assignee-resolver] 审批人表达式求值失败', { expr });
    }
    return [];
  }
}

/** 将节点配置解析为去重后的用户 ID 数组 */
export async function resolveAssigneeIds(
  node: WorkflowNodeConfig,
  ctx: ResolveAssigneeContext,
): Promise<number[]> {
  const exec = ctx.executor ?? db;
  const type: WorkflowAssigneeType | undefined = node.assigneeType;

  // 兼容旧数据：未声明 assigneeType 时，回退 assigneeId / assigneeIds
  if (!type) {
    const fallback = new Set<number>();
    if (typeof node.assigneeId === 'number') fallback.add(node.assigneeId);
    if (node.assigneeIds?.length) node.assigneeIds.forEach((id) => fallback.add(id));
    return [...fallback];
  }

  const result = new Set<number>();

  switch (type) {
    case 'user':
    case 'initiatorSelect':
    case 'initiatorSelectScope': {
      // initiatorSelectScope 运行时依赖发起人在发起时选择的具体人员（已写回 userIds / assigneeIds）
      (node.userIds ?? []).forEach((id) => result.add(id));
      (node.assigneeIds ?? []).forEach((id) => result.add(id));
      if (typeof node.assigneeId === 'number') result.add(node.assigneeId);
      break;
    }
    case 'approverSelect': {
      // 由上一节点审批人在审批时选定
      const picked = await filterSelectedApproverIds(node, ctx.selectedNextApprovers ?? [], exec);
      picked.forEach((id) => result.add(id));
      break;
    }
    case 'role': {
      const roleIds = node.roleIds ?? [];
      if (roleIds.length > 0) {
        // 1) 查角色管理范围（按角色聚合部门）
        const scopeRows = await exec
          .select({ roleId: roleDeptScopes.roleId, deptId: roleDeptScopes.deptId })
          .from(roleDeptScopes)
          .where(inArray(roleDeptScopes.roleId, roleIds));
        const scopeByRole = new Map<number, number[]>();
        for (const r of scopeRows) {
          const arr = scopeByRole.get(r.roleId) ?? [];
          arr.push(r.deptId);
          scopeByRole.set(r.roleId, arr);
        }
        // 2) 查角色成员
        const memberRows = await exec
          .select({ userId: userRoles.userId, roleId: userRoles.roleId })
          .from(userRoles)
          .where(inArray(userRoles.roleId, roleIds));
        const hasScoped = scopeByRole.size > 0;
        // 3) 若存在管理范围，预取所有相关用户的部门信息
        const userDeptMap = new Map<number, number | null>();
        if (hasScoped) {
          const userIds = [...new Set(memberRows.map((r) => r.userId))];
          if (userIds.length > 0) {
            const rows = await exec.select({ id: users.id, deptId: users.departmentId })
              .from(users).where(inArray(users.id, userIds));
            rows.forEach((r) => userDeptMap.set(r.id, r.deptId));
          }
        }
        // 4) 展开每个角色的范围部门（含子部门），缓存
        const expandedScopeByRole = new Map<number, Set<number>>();
        for (const [roleId, deptIds] of scopeByRole) {
          const all = await collectDeptWithChildren(exec, deptIds);
          expandedScopeByRole.set(roleId, new Set(all));
        }
        // 5) 按角色判定成员
        for (const m of memberRows) {
          const scopeSet = expandedScopeByRole.get(m.roleId);
          if (!scopeSet) {
            // 该角色无管理范围 → 全员
            result.add(m.userId);
            continue;
          }
          const dept = userDeptMap.get(m.userId);
          if (dept !== null && dept !== undefined && scopeSet.has(dept)) {
            result.add(m.userId);
          }
        }
      }
      break;
    }
    case 'department': {
      // 已指定部门 IDs：取这些部门下所有启用用户
      const deptIds = node.deptIds ?? [];
      if (deptIds.length > 0) {
        const rows = await exec
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.departmentId, deptIds), eq(users.status, 'enabled')));
        rows.forEach((r) => result.add(r.id));
        break;
      }
      // 未指定：取发起人部门的负责人
      const deptId = await getUserDept(exec, ctx.initiatorId);
      if (deptId) {
        const leader = await getDeptLeader(exec, deptId);
        if (leader) result.add(leader);
      }
      break;
    }
    case 'userGroup': {
      const groupIds = node.userGroupIds ?? [];
      if (groupIds.length > 0) {
        const rows = await exec
          .select({ userId: userGroupMembers.userId })
          .from(userGroupMembers)
          .where(inArray(userGroupMembers.groupId, groupIds));
        rows.forEach((r) => result.add(r.userId));
      }
      break;
    }
    case 'initiator': {
      result.add(ctx.initiatorId);
      break;
    }
    case 'initiatorLeader':
    case 'manager': {
      // 直属主管：发起人所在部门的负责人；managerLevel > 1 时往上走 deptParent 链
      const startDeptId = await getUserDept(exec, ctx.initiatorId);
      if (!startDeptId) break;
      const level = Math.max(1, node.managerLevel ?? 1);
      const targetDeptId = level === 1
        ? startDeptId
        : await walkDeptUp(exec, startDeptId, level - 1);
      if (targetDeptId) {
        const leader = await getDeptLeader(exec, targetDeptId);
        if (leader) result.add(leader);
      }
      break;
    }
    case 'initiatorDept': {
      // 发起人部门主管/全员（兼容旧字段语义：取整个部门的启用用户）
      const deptId = await getUserDept(exec, ctx.initiatorId);
      if (deptId) {
        const rows = await exec
          .select({ id: users.id })
          .from(users)
          .where(and(
            eq(users.departmentId, deptId),
            eq(users.status, 'enabled'),
            isNotNull(users.id),
          ));
        rows.forEach((r) => result.add(r.id));
      }
      break;
    }
    case 'multiLevelManager':
    case 'multiLevelDeptHead': {
      // 从发起人直属部门开始，逐级向上收集每一级的负责人
      // endType=topLevel  → 一直到没有上级
      // endType=level     → 走到第 multiLevelEndLevel 层为止
      // endType=role      → 一直走，遇到具备 multiLevelEndRoleId 角色的负责人即停
      const startDeptId = await getUserDept(exec, ctx.initiatorId);
      if (!startDeptId) break;
      const endType = node.multiLevelEndType ?? 'topLevel';
      const endLevel = node.multiLevelEndLevel ?? 99;
      const endRoleId = node.multiLevelEndRoleId;
      let currentDept: number | null = startDeptId;
      const visited = new Set<number>();
      for (let i = 0; i < 50 && currentDept !== null; i++) {
        if (visited.has(currentDept)) break;
        visited.add(currentDept);
        const leader = await getDeptLeader(exec, currentDept);
        if (leader) {
          result.add(leader);
          if (endType === 'role' && endRoleId) {
            const [hit] = await exec.select({ id: userRoles.userId }).from(userRoles)
              .where(and(eq(userRoles.userId, leader), eq(userRoles.roleId, endRoleId)))
              .limit(1);
            if (hit) break;
          }
        }
        if (endType === 'level' && i + 1 >= endLevel) break;
        const [parent] = await exec.select({ parentId: departments.parentId })
          .from(departments).where(eq(departments.id, currentDept)).limit(1);
        if (!parent?.parentId || parent.parentId === 0) break;
        currentDept = parent.parentId;
      }
      break;
    }
    case 'formUser': {
      const key = node.formUserField;
      if (!key || !ctx.formData) break;
      const v = ctx.formData[key];
      if (typeof v === 'number') result.add(v);
      else if (Array.isArray(v)) v.forEach((x) => typeof x === 'number' && result.add(x));
      break;
    }
    case 'formDepartment': {
      const key = node.formDeptField;
      if (!key || !ctx.formData) break;
      const v = ctx.formData[key];
      const deptIds: number[] = [];
      if (typeof v === 'number') deptIds.push(v);
      else if (Array.isArray(v)) v.forEach((x) => typeof x === 'number' && deptIds.push(x));
      if (deptIds.length === 0) break;
      const level = Math.max(1, node.formDeptHeadLevel ?? 1);
      for (const startDeptId of deptIds) {
        const targetDeptId = level === 1
          ? startDeptId
          : await walkDeptUp(exec, startDeptId, level - 1);
        if (targetDeptId) {
          const leader = await getDeptLeader(exec, targetDeptId);
          if (leader) result.add(leader);
        }
      }
      break;
    }
    case 'nodeApprover': {
      const nodeKey = node.nodeApproverNodeId;
      if (!nodeKey || !ctx.instanceId) break;
      const rows = await exec.select({ userId: workflowTasks.assigneeId }).from(workflowTasks)
        .where(and(
          eq(workflowTasks.instanceId, ctx.instanceId),
          eq(workflowTasks.nodeKey, nodeKey),
          eq(workflowTasks.status, 'approved'),
        ));
      rows.forEach((r) => { if (r.userId) result.add(r.userId); });
      break;
    }
    case 'post': {
      const postIds = node.postIds ?? [];
      if (postIds.length === 0) break;
      const rows = await exec
        .select({ userId: userPositions.userId })
        .from(userPositions)
        .innerJoin(users, eq(users.id, userPositions.userId))
        .where(and(
          inArray(userPositions.positionId, postIds),
          eq(users.status, 'enabled'),
        ));
      rows.forEach((r) => result.add(r.userId));
      break;
    }
    case 'deptMember': {
      const seedIds = node.deptMemberDeptIds ?? [];
      if (seedIds.length === 0) break;
      const deptIds = node.deptMemberIncludeChildren
        ? await collectDeptWithChildren(exec, seedIds)
        : seedIds;
      const rows = await exec
        .select({ id: users.id })
        .from(users)
        .where(and(
          inArray(users.departmentId, deptIds),
          eq(users.status, 'enabled'),
        ));
      rows.forEach((r) => result.add(r.id));
      break;
    }
    case 'startUserDeptResponsible': {
      // 发起人部门的分管领导 → 取上一级部门的负责人
      const startDeptId = await getUserDept(exec, ctx.initiatorId);
      if (!startDeptId) break;
      const [parent] = await exec.select({ parentId: departments.parentId })
        .from(departments).where(eq(departments.id, startDeptId)).limit(1);
      const parentDeptId = parent?.parentId;
      if (!parentDeptId || parentDeptId === 0) break;
      const leader = await getDeptLeader(exec, parentDeptId);
      if (leader) result.add(leader);
      break;
    }
    case 'expression': {
      const expr = node.assigneeExpression;
      if (!expr) break;
      const ids = evalAssigneeExpression(expr, {
        form: ctx.formData ?? {},
        starter: { id: ctx.initiatorId },
      });
      ids.forEach((id) => result.add(id));
      break;
    }
    case 'decision': {
      // 审批人矩阵：查决策表得「来源类型 + id 列表」，复用现有 role/dept/post/user 解析
      if (!node.decisionRuleKey) break;
      const out = await getDecisionOutputs(node.decisionRuleKey, { form: ctx.formData ?? {}, starter: { id: ctx.initiatorId } });
      const srcType = String(out.type ?? out.assigneeType ?? 'user') as WorkflowAssigneeType;
      const raw = out.ids ?? out.id ?? '';
      const ids = (Array.isArray(raw) ? raw : String(raw).split(',')).map((x) => Number(x)).filter((n) => Number.isFinite(n));
      if (ids.length === 0) break;
      const sub: WorkflowNodeConfig = { ...node, assigneeType: srcType, userIds: srcType === 'user' ? ids : undefined, roleIds: srcType === 'role' ? ids : undefined, deptIds: srcType === 'department' ? ids : undefined, postIds: srcType === 'post' ? ids : undefined, decisionRuleKey: undefined };
      (await resolveAssigneeIds(sub, ctx)).forEach((id) => result.add(id));
      break;
    }
  }

  return [...result];
}
