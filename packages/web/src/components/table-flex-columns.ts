import type { ColumnProps, Data, TableProps } from '@douyinfe/semi-ui/lib/es/table';

/**
 * Semi 的 fixed / ellipsis 列或 scroll.y 会启用 table-layout: fixed 与 min-width: 100%；
 * 若所有列都有 width，剩余空间会按比例分配，导致操作列被拉宽。
 * 每表只设一个弹性主列，用 minWidth 代替 width；其余列固定 width，页面不设 scroll.x。
 * 本模块汇总 width / minWidth 及勾选、展开列宽作为 scroll.x，忽略页面传入值，窄容器改为横向滚动。
 * 传给 Semi 前剥离其不支持的 minWidth；缺少弹性列时启发式选一列并标记，供开发期告警。
 * 最终表宽为 max(scroll.x, 容器宽度)：弹性列吸收剩余空间，其余列保持配置宽度。
 */

export const FLEX_COLUMN_DEFAULT_MIN_WIDTH = 120;

/** Semi 通过 `.semi-table-colgroup .semi-table-column-selection / -expand { width: 48px }` 给勾选列与展开列定宽 */
const SELECTION_COLUMN_WIDTH = 48;
const EXPAND_COLUMN_WIDTH = 48;

const TEXT_LIKE_KEY_PATTERN = /name|title|subject|desc|remark|content|summary|message|reason|note|comment|body|text|label|url|path|address|keyword/i;
const NON_TEXT_KEY_PATTERN = /(At|Time|Date|Count|Num|Amount|Id|No)$/;

export type FlexColumnProps<RecordType extends Data = Data> = ColumnProps<RecordType> & {
  /** 弹性列最小宽度（仅对不设 `width` 的列有意义），缺省 FLEX_COLUMN_DEFAULT_MIN_WIDTH */
  minWidth?: number;
  children?: FlexColumnProps<RecordType>[];
};

export interface ResolveFlexColumnsOptions<RecordType extends Data = Data> {
  scroll?: TableProps<RecordType>['scroll'];
  rowSelection?: TableProps<RecordType>['rowSelection'];
  expandedRowRender?: TableProps<RecordType>['expandedRowRender'];
  hideExpandedColumn?: boolean;
  sticky?: TableProps<RecordType>['sticky'];
  /**
   * 虚拟化表格必须传：Semi 在 virtualized 模式下把 `scroll.x` 直接写成 wrapper 的 width（不是最小宽度），
   * 且 body 行宽等于各列宽度之和，纵向滚动条又占在 body 内部——因此 wrapper 要按容器宽度给，
   * 各列之和要按 body 的可视宽度（clientWidth）给，两者分开度量。普通表格无需传。
   */
  fill?: {
    /** wrapper 应占的宽度（容器宽度） */
    wrapperWidth: number;
    /** body 可视宽度（扣除边框与纵向滚动条），各列宽度之和铺满到此值 */
    contentWidth: number;
  };
}

export interface ResolvedFlexColumns<RecordType extends Data = Data> {
  columns: ColumnProps<RecordType>[];
  scroll: TableProps<RecordType>['scroll'];
  /** 页面未声明弹性列、由启发式兜底选中的列标签；已正确声明时为 null */
  fallbackColumnLabel: string | null;
  /**
   * 各列（含 Semi 自动追加的勾选 / 展开列）宽度之和；弹性列为 auto 时按其最小宽度计。
   * 虚拟化表格用它覆写表头 table 的宽度：Semi 会把表头 table 写成 scroll.x 宽，而 body 行宽是各列之和，
   * 纵向滚动条占位使两者不等，表头列会被按比例拉伸而与行错位。
   */
  columnsTotalWidth: number;
  /** 页面传入了 scroll.x 但被列宽之和覆盖（fixed 布局下页面不应手写 scroll.x） */
  ignoredScrollX: boolean;
}

function flattenLeaves<RecordType extends Data>(columns: FlexColumnProps<RecordType>[]): FlexColumnProps<RecordType>[] {
  return columns.flatMap((column) => (column.children?.length ? flattenLeaves(column.children) : [column]));
}

function numericWidth(width: ColumnProps['width']): number | undefined {
  if (typeof width === 'number') return Number.isFinite(width) ? width : undefined;
  if (typeof width === 'string' && /^\d+(\.\d+)?(px)?$/.test(width.trim())) return Number.parseFloat(width);
  return undefined;
}

function columnKeyText<RecordType extends Data>(column: ColumnProps<RecordType>): string {
  const dataIndex = column.dataIndex as unknown;
  if (typeof dataIndex === 'string') return dataIndex;
  if (Array.isArray(dataIndex)) return dataIndex.map(String).join('.');
  if (column.key !== undefined && column.key !== null) return String(column.key);
  return '';
}

function columnLabel<RecordType extends Data>(column: ColumnProps<RecordType>): string {
  const { title } = column;
  if (typeof title === 'string' || typeof title === 'number') return String(title);
  return columnKeyText(column) || '(未命名列)';
}

/** 所有列都设了固定宽度时，挑最像「长文本主列」的一列作为弹性列 */
function pickFallbackAbsorber<RecordType extends Data>(leaves: FlexColumnProps<RecordType>[]): FlexColumnProps<RecordType> | null {
  let best: FlexColumnProps<RecordType> | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestWidth = 0;
  for (const column of leaves) {
    if (column.fixed) continue;
    const key = columnKeyText(column);
    let score = 0;
    if (column.ellipsis) score += 3;
    if (TEXT_LIKE_KEY_PATTERN.test(key)) score += 2;
    if (NON_TEXT_KEY_PATTERN.test(key) || column.align === 'right' || column.align === 'center') score -= 3;
    const width = numericWidth(column.width) ?? 0;
    if (score > bestScore || (score === bestScore && width > bestWidth)) {
      best = column;
      bestScore = score;
      bestWidth = width;
    }
  }
  return best;
}

/**
 * 重建列数组：剥离 `minWidth`；弹性列按 `flexWidths` 处理——值为 undefined 时去掉 `width`（由浏览器分配剩余空间），
 * 为数字时写成显式 `width`（虚拟化表格的 body 行宽取自表头实测值，只有显式数值才能在容器变化时保持表头与行对齐）。
 */
function rebuild<RecordType extends Data>(
  columns: FlexColumnProps<RecordType>[],
  flexWidths: Map<FlexColumnProps<RecordType>, number | undefined>,
): ColumnProps<RecordType>[] {
  return columns.map((column) => {
    if (column.children?.length) {
      const { minWidth: _minWidth, children, ...rest } = column;
      return { ...rest, children: rebuild(children, flexWidths) };
    }
    const { minWidth: _minWidth, ...rest } = column;
    if (!flexWidths.has(column)) return rest;
    const { width: _width, ...flexRest } = rest;
    const explicitWidth = flexWidths.get(column);
    return explicitWidth === undefined ? flexRest : { ...flexRest, width: explicitWidth };
  });
}

/** 仅剥离 `minWidth` 等 Semi 不认识的扩展属性，不改动布局（resizable 表格等不介入场景使用） */
export function stripFlexColumnProps<RecordType extends Data>(columns: FlexColumnProps<RecordType>[]): ColumnProps<RecordType>[] {
  return rebuild(columns, new Map());
}

/**
 * 解析弹性列并补齐 `scroll.x`。不满足介入条件（非固定布局、存在百分比宽度、所有列都 fixed）时
 * 只剥离 `minWidth`，其余原样返回。
 */
export function resolveFlexColumns<RecordType extends Data = Data>(
  columns: FlexColumnProps<RecordType>[],
  options: ResolveFlexColumnsOptions<RecordType> = {},
): ResolvedFlexColumns<RecordType> {
  const { scroll, rowSelection, expandedRowRender, hideExpandedColumn = true, sticky, fill } = options;
  const leaves = flattenLeaves(columns);
  const passthrough = (): ResolvedFlexColumns<RecordType> => ({ columns: stripFlexColumnProps(columns), scroll, fallbackColumnLabel: null, columnsTotalWidth: 0, ignoredScrollX: false });

  // 与 Semi getTableLayout / useFixedHeader 判定一致：只有 table-layout: fixed 才会出现按比例拉伸
  const fixedLayout = leaves.some((column) => Boolean(column.fixed) || Boolean(column.ellipsis)) || scroll?.y != null || Boolean(sticky);
  if (!fixedLayout || leaves.length < 2) return passthrough();

  const hasPercentWidth = leaves.some((column) => typeof column.width === 'string' && numericWidth(column.width) === undefined);
  if (hasPercentWidth) return passthrough();

  const declaredFlex = leaves.filter((column) => column.width === undefined);
  let fallbackColumnLabel: string | null = null;
  let flexLeaves = declaredFlex;
  if (flexLeaves.length === 0) {
    const absorber = pickFallbackAbsorber(leaves);
    if (!absorber) return passthrough();
    flexLeaves = [absorber];
    fallbackColumnLabel = columnLabel(absorber);
  }

  // 兜底列没有 minWidth 时沿用其原 width 作为最小宽度，保证窄屏表现与改造前一致
  const flexMinWidths = new Map(flexLeaves.map((column) => [
    column,
    column.minWidth ?? numericWidth(column.width) ?? FLEX_COLUMN_DEFAULT_MIN_WIDTH,
  ]));
  let fixedTotal = 0;
  for (const column of leaves) {
    if (!flexMinWidths.has(column)) fixedTotal += numericWidth(column.width) ?? 0;
  }
  if (rowSelection && (rowSelection === true || !rowSelection.hidden)) fixedTotal += SELECTION_COLUMN_WIDTH;
  if (expandedRowRender && hideExpandedColumn === false) fixedTotal += EXPAND_COLUMN_WIDTH;
  let flexMinTotal = 0;
  for (const minWidth of flexMinWidths.values()) flexMinTotal += minWidth;

  const minTotal = fixedTotal + flexMinTotal;
  const flexWidths = new Map<FlexColumnProps<RecordType>, number | undefined>();
  let x: number;
  let columnsTotalWidth = minTotal;
  if (fill === undefined) {
    // 普通表格：弹性列不设 width，靠 min-width: 100% 吸收剩余空间；scroll.x 只是各列之和的保底
    for (const column of flexLeaves) flexWidths.set(column, undefined);
    x = Math.ceil(minTotal);
  } else {
    // 虚拟化：wrapper 固定为容器宽度，列宽之和铺满 body 可视宽度；容器过窄时列宽之和大于 wrapper，由 body 横向滚动
    const extraEach = Math.floor(Math.max(0, fill.contentWidth - minTotal) / flexLeaves.length);
    for (const [column, minWidth] of flexMinWidths) flexWidths.set(column, minWidth + extraEach);
    columnsTotalWidth = minTotal + extraEach * flexLeaves.length;
    x = Math.ceil(fill.wrapperWidth);
  }

  // 页面传入的 scroll.x 在 fixed 布局下一律以列宽之和为准（页面不应再手写）
  return {
    columns: rebuild(columns, flexWidths),
    scroll: { ...scroll, x },
    fallbackColumnLabel,
    columnsTotalWidth,
    ignoredScrollX: scroll?.x !== undefined,
  };
}
