import { http, HttpResponse } from 'msw';
import type { UserFeedback, UserFeedbackCategory, UserFeedbackStatus } from '@zenith/shared';
import { mockUserFeedbacks, getNextUserFeedbackId } from '../data/user-feedbacks';
import { mockDateTime } from '../utils/date';

export const userFeedbacksHandlers = [
  // ─── GET /api/feedbacks — 分页列表 + 筛选 ─────────────────────────────────
  http.get('/api/feedbacks', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 10;
    const keyword = url.searchParams.get('keyword') || '';
    const category = url.searchParams.get('category') || '';
    const status = url.searchParams.get('status') || '';
    const startTime = url.searchParams.get('startTime') || '';
    const endTime = url.searchParams.get('endTime') || '';

    let list = [...mockUserFeedbacks].sort((a, b) => b.id - a.id);
    if (keyword) list = list.filter((f) => (f.content ?? '').includes(keyword));
    if (category) list = list.filter((f) => f.category === category);
    if (status) list = list.filter((f) => f.status === status);
    if (startTime) list = list.filter((f) => f.createdAt >= startTime);
    if (endTime) list = list.filter((f) => f.createdAt <= `${endTime} 23:59:59`);

    const total = list.length;
    const sliced = list.slice((page - 1) * pageSize, page * pageSize);
    return HttpResponse.json({ code: 0, message: 'ok', data: { list: sliced, total, page, pageSize } });
  }),

  // ─── POST /api/feedbacks — 提交反馈 ───────────────────────────────────────
  http.post('/api/feedbacks', async ({ request }) => {
    const body = (await request.json()) as {
      score?: number | null;
      category?: UserFeedbackCategory;
      content?: string | null;
      pagePath?: string | null;
    };
    const now = mockDateTime();
    const newFeedback: UserFeedback = {
      id: getNextUserFeedbackId(),
      userId: 1,
      userNickname: '管理员',
      score: body.score ?? null,
      category: body.category ?? 'suggestion',
      content: body.content?.trim() || null,
      pagePath: body.pagePath ?? null,
      status: 'pending',
      handleRemark: null,
      handledBy: null,
      handlerNickname: null,
      handledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    mockUserFeedbacks.push(newFeedback);
    return HttpResponse.json({ code: 0, message: '感谢您的反馈', data: newFeedback });
  }),

  // ─── PUT /api/feedbacks/:id/handle — 处理反馈 ─────────────────────────────
  http.put('/api/feedbacks/:id/handle', async ({ params, request }) => {
    const id = Number(params.id);
    const body = (await request.json()) as { status: UserFeedbackStatus; handleRemark?: string | null };
    const feedback = mockUserFeedbacks.find((f) => f.id === id);
    if (!feedback) {
      return HttpResponse.json({ code: 404, message: '反馈不存在', data: null }, { status: 404 });
    }
    const now = mockDateTime();
    const handled = body.status !== 'pending';
    Object.assign(feedback, {
      status: body.status,
      handleRemark: body.handleRemark?.trim() || null,
      handledBy: handled ? 1 : null,
      handlerNickname: handled ? '管理员' : null,
      handledAt: handled ? now : null,
      updatedAt: now,
    });
    return HttpResponse.json({ code: 0, message: '处理成功', data: feedback });
  }),

  // ─── DELETE /api/feedbacks/batch — 批量删除（需在 /:id 之前）─────────────
  http.delete('/api/feedbacks/batch', async ({ request }) => {
    const body = (await request.json()) as { ids: number[] };
    const ids = body.ids ?? [];
    if (ids.length === 0) {
      return HttpResponse.json({ code: 400, message: '请选择要删除的记录', data: null }, { status: 400 });
    }
    let deleted = 0;
    for (const id of ids) {
      const idx = mockUserFeedbacks.findIndex((f) => f.id === id);
      if (idx !== -1) {
        mockUserFeedbacks.splice(idx, 1);
        deleted += 1;
      }
    }
    return HttpResponse.json({ code: 0, message: `已删除 ${deleted} 条记录`, data: null });
  }),

  // ─── DELETE /api/feedbacks/:id — 删除 ─────────────────────────────────────
  http.delete('/api/feedbacks/:id', ({ params }) => {
    const id = Number(params.id);
    const idx = mockUserFeedbacks.findIndex((f) => f.id === id);
    if (idx === -1) {
      return HttpResponse.json({ code: 404, message: '反馈不存在', data: null }, { status: 404 });
    }
    mockUserFeedbacks.splice(idx, 1);
    return HttpResponse.json({ code: 0, message: '删除成功', data: null });
  }),
];
