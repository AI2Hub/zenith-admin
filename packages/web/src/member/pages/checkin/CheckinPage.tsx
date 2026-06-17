import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Button, Table, Tag, Toast } from '@douyinfe/semi-ui';
import type { MemberCheckin, MemberCheckinStatus, PaginatedResponse } from '@zenith/shared';
import { CalendarCheck, Flame, Trophy } from 'lucide-react';
import { memberRequest } from '../../utils/member-request';
import { MemberPage } from '../../components/MemberPage';
import { useMemberAuth } from '../../hooks/useMemberAuth';

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const HISTORY_PAGE_SIZE = 10;

interface CheckinResult {
  consecutiveDays: number;
  points: number;
  experience: number;
  checkinDate: string;
}

export default function CheckinPage() {
  const { refresh } = useMemberAuth();
  const [status, setStatus] = useState<MemberCheckinStatus | null>(null);
  const [history, setHistory] = useState<MemberCheckin[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await memberRequest.get<MemberCheckinStatus>('/api/member/checkin/status', { silent: true });
      if (res.code === 0) setStatus(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await memberRequest.get<PaginatedResponse<MemberCheckin>>(
        `/api/member/checkin/history?page=${page}&pageSize=${HISTORY_PAGE_SIZE}`,
        { silent: true },
      );
      if (res.code === 0) {
        setHistory(res.data.list);
        setHistoryTotal(res.data.total);
        setHistoryPage(page);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadHistory(1);
  }, [loadHistory, loadStatus]);

  const handleCheckin = async () => {
    const res = await memberRequest.post<CheckinResult>('/api/member/checkin', {});
    if (res.code === 0) {
      Toast.success(`签到成功，获得 ${res.data.points} 积分 / ${res.data.experience} 经验`);
      await Promise.all([loadStatus(), loadHistory(1), refresh()]);
    }
  };

  const checkedDates = useMemo(() => new Set(status?.thisMonthDates ?? []), [status?.thisMonthDates]);
  const calendarCells = useMemo(() => {
    const today = dayjs();
    const monthStart = today.startOf('month');
    const daysInMonth = today.daysInMonth();
    const leading = monthStart.day();
    const items: Array<{ date: string; label: number; currentMonth: boolean }> = [];
    for (let i = 0; i < leading; i += 1) {
      items.push({ date: `blank-${i}`, label: 0, currentMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = today.date(day).format('YYYY-MM-DD');
      items.push({ date, label: day, currentMonth: true });
    }
    return items;
  }, []);

  return (
    <MemberPage title="每日签到">
      <div style={{
        background: 'linear-gradient(135deg, #07c160 0%, #19be6b 100%)',
        borderRadius: 16,
        color: '#fff',
        padding: 24,
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700 }}>
              <CalendarCheck size={20} />
              今日签到
            </div>
            <div style={{ marginTop: 10, fontSize: 28, fontWeight: 700 }}>
              +{status?.todayPoints ?? 0} 积分 / +{status?.todayExperience ?? 0} 经验
            </div>
            <div style={{ marginTop: 8, opacity: 0.9 }}>
              {status?.checkedToday ? '今日已完成签到' : `明日可得 ${status?.nextDayPoints ?? 0} 积分 / ${status?.nextDayExperience ?? 0} 经验`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {status?.checkedToday && <Tag color="green" shape="circle">已签到</Tag>}
            <Button
              type="primary"
              theme="solid"
              loading={loading}
              disabled={status?.checkedToday}
              onClick={handleCheckin}
              style={{ background: '#fff', color: '#07c160', borderColor: '#fff' }}
            >
              {status?.checkedToday ? '今日已签到' : '立即签到'}
            </Button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid var(--m-border)', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--m-text-secondary)' }}>
            <Trophy size={16} color="var(--m-primary)" />
            累计签到
          </div>
          <div style={{ marginTop: 12, fontSize: 30, fontWeight: 700 }}>{status?.totalDays ?? 0}</div>
          <div style={{ marginTop: 4, color: 'var(--m-text-secondary)' }}>累计签到天数</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--m-border)', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--m-text-secondary)' }}>
            <Flame size={16} color="#ff7d00" />
            连续签到
          </div>
          <div style={{ marginTop: 12, fontSize: 30, fontWeight: 700 }}>{status?.consecutiveDays ?? 0}</div>
          <div style={{ marginTop: 4, color: 'var(--m-text-secondary)' }}>连续签到天数</div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--m-border)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
        <div className="mc-card-title" style={{ marginBottom: 12 }}>
          本月签到日历
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
          {WEEK_LABELS.map((label) => (
            <div key={label} style={{ textAlign: 'center', color: 'var(--m-text-secondary)', fontSize: 13 }}>
              {label}
            </div>
          ))}
          {calendarCells.map((cell) => {
            if (!cell.currentMonth) {
              return <div key={cell.date} style={{ minHeight: 66 }} />;
            }
            const checked = checkedDates.has(cell.date);
            const today = cell.date === dayjs().format('YYYY-MM-DD');
            return (
              <div
                key={cell.date}
                style={{
                  minHeight: 66,
                  borderRadius: 10,
                  border: today ? '1px solid #07c160' : '1px solid var(--m-border)',
                  background: checked ? 'rgba(7, 193, 96, 0.08)' : '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 8px',
                }}
              >
                <span style={{ fontWeight: 600 }}>{cell.label}</span>
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: checked ? '#07c160' : 'transparent',
                  border: checked ? 'none' : '1px solid var(--m-border)',
                }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--m-border)', borderRadius: 12, padding: 18 }}>
        <div className="mc-card-title" style={{ marginBottom: 12 }}>
          最近签到记录
        </div>
        <Table
          columns={[
            { title: '签到日期', dataIndex: 'checkinDate', width: 120 },
            { title: '连续天数', dataIndex: 'consecutiveDays', width: 100 },
            { title: '积分奖励', dataIndex: 'pointsAwarded', width: 100 },
            { title: '经验奖励', dataIndex: 'experienceAwarded', width: 100 },
            { title: '签到时间', dataIndex: 'createdAt' },
          ]}
          dataSource={history}
          loading={historyLoading}
          rowKey="id"
          size="small"
          bordered
          pagination={{
            currentPage: historyPage,
            pageSize: HISTORY_PAGE_SIZE,
            total: historyTotal,
            onChange: (page) => void loadHistory(page),
            showSizeChanger: false,
          }}
          empty={<div className="m-empty">暂无签到记录</div>}
        />
      </div>
    </MemberPage>
  );
}
