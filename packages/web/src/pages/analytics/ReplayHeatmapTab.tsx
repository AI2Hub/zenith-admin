/**
 * 页面点击热力 Tab：从回放录像聚合的真实点击坐标（视口归一化 2% 网格）。
 *
 * 底图：自动取最近一条访问过该页面的回放，用 rrweb-player 静态渲染
 * 该页面时刻的真实 DOM 快照（goto 后暂停、屏蔽交互），热力层叠加其上；
 * 无可用回放或渲染失败时回落纯网格示意图。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Select, Spin, Switch, Typography } from '@douyinfe/semi-ui';
import { fetchReplaySegmentEvents, useClickHeatmap, useHeatmapPages, useReplayDetail, useReplayList } from '@/hooks/queries/session-replays';

const { Text } = Typography;

const DAYS_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
];

const EVENT_META = 4;

interface SnapshotBaseProps {
  replayId: string;
  pagePath: string;
  width: number;
  /** 渲染失败回调（父层回落网格） */
  onFail: () => void;
}

/** 底图：rrweb-player 渲染回放中该页面时刻的静态 DOM（隐藏控制器、禁用交互） */
function SnapshotBase({ replayId, pagePath, width, onFail }: Readonly<SnapshotBaseProps>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<{ $destroy?: () => void; goto?: (ms: number, play?: boolean) => void } | null>(null);
  const detailQuery = useReplayDetail(replayId);
  const segments = detailQuery.data?.segments;

  useEffect(() => {
    if (!segments) return;
    let cancelled = false;
    void (async () => {
      try {
        const [{ default: Player }] = await Promise.all([
          import('rrweb-player'),
          import('rrweb-player/dist/style.css'),
        ]);
        const chunks = await Promise.all(segments.map((seg) => fetchReplaySegmentEvents(replayId, seg.seq)));
        if (cancelled) return;
        const events = chunks.flat() as Array<{ type: number; timestamp: number; data?: { href?: string } }>;
        if (events.length < 2) { onFail(); return; }
        // 定位该页面出现的时刻（Meta 事件 href 匹配）
        const baseTs = events[0].timestamp;
        const metaAt = events.find((e) => {
          if (e.type !== EVENT_META || !e.data?.href) return false;
          try { return new URL(e.data.href).pathname === pagePath; } catch { return false; }
        });
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = '';
        playerRef.current = new Player({
          target: host,
          props: {
            events: events as never[],
            width,
            height: Math.round(width * 0.625),
            autoPlay: false,
            showController: false,
            skipInactive: false,
          },
        }) as typeof playerRef.current;
        // 跳到页面时刻 +300ms（等首帧渲染完整）
        playerRef.current?.goto?.(metaAt ? metaAt.timestamp - baseTs + 300 : 0, false);
      } catch {
        if (!cancelled) onFail();
      }
    })();
    return () => {
      cancelled = true;
      try { playerRef.current?.$destroy?.(); } catch { /* ignore */ }
      playerRef.current = null;
    };
  }, [segments, replayId, pagePath, width, onFail]);

  useEffect(() => {
    if (detailQuery.isError) onFail();
  }, [detailQuery.isError, onFail]);

  return <div ref={hostRef} style={{ pointerEvents: 'none', opacity: 0.75 }} aria-hidden="true" />;
}

export default function ReplayHeatmapTab() {
  const [pagePath, setPagePath] = useState('');
  const [days, setDays] = useState(30);
  const [showBase, setShowBase] = useState(true);
  const [baseFailed, setBaseFailed] = useState(false);

  const pagesQuery = useHeatmapPages(days);
  const pages = pagesQuery.data ?? [];
  const heatmapQuery = useClickHeatmap(pagePath, days);
  const heatmap = heatmapQuery.data ?? null;

  // 底图数据源：最近一条访问过该页面的回放
  const baseReplayQuery = useReplayList({ page: 1, pageSize: 1, pagePath });
  const baseReplay = pagePath && !baseFailed && showBase ? (baseReplayQuery.data?.list[0] ?? null) : null;

  useEffect(() => { setBaseFailed(false); }, [pagePath]);

  const maxCount = useMemo(
    () => Math.max(1, ...(heatmap?.points.map((p) => p.count) ?? [1])),
    [heatmap],
  );

  const canvasWidth = 960;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          placeholder="选择页面路径"
          value={pagePath || undefined}
          optionList={pages.map((p) => ({ value: p, label: p }))}
          onChange={(v) => setPagePath((v as string) ?? '')}
          style={{ width: 320 }}
          filter
          loading={pagesQuery.isFetching}
        />
        <Select
          value={days}
          optionList={DAYS_OPTIONS}
          onChange={(v) => setDays(v as number)}
          style={{ width: 110 }}
        />
        {pagePath && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Text type="tertiary" size="small">页面底图</Text>
            <Switch size="small" checked={showBase} onChange={setShowBase} aria-label="切换页面底图" />
          </span>
        )}
        {heatmap && <Text type="tertiary" size="small">共 {heatmap.total} 次点击 · {heatmap.points.length} 个热点网格</Text>}
      </div>

      {!pagePath ? (
        <Empty
          title="选择页面查看点击热力"
          description="热力数据来自回放录像的真实点击坐标（视口相对位置，随回放采集持续累积）"
          style={{ padding: '48px 0' }}
        />
      ) : (
        <Spin spinning={heatmapQuery.isFetching}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: canvasWidth,
              aspectRatio: '16 / 10',
              border: '1px solid var(--semi-color-border)',
              borderRadius: 'var(--semi-border-radius-medium)',
              background: baseReplay
                ? 'var(--semi-color-bg-0)'
                : 'linear-gradient(var(--semi-color-fill-0) 1px, transparent 1px), linear-gradient(90deg, var(--semi-color-fill-0) 1px, transparent 1px)',
              backgroundSize: baseReplay ? undefined : '10% 10%',
              overflow: 'hidden',
            }}
            aria-label={`${pagePath} 的点击热力图`}
          >
            {baseReplay && (
              <SnapshotBase
                replayId={baseReplay.id}
                pagePath={pagePath}
                width={Math.min(canvasWidth, globalThis.innerWidth - 120)}
                onFail={() => setBaseFailed(true)}
              />
            )}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {heatmap?.points.map((p) => {
                const intensity = p.count / maxCount;
                const size = 18 + intensity * 42;
                return (
                  <span
                    key={`${p.x}-${p.y}`}
                    title={`(${p.x}%, ${p.y}%) ${p.count} 次点击`}
                    style={{
                      position: 'absolute',
                      left: `${p.x}%`,
                      top: `${p.y}%`,
                      width: size,
                      height: size,
                      marginLeft: -size / 2,
                      marginTop: -size / 2,
                      borderRadius: '50%',
                      background: `radial-gradient(circle, rgba(255,77,79,${0.25 + intensity * 0.55}) 0%, rgba(255,150,50,${0.12 + intensity * 0.25}) 55%, transparent 75%)`,
                      pointerEvents: 'auto',
                    }}
                  />
                );
              })}
            </div>
            {heatmap && heatmap.points.length === 0 && !heatmapQuery.isFetching && (
              <Text type="quaternary" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                该页面暂无点击数据
              </Text>
            )}
          </div>
          <Text type="quaternary" size="small" style={{ display: 'block', marginTop: 8 }}>
            {baseReplay
              ? '底图为最近一条访问该页面的回放快照（真实 DOM 还原）；坐标为视口相对位置的近似还原，页面滚动时可能存在偏移'
              : '坐标为视口相对位置的近似还原（不含滚动偏移），画布按 16:10 视口比例示意；悬浮热点查看点击次数'}
          </Text>
        </Spin>
      )}
    </div>
  );
}
