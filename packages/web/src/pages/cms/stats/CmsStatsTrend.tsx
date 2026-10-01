import { memo, useMemo } from 'react';
import type { CmsStatOverview } from '@zenith/shared/cms';
import { LineChart, chartOptions, makeLineSpec, useChartPalette } from '@/components/charts';

export type CmsStatsTrendMode = 'traffic' | 'engagement';

export default memo(function CmsStatsTrend({ data, mode = 'traffic' }: Readonly<{ data: CmsStatOverview['trend']; mode?: CmsStatsTrendMode }>) {
  const palette = useChartPalette();
  const spec = useMemo(() => makeLineSpec({ data, xField: 'date', palette, series: [
    ...(mode === 'traffic'
      ? [{ field: 'pv', name: '浏览量 PV' }, { field: 'uv', name: '访客 UV' }, { field: 'sessions', name: '会话' }]
      : [{ field: 'reads', name: '有效阅读' }, { field: 'conversions', name: '成功转化' }]),
  ] }), [data, mode, palette]);
  return <LineChart {...spec} options={chartOptions} height={280} />;
});
