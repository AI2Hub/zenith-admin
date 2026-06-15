import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Form, Input, Select, Space, Spin, Toast, Popconfirm, Switch, Tag, Row, Col } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import { Search, RotateCcw, Plus } from 'lucide-react';
import ConfigurableTable from '@/components/ConfigurableTable';
import { SearchToolbar } from '@/components/SearchToolbar';
import { AppModal } from '@/components/AppModal';
import { request } from '@/utils/request';
import { formatDateTime } from '@/utils/date';
import { usePermission } from '@/hooks/usePermission';
import { usePagination } from '@/hooks/usePagination';
import { PAYMENT_CHANNEL_LABELS } from '@zenith/shared';
import type { PaymentChannel, PaymentChannelConfig, PaginatedResponse } from '@zenith/shared';

interface SearchParams {
  keyword: string;
  channel: string;
  status: string;
}
const defaultSearch: SearchParams = { keyword: '', channel: '', status: '' };

export default function PaymentChannelsPage() {
  const { hasPermission } = usePermission();
  const formApi = useRef<FormApi | null>(null);

  const [data, setData] = useState<PaginatedResponse<PaymentChannelConfig> | null>(null);
  const [loading, setLoading] = useState(false);
  const { page, pageSize, setPage, setPageSize, buildPagination } = usePagination();
  const [searchParams, setSearchParams] = useState<SearchParams>(defaultSearch);
  const searchRef = useRef<SearchParams>(defaultSearch);
  searchRef.current = searchParams;

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<PaymentChannelConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formChannel, setFormChannel] = useState<PaymentChannel>('wechat');
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

  const fetchList = useCallback(
    async (p = page, ps = pageSize, params?: SearchParams) => {
      const active = params ?? searchRef.current;
      setLoading(true);
      try {
        const query: Record<string, string> = { page: String(p), pageSize: String(ps) };
        if (active.keyword) query.keyword = active.keyword;
        if (active.channel) query.channel = active.channel;
        if (active.status) query.status = active.status;
        const res = await request.get<PaginatedResponse<PaymentChannelConfig>>(`/api/payment/channels?${new URLSearchParams(query)}`);
        if (res.code === 0) {
          setData(res.data);
          setPage(res.data.page);
          setPageSize(res.data.pageSize);
        }
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, pageSize],
  );

  useEffect(() => {
    void fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch() {
    setPage(1);
    void fetchList(1, pageSize);
  }
  function handleReset() {
    setSearchParams(defaultSearch);
    setPage(1);
    void fetchList(1, pageSize, defaultSearch);
  }

  function openCreate() {
    setEditing(null);
    setFormChannel('wechat');
    setModalVisible(true);
  }
  async function openEdit(record: PaymentChannelConfig) {
    setEditing(record);
    setFormChannel(record.channel);
    setModalVisible(true);
    setDetailLoading(true);
    const res = await request.get<PaymentChannelConfig>(`/api/payment/channels/${record.id}`);
    setDetailLoading(false);
    if (res.code === 0 && res.data) setEditing(res.data);
  }
  function closeModal() {
    setModalVisible(false);
    setEditing(null);
    setDetailLoading(false);
  }

  const formInit = editing
    ? {
        name: editing.name,
        channel: editing.channel,
        status: editing.status,
        isDefault: editing.isDefault,
        sandbox: editing.sandbox,
        notifyUrl: editing.notifyUrl ?? '',
        remark: editing.remark ?? '',
        wechatAppId: editing.wechatAppId ?? '',
        wechatMchId: editing.wechatMchId ?? '',
        wechatSerialNo: editing.wechatSerialNo ?? '',
        wechatPlatformCert: editing.wechatPlatformCert ?? '',
        alipayAppId: editing.alipayAppId ?? '',
        alipayPublicKey: editing.alipayPublicKey ?? '',
        alipaySignType: editing.alipaySignType ?? 'RSA2',
        alipayGateway: editing.alipayGateway ?? '',
      }
    : { channel: 'wechat', status: 'enabled', isDefault: false, sandbox: false, alipaySignType: 'RSA2' };

  const secretPlaceholder = (has?: boolean) => (editing && has ? '已配置，留空则不修改' : '请输入');

  async function handleOk() {
    let values: Record<string, unknown>;
    try {
      values = (await formApi.current?.validate()) as Record<string, unknown>;
    } catch {
      throw new Error('validation');
    }
    setSubmitting(true);
    try {
      const res = editing
        ? await request.put(`/api/payment/channels/${editing.id}`, values)
        : await request.post('/api/payment/channels', values);
      if (res.code === 0) {
        Toast.success(editing ? '更新成功' : '创建成功');
        closeModal();
        void fetchList();
      } else {
        throw new Error(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    const res = await request.delete(`/api/payment/channels/${id}`);
    if (res.code === 0) {
      Toast.success('删除成功');
      void fetchList();
    }
  }

  function handleToggle(record: PaymentChannelConfig, checked: boolean) {
    setTogglingIds((prev) => new Set(prev).add(record.id));
    request
      .put(`/api/payment/channels/${record.id}`, { status: checked ? 'enabled' : 'disabled' })
      .then((res) => {
        if (res.code === 0) {
          Toast.success(checked ? '已启用' : '已停用');
          void fetchList();
        }
      })
      .finally(() => setTogglingIds((prev) => { const s = new Set(prev); s.delete(record.id); return s; }));
  }

  const columns: ColumnProps<PaymentChannelConfig>[] = [
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '渠道', dataIndex: 'channel', width: 110, render: (v: PaymentChannel) => <Tag color={v === 'wechat' ? 'green' : 'blue'}>{PAYMENT_CHANNEL_LABELS[v]}</Tag> },
    { title: '默认', dataIndex: 'isDefault', width: 80, render: (v: boolean) => (v ? <Tag color="amber">默认</Tag> : '-') },
    { title: '沙箱', dataIndex: 'sandbox', width: 80, render: (v: boolean) => (v ? <Tag color="grey">沙箱</Tag> : '-') },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (t: string) => formatDateTime(t) },
    {
      title: '状态', dataIndex: 'status', width: 80, fixed: 'right',
      render: (_: unknown, r: PaymentChannelConfig) => (
        <Switch checked={r.status === 'enabled'} loading={togglingIds.has(r.id)} disabled={!hasPermission('payment:channel:update')} size="small" onChange={(c) => handleToggle(r, c)} />
      ),
    },
    {
      title: '操作', fixed: 'right', width: 140,
      render: (_: unknown, r: PaymentChannelConfig) => (
        <Space>
          {hasPermission('payment:channel:update') && <Button theme="borderless" size="small" onClick={() => openEdit(r)}>编辑</Button>}
          {hasPermission('payment:channel:delete') && (
            <Popconfirm title="确定要删除吗？" content="删除后不可恢复" onConfirm={() => handleDelete(r.id)}>
              <Button theme="borderless" type="danger" size="small">删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <SearchToolbar>
        <Input prefix={<Search size={14} />} placeholder="搜索名称..." value={searchParams.keyword} onChange={(v) => setSearchParams((p) => ({ ...p, keyword: v }))} showClear style={{ width: 200 }} onEnterPress={handleSearch} />
        <Select placeholder="全部渠道" value={searchParams.channel || undefined} onChange={(v) => setSearchParams((p) => ({ ...p, channel: (v as string) ?? '' }))} showClear style={{ width: 130 }}
          optionList={[{ value: 'wechat', label: '微信支付' }, { value: 'alipay', label: '支付宝' }]} />
        <Select placeholder="全部状态" value={searchParams.status || undefined} onChange={(v) => setSearchParams((p) => ({ ...p, status: (v as string) ?? '' }))} showClear style={{ width: 120 }}
          optionList={[{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]} />
        <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
        <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>
        {hasPermission('payment:channel:create') && <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>新增</Button>}
      </SearchToolbar>

      <ConfigurableTable
        bordered
        columns={columns}
        dataSource={data?.list ?? []}
        loading={loading}
        rowKey="id"
        size="small"
        empty="暂无数据"
        onRefresh={() => void fetchList()}
        refreshLoading={loading}
        pagination={buildPagination(data?.total ?? 0, fetchList)}
      />

      <AppModal title={editing ? '编辑支付渠道' : '新增支付渠道'} visible={modalVisible} onOk={handleOk} onCancel={closeModal} okButtonProps={{ loading: submitting, disabled: detailLoading }} width={660} closeOnEsc>
        <Spin spinning={detailLoading} wrapperClassName="modal-spin-wrapper">
          <Form key={editing?.id ?? 'new'} getFormApi={(api) => { formApi.current = api; }} allowEmpty initValues={formInit} labelPosition="left" labelWidth={96}
            onValueChange={(v) => { if (v.channel) setFormChannel(v.channel as PaymentChannel); }}>
            <Row gutter={16}>
              <Col span={12}><Form.Input field="name" label="名称" placeholder="如：微信主商户" rules={[{ required: true, message: '名称不能为空' }]} /></Col>
              <Col span={12}><Form.Select field="channel" label="渠道" style={{ width: '100%' }} disabled={!!editing} optionList={[{ value: 'wechat', label: '微信支付' }, { value: 'alipay', label: '支付宝' }]} rules={[{ required: true }]} /></Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}><Form.Select field="status" label="状态" style={{ width: '100%' }} optionList={[{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]} /></Col>
              <Col span={12}><Form.Switch field="isDefault" label="设为默认" /></Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}><Form.Switch field="sandbox" label="沙箱模式" /></Col>
            </Row>
            <Form.Input field="notifyUrl" label="回调基址" placeholder="如 https://your-host.com（留空用环境变量）" />

            {formChannel === 'wechat' && (
              <>
                <Row gutter={16}>
                  <Col span={12}><Form.Input field="wechatAppId" label="AppID" placeholder="公众号/小程序/APP AppID" /></Col>
                  <Col span={12}><Form.Input field="wechatMchId" label="商户号" placeholder="mchid" /></Col>
                </Row>
                <Form.Input field="wechatSerialNo" label="证书序列号" placeholder="商户 API 证书序列号" />
                <Form.Input field="wechatApiV3Key" label="APIv3 Key" mode="password" placeholder={secretPlaceholder(editing?.hasWechatApiV3Key)} />
                <Form.TextArea field="wechatPrivateKey" label="商户私钥" autosize rows={3} placeholder={secretPlaceholder(editing?.hasWechatPrivateKey)} />
                <Form.TextArea field="wechatPlatformCert" label="平台证书" autosize rows={3} placeholder="微信支付平台证书（PEM，验签用）" />
              </>
            )}

            {formChannel === 'alipay' && (
              <>
                <Row gutter={16}>
                  <Col span={12}><Form.Input field="alipayAppId" label="AppID" placeholder="支付宝应用 AppID" /></Col>
                  <Col span={12}><Form.Select field="alipaySignType" label="签名算法" style={{ width: '100%' }} optionList={[{ value: 'RSA2', label: 'RSA2' }, { value: 'RSA', label: 'RSA' }]} /></Col>
                </Row>
                <Form.TextArea field="alipayPrivateKey" label="应用私钥" autosize rows={3} placeholder={secretPlaceholder(editing?.hasAlipayPrivateKey)} />
                <Form.TextArea field="alipayPublicKey" label="支付宝公钥" autosize rows={3} placeholder="支付宝公钥（PEM，验签用）" />
                <Form.Input field="alipayGateway" label="网关地址" placeholder="留空则按沙箱开关自动选择" />
              </>
            )}

            <Form.TextArea field="remark" label="备注" autosize rows={1} placeholder="可选" />
          </Form>
        </Spin>
      </AppModal>
    </div>
  );
}
