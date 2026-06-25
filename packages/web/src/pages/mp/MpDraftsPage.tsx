import { useEffect, useState, useCallback, useRef } from 'react';
import { Button, Input, Modal, Space, Spin, Tag, Toast, Banner, Typography, TextArea } from '@douyinfe/semi-ui';
import { Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import type { PaginatedResponse, MpDraft, MpArticle } from '@zenith/shared';
import { usePermission } from '@/hooks/usePermission';
import { request } from '@/utils/request';
import { SearchToolbar } from '@/components/SearchToolbar';
import { AppModal } from '@/components/AppModal';
import ConfigurableTable from '@/components/ConfigurableTable';
import { createdAtColumn, renderEllipsis } from '../../utils/table-columns';
import { usePagination } from '@/hooks/usePagination';
import { useMpAccounts } from './useMpAccounts';
import { MpAccountSwitcher } from './MpAccountSwitcher';

const blankArticle = (): MpArticle => ({ title: '', author: '', digest: '', content: '', thumbUrl: '', showCoverPic: true });

export default function MpDraftsPage() {
  const { hasPermission: can } = usePermission();
  const { accounts, currentId, currentIdRef, setCurrentId, loading: accountsLoading } = useMpAccounts();

  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<MpDraft[]>([]);
  const [total, setTotal] = useState(0);
  const { page, pageSize, setPage, setPageSize, buildPagination } = usePagination();
  const [keyword, setKeyword] = useState('');
  const keywordRef = useRef('');
  keywordRef.current = keyword;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [articles, setArticles] = useState<MpArticle[]>([blankArticle()]);
  const [submitting, setSubmitting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const editDetailIdRef = useRef<number | null>(null);
  const [pushingId, setPushingId] = useState<number | null>(null);

  const fetchList = useCallback(async (p = page, ps = pageSize, kw = keywordRef.current) => {
    if (!currentId) { setList([]); setTotal(0); return; }
    const reqId = currentId;
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(p), pageSize: String(ps), accountId: String(currentId) });
      if (kw) q.set('keyword', kw);
      const res = await request.get<PaginatedResponse<MpDraft>>(`/api/mp/drafts?${q}`);
      if (currentIdRef.current !== reqId) return; // 账号已切换，丢弃过期响应
      setList(res.data?.list ?? []);
      setTotal(res.data?.total ?? 0);
      setPage(res.data?.page ?? p);
      setPageSize(res.data?.pageSize ?? ps);
    } finally { setLoading(false); }
  }, [page, pageSize, currentId, currentIdRef, setPage, setPageSize]);

  useEffect(() => { setPage(1); void fetchList(1, pageSize, keywordRef.current); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [currentId]);

  const handleSearch = () => { setPage(1); void fetchList(1, pageSize); };
  const handleReset = () => { setKeyword(''); setPage(1); void fetchList(1, pageSize, ''); };

  const openCreate = () => { setEditingId(null); setArticles([blankArticle()]); setModalVisible(true); };
  const openEdit = async (record: MpDraft) => {
    setEditingId(record.id); setArticles([blankArticle()]); setModalVisible(true); setDetailLoading(true);
    editDetailIdRef.current = record.id;
    const res = await request.get<MpDraft>(`/api/mp/drafts/${record.id}`);
    if (editDetailIdRef.current !== record.id) return; // 已打开其它草稿，丢弃过期详情
    setDetailLoading(false);
    if (res.code === 0 && res.data) setArticles(res.data.articles.length ? res.data.articles : [blankArticle()]);
  };

  const updateArticle = (i: number, patch: Partial<MpArticle>) => setArticles((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const addArticle = () => setArticles((prev) => [...prev, blankArticle()]);
  const removeArticle = (i: number) => setArticles((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!currentId) return;
    for (const a of articles) {
      if (!a.title.trim()) { Toast.error('每篇图文都需要标题'); return; }
      if (!a.content.trim()) { Toast.error('每篇图文都需要正文'); return; }
    }
    setSubmitting(true);
    try {
      if (editingId) {
        const res = await request.put(`/api/mp/drafts/${editingId}`, { articles });
        if (res.code !== 0) return;
        Toast.success('更新成功');
      } else {
        const res = await request.post('/api/mp/drafts', { accountId: currentId, articles });
        if (res.code !== 0) return;
        Toast.success('创建成功');
      }
      setModalVisible(false);
      void fetchList();
    } finally { setSubmitting(false); }
  };

  const handlePush = async (record: MpDraft) => {
    setPushingId(record.id);
    try {
      const res = await request.post(`/api/mp/drafts/${record.id}/push`);
      if (res.code === 0) { Toast.success('已推送到微信草稿箱'); void fetchList(); }
    } finally { setPushingId(null); }
  };

  const handleDelete = (record: MpDraft) => {
    Modal.confirm({
      title: `确定删除图文「${record.title}」吗？`,
      okButtonProps: { type: 'danger', theme: 'solid' },
      onOk: async () => {
        const res = await request.delete(`/api/mp/drafts/${record.id}`);
        if (res.code !== 0) return;
        Toast.success('删除成功');
        void fetchList();
      },
    });
  };

  const columns = [
    { title: '标题', dataIndex: 'title', width: 220, render: renderEllipsis },
    { title: '文章数', dataIndex: 'articles', width: 90, render: (v: MpArticle[]) => `${v?.length ?? 0} 篇` },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v: string) => (v === 'published' ? <Tag color="green" type="light">已推送</Tag> : <Tag color="grey" type="light">草稿</Tag>),
    },
    { title: '微信 MediaID', dataIndex: 'wechatMediaId', width: 200, render: (v: string | null) => v || '—' },
    createdAtColumn,
    {
      title: '操作', key: 'actions', width: 200, fixed: 'right' as const,
      render: (_: unknown, record: MpDraft) => (
        <Space>
          {can('mp:draft:update') && <Button theme="borderless" size="small" onClick={() => void openEdit(record)}>编辑</Button>}
          {can('mp:draft:push') && <Button theme="borderless" size="small" loading={pushingId === record.id} onClick={() => void handlePush(record)}>推送</Button>}
          {can('mp:draft:delete') && <Button theme="borderless" type="danger" size="small" onClick={() => handleDelete(record)}>删除</Button>}
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
      placeholder="搜索标题"
      value={keyword}
      onChange={setKeyword}
      onEnterPress={handleSearch}
      showClear
      style={{ width: 180 }}
    />
  );
  const renderSearchButton = () => <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>;
  const renderResetButton = () => <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>;
  const renderCreateButton = () => can('mp:draft:create') ? (
    <Button type="primary" icon={<Plus size={14} />} disabled={!currentId} onClick={openCreate}>新增图文</Button>
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
        filterTitle="图文草稿筛选"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      {!accountsLoading && accounts.length === 0 && (
        <Banner type="warning" fullMode={false} description="尚未配置公众号，请先在「公众号账号」中添加公众号。" style={{ marginBottom: 12 }} />
      )}

      <ConfigurableTable bordered loading={loading} onRefresh={() => void fetchList()} refreshLoading={loading} columns={columns} dataSource={list} rowKey="id"
        pagination={buildPagination(total, fetchList)} scroll={{ x: 1000 }} />

      <AppModal title={editingId ? '编辑图文' : '新增图文'} visible={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} confirmLoading={submitting}
        okButtonProps={{ disabled: detailLoading }} width={760}>
        <Spin spinning={detailLoading} wrapperClassName="modal-spin-wrapper">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '60vh', overflow: 'auto' }}>
            {articles.map((a, i) => (
              <div key={i} style={{ border: '1px solid var(--semi-color-border)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Typography.Text strong>第 {i + 1} 篇</Typography.Text>
                  {articles.length > 1 && <Button theme="borderless" type="danger" size="small" icon={<Trash2 size={13} />} onClick={() => removeArticle(i)}>移除</Button>}
                </div>
                <Space vertical align="start" style={{ width: '100%' }}>
                  <Input prefix="标题" value={a.title} onChange={(v) => updateArticle(i, { title: v })} placeholder="文章标题" />
                  <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                    <Input prefix="作者" value={a.author ?? ''} onChange={(v) => updateArticle(i, { author: v })} placeholder="作者" style={{ flex: 1 }} />
                    <Input prefix="封面" value={a.thumbUrl ?? ''} onChange={(v) => updateArticle(i, { thumbUrl: v })} placeholder="封面图 URL" style={{ flex: 2 }} />
                  </div>
                  <Input prefix="摘要" value={a.digest ?? ''} onChange={(v) => updateArticle(i, { digest: v })} placeholder="摘要（选填）" />
                  <TextArea value={a.content} onChange={(v) => updateArticle(i, { content: v })} rows={4} placeholder="正文内容（支持 HTML）" />
                </Space>
              </div>
            ))}
            <Button theme="light" icon={<Plus size={14} />} onClick={addArticle} style={{ alignSelf: 'flex-start' }}>添加一篇</Button>
          </div>
        </Spin>
      </AppModal>
    </div>
  );
}
