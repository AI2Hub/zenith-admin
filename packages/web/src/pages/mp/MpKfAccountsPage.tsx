import { useEffect, useState, useCallback, useRef } from 'react';
import { Avatar, Button, Form, Input, Modal, Space, Spin, Tag, Toast, Banner } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import { Plus, RotateCcw, Search, RefreshCw } from 'lucide-react';
import type { PaginatedResponse, MpKfAccount } from '@zenith/shared';
import { usePermission } from '@/hooks/usePermission';
import { request } from '@/utils/request';
import { SearchToolbar } from '@/components/SearchToolbar';
import { AppModal } from '@/components/AppModal';
import ConfigurableTable from '@/components/ConfigurableTable';
import { createdAtColumn, renderEllipsis } from '../../utils/table-columns';
import { usePagination } from '@/hooks/usePagination';
import { useMpAccounts } from './useMpAccounts';
import { MpAccountSwitcher } from './MpAccountSwitcher';

const INVITE_LABEL: Record<string, { label: string; color: 'green' | 'orange' | 'grey' }> = {
  none: { label: '未邀请', color: 'grey' },
  inviting: { label: '邀请中', color: 'orange' },
  waiting: { label: '待确认', color: 'orange' },
  bound: { label: '已绑定', color: 'green' },
};

export default function MpKfAccountsPage() {
  const { hasPermission: can } = usePermission();
  const { accounts, currentId, currentIdRef, setCurrentId, loading: accountsLoading } = useMpAccounts();

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<MpKfAccount[]>([]);
  const [total, setTotal] = useState(0);
  const { page, pageSize, setPage, setPageSize, buildPagination } = usePagination();
  const [keyword, setKeyword] = useState('');
  const keywordRef = useRef('');
  keywordRef.current = keyword;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MpKfAccount | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const formRef = useRef<FormApi>(null);

  const fetchList = useCallback(async (p = page, ps = pageSize, kw = keywordRef.current) => {
    if (!currentId) { setList([]); setTotal(0); return; }
    const reqId = currentId;
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(p), pageSize: String(ps), accountId: String(currentId) });
      if (kw) q.set('keyword', kw);
      const res = await request.get<PaginatedResponse<MpKfAccount>>(`/api/mp/kf-accounts?${q}`);
      if (currentIdRef.current !== reqId) return;
      setList(res.data?.list ?? []);
      setTotal(res.data?.total ?? 0);
      setPage(res.data?.page ?? p);
      setPageSize(res.data?.pageSize ?? ps);
    } finally {
      if (currentIdRef.current === reqId) setLoading(false);
    }
  }, [page, pageSize, currentId, currentIdRef, setPage, setPageSize]);

  useEffect(() => {
    setPage(1);
    void fetchList(1, pageSize, keywordRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const handleSearch = () => { setPage(1); void fetchList(1, pageSize); };
  const handleReset = () => { setKeyword(''); setPage(1); void fetchList(1, pageSize, ''); };

  const handleSync = async () => {
    if (!currentId) return;
    setSyncing(true);
    try {
      const res = await request.post(`/api/mp/kf-accounts/sync`, { accountId: currentId });
      if (res.code === 0) { Toast.success('同步完成'); void fetchList(); }
    } finally { setSyncing(false); }
  };

  const openCreate = () => { setEditingRecord(null); setModalVisible(true); };
  const openEdit = (record: MpKfAccount) => { setEditingRecord(record); setModalVisible(true); };

  const handleSubmit = async () => {
    let values: Awaited<ReturnType<FormApi['validate']>>;
    try { values = (await formRef.current?.validate())!; } catch { return; }
    if (!currentId) return;
    setSubmitting(true);
    try {
      if (editingRecord) {
        const res = await request.put(`/api/mp/kf-accounts/${editingRecord.id}`, { nickname: values.nickname });
        if (res.code !== 0) return;
        Toast.success('更新成功');
      } else {
        const res = await request.post('/api/mp/kf-accounts', { accountId: currentId, kfAccount: values.kfAccount, nickname: values.nickname });
        if (res.code !== 0) return;
        Toast.success('创建成功');
      }
      setModalVisible(false);
      void fetchList();
    } finally { setSubmitting(false); }
  };

  const handleDelete = (record: MpKfAccount) => {
    Modal.confirm({
      title: `确定删除客服「${record.nickname}」吗？`,
      content: '将同时删除微信侧客服账号。',
      okButtonProps: { type: 'danger', theme: 'solid' },
      onOk: async () => {
        const res = await request.delete(`/api/mp/kf-accounts/${record.id}`);
        if (res.code !== 0) return;
        Toast.success('删除成功');
        void fetchList();
      },
    });
  };

  const columns = [
    {
      title: '客服', dataIndex: 'nickname', width: 200,
      render: (_: unknown, r: MpKfAccount) => (
        <Space>
          <Avatar size="small" src={r.avatar ?? undefined} color="blue">{r.nickname.slice(0, 1)}</Avatar>
          <span>{r.nickname}</span>
        </Space>
      ),
    },
    { title: '客服账号', dataIndex: 'kfAccount', width: 220, render: renderEllipsis },
    { title: '绑定微信号', dataIndex: 'inviteWx', width: 140, render: (v: string | null) => v || '—' },
    {
      title: '绑定状态', dataIndex: 'inviteStatus', width: 100,
      render: (v: string) => { const m = INVITE_LABEL[v] ?? INVITE_LABEL.none; return <Tag color={m.color} type="light">{m.label}</Tag>; },
    },
    createdAtColumn,
    {
      title: '操作', key: 'actions', width: 140, fixed: 'right' as const,
      render: (_: unknown, record: MpKfAccount) => (
        <Space>
          {can('mp:kf:update') && <Button theme="borderless" size="small" onClick={() => openEdit(record)}>编辑</Button>}
          {can('mp:kf:delete') && <Button theme="borderless" type="danger" size="small" onClick={() => handleDelete(record)}>删除</Button>}
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
      placeholder="搜索客服昵称"
      value={keyword}
      onChange={setKeyword}
      onEnterPress={handleSearch}
      showClear
      style={{ width: 180 }}
    />
  );
  const renderSearchButton = () => <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>;
  const renderResetButton = () => <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>;
  const renderCreateButton = () => can('mp:kf:create') ? (
    <Button type="primary" icon={<Plus size={14} />} disabled={!currentId} onClick={openCreate}>添加客服</Button>
  ) : null;
  const renderSyncButton = () => can('mp:kf:sync') ? (
    <Button icon={<RefreshCw size={14} />} loading={syncing} disabled={!currentId} onClick={() => void handleSync()}>从微信同步</Button>
  ) : null;

  return (
    <div className="page-container">
      <SearchToolbar
        primary={(
          <>
            {renderAccountFilter()}
            {renderKeywordInput()}
            {renderSearchButton()}
            {renderResetButton()}
            {renderSyncButton()}
            {renderCreateButton()}
          </>
        )}
        mobilePrimary={(
          <>
            {renderKeywordInput()}
            {renderSearchButton()}
            {renderCreateButton()}
          </>
        )}
        mobileFilters={renderAccountFilter()}
        mobileActions={renderSyncButton()}
        filterTitle="多客服筛选"
        actionTitle="多客服操作"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      {!accountsLoading && accounts.length === 0 && (
        <Banner type="warning" fullMode={false} description="尚未配置公众号，请先在「公众号账号」中添加公众号。" style={{ marginBottom: 12 }} />
      )}

      <ConfigurableTable bordered loading={loading} onRefresh={() => void fetchList()} refreshLoading={loading} columns={columns} dataSource={list} rowKey="id"
        pagination={buildPagination(total, fetchList)} scroll={{ x: 1000 }} />

      <AppModal title={editingRecord ? '编辑客服' : '添加客服'} visible={modalVisible}
        onOk={handleSubmit} onCancel={() => { setModalVisible(false); setEditingRecord(null); }}
        confirmLoading={submitting} width={520}>
        <Spin spinning={false} wrapperClassName="modal-spin-wrapper">
          <Form
            key={editingRecord?.id ?? 'new'}
            getFormApi={(api) => { (formRef as { current: FormApi }).current = api; }}
            labelPosition="left" labelWidth={90}
            initValues={editingRecord ? { kfAccount: editingRecord.kfAccount, nickname: editingRecord.nickname } : { kfAccount: '', nickname: '' }}
          >
            <Form.Input field="kfAccount" label="客服账号" disabled={!!editingRecord}
              placeholder="形如 kf2001@公众号微信号" rules={[{ required: true, message: '请输入客服账号' }]} />
            <Form.Input field="nickname" label="客服昵称" placeholder="请输入客服昵称" rules={[{ required: true, message: '请输入客服昵称' }]} />
          </Form>
        </Spin>
      </AppModal>
    </div>
  );
}
