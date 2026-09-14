import { useMemo, type ReactNode } from 'react';
import { Tag, Tooltip, Typography } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { PaginationProps } from '@douyinfe/semi-ui/lib/es/pagination';
import type { OperationVerdict } from '@zenith/shared/permission-catalog';
import ConfigurableTable from '@/components/ConfigurableTable';
import { ListSearchToolbar } from '@/components/list-page';
import { FilterSelect, KeywordInput } from '@/components/search-filters';
import type { UseListSearchReturn } from '@/hooks/useListSearch';
import { copyableNoColumn, EMPTY_PLACEHOLDER, renderEllipsis } from '@/utils/table-columns';
import {
  ACCESS_KIND_OPTIONS,
  AUDIT_OPTIONS,
  METHOD_OPTIONS,
  METHOD_TAG_COLORS,
  SECURITY_OPTIONS,
  VERDICT_LABELS,
  VERDICT_TAG_COLORS,
  describeAccess,
  domainLabel,
  domainOptions,
  featureOptions,
  permissionLabel,
  permissionOptions,
  type CatalogFilters,
  type CatalogRow,
} from './catalog-model';
import { SECURITY_SCHEME_LABELS } from '@zenith/shared/permission-catalog';

/** 方法标签：等宽大写，颜色按语义（读绿 / 写蓝 / 改橙 / 删红） */
export function MethodTag({ method }: Readonly<{ method: CatalogRow['method'] }>) {
  return (
    <Tag size="small" color={METHOD_TAG_COLORS[method]} style={{ fontFamily: 'var(--semi-font-family-mono, monospace)', minWidth: 58, justifyContent: 'center' }}>
      {method.toUpperCase()}
    </Tag>
  );
}

/** 权限码标签：最多展示 2 个，其余折成「+N」并悬停列出全部；带注册表里的中文名 */
export function PermissionTags({ codes, max = 2 }: Readonly<{ codes: readonly string[]; max?: number }>) {
  if (codes.length === 0) return <>{EMPTY_PLACEHOLDER}</>;
  const shown = codes.slice(0, max);
  const rest = codes.slice(max);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', minWidth: 0 }}>
      {shown.map((code) => (
        <Tooltip key={code} content={permissionLabel(code) ?? code}>
          <Tag size="small" color="light-blue" style={{ fontFamily: 'var(--semi-font-family-mono, monospace)', maxWidth: 220 }}>
            <Typography.Text ellipsis style={{ fontSize: 'inherit', color: 'inherit' }}>{code}</Typography.Text>
          </Tag>
        </Tooltip>
      ))}
      {rest.length > 0 && (
        <Tooltip content={<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{rest.map((code) => <span key={code}>{code}</span>)}</div>}>
          <Tag size="small" color="grey">+{rest.length}</Tag>
        </Tooltip>
      )}
    </span>
  );
}

/** 访问要求单元格：权限码标签 / 登录即可 / 仅平台超管；非 bearer 显示凭证类型 */
function renderAccess(row: CatalogRow): ReactNode {
  if (row.security !== 'bearer' || row.accessKind === null) {
    return <Typography.Text type="tertiary">{SECURITY_SCHEME_LABELS[row.security]}</Typography.Text>;
  }
  if (row.accessKind === 'permission') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
        <PermissionTags codes={row.permissions} />
        {row.platformOnly && <Tag size="small" color="violet">{row.platformOnly === 'multi-tenant' ? '多租户仅平台' : '仅平台'}</Tag>}
      </span>
    );
  }
  return <Tag size="small" color={row.accessKind === 'platform' ? 'violet' : 'grey'}>{describeAccess(row)}</Tag>;
}

export interface ApiCatalogSearchBarProps<F extends CatalogFilters> {
  readonly rows: readonly CatalogRow[];
  /** `useListSearch<F>` 的返回值：控件绑定草稿，点「查询」才提交 */
  readonly search: UseListSearchReturn<F>;
  /** 追加的筛选控件（矩阵 Tab 的判定筛选） */
  readonly extraFilters?: ReactNode;
  /** 工具栏右侧说明（匹配数量等） */
  readonly extra?: ReactNode;
}

/** 目录搜索栏：标准「查询 / 重置」语义——筛选改动只进草稿，点「查询」提交后过滤并回到第 1 页 */
export function ApiCatalogSearchBar<F extends CatalogFilters>({ rows, search, extraFilters, extra }: ApiCatalogSearchBarProps<F>) {
  const domains = useMemo(() => domainOptions(rows), [rows]);
  const permissions = useMemo(() => permissionOptions(rows), [rows]);
  const features = useMemo(() => featureOptions(rows), [rows]);
  // 子类型筛选状态（矩阵多一个 verdict 键）对目录字段的绑定与 CatalogFilters 完全一致
  const { bind, bindKeyword, handleSearch, handleReset } = search as unknown as UseListSearchReturn<CatalogFilters>;
  return (
    <ListSearchToolbar
      keyword={<KeywordInput placeholder="搜索名称 / 路径 / 权限码（支持拼音）" {...bindKeyword('keyword')} width={280} />}
      filters={(
        <>
          <FilterSelect placeholder="全部模块" items={domains} {...bind('domain')} width={130} filter />
          <FilterSelect placeholder="全部方法" items={METHOD_OPTIONS} {...bind('method')} width={110} />
          <FilterSelect placeholder="全部认证方式" items={SECURITY_OPTIONS} {...bind('security')} width={130} />
          <FilterSelect placeholder="全部访问要求" items={ACCESS_KIND_OPTIONS} {...bind('accessKind')} width={130} />
          <FilterSelect placeholder="全部权限码" items={permissions} {...bind('permission')} width={260} filter />
          <FilterSelect placeholder="全部审计" items={AUDIT_OPTIONS} {...bind('audit')} width={110} />
          {features.length > 0 && <FilterSelect placeholder="全部功能门控" items={features} {...bind('feature')} width={140} filter />}
          {extraFilters}
        </>
      )}
      onSearch={handleSearch}
      onReset={handleReset}
      actions={extra}
    />
  );
}

export interface ApiCatalogTableProps {
  /** 当前页的行（调用方按 page / pageSize 切片） */
  readonly rows: readonly CatalogRow[];
  readonly pagination: PaginationProps;
  readonly onOpen: (row: CatalogRow) => void;
  /** 传入即追加「可调用」列（权限矩阵 Tab） */
  readonly verdictOf?: (row: CatalogRow) => OperationVerdict;
}

export function ApiCatalogTable({ rows, pagination, onOpen, verdictOf }: ApiCatalogTableProps) {
  const columns = useMemo<ColumnProps<CatalogRow>[]>(() => [
    { title: '模块', dataIndex: 'domain', width: 110, render: (domain: CatalogRow['domain']) => domainLabel(domain) },
    { title: '方法', dataIndex: 'method', width: 90, render: (method: CatalogRow['method']) => <MethodTag method={method} /> },
    copyableNoColumn<CatalogRow>('路径', 'fullPath', { flex: true }),
    {
      title: '名称',
      dataIndex: 'summary',
      width: 220,
      render: (summary: string, row: CatalogRow) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
          {renderEllipsis(summary)}
          {row.deprecated && <Tag size="small" color="grey">已废弃</Tag>}
        </span>
      ),
    },
    { title: '认证', dataIndex: 'security', width: 100, render: (security: CatalogRow['security']) => SECURITY_SCHEME_LABELS[security] },
    { title: '访问要求', dataIndex: 'permissions', width: 300, render: (_: unknown, row: CatalogRow) => renderAccess(row) },
    { title: '审计', dataIndex: 'audit', width: 150, render: renderEllipsis },
    { title: '功能门控', dataIndex: 'feature', width: 110, render: renderEllipsis },
    ...(verdictOf
      ? [{
        title: '可调用',
        dataIndex: 'key',
        width: 110,
        fixed: 'right' as const,
        render: (_: unknown, row: CatalogRow) => {
          const verdict = verdictOf(row);
          return <Tag size="small" color={VERDICT_TAG_COLORS[verdict]}>{VERDICT_LABELS[verdict]}</Tag>;
        },
      }]
      : []),
  ], [verdictOf]);

  return (
    <ConfigurableTable<CatalogRow>
      bordered
      size="small"
      rowKey="key"
      columns={columns}
      dataSource={rows as CatalogRow[]}
      pagination={pagination}
      empty="没有符合条件的接口"
      onRow={(row) => ({ onClick: () => { if (row) onOpen(row); }, style: { cursor: 'pointer' } })}
    />
  );
}
