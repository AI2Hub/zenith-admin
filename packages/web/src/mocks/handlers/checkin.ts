import dayjs from 'dayjs';
import { http, HttpResponse } from 'msw';
import { mockCheckinRules, mockCheckinStatus, mockMemberCheckins, mockCheckinSettings, mockCheckinMilestones, buildMilestoneStatus } from '../data/checkin';
import { mockDate, mockDateTime } from '../utils/date';

const rules = [...mockCheckinRules];
const memberCheckins = [...mockMemberCheckins];
let checkinStatus = { ...mockCheckinStatus };
const settings = { ...mockCheckinSettings };
const milestones = [...mockCheckinMilestones];

function ok(data: unknown, message = 'ok') {
  return HttpResponse.json({ code: 0, message, data });
}

function paginated<T>(list: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize);
  return HttpResponse.json({ code: 0, message: 'ok', data: { list: items, total: list.length, page, pageSize } });
}

function getReward(days: number) {
  const sorted = [...rules].sort((a, b) => a.dayNumber - b.dayNumber);
  const exact = sorted.find((rule) => rule.dayNumber === days);
  if (exact) return exact;
  return sorted[sorted.length - 1];
}

export const checkinHandlers = [
  http.get('/api/checkin-rules', () => ok([...rules].sort((a, b) => a.dayNumber - b.dayNumber))),
  http.post('/api/checkin-rules', async ({ request }) => {
    const body = await request.json() as { dayNumber: number; points: number; experience: number; remark?: string | null };
    const created = {
      id: rules.length ? Math.max(...rules.map((rule) => rule.id)) + 1 : 1,
      dayNumber: body.dayNumber,
      points: body.points,
      experience: body.experience,
      remark: body.remark ?? null,
      createdAt: mockDateTime(),
      updatedAt: mockDateTime(),
    };
    rules.push(created);
    return ok(created, '创建成功');
  }),
  http.put('/api/checkin-rules/:id', async ({ params, request }) => {
    const id = Number(params.id);
    const body = await request.json() as Partial<{ dayNumber: number; points: number; experience: number; remark: string | null }>;
    const target = rules.find((rule) => rule.id === id);
    if (!target) return HttpResponse.json({ code: 404, message: '签到规则不存在', data: null }, { status: 404 });
    Object.assign(target, body, { updatedAt: mockDateTime() });
    return ok(target, '更新成功');
  }),
  http.delete('/api/checkin-rules/:id', ({ params }) => {
    const id = Number(params.id);
    const index = rules.findIndex((rule) => rule.id === id);
    if (index >= 0) rules.splice(index, 1);
    return ok(null, '删除成功');
  }),
  http.get('/api/member-checkins', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '10');
    const memberKeyword = url.searchParams.get('memberKeyword') ?? '';
    const dateStart = url.searchParams.get('dateStart');
    const dateEnd = url.searchParams.get('dateEnd');
    const filtered = memberCheckins.filter((item) => {
      if (memberKeyword) {
        const numId = /^\d+$/.test(memberKeyword) ? Number(memberKeyword) : null;
        if (numId) { if (item.memberId !== numId) return false; }
        else if (!item.memberNickname?.toLowerCase().includes(memberKeyword.toLowerCase())) return false;
      }
      if (dateStart && item.checkinDate < dateStart) return false;
      if (dateEnd && item.checkinDate > dateEnd) return false;
      return true;
    });
    return paginated(filtered, page, pageSize);
  }),
  http.get('/api/member/checkin/status', () => ok(checkinStatus)),
  http.post('/api/member/checkin', () => {
    if (checkinStatus.checkedToday) {
      return HttpResponse.json({ code: 400, message: '今天已经签到过了', data: null }, { status: 400 });
    }
    const reward = getReward(checkinStatus.consecutiveDays + 1);
    const result = {
      consecutiveDays: checkinStatus.consecutiveDays + 1,
      points: reward?.points ?? 0,
      experience: reward?.experience ?? 0,
      checkinDate: mockDate(),
    };
    checkinStatus = {
      ...checkinStatus,
      checkedToday: true,
      consecutiveDays: result.consecutiveDays,
      totalDays: checkinStatus.totalDays + 1,
      todayPoints: result.points,
      todayExperience: result.experience,
      nextDayPoints: getReward(result.consecutiveDays + 1)?.points ?? result.points,
      nextDayExperience: getReward(result.consecutiveDays + 1)?.experience ?? result.experience,
      thisMonthDates: Array.from(new Set([...checkinStatus.thisMonthDates, result.checkinDate])).sort(),
    };
    memberCheckins.unshift({
      id: memberCheckins.length ? Math.max(...memberCheckins.map((item) => item.id)) + 1 : 1,
      memberId: 1,
      memberNickname: '演示会员',
      checkinDate: result.checkinDate,
      consecutiveDays: result.consecutiveDays,
      pointsAwarded: result.points,
      experienceAwarded: result.experience,
      createdAt: mockDateTime(dayjs().hour(9).minute(0).second(0).toDate()),
    });
    return ok(result, '签到成功');
  }),
  http.get('/api/member/checkin/history', ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '10');
    const dateStart = url.searchParams.get('dateStart');
    const dateEnd = url.searchParams.get('dateEnd');
    const filtered = memberCheckins.filter((item) => {
      if (dateStart && item.checkinDate < dateStart) return false;
      if (dateEnd && item.checkinDate > dateEnd) return false;
      return true;
    });
    return paginated(filtered, page, pageSize);
  }),

  // ── 签到设置 ──────────────────────────────────────────────────
  http.get('/api/checkin-settings', () => ok(settings)),
  http.put('/api/checkin-settings', async ({ request }) => {
    const body = await request.json() as Partial<typeof settings>;
    Object.assign(settings, body, { updatedAt: mockDateTime() });
    return ok(settings, '更新成功');
  }),

  // ── 签到里程碑 ────────────────────────────────────────────────
  http.get('/api/checkin-milestones', () => ok([...milestones].sort((a, b) => a.cumulativeDays - b.cumulativeDays))),
  http.post('/api/checkin-milestones', async ({ request }) => {
    const body = await request.json() as Omit<(typeof milestones)[number], 'id' | 'createdAt' | 'updatedAt' | 'couponName'>;
    const created = {
      id: milestones.length ? Math.max(...milestones.map((m) => m.id)) + 1 : 1,
      ...body,
      couponName: body.couponId ? `优惠券#${body.couponId}` : null,
      createdAt: mockDateTime(),
      updatedAt: mockDateTime(),
    };
    milestones.push(created);
    return ok(created, '创建成功');
  }),
  http.put('/api/checkin-milestones/:id', async ({ params, request }) => {
    const id = Number(params.id);
    const body = await request.json() as Partial<(typeof milestones)[number]>;
    const target = milestones.find((m) => m.id === id);
    if (!target) return HttpResponse.json({ code: 404, message: '里程碑不存在', data: null }, { status: 404 });
    Object.assign(target, body, {
      couponName: (body.couponId ?? target.couponId) ? `优惠券#${body.couponId ?? target.couponId}` : null,
      updatedAt: mockDateTime(),
    });
    return ok(target, '更新成功');
  }),
  http.delete('/api/checkin-milestones/:id', ({ params }) => {
    const id = Number(params.id);
    const index = milestones.findIndex((m) => m.id === id);
    if (index >= 0) milestones.splice(index, 1);
    return ok(null, '删除成功');
  }),

  // ── 我的里程碑（C 端）─────────────────────────────────────────
  http.get('/api/member/checkin/milestones', () => ok(buildMilestoneStatus(checkinStatus.totalDays))),

  // ── 后台为会员补签 ────────────────────────────────────────────
  http.post('/api/members/:id/checkin/makeup', async ({ params, request }) => {
    const memberId = Number(params.id);
    const body = await request.json() as { date: string; reason?: string };
    const reward = getReward(1);
    const created = {
      id: memberCheckins.length ? Math.max(...memberCheckins.map((item) => item.id)) + 1 : 1,
      memberId,
      memberNickname: `会员#${memberId}`,
      checkinDate: body.date,
      consecutiveDays: 1,
      pointsAwarded: reward?.points ?? 0,
      experienceAwarded: reward?.experience ?? 0,
      isMakeup: true,
      remark: body.reason ?? null,
      createdAt: mockDateTime(),
    };
    memberCheckins.unshift(created);
    return ok({
      checkinDate: body.date,
      pointsAwarded: created.pointsAwarded,
      experienceAwarded: created.experienceAwarded,
      costPoints: 0,
      consecutiveDays: 1,
    }, '补签成功');
  }),

  // ── 会员自助补签（C 端）───────────────────────────────────────
  http.post('/api/member/checkin/makeup', async ({ request }) => {
    if (!settings.makeupEnabled) {
      return HttpResponse.json({ code: 400, message: '补签功能未开放', data: null }, { status: 400 });
    }
    const body = await request.json() as { date: string };
    const reward = getReward(1);
    checkinStatus = { ...checkinStatus, totalDays: checkinStatus.totalDays + 1 };
    memberCheckins.unshift({
      id: memberCheckins.length ? Math.max(...memberCheckins.map((item) => item.id)) + 1 : 1,
      memberId: 1,
      memberNickname: '演示会员',
      checkinDate: body.date,
      consecutiveDays: 1,
      pointsAwarded: reward?.points ?? 0,
      experienceAwarded: reward?.experience ?? 0,
      isMakeup: true,
      createdAt: mockDateTime(),
    });
    return ok({
      checkinDate: body.date,
      pointsAwarded: reward?.points ?? 0,
      experienceAwarded: reward?.experience ?? 0,
      costPoints: settings.makeupCostPoints,
      consecutiveDays: 1,
    }, '补签成功');
  }),
];
