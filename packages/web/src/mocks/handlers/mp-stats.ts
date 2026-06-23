import { http, HttpResponse } from 'msw';
import { mockMpFans } from '@/mocks/data/mp-fans';
import { mockMpTags } from '@/mocks/data/mp-tags';
import { mockMpMessages } from '@/mocks/data/mp-messages';
import { mockMpAutoReplies } from '@/mocks/data/mp-auto-replies';
import { mockMpMaterials } from '@/mocks/data/mp-materials';
import { mockMpDrafts } from '@/mocks/data/mp-drafts';
import type { MpStats } from '@zenith/shared';

function last7Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return days;
}

export const mpStatsHandlers = [
  http.get('/api/mp/stats', ({ request }) => {
    const accountId = Number(new URL(request.url).searchParams.get('accountId') ?? '0');
    const fans = mockMpFans.filter((f) => f.accountId === accountId);
    const days = last7Days();
    const stats: MpStats = {
      fanTotal: fans.length,
      fanSubscribed: fans.filter((f) => f.subscribe === 'subscribed').length,
      fanUnsubscribed: fans.filter((f) => f.subscribe === 'unsubscribed').length,
      tagTotal: mockMpTags.filter((t) => t.accountId === accountId).length,
      materialTotal: mockMpMaterials.filter((m) => m.accountId === accountId).length,
      draftTotal: mockMpDrafts.filter((d) => d.accountId === accountId).length,
      messageIn: mockMpMessages.filter((m) => m.accountId === accountId && m.direction === 'in').length,
      messageOut: mockMpMessages.filter((m) => m.accountId === accountId && m.direction === 'out').length,
      autoReplyTotal: mockMpAutoReplies.filter((r) => r.accountId === accountId).length,
      fanTrend: days.map((date, i) => ({ date, count: [1, 0, 2, 1, 3, 2, 1][i] ?? 0 })),
      messageTrend: days.map((date, i) => ({ date, in: [2, 1, 3, 2, 4, 1, 2][i] ?? 0, out: [1, 1, 2, 1, 3, 1, 1][i] ?? 0 })),
    };
    return HttpResponse.json({ code: 0, message: 'ok', data: stats });
  }),
];
