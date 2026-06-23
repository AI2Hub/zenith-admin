import { http, HttpResponse } from 'msw';
import { mockMpMaterials, getNextMpMaterialId } from '@/mocks/data/mp-materials';
import { mockDateTime } from '@/mocks/utils/date';
import type { MpMaterial } from '@zenith/shared';

export const mpMaterialsHandlers = [
  http.get('/api/mp/materials', ({ request }) => {
    const url = new URL(request.url);
    const accountId = Number(url.searchParams.get('accountId') ?? '0');
    const type = url.searchParams.get('type') ?? '';
    const keyword = url.searchParams.get('keyword') ?? '';
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
    const filtered = mockMpMaterials.filter((m) => {
      if (m.accountId !== accountId) return false;
      if (type && m.type !== type) return false;
      if (keyword && !m.name.includes(keyword)) return false;
      return true;
    });
    const total = filtered.length;
    const list = filtered.slice((page - 1) * pageSize, page * pageSize);
    return HttpResponse.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  }),

  http.post('/api/mp/materials/sync', async ({ request }) => {
    const body = await request.json() as { accountId: number };
    const total = mockMpMaterials.filter((m) => m.accountId === body.accountId).length;
    return HttpResponse.json({ code: 0, message: '同步完成', data: { success: true, created: 0, updated: total, total } });
  }),

  http.post('/api/mp/materials', async ({ request }) => {
    const body = await request.json() as Partial<MpMaterial> & { accountId: number };
    const now = mockDateTime();
    const item: MpMaterial = {
      id: getNextMpMaterialId(), accountId: body.accountId, type: body.type ?? 'image', name: body.name ?? '',
      wechatMediaId: null, url: body.url ?? null, fileSize: body.fileSize ?? null, createdAt: now, updatedAt: now,
    };
    mockMpMaterials.push(item);
    return HttpResponse.json({ code: 0, message: '创建成功', data: item });
  }),

  http.put('/api/mp/materials/:id', async ({ params, request }) => {
    const m = mockMpMaterials.find((x) => x.id === Number(params.id));
    if (!m) return HttpResponse.json({ code: 404, message: '素材不存在', data: null }, { status: 404 });
    const body = await request.json() as { name: string };
    m.name = body.name ?? m.name;
    m.updatedAt = mockDateTime();
    return HttpResponse.json({ code: 0, message: '更新成功', data: m });
  }),

  http.delete('/api/mp/materials/:id', ({ params }) => {
    const idx = mockMpMaterials.findIndex((x) => x.id === Number(params.id));
    if (idx === -1) return HttpResponse.json({ code: 404, message: '素材不存在', data: null }, { status: 404 });
    mockMpMaterials.splice(idx, 1);
    return HttpResponse.json({ code: 0, message: '删除成功', data: null });
  }),
];
