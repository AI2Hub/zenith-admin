import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Switch,
  Tag,
  Toast,
} from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Plus, RotateCcw, Search } from 'lucide-react';
import type { PaginatedResponse, Role, Tenant, TenantIdentityProvider } from '@zenith/shared';
import { request } from '@/utils/request';
import { SearchToolbar } from '@/components/SearchToolbar';
import ConfigurableTable from '@/components/ConfigurableTable';
import { AppModal } from '@/components/AppModal';
import { usePagination } from '@/hooks/usePagination';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { createdAtColumn, renderEllipsis } from '@/utils/table-columns';

interface SearchParams {
  keyword: string;
  type: string;
  status: string;
  tenantId: string;
}

const defaultSearchParams: SearchParams = {
  keyword: '',
  type: '',
  status: '',
  tenantId: '',
};

const providerTypeOptions = [
  { value: 'oidc', label: 'OIDC' },
  { value: 'saml', label: 'SAML' },
];

const statusOptions = [
  { value: 'enabled', label: '启用' },
  { value: 'disabled', label: '停用' },
];

const defaultMapping = {
  subject: 'sub',
  email: 'email',
  username: 'preferred_username',
  nickname: 'name',
};

export default function IdentityProvidersPage() {
  const formApi = useRef<FormApi | null>(null);
  const [data, setData] = useState<TenantIdentityProvider[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<TenantIdentityProvider | null>(null);
  const [providerType, setProviderType] = useState<'oidc' | 'saml'>('oidc');
  const [searchParams, setSearchParams] = useState<SearchParams>(defaultSearchParams);
  const searchParamsRef = useRef<SearchParams>(defaultSearchParams);
  searchParamsRef.current = searchParams;
  const { page, pageSize, setPage, buildPagination } = usePagination();
  const [tenantOptions, setTenantOptions] = useState<{ value: number; label: string }[]>([]);
  const [roleOptions, setRoleOptions] = useState<{ value: number; label: string }[]>([]);

  const fetchData = useCallback(async (p = page, ps = pageSize, params?: SearchParams) => {
    const activeParams = params ?? searchParamsRef.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: String(p),
        pageSize: String(ps),
        ...(activeParams.keyword ? { keyword: activeParams.keyword } : {}),
        ...(activeParams.type ? { type: activeParams.type } : {}),
        ...(activeParams.status ? { status: activeParams.status } : {}),
        ...(activeParams.tenantId ? { tenantId: activeParams.tenantId } : {}),
      }).toString();
      const res = await request.get<PaginatedResponse<TenantIdentityProvider>>(`/api/identity-providers?${query}`);
      if (res.code === 0) {
        setData(res.data.list);
        setTotal(res.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    void Promise.all([
      request.get<Tenant[]>('/api/tenants/all', { silent: true }),
      request.get<Role[]>('/api/roles/all', { silent: true }),
    ]).then(([tenantRes, roleRes]) => {
      if (tenantRes.code === 0) {
        setTenantOptions(tenantRes.data.map((item) => ({ value: item.id, label: `${item.name}（${item.code}）` })));
      }
      if (roleRes.code === 0) {
        setRoleOptions(roleRes.data.map((item) => ({ value: item.id, label: item.name })));
      }
    });
  }, []);

  function handleSearch() {
    setPage(1);
    void fetchData(1, pageSize);
  }

  function handleReset() {
    setSearchParams(defaultSearchParams);
    setPage(1);
    void fetchData(1, pageSize, defaultSearchParams);
  }

  function openCreate() {
    setEditing(null);
    setProviderType('oidc');
    setModalVisible(true);
  }

  async function openEdit(row: TenantIdentityProvider) {
    const res = await request.get<TenantIdentityProvider>(`/api/identity-providers/${row.id}`);
    if (res.code === 0) {
      setEditing(res.data);
      setProviderType(res.data.type);
      setModalVisible(true);
    }
  }

  async function handleModalOk() {
    let values: Record<string, unknown>;
    try {
      values = await formApi.current!.validate();
    } catch {
      throw new Error('validation');
    }
    const payload = {
      ...values,
      tenantId: values.tenantId ?? null,
      type: providerType,
      attributeMapping: {
        subject: values['attributeMapping.subject'] || defaultMapping.subject,
        email: values['attributeMapping.email'] || defaultMapping.email,
        username: values['attributeMapping.username'] || defaultMapping.username,
        nickname: values['attributeMapping.nickname'] || defaultMapping.nickname,
      },
      defaultRoleIds: Array.isArray(values.defaultRoleIds) ? values.defaultRoleIds : [],
    };
    const res = editing
      ? await request.put<TenantIdentityProvider>(`/api/identity-providers/${editing.id}`, payload)
      : await request.post<TenantIdentityProvider>('/api/identity-providers', payload);
    if (res.code === 0) {
      Toast.success(editing ? '更新成功' : '创建成功');
      setModalVisible(false);
      void fetchData();
    } else {
      throw new Error(res.message);
    }
  }

  function handleToggleStatus(row: TenantIdentityProvider, checked: boolean) {
    void request.put<TenantIdentityProvider>(`/api/identity-providers/${row.id}`, { status: checked ? 'enabled' : 'disabled' }).then((res) => {
      if (res.code === 0) {
        Toast.success(checked ? '已启用' : '已停用');
        void fetchData();
      }
    });
  }

  function handleDelete(row: TenantIdentityProvider) {
    Modal.confirm({
      title: `确认删除身份源「${row.name}」？`,
      content: '删除后，已绑定的企业身份账号关系也会被移除。',
      okButtonProps: { type: 'danger', theme: 'solid' },
      onOk: async () => {
        const res = await request.delete(`/api/identity-providers/${row.id}`);
        if (res.code === 0) {
          Toast.success('删除成功');
          void fetchData();
        }
      },
    });
  }

  const columns: ColumnProps<TenantIdentityProvider>[] = [
    { title: '名称', dataIndex: 'name', width: 180, render: renderEllipsis },
    { title: '编码', dataIndex: 'code', width: 130, render: renderEllipsis },
    { title: '租户', dataIndex: 'tenantName', width: 160, render: (value) => renderEllipsis(value || '平台') },
    {
      title: '类型',
      dataIndex: 'type',
      width: 90,
      render: (value: string) => <Tag color={value === 'oidc' ? 'blue' : 'violet'}>{value.toUpperCase()}</Tag>,
    },
    { title: 'Issuer / Entity ID', dataIndex: 'issuer', width: 260, render: (_value, row) => renderEllipsis(row.type === 'oidc' ? row.issuer : row.samlEntityId) },
    createdAtColumn,
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      fixed: 'right',
      render: (value: string, row) => (
        <Switch
          size="small"
          checked={value === 'enabled'}
          onChange={(checked: boolean) => handleToggleStatus(row, checked)}
        />
      ),
    },
    createOperationColumn<TenantIdentityProvider>({
      width: 140,
      desktopInlineKeys: ['edit', 'delete'],
      actions: (row) => [
        { key: 'edit', label: '编辑', onClick: () => { void openEdit(row); } },
        { key: 'delete', label: '删除', danger: true, onClick: () => handleDelete(row) },
      ],
    }),
  ];

  const renderKeywordSearch = () => (
    <Input
      prefix={<Search size={14} />}
      placeholder="搜索名称/编码"
      value={searchParams.keyword}
      onChange={(value) => setSearchParams((prev) => ({ ...prev, keyword: value }))}
      onEnterPress={handleSearch}
      style={{ width: 220, maxWidth: '100%' }}
      showClear
    />
  );

  const renderTypeFilter = () => (
    <Select
      placeholder="类型"
      value={searchParams.type || undefined}
      onChange={(value) => setSearchParams((prev) => ({ ...prev, type: (value as string) ?? '' }))}
      style={{ width: 130, maxWidth: '100%' }}
      optionList={[{ value: '', label: '全部类型' }, ...providerTypeOptions]}
    />
  );

  const renderStatusFilter = () => (
    <Select
      placeholder="状态"
      value={searchParams.status || undefined}
      onChange={(value) => setSearchParams((prev) => ({ ...prev, status: (value as string) ?? '' }))}
      style={{ width: 130, maxWidth: '100%' }}
      optionList={[{ value: '', label: '全部状态' }, ...statusOptions]}
    />
  );

  const initValues = editing ? {
    ...editing,
    tenantId: editing.tenantId ?? undefined,
    defaultRoleIds: editing.defaultRoleIds ?? [],
    'attributeMapping.subject': editing.attributeMapping?.subject || defaultMapping.subject,
    'attributeMapping.email': editing.attributeMapping?.email || defaultMapping.email,
    'attributeMapping.username': editing.attributeMapping?.username || defaultMapping.username,
    'attributeMapping.nickname': editing.attributeMapping?.nickname || defaultMapping.nickname,
  } : {
    type: 'oidc',
    status: 'disabled',
    scopes: 'openid profile email',
    jitEnabled: false,
    defaultRoleIds: [],
    ...Object.fromEntries(Object.entries(defaultMapping).map(([key, value]) => [`attributeMapping.${key}`, value])),
  };

  return (
    <div className="page-container">
      <SearchToolbar
        primary={(
          <>
            {renderKeywordSearch()}
            {renderTypeFilter()}
            {renderStatusFilter()}
            <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
            <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>
            <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>新增</Button>
          </>
        )}
        mobilePrimary={(
          <>
            {renderKeywordSearch()}
            <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
            <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>新增</Button>
          </>
        )}
        mobileFilters={<>{renderTypeFilter()}{renderStatusFilter()}</>}
        filterTitle="身份源筛选"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      <ConfigurableTable
        bordered
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        onRefresh={fetchData}
        refreshLoading={loading}
        pagination={buildPagination(total, fetchData)}
      />

      <AppModal
        title={editing ? '编辑企业身份源' : '新增企业身份源'}
        visible={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditing(null);
        }}
        onOk={handleModalOk}
        closeOnEsc
        width={760}
      >
        <Form
          getFormApi={(api) => { formApi.current = api; }}
          allowEmpty
          initValues={initValues}
          labelPosition="left"
          labelWidth={110}
        >
          <Row gutter={16}>
            <Col span={12}><Form.Input field="name" label="名称" placeholder="Azure AD / Okta" rules={[{ required: true, message: '请输入名称' }]} /></Col>
            <Col span={12}><Form.Input field="code" label="编码" placeholder="azure_ad" rules={[{ required: true, message: '请输入编码' }]} /></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Select
                field="tenantId"
                label="租户"
                placeholder="平台级身份源"
                optionList={tenantOptions}
                showClear
                style={{ width: '100%' }}
              />
            </Col>
            <Col span={12}>
              <Form.Select
                field="type"
                label="类型"
                optionList={providerTypeOptions}
                style={{ width: '100%' }}
                onChange={(value) => setProviderType(value as 'oidc' | 'saml')}
              />
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Select field="status" label="状态" optionList={statusOptions} style={{ width: '100%' }} /></Col>
            <Col span={12}><Form.Switch field="jitEnabled" label="JIT 创建" /></Col>
          </Row>

          {providerType === 'oidc' ? (
            <>
              <Form.Input field="issuer" label="Issuer" placeholder="https://login.example.com" />
              <Form.Input field="authorizationEndpoint" label="授权端点" placeholder="https://.../authorize" rules={[{ required: providerType === 'oidc', message: '请输入授权端点' }]} />
              <Form.Input field="tokenEndpoint" label="Token 端点" placeholder="https://.../token" rules={[{ required: providerType === 'oidc', message: '请输入 Token 端点' }]} />
              <Form.Input field="userinfoEndpoint" label="UserInfo 端点" placeholder="https://.../userinfo" rules={[{ required: providerType === 'oidc', message: '请输入 UserInfo 端点' }]} />
              <Form.Input field="jwksUri" label="JWKS URI" placeholder="https://.../jwks" />
              <Row gutter={16}>
                <Col span={12}><Form.Input field="clientId" label="Client ID" /></Col>
                <Col span={12}><Form.Input field="clientSecret" label="Client Secret" type="password" /></Col>
              </Row>
              <Form.Input field="scopes" label="Scopes" placeholder="openid profile email" />
            </>
          ) : (
            <>
              <Form.Input field="samlSsoUrl" label="SSO URL" placeholder="https://idp.example.com/sso" rules={[{ required: providerType === 'saml', message: '请输入 SSO URL' }]} />
              <Form.Input field="samlEntityId" label="Entity ID" placeholder="https://idp.example.com/metadata" />
              <Form.TextArea field="samlCertificate" label="证书" placeholder="-----BEGIN CERTIFICATE-----" rows={4} />
            </>
          )}

          <Row gutter={16}>
            <Col span={12}><Form.Input field="attributeMapping.subject" label="主体字段" placeholder="sub / NameID" /></Col>
            <Col span={12}><Form.Input field="attributeMapping.email" label="邮箱字段" placeholder="email" /></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Input field="attributeMapping.username" label="用户名字段" placeholder="preferred_username" /></Col>
            <Col span={12}><Form.Input field="attributeMapping.nickname" label="昵称字段" placeholder="name" /></Col>
          </Row>
          <Form.Select
            field="defaultRoleIds"
            label="默认角色"
            multiple
            optionList={roleOptions}
            style={{ width: '100%' }}
          />
          <Form.TextArea field="remark" label="备注" rows={3} />
        </Form>
      </AppModal>
    </div>
  );
}
