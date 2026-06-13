import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Select, Spin, Tabs, TabPane, Typography, Empty, Table, Tag, Progress } from '@douyinfe/semi-ui';
import { Clock, MousePointerClick, Flame, RefreshCcw } from 'lucide-react';
import { request } from '@/utils/request';
import type { PageStats, PageStatItem, FeatureStats, FeatureStatItem, HeatmapData, HeatmapPageListItem } from '@zenith/shared';
import { usePageTracker } from '@/hooks/usePageTracker';

const { Text } = Typography;

// ─── Helpers ────────────────────────────────────────────────────────────────

function msToReadable(ms: number | null): string {
  if (ms == null) return '–';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

const DAYS_OPTIONS = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
];

// ─── Page Dwell Time Tab ─────────────────────────────────────────────────────

function PageDwellTab() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PageStats | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get<PageStats>(`/api/analytics/page-stats?days=${days}&limit=20`);
      if (res.code === 0) setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const maxAvg = Math.max(...(data?.items ?? []).map((i) => i.avgMs ?? 0), 1);

  const columns = [
    {
      title: '页面',
      dataIndex: 'pagePath',
      key: 'pagePath',
      render: (_: unknown, record: PageStatItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.pageTitle ?? record.pagePath}</div>
          <Text type="tertiary" size="small">{record.pagePath}</Text>
        </div>
      ),
    },
    {
      title: '访问次数',
      dataIndex: 'visits',
      key: 'visits',
      width: 100,
      render: (v: number) => <Tag color="blue" size="small">{v.toLocaleString()}</Tag>,
    },
    {
      title: '平均停留',
      dataIndex: 'avgMs',
      key: 'avgMs',
      width: 220,
      render: (v: number | null) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress percent={Math.round(((v ?? 0) / maxAvg) * 100)} showInfo={false} style={{ width: 80 }} size="small" />
          <Text size="small">{msToReadable(v)}</Text>
        </div>
      ),
    },
    {
      title: '中位数',
      dataIndex: 'medianMs',
      key: 'medianMs',
      width: 100,
      render: (v: number | null) => <Text size="small">{msToReadable(v)}</Text>,
    },
    {
      title: 'P90',
      dataIndex: 'p90Ms',
      key: 'p90Ms',
      width: 100,
      render: (v: number | null) => <Text size="small">{msToReadable(v)}</Text>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Select value={days} onChange={(v) => setDays(v as number)} style={{ width: 120 }}>
          {DAYS_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
        </Select>
        <Button icon={<RefreshCcw size={14} />} onClick={load} loading={loading}>刷新</Button>
        {data && <Text type="tertiary">共 {data.totalVisits.toLocaleString()} 次访问，{data.items.length} 个页面</Text>}
      </div>
      <Table
        columns={columns}
        dataSource={data?.items ?? []}
        loading={loading}
        rowKey="pagePath"
        bordered
        empty={<Empty description="暂无停留时长数据" style={{ padding: 60 }} />}
        pagination={false}
      />
    </div>
  );
}

// ─── Feature Usage Tab ──────────────────────────────────────────────────────

function FeatureUsageTab() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FeatureStats | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get<FeatureStats>(`/api/analytics/feature-stats?days=${days}&limit=30`);
      if (res.code === 0) setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const maxCount = Math.max(...(data?.items ?? []).map((i) => i.count), 1);

  const columns = [
    {
      title: '排名',
      key: 'rank',
      width: 60,
      render: (_: unknown, __: unknown, index: number) => (
        <Text type={index < 3 ? 'warning' : 'tertiary'} strong={index < 3}>{index + 1}</Text>
      ),
    },
    {
      title: '功能名称',
      dataIndex: 'elementKey',
      key: 'elementKey',
      render: (_: unknown, record: FeatureStatItem) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.elementLabel ?? record.elementKey}</div>
          <Text type="tertiary" size="small">{record.elementKey}</Text>
        </div>
      ),
    },
    {
      title: 'UI 区域',
      dataIndex: 'componentArea',
      key: 'componentArea',
      width: 140,
      render: (v: string | null) => v ? <Tag size="small">{v}</Tag> : <Text type="tertiary">–</Text>,
    },
    {
      title: '所在页面',
      dataIndex: 'pagePath',
      key: 'pagePath',
      width: 200,
      render: (v: string) => <Text size="small" type="tertiary">{v}</Text>,
    },
    {
      title: '使用次数',
      dataIndex: 'count',
      key: 'count',
      width: 220,
      render: (v: number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Progress percent={Math.round((v / maxCount) * 100)} showInfo={false} style={{ width: 80 }} size="small" stroke="var(--semi-color-success)" />
          <Text strong>{v.toLocaleString()}</Text>
          <Text type="tertiary" size="small">次</Text>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Select value={days} onChange={(v) => setDays(v as number)} style={{ width: 120 }}>
          {DAYS_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
        </Select>
        <Button icon={<RefreshCcw size={14} />} onClick={load} loading={loading}>刷新</Button>
        {data && <Text type="tertiary">共 {data.totalEvents.toLocaleString()} 次操作，{data.items.length} 个功能</Text>}
      </div>
      <Table
        columns={columns}
        dataSource={data?.items ?? []}
        loading={loading}
        rowKey={(r: FeatureStatItem) => `${r.pagePath}_${r.elementKey}`}
        bordered
        empty={<Empty description="暂无功能使用数据" style={{ padding: 60 }} />}
        pagination={false}
      />
    </div>
  );
}

// ─── Heatmap Canvas ─────────────────────────────────────────────────────────

function HeatmapCanvas({ data }: Readonly<{ data: HeatmapData }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.points.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const maxValue = Math.max(...data.points.map((p) => p.value), 1);

    for (const point of data.points) {
      const px = (point.x / 100) * W;
      const py = (point.y / 100) * H;
      const intensity = point.value / maxValue;
      const radius = Math.max(18, Math.min(40, 18 + intensity * 22));

      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
      gradient.addColorStop(0, `rgba(255, ${Math.floor(20 + (1 - intensity) * 200)}, 0, ${0.12 + intensity * 0.45})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [data]);

  if (data.points.length === 0) {
    return <Empty description="该区域暂无点击数据" style={{ padding: 40 }} />;
  }

  return (
    <div style={{ border: '1px solid var(--semi-color-border)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ width: '100%', paddingBottom: '45%', background: 'var(--semi-color-fill-0)', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={360}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--semi-color-border)' }}>
        <Text size="small" type="tertiary">
          {data.total.toLocaleString()} 次点击 · 页面：{data.pagePath} · 区域：{data.componentArea}
        </Text>
      </div>
    </div>
  );
}

// ─── Heatmap Tab ─────────────────────────────────────────────────────────────

function HeatmapTab() {
  const [days, setDays] = useState(30);
  const [pages, setPages] = useState<HeatmapPageListItem[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);

  const loadPages = useCallback(async () => {
    setPagesLoading(true);
    try {
      const res = await request.get<{ pages: HeatmapPageListItem[] }>(`/api/analytics/heatmap-pages?days=${days}`, { silent: true });
      if (res.code === 0) {
        setPages(res.data?.pages ?? []);
        setSelectedPage(null);
        setSelectedArea(null);
        setHeatmapData(null);
      }
    } finally {
      setPagesLoading(false);
    }
  }, [days]);

  useEffect(() => { void loadPages(); }, [loadPages]);

  const currentPageAreas = pages.find((p) => p.pagePath === selectedPage)?.areas ?? [];

  const loadHeatmap = useCallback(async () => {
    if (!selectedPage || !selectedArea) return;
    setLoading(true);
    try {
      const res = await request.get<HeatmapData>(
        `/api/analytics/heatmap?pagePath=${encodeURIComponent(selectedPage)}&componentArea=${encodeURIComponent(selectedArea)}&days=${days}`,
      );
      if (res.code === 0) setHeatmapData(res.data);
    } finally {
      setLoading(false);
    }
  }, [selectedPage, selectedArea, days]);

  useEffect(() => { void loadHeatmap(); }, [loadHeatmap]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Select value={days} onChange={(v) => setDays(v as number)} style={{ width: 120 }}>
          {DAYS_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
        </Select>
        <Select
          value={selectedPage ?? undefined}
          onChange={(v) => { setSelectedPage(v as string); setSelectedArea(null); }}
          placeholder="选择页面"
          style={{ width: 220 }}
          loading={pagesLoading}
          showClear
        >
          {pages.map((p) => (
            <Select.Option key={p.pagePath} value={p.pagePath}>
              {p.pageTitle ?? p.pagePath}
            </Select.Option>
          ))}
        </Select>
        {selectedPage && (
          <Select
            value={selectedArea ?? undefined}
            onChange={(v) => setSelectedArea(v as string)}
            placeholder="选择区域"
            style={{ width: 160 }}
            showClear
          >
            {currentPageAreas.map((area) => (
              <Select.Option key={area} value={area}>{area}</Select.Option>
            ))}
          </Select>
        )}
        <Button icon={<RefreshCcw size={14} />} onClick={loadPages} loading={pagesLoading}>刷新</Button>
      </div>

      <Spin spinning={loading}>
        {(!selectedPage || !selectedArea) && (
          <Empty
            description={pages.length === 0 ? '暂无热力图数据，请先在页面中接入区域点击追踪' : '请选择页面和组件区域'}
            style={{ padding: 60 }}
          />
        )}
        {selectedPage && selectedArea && heatmapData && <HeatmapCanvas data={heatmapData} />}
      </Spin>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  usePageTracker('行为分析');

  return (
    <div className="page-container">
      <Tabs type="line" defaultActiveKey="dwell">
        <TabPane
          tab={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} />页面停留时长</span>}
          itemKey="dwell"
        >
          <div style={{ paddingTop: 16 }}>
            <PageDwellTab />
          </div>
        </TabPane>
        <TabPane
          tab={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MousePointerClick size={14} />功能使用频率</span>}
          itemKey="feature"
        >
          <div style={{ paddingTop: 16 }}>
            <FeatureUsageTab />
          </div>
        </TabPane>
        <TabPane
          tab={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Flame size={14} />点击热力图</span>}
          itemKey="heatmap"
        >
          <div style={{ paddingTop: 16 }}>
            <HeatmapTab />
          </div>
        </TabPane>
      </Tabs>
    </div>
  );
}
