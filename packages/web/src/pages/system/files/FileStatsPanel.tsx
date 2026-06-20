import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Row, Col } from '@douyinfe/semi-ui';
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
} from 'recharts';
import { FileImage, Video, Music, FileText, File } from 'lucide-react';
import { request } from '@/utils/request';
import { formatFileSize } from '@/utils/file-utils';
import type { FileStats } from '@zenith/shared';

const PROVIDER_LABELS: Record<string, string> = {
  local: '本地磁盘', oss: '阿里云 OSS', s3: 'S3 存储',
  cos: '腾讯云 COS', obs: '华为云 OBS', kodo: '七牛云 Kodo',
  bos: '百度云 BOS', azure: 'Azure Blob', sftp: 'SFTP',
};

const PROVIDER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899',
];

const FILE_TYPE_CONFIG = [
  { type: 'image',    label: '图片', Icon: FileImage, color: '#3b82f6', bgColor: 'rgba(59,130,246,0.12)' },
  { type: 'video',    label: '视频', Icon: Video,     color: '#8b5cf6', bgColor: 'rgba(139,92,246,0.12)' },
  { type: 'audio',    label: '音频', Icon: Music,     color: '#f59e0b', bgColor: 'rgba(245,158,11,0.12)' },
  { type: 'document', label: '文档', Icon: FileText,  color: '#10b981', bgColor: 'rgba(16,185,129,0.12)' },
  { type: 'other',    label: '其他', Icon: File,      color: '#6b7280', bgColor: 'rgba(107,114,128,0.12)' },
] as const;

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
    <div style={{ ...sectionStyle, display: 'flex', flexDirection: 'column', gap: 2, height: '100%', minHeight: 96, boxSizing: 'border-box' }}>
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
  const totalFiles = summary?.totalFiles ?? 0;

  return (
    <Spin spinning={loading}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 汇总卡片 */}
        <Row gutter={[16, 16]} type="flex">
          <Col xs={24} sm={12} xl={6}>
            <StatCard title="文件总数" value={totalFiles > 0 ? totalFiles.toLocaleString() : '—'} />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <StatCard title="占用空间" value={summary ? formatFileSize(summary.totalSize) : '—'} />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <StatCard
              title="今日新增"
              value={summary?.todayCount == null ? '—' : summary.todayCount.toLocaleString()}
              sub="今日共上传"
            />
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <StatCard
              title="本月新增"
              value={summary?.thisMonthCount == null ? '—' : summary.thisMonthCount.toLocaleString()}
              sub="本月共上传"
            />
          </Col>
        </Row>

        {/* 文件类型卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {FILE_TYPE_CONFIG.map(({ type, label, Icon, color, bgColor }) => {
            const stat = stats?.typeStats.find(t => t.type === type);
            const count = stat?.count ?? 0;
            const size = stat?.size ?? 0;
            const percent = totalFiles > 0 ? (count / totalFiles) * 100 : 0;
            return (
              <div key={type} style={{ ...sectionStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 图标 + 右侧内容 */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 9, background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={19} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 类型名 + 数量同行 */}
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--semi-color-text-0)' }}>{label}</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--semi-color-text-0)', flexShrink: 0 }}>{count.toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--semi-color-text-2)', marginTop: 3 }}>{formatFileSize(size)}</div>
                  </div>
                </div>
                {/* 进度条 */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--semi-color-text-2)' }}>占比</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color }}>{percent.toFixed(1)}%</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--semi-color-fill-1)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(percent, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 存储类型分布 + 月度上传趋势 */}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div style={{ ...sectionStyle }}>
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
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 个文件`, '文件数']} />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]} fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ ...sectionStyle }}>
              <div style={sectionTitleStyle}>月度上传趋势（近 12 个月）</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stats?.monthlyStats} margin={{ left: -8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--semi-color-border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 个`, '新增文件']} />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="新增文件" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Col>
        </Row>

        {/* 文件大小分布 + Top 上传人 */}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <div style={{ ...sectionStyle }}>
              <div style={sectionTitleStyle}>文件大小分布</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats?.sizeRangeStats} margin={{ left: -8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--semi-color-border)" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 个`, '文件数']} />
                  <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} name="文件数" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Col>
          {stats && stats.uploaderStats.length > 0 && (
            <Col xs={24} md={12}>
              <div style={{ ...sectionStyle }}>
                <div style={sectionTitleStyle}>Top 上传人（按文件数）</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    layout="vertical"
                    data={stats.uploaderStats.map((u) => ({ ...u, sizeLabel: formatFileSize(u.size) }))}
                    margin={{ left: 8, right: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--semi-color-border)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="username" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v} 个文件`, n === 'count' ? '文件数' : n]} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 3, 3, 0]} name="count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Col>
          )}
        </Row>

      </div>
    </Spin>
  );
}
