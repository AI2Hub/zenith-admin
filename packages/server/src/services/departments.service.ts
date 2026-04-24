import { db } from '../db';
import { departments } from '../db/schema';
import { AppError } from '../lib/errors';
import type { Department } from '@zenith/shared';

// ─── 数据映射 ─────────────────────────────────────────────────────────────────

export function mapDepartment(row: typeof departments.$inferSelect): Omit<Department, 'children'> {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    code: row.code,
    leader: row.leader ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    sort: row.sort,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── 树形结构构建 ─────────────────────────────────────────────────────────────

export function buildDepartmentTree(list: Omit<Department, 'children'>[]): Department[] {
  const map = new Map<number, Department>();
  list.forEach((item) => map.set(item.id, { ...item }));
  const roots: Department[] = [];
  map.forEach((node) => {
    if (node.parentId === 0) { roots.push(node); return; }
    const parent = map.get(node.parentId);
    if (!parent) { roots.push(node); return; }
    parent.children = parent.children ?? [];
    parent.children.push(node);
  });
  const sortNodes = (nodes: Department[]) => {
    nodes.sort((a, b) => a.sort - b.sort || a.id - b.id);
    nodes.forEach((item) => item.children && sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

export function filterDepartmentTree(nodes: Department[], keyword: string, status?: string): Department[] {
  return nodes.reduce<Department[]>((acc, node) => {
    const children = node.children ? filterDepartmentTree(node.children, keyword, status) : [];
    const keywordMatched = !keyword || node.name.includes(keyword) || node.code.includes(keyword);
    const statusMatched = !status || node.status === status;
    if ((keywordMatched && statusMatched) || children.length > 0) {
      acc.push({ ...node, children: children.length > 0 ? children : undefined });
    }
    return acc;
  }, []);
}

// ─── 业务校验 ─────────────────────────────────────────────────────────────────

export async function ensureParentValid(parentId: number, currentId?: number) {
  if (parentId === 0) return;
  const allDepartments = await db.select({ id: departments.id, parentId: departments.parentId }).from(departments);
  const parentExists = allDepartments.some((item) => item.id === parentId);
  if (!parentExists) throw new AppError('上级部门不存在', 400);
  if (!currentId) return;
  if (parentId === currentId) throw new AppError('上级部门不能选择自身', 400);
  const descendants = new Set<number>();
  const queue = [currentId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    for (const item of allDepartments) {
      if (item.parentId === current) { descendants.add(item.id); queue.push(item.id); }
    }
  }
  if (descendants.has(parentId)) throw new AppError('上级部门不能选择子部门', 400);
}
