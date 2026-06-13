import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Select, Spin, Tabs, TabPane, Typography, Empty } from '@douyinfe/semi-ui';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Clock, MousePointerClick, Flame, RefreshCcw } from 'lucide-react';
import { request } from '@/utils/request';
import type { PageStats, PageStatItem, FeatureStats, FeatureStatItem, HeatmapData, HeatmapPageListItem } from '@zenith/shared';
import { usePageTracker } from '@/hooks/usePageTracker';

const { Text, Title } = Typography;

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

const CHART_COLORS = ['#4f8df9', '#67d9c2', '#f5a623', '#e86b6b', '#a06ee1', '#63c96b', '#ffd166', '#ef476f'];

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

  const chartData = (data?.items ?? []).map((item: PageStatItem) => ({
    name: item.pageTitle ?? item.pagePath,
    path: item.pagePath,
    avg: item.avgMs,
    median: item.medianMs,
    p90: item.p90Ms,
    visits: item.visits,
  }));

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Select value={days} onChange={(v) => setDays(v as number)} style={{ width: 120 }}>
          {DAYS_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
        </Select>
        <Button icon={<RefreshCcw size={14} />} onClick={load} loading={loading}>刷新</Button>
        {data && <Text type="tertiary">共 {data.totalVisits.toLocaleString()} 次访问，{data.items.length} 个页面</Text>}
      </div>

      <Spin spinning={loading}>
        {chartData.length === 0 && !loading
          ? <Empty description="暂无数据" style={{ padding: 60 }} />
          : (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 120, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => msToReadable(v as number)} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, name) => {
                    let label = 'P90';
                    if (name === 'avg') label = '均值';
                    else if (name === 'median') label = '中位数';
                    return [msToReadable(value as number), label];
                  }}
                  labelFormatter={(label, payload) => {
                    const visits = payload?.[0]?.payload?.visits;
                    return `${label as string}（${visits ?? 0} 次访问）`;
                  }}
                />
                <Bar dataKey="avg" name="avg" fill="#4f8df9" maxBarSize={16} radius={[0, 4, 4, 0]} />
                <Bar dataKey="median" name="median" fill="#67d9c2" maxBarSize={16} radius={[0, 4, 4, 0]} />
                <Bar dataKey="p90" name="p90" fill="#f5a623" maxBarSize={16} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
      </Spin>
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

  const chartData = (data?.items ?? []).map((item: FeatureStatItem, i: number) => ({
    name: item.elementLabel ?? item.elementKey,
    page: item.pagePath,
    area: item.componentArea ?? '–',
    count: item.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Select value={days} onChange={(v) => setDays(v as number)} style={{ width: 120 }}>
          {DAYS_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>)}
        </Select>
        <Button icon={<RefreshCcw size={14} />} onClick={load} loading={loading}>刷新</Button>
        {data && <Text type="tertiary">共 {data.totalEvents.toLocaleString()} 次操作，{data.items.length} 个功能</Text>}
      </div>

      <Spin spinning={loading}>
        {chartData.length === 0 && !loading
          ? <Empty description="暂无数据" style={{ padding: 60 }} />
          : (
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 130, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={125} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [`${(value as number).toLocaleString()} 次`, '使用次数']}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload;
                    return item ? `${label as string}（${item.page as string} · ${item.area as string}）` : (label as string);
                  }}
                />
                <Bar
                  dataKey="count"
                  maxBarSize={18}
                  radius={[0, 4, 4, 0]}
                  fill="#4f8df9"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
      </Spin>
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
    <div style={{ position: 'relative', display: 'inline-block', border: '1px solid var(--semi-color-border)', borderRadius: 6, overflow: 'hidden', width: '100%' }}>
      {/* Background grid to represent the component area */}
      <div style={{ width: '100%', paddingBottom: '45%', background: 'var(--semi-color-fill-0)', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={360}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Text size="small" type="tertiary">
          {data.total.toLocaleString()} 次点击 · {data.pagePath} · {data.componentArea}
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
    <div style={{ padding: '0 4px' }}>
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
          <Empty description={pages.length === 0 ? '暂无热力图数据，请先在页面中接入区域点击追踪' : '请选择页面和组件区域'} style={{ padding: 60 }} />
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
      <div style={{ marginBottom: 16 }}>
        <Title heading={5} style={{ margin: 0 }}>行为分析</Title>
        <Text type="tertiary" size="small">分析用户在系统中的页面停留时长、功能使用频率和点击热力图</Text>
      </div>

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
