import { Hash, Table as TableIcon, BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReportWidgetType } from '@zenith/shared';

/** 组件类型元数据（设计器面板用）*/
export interface WidgetTypeMeta {
  type: ReportWidgetType;
  label: string;
  icon: LucideIcon;
  /** 默认网格尺寸（列宽 w / 行高 h） */
  defaultSize: { w: number; h: number };
}

export const WIDGET_TYPES: WidgetTypeMeta[] = [
  { type: 'kpi', label: '指标卡', icon: Hash, defaultSize: { w: 3, h: 3 } },
  { type: 'table', label: '表格', icon: TableIcon, defaultSize: { w: 6, h: 6 } },
  { type: 'bar', label: '柱状图', icon: BarChart3, defaultSize: { w: 6, h: 6 } },
  { type: 'line', label: '折线图', icon: LineChartIcon, defaultSize: { w: 6, h: 6 } },
  { type: 'pie', label: '饼图', icon: PieChartIcon, defaultSize: { w: 4, h: 6 } },
];
