import React, { useState, useEffect, useCallback } from 'react';
import { Spin } from '@douyinfe/semi-ui';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { request } from '@/utils/request';
import { formatFileSize } from '@/utils/file-utils';
import type { FileStats } from '@zenith/shared';

const PROVIDER_LABELS: Record<string, string> = {
  local: '本地磁盘', oss: '阿里云 OSS', s3: 'S3 存储',
  cos: '腾讯云 COS', obs: '华为云 OBS', kodo: '七牛云 Kodo',
  bos: '百度云 BOS', azure: 'Azure Blob', sftp: 'SFTP',
};

const TYPE_COLORS: Record<string, string> = {
  image: '#3b82f6',
  video: '#8b5cf6',
  audio: '#f59e0b',
  document: '#10b981',
  other: '#6b7280',
};

const PROVIDER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899',
];

const sectionStyle: React.CSSProperties = {
  background: 'var(--semi-color-bg-1)',
  border: '1px solid var(--semi-color-border)',
  borderRadius: 6,
  padding: '16px 20px',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--semi-color-text-0)',
  marginBottom: 12,
};

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'var(--semi-color-bg-2)',
  border: '1px solid var(--semi-color-border)',
  borderRadius: 6,
  fontSize: 12,
};

interface StatCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly sub?: string;
}

function StatCard({ title, value, sub }: StatCardProps) {
  return (
    <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 96 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--semi-color-text-0)', lineHeight: 1.2 }}>
        {String(value)}
      </div>
      <div style={{ fontSize: 11, color: 'var(--semi-color-text-2)', minHeight: 18 }}>{sub ?? ''}</div>
      <div style={{ fontSize: 13, color: 'var(--semi-color-text-1)', marginTop: 'auto' }}>{title}</div>
    </div>
  );
}

export default function FileStatsPanel() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<FileStats | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get<FileStats>('/api/files/stats');
      if (res.code === 0) setStats(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const summary = stats?.summary;

  // PieChart 自定义 label
  const renderPieLabel = ({ name, percent }: { name?: string; percent?: number }) =>
    (percent ?? 0) > 0.03 ? `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%` : '';

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>

        {/* 汇总卡片 */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          <StatCard title="文件总数" value={summary?.totalFiles ?? '—'} />
          <StatCard title="占用空间" value={summary ? formatFileSize(summary.totalSize) : '—'} />
          <StatCard
            title="图片数量"
            value={summary?.imageCount ?? '—'}
            sub={summary && summary.totalFiles > 0 ? `占 ${((summary.imageCount / summary.totalFiles) * 100).toFixed(0)}%` : undefined}
          />
          <StatCard
            title="文档数量"
            value={summary?.docCount ?? '—'}
            sub={summary && summary.totalFiles > 0 ? `占 ${((summary.docCount / summary.totalFiles) * 100).toFixed(0)}%` : undefined}
          />
        </div>

        {/* 文件类型 + 存储类型分布 */}
        <div style={{ display: 'flex', gap: 16 }}>
          {/* 文件类型环形图 */}
          <div style={{ ...sectionStyle, flex: 1, minWidth: 0 }}>
            <div style={sectionTitleStyle}>文件类型分布</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats?.typeStats.filter(t => t.count > 0).map(t => ({ ...t, fill: TYPE_COLORS[t.type] ?? '#6b7280' }))}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  label={renderPieLabel}
                  labelLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 存储类型横向柱状图 */}
          <div style={{ ...sectionStyle, flex: 1, minWidth: 0 }}>
            <div style={sectionTitleStyle}>存储类型分布</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                layout="vertical"
                data={stats?.providerStats.map((p, i) => ({
                  ...p,
                  providerLabel: PROVIDER_LABELS[p.provider] ?? p.provider,
                  fill: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
                }))}
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--semi-color-border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="providerLabel" tick={{ fontSize: 11 }} width={80} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${v} 个文件`, '文件数']}
                />
                <Bar dataKey="count" radius={[0, 3, 3, 0]} fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 月度上传趋势 + 文件大小分布 */}
        <div style={{ display: 'flex', gap: 16 }}>
          {/* 月度折线图 */}
          <div style={{ ...sectionStyle, flex: 1, minWidth: 0 }}>
            <div style={sectionTitleStyle}>月度上传趋势（近 12 个月）</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={stats?.monthlyStats} margin={{ left: -8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--semi-color-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 个`, '新增文件']} />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="新增文件" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 大小分布柱状图 */}
          <div style={{ ...sectionStyle, flex: 1, minWidth: 0 }}>
            <div style={sectionTitleStyle}>文件大小分布</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats?.sizeRangeStats} margin={{ left: -8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--semi-color-border)" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 个`, '文件数']} />
                <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} name="文件数" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 上传人 */}
        {stats && stats.uploaderStats.length > 0 && (
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Top 上传人（按文件数）</div>
            <ResponsiveContainer width="100%" height={Math.min(stats.uploaderStats.length * 36 + 16, 280)}>
              <BarChart
                layout="vertical"
                data={stats.uploaderStats.map((u) => ({ ...u, sizeLabel: formatFileSize(u.size) }))}
                margin={{ left: 8, right: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--semi-color-border)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="username" tick={{ fontSize: 11 }} width={80} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, n) => [`${v} 个文件`, n === 'count' ? '文件数' : n]}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 3, 3, 0]} name="count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Spin>
  );
}
