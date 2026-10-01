import { useState } from 'react';
import { Select, Typography } from '@douyinfe/semi-ui';
import type { CmsStatOverview } from '@zenith/shared/cms';
import { StatCard, StatGrid } from '@/components/charts/StatCard';
import type { CmsStatsQuery } from '@/hooks/queries/cms-stats';
import CmsStatsReport from './stats/CmsStatsReport';
import { DIMENSION_LABELS, displayCmsMetric, type CmsStatsDimension } from './stats/cms-stats-presentation';

export default function CmsAttributionPanel({ query, overview }: Readonly<{ query: CmsStatsQuery; overview: CmsStatOverview }>) {
  const [dimension, setDimension] = useState<CmsStatsDimension>('content');
  const metrics = overview.metrics;
  return <div className="cms-stats-attribution">
    <section className="cms-stats-section">
      <div className="cms-stats-section__header">
        <div>
          <Typography.Text strong className="cms-stats-section__title">转化规模</Typography.Text>
          <Typography.Text type="tertiary" className="cms-stats-section__description">展示业务成功、转化访客与曝光点击的整体结果。</Typography.Text>
        </div>
      </div>
      <StatGrid minItemWidth={200}>
      <StatCard title="成功转化" value={metrics.conversions} sub="按业务成功事件计数" />
      <StatCard title="转化访客 / 浏览访客" value={`${metrics.conversionVisitors} / ${metrics.uv}`} sub="分子属于当前区间浏览访客" />
      <StatCard title="访客转化率" value={displayCmsMetric(metrics, 'conversionRate')} sub="转化访客 ÷ 浏览访客" />
      <StatCard title="曝光点击率" value={displayCmsMetric(metrics, 'ctr')} sub={`${metrics.clicks} 次点击 / ${metrics.impressions} 次曝光；按曝光实例去重`} />
      </StatGrid>
    </section>
    <section className="cms-stats-section">
      <div className="cms-stats-section__header">
        <div>
          <Typography.Text strong className="cms-stats-section__title">互动与交付</Typography.Text>
          <Typography.Text type="tertiary" className="cms-stats-section__description">保留开始、成功、失败和交付结果的独立计数。</Typography.Text>
        </div>
      </div>
      <StatGrid minItemWidth={200}>
      <StatCard title="表单开始 / 成功 / 失败" value={`${metrics.formStarts} / ${metrics.formCompletions} / ${metrics.formErrors}`} sub="展示行为与服务端成功分开记录" />
      <StatCard title="投票 / 评论 / 关注成功" value={`${metrics.votes} / ${metrics.comments} / ${metrics.follows}`} />
      <StatCard title="下载点击 / 交付" value={`${metrics.downloadClicks} / ${metrics.downloads}`} />
      <StatCard title="媒体启播 / 完成 / 失败" value={`${metrics.mediaStarts} / ${metrics.mediaCompletions} / ${metrics.mediaErrors}`} />
      </StatGrid>
    </section>
    <section className="cms-stats-section">
      <div className="cms-stats-section__header">
        <div>
          <Typography.Text strong className="cms-stats-section__title">内容归因与互动表现</Typography.Text>
          <Typography.Text type="tertiary" className="cms-stats-section__description">按维度查看成功转化、互动和媒体行为的明细。</Typography.Text>
        </div>
        <Select className="cms-stats-dimension-select" aria-label="互动分析维度" value={dimension} onChange={(value) => setDimension(value as CmsStatsDimension)} optionList={(['content', 'form', 'interaction', 'media', 'placement'] as const).map((value) => ({ value, label: DIMENSION_LABELS[value] }))} />
      </div>
      <CmsStatsReport key={dimension} query={query} dimension={dimension} />
    </section>
  </div>;
}
