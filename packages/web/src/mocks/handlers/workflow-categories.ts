import { http, HttpResponse } from 'msw';
import type { WorkflowCategory } from '@zenith/shared';
import { mockWorkflowCategories, getNextCategoryId } from '@/mocks/data/workflow-categories';
import { mockDateTime } from '@/mocks/utils/date';

function ok<T>(data: T) {
  return HttpResponse.json({ code: 0, message: 'ok', data });
}

function fail(message: string, code = 400) {
  return HttpResponse.json({ code, message, data: null }, { status: code });
}

export const workflowCategoriesHandlers = [
  // GET /all — 全量列表（useWorkflowCategories hook 使用）
  http.get('/api/workflows/categories/all', () => {
    const sorted = [...mockWorkflowCategories].sort((a, b) => a.sort - b.sort);
    return ok(sorted);
  }),

  // GET / — 分页列表
  http.get('/api/workflows/categories', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 20;
    const keyword = url.searchParams.get('keyword') ?? '';

    let list = [...mockWorkflowCategories];
    if (keyword) list = list.filter((c) => c.name.includes(keyword) || (c.code ?? '').includes(keyword));

    const total = list.length;
    const sliced = list.toSorted((a, b) => a.sort - b.sort).slice((page - 1) * pageSize, page * pageSize);
    return ok({ list: sliced, total, page, pageSize });
  }),

  // POST / — 创建
  http.post('/api/workflows/categories', async ({ request }) => {
    const body = (await request.json()) as Partial<WorkflowCategory>;
    if (!body.name?.trim()) return fail('分类名称不能为空');
    if (mockWorkflowCategories.some((c) => c.code && c.code === body.code)) {
      return fail('分类编码已存在');
    }
    const now = mockDateTime();
    const newCategory: WorkflowCategory = {
      id: getNextCategoryId(),
      name: body.name,
      code: body.code ?? null,
      icon: body.icon ?? null,
      color: body.color ?? null,
      sort: body.sort ?? mockWorkflowCategories.length + 1,
      description: body.description ?? null,
      tenantId: null,
      createdAt: now,
      updatedAt: now,
    };
    mockWorkflowCategories.push(newCategory);
    return ok(newCategory);
  }),

  // PUT /:id — 更新
  http.put('/api/workflows/categories/:id', async ({ params, request }) => {
    const id = Number(params.id);
    const idx = mockWorkflowCategories.findIndex((c) => c.id === id);
    if (idx === -1) return fail('分类不存在', 404);
    const body = (await request.json()) as Partial<WorkflowCategory>;
    if (body.code && body.code !== mockWorkflowCategories[idx].code) {
      if (mockWorkflowCategories.some((c) => c.code === body.code)) return fail('分类编码已存在');
    }
    const updated: WorkflowCategory = {
      ...mockWorkflowCategories[idx],
      ...body,
      id,
      updatedAt: mockDateTime(),
    };
    mockWorkflowCategories[idx] = updated;
    return ok(updated);
  }),

  // DELETE /:id — 删除
  http.delete('/api/workflows/categories/:id', ({ params }) => {
    const id = Number(params.id);
    const idx = mockWorkflowCategories.findIndex((c) => c.id === id);
    if (idx === -1) return fail('分类不存在', 404);
    mockWorkflowCategories.splice(idx, 1);
    return ok(null);
  }),
];
