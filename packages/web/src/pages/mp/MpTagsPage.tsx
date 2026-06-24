import { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Form, Input, Modal, Space, Spin, Toast, Banner } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import { Plus, RotateCcw, Search, RefreshCw } from 'lucide-react';
import type { PaginatedResponse, MpTag } from '@zenith/shared';
import { usePermission } from '@/hooks/usePermission';
import { request } from '@/utils/request';
import { SearchToolbar } from '@/components/SearchToolbar';
import { AppModal } from '@/components/AppModal';
import ConfigurableTable from '@/components/ConfigurableTable';
import { createdAtColumn, renderEllipsis } from '../../utils/table-columns';
import { usePagination } from '@/hooks/usePagination';
import { useMpAccounts } from './useMpAccounts';
import { MpAccountSwitcher } from './MpAccountSwitcher';

export default function MpTagsPage() {
  const { hasPermission: can } = usePermission();
  const { accounts, currentId, currentIdRef, setCurrentId, loading: accountsLoading } = useMpAccounts();

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<MpTag[]>([]);
  const [total, setTotal] = useState(0);
  const { page, pageSize, setPage, setPageSize, buildPagination } = usePagination();
  const [keyword, setKeyword] = useState('');
  const keywordRef = useRef('');
  keywordRef.current = keyword;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MpTag | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const formRef = useRef<FormApi>(null);

  const fetchList = useCallback(
    async (p = page, ps = pageSize, kw = keywordRef.current) => {
      if (!currentId) { setList([]); setTotal(0); return; }
      const reqId = currentId;
      setLoading(true);
      try {
        const query = new URLSearchParams({ page: String(p), pageSize: String(ps), accountId: String(currentId) });
        if (kw) query.set('keyword', kw);
        const res = await request.get<PaginatedResponse<MpTag>>(`/api/mp/tags?${query}`);
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
    setPage(1);
    void fetchList(1, pageSize, keywordRef.current);
  }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => { setPage(1); void fetchList(1, pageSize); };
  const handleReset = () => { setKeyword(''); setPage(1); void fetchList(1, pageSize, ''); };

  const handleSync = async () => {
    if (!currentId) return;
    setSyncing(true);
    try {
      const res = await request.post<{ created: number; updated: number; total: number }>('/api/mp/tags/sync', { accountId: currentId });
      if (res.code === 0) {
        Toast.success(`同步完成：新增 ${res.data?.created ?? 0}，更新 ${res.data?.updated ?? 0}`);
        void fetchList();
      }
    } finally {
      setSyncing(false);
    }
  };

  const openCreate = () => { setEditingRecord(null); setModalVisible(true); };
  const openEdit = (record: MpTag) => { setEditingRecord(record); setModalVisible(true); };

  const handleSubmit = async () => {
    let values: Awaited<ReturnType<FormApi['validate']>>;
    try { values = (await formRef.current?.validate())!; } catch { return; }
    if (!currentId) return;
    setSubmitting(true);
    try {
      if (editingRecord) {
        const res = await request.put(`/api/mp/tags/${editingRecord.id}`, { name: values.name });
        if (res.code !== 0) return;
        Toast.success('更新成功');
      } else {
        const res = await request.post('/api/mp/tags', { accountId: currentId, name: values.name });
        if (res.code !== 0) return;
        Toast.success('创建成功');
      }
      setModalVisible(false);
      void fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (record: MpTag) => {
    Modal.confirm({
      title: `确定要删除标签「${record.name}」吗？`,
      content: '删除后将从所有粉丝的本地标签中移除该标签。',
      okButtonProps: { type: 'danger', theme: 'solid' },
      onOk: async () => {
        const res = await request.delete(`/api/mp/tags/${record.id}`);
        if (res.code !== 0) return;
        Toast.success('删除成功');
        void fetchList();
      },
    });
  };

  const columns = [
    { title: '标签名称', dataIndex: 'name', width: 200, render: renderEllipsis },
    { title: '微信标签ID', dataIndex: 'wechatTagId', width: 140, render: (v: number | null) => (v == null ? '— 未同步' : v) },
    { title: '粉丝数', dataIndex: 'fansCount', width: 120 },
    createdAtColumn,
    {
      title: '操作', key: 'actions', width: 160, fixed: 'right' as const,
      render: (_: unknown, record: MpTag) => (
        <Space>
          {can('mp:tag:update') && (
            <Button theme="borderless" size="small" onClick={() => openEdit(record)}>编辑</Button>
          )}
          {can('mp:tag:delete') && (
            <Button theme="borderless" type="danger" size="small" onClick={() => handleDelete(record)}>删除</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <SearchToolbar>
        <MpAccountSwitcher accounts={accounts} value={currentId} onChange={setCurrentId} loading={accountsLoading} />
        <Input prefix={<Search size={14} />} placeholder="搜索标签名称"
          value={keyword} onChange={setKeyword} onEnterPress={handleSearch} showClear style={{ width: 180 }} />
        <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
        <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>
        {can('mp:tag:sync') && (
          <Button icon={<RefreshCw size={14} />} loading={syncing} disabled={!currentId} onClick={() => void handleSync()}>从微信同步</Button>
        )}
        {can('mp:tag:create') && (
          <Button type="primary" icon={<Plus size={14} />} disabled={!currentId} onClick={openCreate}>新增</Button>
        )}
      </SearchToolbar>

      {!accountsLoading && accounts.length === 0 && (
        <Banner type="warning" fullMode={false} description="尚未配置公众号，请先在「公众号账号」中添加公众号。" style={{ marginBottom: 12 }} />
      )}

      <ConfigurableTable bordered loading={loading} onRefresh={() => void fetchList()} refreshLoading={loading} columns={columns} dataSource={list} rowKey="id"
        pagination={buildPagination(total, fetchList)}
        scroll={{ x: 800 }} />

      <AppModal title={editingRecord ? '编辑标签' : '新增标签'} visible={modalVisible}
        onOk={handleSubmit} onCancel={() => { setModalVisible(false); setEditingRecord(null); }}
        confirmLoading={submitting} width={480}>
        <Spin spinning={false} wrapperClassName="modal-spin-wrapper">
          <Form
            key={editingRecord?.id ?? 'new'}
            getFormApi={(api) => { (formRef as { current: FormApi }).current = api; }}
            labelPosition="left" labelWidth={90}
            initValues={editingRecord ? { name: editingRecord.name } : { name: '' }}
          >
            <Form.Input field="name" label="标签名称" placeholder="请输入标签名称（最多30字）"
              maxLength={30} rules={[{ required: true, message: '请输入标签名称' }]} />
          </Form>
        </Spin>
      </AppModal>
    </div>
  );
}
