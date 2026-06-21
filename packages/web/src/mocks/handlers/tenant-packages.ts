import { http, HttpResponse } from 'msw';
import { mockTenantPackages, getNextTenantPackageId } from '@/mocks/data/tenant-packages';
import { mockDateTime } from '@/mocks/utils/date';
import type { TenantPackage } from '@zenith/shared';

export const tenantPackagesHandlers = [
  // 全部套餐（下拉用）— 必须在 /:id 之前注册
  http.get('/api/tenant-packages/all', () => {
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: mockTenantPackages.map((p) => ({ id: p.id, name: p.name, status: p.status })),
    });
  }),

  // 套餐列表（分页）
  http.get('/api/tenant-packages', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const status = url.searchParams.get('status') ?? '';
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '10');

    const filtered = mockTenantPackages.filter((p) => {
      if (keyword && !p.name.includes(keyword)) return false;
      if (status && p.status !== status) return false;
      return true;
    });

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const list = filtered
      .slice(start, start + pageSize)
      .map((p) => ({ ...p, menuCount: (p.menuIds ?? []).length }));

    return HttpResponse.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  }),

  // 套餐详情
  http.get('/api/tenant-packages/:id', ({ params }) => {
    const pkg = mockTenantPackages.find((p) => p.id === Number(params.id));
    if (!pkg) return HttpResponse.json({ code: 404, message: '套餐不存在', data: null });
    return HttpResponse.json({ code: 0, message: 'ok', data: { ...pkg, menuCount: (pkg.menuIds ?? []).length } });
  }),

  // 新增套餐
  http.post('/api/tenant-packages', async ({ request }) => {
    const body = await request.json() as Partial<TenantPackage>;
    const newPkg: TenantPackage = {
      id: getNextTenantPackageId(),
      name: body.name ?? '',
      status: body.status ?? 'enabled',
      remark: body.remark ?? null,
      menuIds: [],
      menuCount: 0,
      createdAt: mockDateTime(),
      updatedAt: mockDateTime(),
    };
    mockTenantPackages.push(newPkg);
    return HttpResponse.json({ code: 0, message: '创建成功', data: newPkg });
  }),

  // 更新套餐
  http.put('/api/tenant-packages/:id', async ({ params, request }) => {
    const pkg = mockTenantPackages.find((p) => p.id === Number(params.id));
    if (!pkg) return HttpResponse.json({ code: 404, message: '套餐不存在', data: null });
    const body = await request.json() as Partial<TenantPackage>;
    Object.assign(pkg, body, { updatedAt: mockDateTime() });
    return HttpResponse.json({ code: 0, message: '更新成功', data: pkg });
  }),

  // 分配菜单
  http.put('/api/tenant-packages/:id/menus', async ({ params, request }) => {
    const pkg = mockTenantPackages.find((p) => p.id === Number(params.id));
    if (!pkg) return HttpResponse.json({ code: 404, message: '套餐不存在', data: null });
    const body = await request.json() as { menuIds: number[] };
    pkg.menuIds = body.menuIds ?? [];
    pkg.menuCount = pkg.menuIds.length;
    pkg.updatedAt = mockDateTime();
    return HttpResponse.json({ code: 0, message: '菜单已更新', data: null });
  }),

  // 批量删除（必须在 /:id 之前注册）
  http.delete('/api/tenant-packages/batch', async ({ request }) => {
    const body = await request.json() as { ids: number[] };
    const ids = body.ids ?? [];
    for (const id of ids) {
      const idx = mockTenantPackages.findIndex((p) => p.id === id);
      if (idx !== -1) mockTenantPackages.splice(idx, 1);
    }
    return HttpResponse.json({ code: 0, message: `已删除 ${ids.length} 条记录`, data: null });
  }),

  // 删除套餐
  http.delete('/api/tenant-packages/:id', ({ params }) => {
    const idx = mockTenantPackages.findIndex((p) => p.id === Number(params.id));
    if (idx === -1) return HttpResponse.json({ code: 404, message: '套餐不存在', data: null });
    mockTenantPackages.splice(idx, 1);
    return HttpResponse.json({ code: 0, message: '删除成功', data: null });
  }),
];
