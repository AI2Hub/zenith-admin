import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, InputNumber, Select, Toast, Tag, Modal } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Search, RotateCcw } from 'lucide-react';
import type { MemberCoupon, MemberCouponStatus, PaginatedResponse } from '@zenith/shared';
import { MEMBER_COUPON_STATUS_LABELS } from '@zenith/shared';
import { request } from '@/utils/request';
import { usePermission } from '@/hooks/usePermission';
import { usePagination } from '@/hooks/usePagination';
import { SearchToolbar } from '@/components/SearchToolbar';
import ConfigurableTable from '@/components/ConfigurableTable';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { renderEllipsis } from '../../utils/table-columns';

const statusOptions = (Object.keys(MEMBER_COUPON_STATUS_LABELS) as MemberCouponStatus[]).map((v) => ({ value: v, label: MEMBER_COUPON_STATUS_LABELS[v] }));
const STATUS_COLORS: Record<string, string> = { unused: 'blue', used: 'green', expired: 'grey', frozen: 'orange' };

interface SearchParams { memberKeyword?: string; couponId?: number; status?: string }

export default function CouponRecordsPage() {
  const { hasPermission } = usePermission();
  const [data, setData] = useState<MemberCoupon[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const { page, pageSize, setPage, buildPagination } = usePagination();
  const [search, setSearch] = useState<SearchParams>({});
  const searchRef = useRef<SearchParams>({});
  searchRef.current = search;

  const fetchData = useCallback(async (p = page, ps = pageSize, params?: SearchParams) => {
    const ap = params ?? searchRef.current;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(p), pageSize: String(ps),
        ...(ap.memberKeyword ? { memberKeyword: ap.memberKeyword } : {}),
        ...(ap.couponId ? { couponId: String(ap.couponId) } : {}),
        ...(ap.status ? { status: ap.status } : {}),
      }).toString();
      const res = await request.get<PaginatedResponse<MemberCoupon>>(`/api/coupons/records?${q}`);
      if (res.code === 0) { setData(res.data.list); setTotal(res.data.total); }
    } finally { setLoading(false); }
  }, [page, pageSize]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleSearch = () => { setPage(1); void fetchData(1, pageSize); };
  const handleReset = () => { setSearch({}); setPage(1); void fetchData(1, pageSize, {}); };

  const handleRevoke = async (id: number) => {
    const res = await request.post(`/api/coupons/records/${id}/revoke`, {});
    if (res.code === 0) { Toast.success('已作废'); void fetchData(); }
    else Toast.error(res.message);
  };

  const confirmRevoke = (record: MemberCoupon) => {
    Modal.confirm({
      title: '确定要作废该券码吗？',
      okButtonProps: { type: 'danger', theme: 'solid' },
      onOk: () => handleRevoke(record.id),
    });
  };

  const canRevoke = hasPermission('member:coupon:revoke');

  const columns: ColumnProps<MemberCoupon>[] = [
    { title: '券码', dataIndex: 'code', width: 180, fixed: 'left', render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '会员', dataIndex: 'memberName', width: 140, render: (v?: string, r?: MemberCoupon) => v || `#${r?.memberId}` },
    { title: '优惠券', dataIndex: 'coupon', width: 160, render: (_: unknown, r: MemberCoupon) => renderEllipsis(r.coupon?.name ?? `#${r.couponId}`) },
    { title: '状态', dataIndex: 'status', width: 100, render: (v: MemberCouponStatus) => <Tag color={STATUS_COLORS[v] as 'blue'}>{MEMBER_COUPON_STATUS_LABELS[v]}</Tag> },
    { title: '领取时间', dataIndex: 'receivedAt', width: 180 },
    { title: '使用时间', dataIndex: 'usedAt', width: 180, render: (v: string | null) => v || '-' },
    { title: '过期时间', dataIndex: 'expireAt', width: 180, render: (v: string | null) => v || '-' },
    ...(canRevoke ? [
      createOperationColumn<MemberCoupon>({
        width: 90,
        desktopInlineKeys: ['revoke'],
        actions: (record) => [
          {
            key: 'revoke',
            label: '作废',
            danger: true,
            hidden: record.status !== 'unused',
            onClick: () => confirmRevoke(record),
          },
        ],
      }),
    ] : []),
  ];

  const renderKeywordSearch = () => (
    <Input
      prefix={<Search size={14} />}
      placeholder="会员ID/昵称"
      value={search.memberKeyword}
      showClear
      style={{ width: 180 }}
      onChange={(v) => setSearch((p) => ({ ...p, memberKeyword: v || undefined }))}
      onEnterPress={handleSearch}
    />
  );

  const renderCouponIdFilter = () => (
    <InputNumber
      placeholder="优惠券ID"
      value={search.couponId}
      min={1}
      style={{ width: 120 }}
      onChange={(v) => setSearch((p) => ({ ...p, couponId: (v as number) || undefined }))}
    />
  );

  const renderStatusFilter = () => (
    <Select
      placeholder="全部状态"
      value={search.status}
      style={{ width: 130 }}
      showClear
      onChange={(v) => setSearch((p) => ({ ...p, status: v as string | undefined }))}
      optionList={statusOptions}
    />
  );

  const renderSearchButton = () => <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>;
  const renderResetButton = () => <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>;

  return (
    <div className="page-container">
      <SearchToolbar
        primary={(
          <>
            {renderKeywordSearch()}
            {renderCouponIdFilter()}
            {renderStatusFilter()}
            {renderSearchButton()}
            {renderResetButton()}
          </>
        )}
        mobilePrimary={(
          <>
            {renderKeywordSearch()}
            {renderSearchButton()}
          </>
        )}
        mobileFilters={(
          <>
            {renderCouponIdFilter()}
            {renderStatusFilter()}
          </>
        )}
        filterTitle="领券记录筛选"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      <ConfigurableTable bordered columns={columns} dataSource={data} loading={loading}
        onRefresh={fetchData} refreshLoading={loading} rowKey="id" size="small"
        pagination={buildPagination(total, fetchData)} empty="暂无领券记录" scroll={{ x: 1100 }} />
    </div>
  );
}
