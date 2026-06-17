import { http, HttpResponse } from 'msw';
import {
  mockMembers,
  mockMemberLevels,
  mockMemberPointTxs,
  mockMemberWalletTxs,
  mockMemberCoupons,
  mockCoupons,
  mockMemberPointAccount,
  mockMemberWallet,
} from '../data/members';

function memberView(m: (typeof mockMembers)[number]) {
  const { password: _pwd, ...rest } = m;
  return rest;
}

function ok(data: unknown, message = 'ok') {
  return HttpResponse.json({ code: 0, message, data });
}

function paginated<T>(list: T[], page = 1, pageSize = 10) {
  return HttpResponse.json({ code: 0, message: 'ok', data: { list, total: list.length, page, pageSize } });
}

export const memberAdminHandlers = [
  // ── 会员管理（/export 必须在 /:id 之前）──────────────────────────────────
  http.get('/api/members/export', () =>
    new HttpResponse('id,nickname,phone\n1,演示会员,13800138000', {
      headers: { 'Content-Type': 'text/csv' },
    }),
  ),
  http.get('/api/members', () => paginated(mockMembers.map(memberView))),
  http.get('/api/members/:id', ({ params }) => {
    const m = mockMembers.find((x) => x.id === Number(params.id));
    return ok(m ? memberView(m) : null);
  }),
  http.post('/api/members', () => ok(memberView(mockMembers[0]), '创建成功')),
  http.put('/api/members/:id/status', () => ok(null, '状态已更新')),
  http.post('/api/members/:id/reset-password', () => ok(null, '密码已重置')),
  http.put('/api/members/:id', () => ok(memberView(mockMembers[0]), '更新成功')),
  http.delete('/api/members/:id', () => ok(null, '删除成功')),

  // ── 会员等级 ─────────────────────────────────────────────────────────────
  http.get('/api/member-levels', () => paginated(mockMemberLevels)),
  http.get('/api/member-levels/:id', ({ params }) =>
    ok(mockMemberLevels.find((l) => l.id === Number(params.id)) ?? null),
  ),
  http.post('/api/member-levels', () => ok(mockMemberLevels[0], '创建成功')),
  http.put('/api/member-levels/:id', () => ok(mockMemberLevels[0], '更新成功')),
  http.delete('/api/member-levels/:id', () => ok(null, '删除成功')),

  // ── 会员积分 ─────────────────────────────────────────────────────────────
  http.get('/api/member-points/transactions', () => paginated(mockMemberPointTxs)),
  http.get('/api/member-points/account/:id', () => ok(mockMemberPointAccount)),
  http.post('/api/member-points/adjust', () => ok(null, '积分已调整')),

  // ── 会员钱包 ─────────────────────────────────────────────────────────────
  http.get('/api/member-wallets/transactions', () => paginated(mockMemberWalletTxs)),
  http.get('/api/member-wallets/account/:id', () => ok(mockMemberWallet)),
  http.post('/api/member-wallets/adjust', () => ok(null, '余额已调整')),
  http.post('/api/member-wallets/refund', () => ok(null, '已退款')),

  // ── 优惠券（/records 必须在 /:id 之前）───────────────────────────────────
  http.get('/api/coupons/records', () => paginated(mockMemberCoupons)),
  http.post('/api/coupons/records/:id/revoke', () => ok(null, '券码已作废')),
  http.get('/api/coupons', () => paginated(mockCoupons)),
  http.get('/api/coupons/:id', ({ params }) => ok(mockCoupons.find((c) => c.id === Number(params.id)) ?? null)),
  http.post('/api/coupons/:id/issue', () => ok(null, '发券成功')),
  http.post('/api/coupons', () => ok(mockCoupons[0], '创建成功')),
  http.put('/api/coupons/:id', () => ok(mockCoupons[0], '更新成功')),
  http.delete('/api/coupons/:id', () => ok(null, '删除成功')),
];
