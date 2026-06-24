import { http, HttpResponse } from 'msw';
import { mockMpKfAccounts, getNextMpKfAccountId } from '@/mocks/data/mp-kf-accounts';
import { mockDateTime } from '@/mocks/utils/date';
import type { MpKfAccount } from '@zenith/shared';

export const mpKfAccountsHandlers = [
  http.get('/api/mp/kf-accounts', ({ request }) => {
    const url = new URL(request.url);
    const accountId = Number(url.searchParams.get('accountId') ?? '0');
    const keyword = url.searchParams.get('keyword') ?? '';
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '20');
    const filtered = mockMpKfAccounts.filter((k) => k.accountId === accountId && (!keyword || k.nickname.includes(keyword)));
    const total = filtered.length;
    const list = filtered.slice((page - 1) * pageSize, page * pageSize);
    return HttpResponse.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  }),

  http.post('/api/mp/kf-accounts/sync', () => HttpResponse.json({ code: 0, message: '同步完成', data: { success: true, created: 0, updated: mockMpKfAccounts.length, total: mockMpKfAccounts.length } })),

  http.post('/api/mp/kf-accounts', async ({ request }) => {
    const body = await request.json() as { accountId: number; kfAccount: string; nickname: string };
    if (mockMpKfAccounts.some((k) => k.accountId === body.accountId && k.kfAccount === body.kfAccount)) {
      return HttpResponse.json({ code: 400, message: '该客服账号已存在', data: null }, { status: 400 });
    }
    const now = mockDateTime();
    const item: MpKfAccount = {
      id: getNextMpKfAccountId(), accountId: body.accountId, kfAccount: body.kfAccount, nickname: body.nickname,
      avatar: null, kfId: null, inviteStatus: 'none', inviteWx: null, status: 'enabled', createdAt: now, updatedAt: now,
    };
    mockMpKfAccounts.push(item);
    return HttpResponse.json({ code: 0, message: '创建成功', data: item });
  }),

  http.put('/api/mp/kf-accounts/:id', async ({ params, request }) => {
    const k = mockMpKfAccounts.find((x) => x.id === Number(params.id));
    if (!k) return HttpResponse.json({ code: 404, message: '客服账号不存在', data: null }, { status: 404 });
    const body = await request.json() as { nickname: string };
    k.nickname = body.nickname;
    k.updatedAt = mockDateTime();
    return HttpResponse.json({ code: 0, message: '更新成功', data: k });
  }),

  http.delete('/api/mp/kf-accounts/:id', ({ params }) => {
    const idx = mockMpKfAccounts.findIndex((x) => x.id === Number(params.id));
    if (idx === -1) return HttpResponse.json({ code: 404, message: '客服账号不存在', data: null }, { status: 404 });
    mockMpKfAccounts.splice(idx, 1);
    return HttpResponse.json({ code: 0, message: '删除成功', data: null });
  }),
];
