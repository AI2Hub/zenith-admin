import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, DatePicker, Form, Input, Tag, Toast } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Search, RotateCcw, CalendarPlus } from 'lucide-react';
import type { MemberCheckin, PaginatedResponse } from '@zenith/shared';
import { request } from '@/utils/request';
import { usePagination } from '@/hooks/usePagination';
import { usePermission } from '@/hooks/usePermission';
import { SearchToolbar } from '@/components/SearchToolbar';
import ConfigurableTable from '@/components/ConfigurableTable';
import { AppModal } from '@/components/AppModal';
import { MemberSelect } from '@/components/MemberSelect';
import { formatDateForApi } from '@/utils/date';

interface SearchParams {
  memberKeyword?: string;
  dateRange: [Date, Date] | null;
}

const defaultSearch: SearchParams = {
  memberKeyword: undefined,
  dateRange: null,
};

export default function CheckinLogsPage() {
  const { hasPermission } = usePermission();
  const [data, setData] = useState<MemberCheckin[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState<SearchParams>(defaultSearch);
  const searchRef = useRef<SearchParams>(defaultSearch);
  searchRef.current = search;
  const { page, pageSize, setPage, buildPagination } = usePagination();
  const [makeupVisible, setMakeupVisible] = useState(false);
  const makeupFormApi = useRef<FormApi | null>(null);

  const fetchData = useCallback(async (p = page, ps = pageSize, params?: SearchParams) => {
    const current = params ?? searchRef.current;
    setLoading(true);
    try {
      const [dateStart, dateEnd] = current.dateRange ?? [];
      const q = new URLSearchParams({
        page: String(p),
        pageSize: String(ps),
        ...(current.memberKeyword ? { memberKeyword: current.memberKeyword } : {}),
        ...(dateStart ? { dateStart: formatDateForApi(dateStart) } : {}),
        ...(dateEnd ? { dateEnd: formatDateForApi(dateEnd) } : {}),
      }).toString();
      const res = await request.get<PaginatedResponse<MemberCheckin>>(`/api/member-checkins?${q}`);
      if (res.code === 0) {
        setData(res.data.list);
        setTotal(res.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSearch = () => { setPage(1); void fetchData(1, pageSize); };
  const handleReset = () => { setSearch(defaultSearch); setPage(1); void fetchData(1, pageSize, defaultSearch); };

  const handleMakeup = async () => {
    let values: { memberId?: number; date?: Date } | undefined;
    try {
      values = await makeupFormApi.current?.validate();
    } catch {
      throw new Error('validation');
    }
    if (!values?.memberId || !values?.date) throw new Error('请完整填写补签信息');
    const res = await request.post(`/api/members/${values.memberId}/checkin/makeup`, { date: formatDateForApi(values.date) });
    if (res.code === 0) {
      Toast.success('补签成功');
      setMakeupVisible(false);
      void fetchData();
      return;
    }
    throw new Error(res.message);
  };

  const columns: ColumnProps<MemberCheckin>[] = [
    { title: 'ID', dataIndex: 'id', width: 90 },
    { title: '会员昵称', dataIndex: 'memberNickname', width: 140, render: (value?: string | null, row?: MemberCheckin) => value || `#${row?.memberId}` },
    { title: '签到日期', dataIndex: 'checkinDate', width: 120 },
    { title: '连续天数', dataIndex: 'consecutiveDays', width: 100 },
    { title: '积分奖励', dataIndex: 'pointsAwarded', width: 100 },
    { title: '经验奖励', dataIndex: 'experienceAwarded', width: 100 },
    {
      title: '类型',
      dataIndex: 'isMakeup',
      width: 90,
      render: (value?: boolean) => (
        <Tag color={value ? 'orange' : 'green'} size="small">{value ? '补签' : '正常'}</Tag>
      ),
    },
    { title: '签到时间', dataIndex: 'createdAt', width: 180 },
  ];

  const renderKeywordSearch = () => (
    <Input
      placeholder="会员ID/昵称"
      prefix={<Search size={14} />}
      value={search.memberKeyword}
      showClear
      style={{ width: 180 }}
      onChange={(value) => setSearch((prev) => ({ ...prev, memberKeyword: value || undefined }))}
      onEnterPress={handleSearch}
    />
  );

  const renderDateRangeFilter = () => (
    <DatePicker
      type="dateRange"
      placeholder={['开始日期', '结束日期']}
      value={search.dateRange ?? undefined}
      onChange={(value) => setSearch((prev) => ({ ...prev, dateRange: value ? (value as [Date, Date]) : null }))}
      style={{ width: 300 }}
    />
  );

  const renderSearchButton = () => <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>;
  const renderResetButton = () => <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>;
  const renderMakeupButton = () => hasPermission('member:checkin:makeup') ? (
    <Button type="primary" icon={<CalendarPlus size={14} />} onClick={() => setMakeupVisible(true)}>
      会员补签
    </Button>
  ) : null;

  return (
    <div className="page-container">
      <SearchToolbar
        primary={(
          <>
            {renderKeywordSearch()}
            {renderDateRangeFilter()}
            {renderSearchButton()}
            {renderResetButton()}
            {renderMakeupButton()}
          </>
        )}
        mobilePrimary={(
          <>
            {renderKeywordSearch()}
            {renderSearchButton()}
            {renderMakeupButton()}
          </>
        )}
        mobileFilters={renderDateRangeFilter()}
        filterTitle="签到记录筛选"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      <ConfigurableTable
        bordered
        columns={columns}
        dataSource={data}
        loading={loading}
        onRefresh={fetchData}
        refreshLoading={loading}
        rowKey="id"
        size="small"
        pagination={buildPagination(total, fetchData)}
        empty="暂无签到记录"
      />

      <AppModal
        title="会员补签"
        visible={makeupVisible}
        width={480}
        closeOnEsc
        onCancel={() => setMakeupVisible(false)}
        onOk={handleMakeup}
      >
        <Form
          key={makeupVisible ? 'makeup-open' : 'makeup-closed'}
          getFormApi={(api) => { makeupFormApi.current = api; }}
          labelPosition="left"
          labelWidth={90}
        >
          <MemberSelect field="memberId" label="会员" required />
          <Form.DatePicker field="date" label="补签日期" type="date" style={{ width: '100%' }} rules={[{ required: true, message: '请选择补签日期' }]} />
        </Form>
      </AppModal>
    </div>
  );
}
