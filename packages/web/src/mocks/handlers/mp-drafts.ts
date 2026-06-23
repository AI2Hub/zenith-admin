import { http, HttpResponse } from 'msw';
import { mockMpDrafts, getNextMpDraftId } from '@/mocks/data/mp-drafts';
import { mockDateTime } from '@/mocks/utils/date';
import type { MpDraft, MpArticle } from '@zenith/shared';

export const mpDraftsHandlers = [
  http.get('/api/mp/drafts', ({ request }) => {
    const url = new URL(request.url);
    const accountId = Number(url.searchParams.get('accountId') ?? '0');
    const keyword = url.searchParams.get('keyword') ?? '';
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
    const filtered = mockMpDrafts.filter((d) => d.accountId === accountId && (!keyword || d.title.includes(keyword)));
    const total = filtered.length;
    const list = [...filtered].sort((a, b) => b.id - a.id).slice((page - 1) * pageSize, page * pageSize);
    return HttpResponse.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  }),

  http.get('/api/mp/drafts/:id', ({ params }) => {
    const d = mockMpDrafts.find((x) => x.id === Number(params.id));
    if (!d) return HttpResponse.json({ code: 404, message: '图文草稿不存在', data: null }, { status: 404 });
    return HttpResponse.json({ code: 0, message: 'ok', data: d });
  }),

  http.post('/api/mp/drafts', async ({ request }) => {
    const body = await request.json() as { accountId: number; articles: MpArticle[] };
    const now = mockDateTime();
    const item: MpDraft = {
      id: getNextMpDraftId(), accountId: body.accountId, title: body.articles[0]?.title ?? '未命名图文',
      articles: body.articles, wechatMediaId: null, status: 'draft', createdAt: now, updatedAt: now,
    };
    mockMpDrafts.push(item);
    return HttpResponse.json({ code: 0, message: '创建成功', data: item });
  }),

  http.put('/api/mp/drafts/:id', async ({ params, request }) => {
    const d = mockMpDrafts.find((x) => x.id === Number(params.id));
    if (!d) return HttpResponse.json({ code: 404, message: '图文草稿不存在', data: null }, { status: 404 });
    const body = await request.json() as { articles: MpArticle[] };
    d.articles = body.articles;
    d.title = body.articles[0]?.title ?? '未命名图文';
    d.status = 'draft';
    d.wechatMediaId = null;
    d.updatedAt = mockDateTime();
    return HttpResponse.json({ code: 0, message: '更新成功', data: d });
  }),

  http.post('/api/mp/drafts/:id/push', ({ params }) => {
    const d = mockMpDrafts.find((x) => x.id === Number(params.id));
    if (!d) return HttpResponse.json({ code: 404, message: '图文草稿不存在', data: null }, { status: 404 });
    d.status = 'published';
    d.wechatMediaId = `mock_draft_${d.id}`;
    d.updatedAt = mockDateTime();
    return HttpResponse.json({ code: 0, message: '推送成功', data: d });
  }),

  http.delete('/api/mp/drafts/:id', ({ params }) => {
    const idx = mockMpDrafts.findIndex((x) => x.id === Number(params.id));
    if (idx === -1) return HttpResponse.json({ code: 404, message: '图文草稿不存在', data: null }, { status: 404 });
    mockMpDrafts.splice(idx, 1);
    return HttpResponse.json({ code: 0, message: '删除成功', data: null });
  }),
];
