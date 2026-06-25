import { useEffect, useState, useCallback, useRef } from 'react';
import { Avatar, Button, Form, Input, Select, Space, Spin, Tag, Toast, Banner, Popconfirm } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import { RotateCcw, Search, RefreshCw, Ban } from 'lucide-react';
import type { PaginatedResponse, MpFan, MpTag, MpFanSubscribe } from '@zenith/shared';
import { usePermission } from '@/hooks/usePermission';
import { request } from '@/utils/request';
import { SearchToolbar } from '@/components/SearchToolbar';
import { AppModal } from '@/components/AppModal';
import ConfigurableTable from '@/components/ConfigurableTable';
import { renderEllipsis } from '../../utils/table-columns';
import { usePagination } from '@/hooks/usePagination';
import { useMpAccounts } from './useMpAccounts';
import { MpAccountSwitcher } from './MpAccountSwitcher';

const SEX_LABELS: Record<number, string> = { 0: '未知', 1: '男', 2: '女' };
const SUBSCRIBE_OPTIONS = [
  { label: '已关注', value: 'subscribed' },
  { label: '已取关', value: 'unsubscribed' },
];

export default function MpFansPage() {
  const { hasPermission: can } = usePermission();
  const { accounts, currentId, currentIdRef, setCurrentId, loading: accountsLoading } = useMpAccounts();

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<MpFan[]>([]);
  const [total, setTotal] = useState(0);
  const { page, pageSize, setPage, setPageSize, buildPagination } = usePagination();

  const [tags, setTags] = useState<MpTag[]>([]);
  const tagMap = new Map(tags.map((t) => [t.id, t.name]));

  interface SearchParams { keyword: string; subscribe: MpFanSubscribe | undefined; tagId: number | undefined; blacklisted: 'true' | 'false' | undefined; }
  const defaultSearch: SearchParams = { keyword: '', subscribe: undefined, tagId: undefined, blacklisted: undefined };
  const [searchParams, setSearchParams] = useState<SearchParams>(defaultSearch);
  const searchRef = useRef<SearchParams>(defaultSearch);
  searchRef.current = searchParams;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MpFan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const formRef = useRef<FormApi>(null);

  const fetchTags = useCallback(async (accountId: number) => {
    const res = await request.get<PaginatedResponse<MpTag>>(`/api/mp/tags?page=1&pageSize=200&accountId=${accountId}`);
    if (currentIdRef.current !== accountId) return; // 账号已切换，丢弃过期标签
    setTags(res.data?.list ?? []);
  }, [currentIdRef]);

  const fetchList = useCallback(
    async (p = page, ps = pageSize, params?: SearchParams) => {
      if (!currentId) { setList([]); setTotal(0); return; }
      const reqId = currentId;
      const { keyword, subscribe, tagId, blacklisted } = params ?? searchRef.current;
      setLoading(true);
      try {
        const query = new URLSearchParams({ page: String(p), pageSize: String(ps), accountId: String(currentId) });
        if (keyword) query.set('keyword', keyword);
        if (subscribe) query.set('subscribe', subscribe);
        if (tagId) query.set('tagId', String(tagId));
        if (blacklisted) query.set('blacklisted', blacklisted);
        const res = await request.get<PaginatedResponse<MpFan>>(`/api/mp/fans?${query}`);
        if (currentIdRef.current !== reqId) return; // 账号已切换，丢弃过期响应
        setList(res.data?.list ?? []);
        setTotal(res.data?.total ?? 0);
        setPage(res.data?.page ?? p);
        setPageSize(res.data?.pageSize ?? ps);
      } finally {
        setLoading(false);
      }
    },
    [page, pageSize, currentId, currentIdRef, setPage, setPageSize],
  );

  useEffect(() => {
    if (currentId) void fetchTags(currentId);
    setPage(1);
    void fetchList(1, pageSize, searchRef.current);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [currentId]);

  const handleSearch = () => { setPage(1); void fetchList(1, pageSize); };
  const handleReset = () => { setSearchParams(defaultSearch); setPage(1); void fetchList(1, pageSize, defaultSearch); };

  const handleSync = async () => {
    if (!currentId) return;
    setSyncing(true);
    try {
      const res = await request.post<{ synced: number; total: number }>('/api/mp/fans/sync', { accountId: currentId });
      if (res.code === 0) {
        Toast.success(`同步完成：共处理 ${res.data?.synced ?? 0} 个粉丝`);
        void fetchList();
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleBlacklist = async (record: MpFan) => {
    if (!currentId) return;
    const res = await request.post(`/api/mp/fans/${record.blacklisted ? 'unblacklist' : 'blacklist'}`, { accountId: currentId, openids: [record.openid] });
    if (res.code === 0) { Toast.success(record.blacklisted ? '已移出黑名单' : '已拉黑'); void fetchList(); }
  };

  const handleSyncBlacklist = async () => {
    if (!currentId) return;
    setSyncing(true);
    try {
      const res = await request.post<{ synced: number }>('/api/mp/fans/sync-blacklist', { accountId: currentId });
      if (res.code === 0) { Toast.success(`黑名单同步完成：共 ${res.data?.synced ?? 0} 个`); void fetchList(); }
    } finally {
      setSyncing(false);
    }
  };

  const openEdit = (record: MpFan) => { setEditingRecord(record); setModalVisible(true); };

  const handleCreateMember = async (record: MpFan) => {
    const res = await request.post(`/api/mp/fans/${record.id}/create-member`);
    if (res.code === 0) { Toast.success('会员已创建并绑定'); void fetchList(); }
  };

  const handleUnbindMember = async (record: MpFan) => {
    const res = await request.post(`/api/mp/fans/${record.id}/unbind-member`);
    if (res.code === 0) { Toast.success('已解绑会员'); void fetchList(); }
  };

  const handleSubmit = async () => {
    let values: Awaited<ReturnType<FormApi['validate']>>;
    try { values = (await formRef.current?.validate())!; } catch { return; }
    if (!editingRecord) return;
    setSubmitting(true);
    try {
      const res = await request.put(`/api/mp/fans/${editingRecord.id}`, { remark: values.remark ?? '', tagIds: values.tagIds ?? [] });
      if (res.code !== 0) return;
      Toast.success('保存成功');
      setModalVisible(false);
      void fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: '粉丝', dataIndex: 'nickname', width: 200,
      render: (v: string | null, record: MpFan) => (
        <Space>
          <Avatar size="extra-small" src={record.avatar ?? undefined} color="blue">{(v ?? '?').slice(0, 1)}</Avatar>
          <span>{v || '（未命名）'}</span>
        </Space>
      ),
    },
    { title: 'openid', dataIndex: 'openid', width: 200, render: renderEllipsis },
    { title: '性别', dataIndex: 'sex', width: 70, render: (v: number) => SEX_LABELS[v] ?? '未知' },
    { title: '地区', dataIndex: 'province', width: 140, render: (_: unknown, r: MpFan) => [r.province, r.city].filter(Boolean).join(' ') || '—' },
    {
      title: '标签', dataIndex: 'tagIds', width: 200,
      render: (ids: number[]) => (
        ids.length === 0 ? '—' : (
          <Space wrap spacing={4}>
            {ids.map((id) => <Tag key={id} color="light-blue" type="light" size="small">{tagMap.get(id) ?? `#${id}`}</Tag>)}
          </Space>
        )
      ),
    },
    { title: '备注', dataIndex: 'remark', width: 140, render: (v: string | null) => v || '—' },
    { title: '关注时间', dataIndex: 'subscribeTime', width: 170, render: (v: string | null) => v || '—' },
    {
      title: '会员', dataIndex: 'memberId', width: 90, align: 'center' as const,
      render: (v: number | null) => (v ? <Tag color="green" type="light">已绑定 #{v}</Tag> : <Tag color="grey" type="light">未绑定</Tag>),
    },
    {
      title: '关注状态', dataIndex: 'subscribe', width: 100, align: 'center' as const, fixed: 'right' as const,
      render: (v: MpFanSubscribe, r: MpFan) => (
        <Space spacing={2}>
          {v === 'subscribed' ? <Tag color="green" type="light">已关注</Tag> : <Tag color="grey" type="light">已取关</Tag>}
          {r.blacklisted && <Tag color="red" type="light">黑名单</Tag>}
        </Space>
      ),
    },
    {
      title: '操作', key: 'actions', width: 240, fixed: 'right' as const,
      render: (_: unknown, record: MpFan) => (
        <Space>
          {can('mp:fan:update') && <Button theme="borderless" size="small" onClick={() => openEdit(record)}>编辑</Button>}
          {can('mp:fan:bind') && (record.memberId
            ? (
              <Popconfirm title="确定解绑该粉丝的会员？" onConfirm={() => void handleUnbindMember(record)}>
                <Button theme="borderless" size="small" type="danger">解绑会员</Button>
              </Popconfirm>
            )
            : <Button theme="borderless" size="small" onClick={() => void handleCreateMember(record)}>创建会员</Button>)}
          {can('mp:fan:blacklist') && (
            <Popconfirm title={record.blacklisted ? '移出黑名单？' : '确定拉黑该粉丝？'} onConfirm={() => void handleBlacklist(record)}>
              <Button theme="borderless" size="small" type={record.blacklisted ? 'tertiary' : 'danger'}>{record.blacklisted ? '移出黑名单' : '拉黑'}</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const renderAccountFilter = () => (
    <MpAccountSwitcher accounts={accounts} value={currentId} onChange={setCurrentId} loading={accountsLoading} />
  );
  const renderKeywordInput = () => (
    <Input
      prefix={<Search size={14} />}
      placeholder="搜索昵称/openid/备注"
      value={searchParams.keyword}
      onChange={(v) => setSearchParams({ ...searchParams, keyword: v })}
      onEnterPress={handleSearch}
      showClear
      style={{ width: 200 }}
    />
  );
  const renderSubscribeFilter = () => (
    <Select
      placeholder="关注状态"
      value={searchParams.subscribe}
      onChange={(v) => setSearchParams({ ...searchParams, subscribe: v as MpFanSubscribe | undefined })}
      optionList={SUBSCRIBE_OPTIONS}
      showClear
      style={{ width: 120 }}
    />
  );
  const renderTagFilter = () => (
    <Select
      placeholder="标签"
      value={searchParams.tagId}
      onChange={(v) => setSearchParams({ ...searchParams, tagId: v as number | undefined })}
      optionList={tags.map((t) => ({ label: t.name, value: t.id }))}
      showClear
      filter
      style={{ width: 150 }}
    />
  );
  const renderBlacklistFilter = () => (
    <Select
      placeholder="黑名单"
      value={searchParams.blacklisted}
      onChange={(v) => setSearchParams({ ...searchParams, blacklisted: v as 'true' | 'false' | undefined })}
      optionList={[{ label: '黑名单', value: 'true' }, { label: '正常', value: 'false' }]}
      showClear
      style={{ width: 110 }}
    />
  );
  const renderSearchButton = () => <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>;
  const renderResetButton = () => <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>;
  const renderSyncActions = () => {
    const syncButton = can('mp:fan:sync') ? (
      <Button icon={<RefreshCw size={14} />} loading={syncing} disabled={!currentId} onClick={() => void handleSync()}>同步粉丝</Button>
    ) : null;
    const blacklistButton = can('mp:fan:blacklist') ? (
      <Button icon={<Ban size={14} />} loading={syncing} disabled={!currentId} onClick={() => void handleSyncBlacklist()}>同步黑名单</Button>
    ) : null;
    return syncButton || blacklistButton ? <>{syncButton}{blacklistButton}</> : null;
  };

  return (
    <div className="page-container">
      <SearchToolbar
        primary={(
          <>
            {renderAccountFilter()}
            {renderKeywordInput()}
            {renderSubscribeFilter()}
            {renderTagFilter()}
            {renderBlacklistFilter()}
            {renderSearchButton()}
            {renderResetButton()}
            {renderSyncActions()}
          </>
        )}
        mobilePrimary={(
          <>
            {renderKeywordInput()}
            {renderSearchButton()}
          </>
        )}
        mobileFilters={(
          <>
            {renderAccountFilter()}
            {renderSubscribeFilter()}
            {renderTagFilter()}
            {renderBlacklistFilter()}
          </>
        )}
        mobileActions={renderSyncActions()}
        filterTitle="粉丝筛选"
        actionTitle="粉丝操作"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      {!accountsLoading && accounts.length === 0 && (
        <Banner type="warning" fullMode={false} description="尚未配置公众号，请先在「公众号账号」中添加公众号。" style={{ marginBottom: 12 }} />
      )}

      <ConfigurableTable bordered loading={loading} onRefresh={() => void fetchList()} refreshLoading={loading} columns={columns} dataSource={list} rowKey="id"
        pagination={buildPagination(total, fetchList)}
        scroll={{ x: 1320 }} />

      <AppModal title="编辑粉丝" visible={modalVisible}
        onOk={handleSubmit} onCancel={() => { setModalVisible(false); setEditingRecord(null); }}
        confirmLoading={submitting} width={520}>
        <Spin spinning={false} wrapperClassName="modal-spin-wrapper">
          <Form
            key={editingRecord?.id ?? 'none'}
            getFormApi={(api) => { (formRef as { current: FormApi }).current = api; }}
            labelPosition="left" labelWidth={72}
            initValues={editingRecord ? { remark: editingRecord.remark ?? '', tagIds: editingRecord.tagIds } : { remark: '', tagIds: [] }}
          >
            <Form.Input field="remark" label="备注" placeholder="请输入备注（最多128字）" maxLength={128} />
            <Form.Select field="tagIds" label="标签" multiple style={{ width: '100%' }}
              placeholder="为该粉丝选择标签" optionList={tags.map((t) => ({ label: t.name, value: t.id }))} />
          </Form>
        </Spin>
      </AppModal>
    </div>
  );
}
