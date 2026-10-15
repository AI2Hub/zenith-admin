import { useState } from 'react';
import { Tag } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { MemberLoginLog } from '@zenith/shared/member';
import ConfigurableTable from '@/components/ConfigurableTable';
import { ListSearchToolbar } from '@/components/list-page';
import ExportButton from '@/components/ExportButton';
import { dateTimeColumn, renderEllipsis } from '../../utils/table-columns';
import { formatDateRangeValuesForApi, formatDateTime } from '@/utils/date';
import { memberAdminKeys, useMemberLoginLogList } from '@/hooks/queries/member-admin';
import { DateRangeFilter, KeywordInput, StatusSelect } from '@/components/search-filters';
import { memberCellColumn, renderMemberName, useMemberKeywordDeepLink } from './member-admin-display';
import { useListPage } from '@/hooks/useListPage';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { LoginLogDetailModal } from '@/components/logs/LoginLogDetailModal';

interface SearchParams {
  keyword?: string;
  status?: 'success' | 'fail';
  dateRange: [Date, Date] | null;
}

const defaultSearch: SearchParams = { keyword: undefined, status: undefined, dateRange: null };

const statusOptions = [
  { value: 'success', label: '成功' },
  { value: 'fail', label: '失败' },
];

export default function MemberLoginLogsPage() {
  const [detailLog, setDetailLog] = useState<MemberLoginLog | null>(null);
  const {
    bind,
    bindKeyword,
    handleSearch,
    handleReset,
    applySearch,
    tableProps,
    filterQuery,
  } = useListPage({
    defaults: defaultSearch,
    listKey: memberAdminKeys.loginLogLists,
    useList: useMemberLoginLogList,
    toQuery: (s) => {
      const [dateStart, dateEnd] = formatDateRangeValuesForApi(s.dateRange);
      return { keyword: s.keyword, status: s.status, dateStart, dateEnd };
    },
    table: { empty: '暂无登录日志' },
  });
  useMemberKeywordDeepLink<SearchParams>({ applySearch, buildParams: (memberKeyword) => ({ keyword: memberKeyword, dateRange: null }) });

  const columns: ColumnProps<MemberLoginLog>[] = [
    memberCellColumn<MemberLoginLog>({ width: 140, nameField: 'memberNickname', idField: 'memberId' }),
    { title: 'IP', dataIndex: 'ip', width: 140, render: (v: string | null) => v ?? '—' },
    { title: '地点', dataIndex: 'location', width: 140, render: (v: string | null) => renderEllipsis(v ?? '—') },
    { title: '浏览器', dataIndex: 'browser', width: 130, render: (v: string | null) => renderEllipsis(v ?? '—') },
    { title: '操作系统', dataIndex: 'os', width: 130, render: (v: string | null) => renderEllipsis(v ?? '—') },
    { title: '说明', dataIndex: 'message', render: (v: string | null) => renderEllipsis(v ?? '—') },
    dateTimeColumn('登录时间', 'createdAt', { fixed: 'right' }),
    { title: '状态', dataIndex: 'status', width: 90, fixed: 'right', render: (v: 'success' | 'fail') => <Tag color={v === 'success' ? 'green' : 'red'}>{v === 'success' ? '成功' : '失败'}</Tag> },
    createOperationColumn<MemberLoginLog>({
      width: 80,
      actions: (record) => [
        { key: 'detail', label: '详情', onClick: () => setDetailLog(record) },
      ],
    }),
  ];

  return (
    <div className="page-container">
      <ListSearchToolbar
        keyword={<KeywordInput placeholder="会员昵称/手机号/用户名" {...bindKeyword('keyword')} />}
        filters={(
          <>
            <StatusSelect
              items={statusOptions}
              {...bind('status', (value) => value as 'success' | 'fail' | undefined)}
            />
            <DateRangeFilter type="dateRange" {...bind('dateRange')} />
          </>
        )}
        onSearch={handleSearch}
        onReset={handleReset}
        actions={<ExportButton entity="member.login-logs" query={filterQuery} permission="member:loginlog:list" />}
        filterTitle="登录日志筛选"
      />

      <ConfigurableTable<MemberLoginLog>
        columns={columns}
        {...tableProps}
      />
      <LoginLogDetailModal
        title="会员登录日志详情"
        visible={detailLog !== null}
        onCancel={() => setDetailLog(null)}
        items={detailLog ? [
          { key: 'ID', value: String(detailLog.id) },
          { key: '状态', value: <Tag color={detailLog.status === 'success' ? 'green' : 'red'}>{detailLog.status === 'success' ? '成功' : '失败'}</Tag> },
          { key: '会员', value: renderMemberName({ nickname: detailLog.memberNickname, memberId: detailLog.memberId }), span: 2 },
          { key: 'IP 地址', value: detailLog.ip ?? '—' },
          { key: '地点', value: detailLog.location ?? '—' },
          { key: '浏览器', value: detailLog.browser ?? '—' },
          { key: '操作系统', value: detailLog.os ?? '—' },
          { key: '说明', value: detailLog.message ?? '—', span: 2 },
          { key: '登录时间', value: formatDateTime(detailLog.createdAt), span: 2 },
          { key: 'User-Agent', value: detailLog.userAgent ?? '—', span: 2 },
        ] : []}
      />
    </div>
  );
}
