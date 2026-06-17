import dayjs from 'dayjs';
import type { CheckinRule, MemberCheckin, MemberCheckinStatus } from '@zenith/shared';
import { mockDateTime, mockDate } from '../utils/date';

export const mockCheckinRules: CheckinRule[] = [
  { id: 1, dayNumber: 1, points: 10, experience: 5, remark: '第1天签到', createdAt: mockDateTime(), updatedAt: mockDateTime() },
  { id: 2, dayNumber: 2, points: 10, experience: 5, remark: '第2天签到', createdAt: mockDateTime(), updatedAt: mockDateTime() },
  { id: 3, dayNumber: 3, points: 15, experience: 8, remark: '第3天签到', createdAt: mockDateTime(), updatedAt: mockDateTime() },
  { id: 4, dayNumber: 4, points: 15, experience: 8, remark: '第4天签到', createdAt: mockDateTime(), updatedAt: mockDateTime() },
  { id: 5, dayNumber: 5, points: 20, experience: 10, remark: '第5天签到', createdAt: mockDateTime(), updatedAt: mockDateTime() },
  { id: 6, dayNumber: 6, points: 20, experience: 10, remark: '第6天签到', createdAt: mockDateTime(), updatedAt: mockDateTime() },
  { id: 7, dayNumber: 7, points: 50, experience: 30, remark: '连续7天签到（周奖励）', createdAt: mockDateTime(), updatedAt: mockDateTime() },
];

export const mockMemberCheckins: MemberCheckin[] = Array.from({ length: 10 }, (_, index) => {
  const day = dayjs().subtract(index + 1, 'day');
  const consecutiveDays = Math.max(1, 10 - index);
  return {
    id: index + 1,
    memberId: 1,
    memberNickname: '演示会员',
    checkinDate: mockDate(day.toDate()),
    consecutiveDays,
    pointsAwarded: consecutiveDays >= 7 ? 50 : consecutiveDays >= 5 ? 20 : consecutiveDays >= 3 ? 15 : 10,
    experienceAwarded: consecutiveDays >= 7 ? 30 : consecutiveDays >= 5 ? 10 : consecutiveDays >= 3 ? 8 : 5,
    createdAt: mockDateTime(day.hour(9).minute(30).second(0).toDate()),
  };
});

export const mockCheckinStatus: MemberCheckinStatus = {
  checkedToday: false,
  consecutiveDays: 3,
  totalDays: 15,
  todayPoints: 15,
  todayExperience: 8,
  nextDayPoints: 15,
  nextDayExperience: 8,
  thisMonthDates: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-05', '2026-06-06', '2026-06-07', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-15', '2026-06-16'],
};
