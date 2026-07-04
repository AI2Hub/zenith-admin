# CRUD 前端实现参考（以「xxx管理」为范例）

本文档提供前端页面的完整代码模板，对照 `packages/web/src/pages/system/tenant-packages/TenantPackagesPage.tsx`（标准列表页）与 `packages/web/src/pages/users/UsersPage.tsx`（复杂页面）的实际实现。

> **占位符约定**：`xxx` = 小写（表名、API 路径、文件名）；`Xxx` = 大驼峰（TypeScript 类型、组件名）；替换时请将所有 `xxx`/`Xxx` 替换为实际实体名。

---

## 数据获取架构（必读）

前端服务端状态统一由 **TanStack Query v5** 管理，分两层：

- **传输层**：`packages/web/src/utils/request.ts`（token 刷新、401/429/503、错误 Toast）。**禁止**在页面里手写 `loading`/`data` state + `fetchXxx` useCallback + `useEffect` 初始拉取的旧模式。
- **服务端状态层**：`packages/web/src/hooks/queries/<域>.ts` 域 hooks 文件 + 页面内 `useQuery`/`useMutation`。基建位于 `packages/web/src/lib/query.ts`（`queryClient`、`unwrap()`、`toQueryString()`、`LOOKUP_STALE_TIME`）。

核心约定：

1. queryFn 统一 `request.get<T>(url).then(unwrap)`；`unwrap` 在 `code !== 0` 时抛 `ApiError`（request 层已自动 Toast，调用方无需重复提示）。
2. 每个域文件导出 keys 常量对象，必须包含 `all` / `lists` / `list(params)` / `detail(id)`。
3. 分页列表查询必须 `placeholderData: keepPreviousData`（翻页不闪白屏）。
4. **查询/重置必回源**：`handleSearch` / `handleReset` 除更新参数外必须显式 `invalidateQueries({ queryKey: xxxKeys.lists })` —— 条件未变化时 query key 不变，不失效则 staleTime 内不发请求，而本系统「查询」按钮兼具刷新语义。
5. mutation 的 `onSuccess` 在域 hooks 中统一 `invalidateQueries({ queryKey: xxxKeys.all })`；成功 Toast 留在页面代码。
6. 下拉源等低频 lookup 数据用 `staleTime: LOOKUP_STALE_TIME`（5 分钟），全局共享缓存；已有共享 lookup（`useAllUsers` / `useFlatDepartments` / `useDepartmentTree` / `useMenuTree` / `useAllRoles` / `useAllPositions` / `useDictItems` 等）直接 import，**禁止重复定义**。
7. 轮询页面用 `refetchInterval`（毫秒），禁止手写 `setInterval` 拉数据。
8. 一次性动作（文件下载 `request.download`、验密、诊断类）可保留直接调用；WebSocket / SSE / xterm 流式逻辑不走 TanStack Query。

---

## 文件位置

```text
packages/web/src/hooks/queries/xxxs.ts     # 域 hooks（查询 + 变更）
packages/web/src/pages/xxx/XxxPage.tsx     # 页面组件
```

---

## 域 hooks 文件模板（hooks/queries/xxxs.ts）

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse, Xxx } from '@zenith/shared';
import { request } from '@/utils/request';
import { toQueryString, unwrap } from '@/lib/query';

export interface XxxListParams {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  // 时间范围筛选：只放已转换的字符串（formatDateTimeForApi），禁止 Date 对象进 params
  // startTime?: string;
  // endTime?: string;
}

export const xxxKeys = {
  all: ['xxxs'] as const,
  lists: ['xxxs', 'list'] as const,
  list: (params: XxxListParams) => ['xxxs', 'list', params] as const,
  detail: (id: number | undefined) => ['xxxs', 'detail', id] as const,
};

export function useXxxList(params: XxxListParams) {
  return useQuery({
    queryKey: xxxKeys.list(params),
    queryFn: () => request.get<PaginatedResponse<Xxx>>(`/api/xxxs${toQueryString(params)}`).then(unwrap),
    placeholderData: keepPreviousData,
  });
}

export function useXxxDetail(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: xxxKeys.detail(id),
    queryFn: () => request.get<Xxx>(`/api/xxxs/${id}`).then(unwrap),
    enabled: enabled && id !== undefined,
  });
}

/** 新增（无 id）或更新（有 id） */
export function useSaveXxx() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id?: number; values: Record<string, unknown> }) =>
      (id === undefined
        ? request.post<Xxx>('/api/xxxs', values)
        : request.put<Xxx>(`/api/xxxs/${id}`, values)
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: xxxKeys.all }),
  });
}

/** 删除：单个（length===1 走单删接口）或批量 */
export function useDeleteXxxs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      (ids.length === 1
        ? request.delete<null>(`/api/xxxs/${ids[0]}`)
        : request.delete<null>('/api/xxxs/batch', { ids })
      ).then(unwrap),
    onSuccess: () => qc.invalidateQueries({ queryKey: xxxKeys.all }),
  });
}
```

> 如页面存在关联下拉源（如全量 Yyy 列表），在 Yyy 的域文件中定义 `useAllYyys()`（key `['yyys','all']`，`staleTime: LOOKUP_STALE_TIME`，可选 `{ enabled }` 参数），供跨页共享。

---

## 完整页面模板

```tsx
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button, Form, Input, Select, Spin,
  Toast, Modal, Switch, Row, Col,
} from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import { Search, RotateCcw, Plus } from 'lucide-react';
import ConfigurableTable from '@/components/ConfigurableTable';
import ExportButton from '@/components/ExportButton';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { SearchToolbar } from '@/components/SearchToolbar';
import AppModal from '@/components/AppModal';
import { createdAtColumn, renderEllipsis } from '@/utils/table-columns';
import { useDictItems } from '@/hooks/useDictItems';
import { usePermission } from '@/hooks/usePermission';
import { usePagination } from '@/hooks/usePagination';
import { useDeleteXxxs, useSaveXxx, useXxxDetail, useXxxList, xxxKeys } from '@/hooks/queries/xxxs';
import type { Xxx } from '@zenith/shared';

// ─── 搜索参数类型 ────────────────────────────────────────────────────────
interface SearchParams {
  keyword: string;
  status: string;
  // 如有时间范围筛选：
  // timeRange: [Date, Date] | null;
}

const defaultSearchParams: SearchParams = {
  keyword: '',
  status: '',
};

// ════════════════════════════════════════════════════════════════════════════
// 主组件
// ════════════════════════════════════════════════════════════════════════════
export default function XxxPage() {
  const { hasPermission } = usePermission();
  const formApi = useRef<FormApi | null>(null);
  const queryClient = useQueryClient();

  // ─── 搜索状态：draft 绑输入框，submitted 进 query key ────────────────────
  const { page, pageSize, setPage, buildPagination } = usePagination();
  const [draftParams, setDraftParams] = useState<SearchParams>(defaultSearchParams);
  const [submittedParams, setSubmittedParams] = useState<SearchParams>(defaultSearchParams);

  // ─── 列表查询（key 驱动：page/pageSize/submittedParams 变化自动请求）────
  const listQuery = useXxxList({
    page,
    pageSize,
    keyword: submittedParams.keyword || undefined,
    status: submittedParams.status || undefined,
    // 如有时间范围（Date → 字符串后再进 params）：
    // startTime: submittedParams.timeRange ? formatDateTimeForApi(submittedParams.timeRange[0]) : undefined,
    // endTime: submittedParams.timeRange ? formatDateTimeForApi(submittedParams.timeRange[1]) : undefined,
  });
  const list = listQuery.data?.list ?? [];
  const total = listQuery.data?.total ?? 0;

  // ─── 弹窗状态（编辑详情懒加载：enabled 门控 + 行数据回退）───────────────
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Xxx | null>(null);  // null=新增
  const detailQuery = useXxxDetail(editingRecord?.id, modalVisible);
  const editingXxx = editingRecord ? (detailQuery.data ?? editingRecord) : null;
  const modalDetailLoading = !!editingRecord && detailQuery.isFetching;

  // ─── 变更 hooks ────────────────────────────────────────────────────────
  const saveMutation = useSaveXxx();
  const toggleStatusMutation = useSaveXxx();  // 行级 Switch 专用实例，便于按行显示 pending
  const deleteMutation = useDeleteXxxs();
  const togglingId = toggleStatusMutation.isPending ? (toggleStatusMutation.variables?.id ?? null) : null;

  // 字典数据（内部已是 useQuery，全局共享缓存）
  const { items: statusItems } = useDictItems('common_status');

  // ─── 搜索 / 重置（必须显式失效，保证点击必回源）─────────────────────────
  function handleSearch() {
    setPage(1);
    setSubmittedParams(draftParams);
    void queryClient.invalidateQueries({ queryKey: xxxKeys.lists });
  }

  function handleReset() {
    setPage(1);
    setDraftParams(defaultSearchParams);
    setSubmittedParams(defaultSearchParams);
    void queryClient.invalidateQueries({ queryKey: xxxKeys.lists });
  }

  // ─── 导出（导出中心）──────────────────────────────────────────────────
  function buildExportQuery(): Record<string, unknown> {
    return {
      keyword: submittedParams.keyword || undefined,
      status: submittedParams.status || undefined,
    };
  }

  // ─── 新增 / 编辑 ──────────────────────────────────────────────────────
  function openCreate() {
    setEditingRecord(null);
    setModalVisible(true);
  }

  function openEdit(record: Xxx) {
    setEditingRecord(record);   // 详情由 detailQuery 自动加载（30s 内缓存命中则秒开）
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingRecord(null);
  }

  // Form 初始值（编辑时回填，新增时清空）
  const formInitValues = editingXxx
    ? {
        name: editingXxx.name,
        description: editingXxx.description,
        status: editingXxx.status,
        // 多对多字段示例：yyyIds: editingXxx.yyyIds ?? [],
      }
    : { status: 'enabled' };

  async function handleModalOk() {
    let values: Record<string, unknown>;
    try {
      values = (await formApi.current?.validate()) ?? {};
    } catch {
      throw new Error('validation');  // 阻止 Modal 关闭
    }
    // mutateAsync 失败时抛 ApiError → Modal 保持打开（错误 Toast 由 request 层弹出）
    await saveMutation.mutateAsync({ id: editingRecord?.id, values });
    Toast.success(editingRecord ? '更新成功' : '创建成功');
    closeModal();
  }

  // ─── 删除 ──────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync([id]);
    Toast.success('删除成功');
  }

  // ─── 状态切换（Switch 直接修改）────────────────────────────────────────
  // status 字段为 'enabled'|'disabled' 时使用此模式；boolean 字段改为 { isEnabled: checked }
  function handleToggleStatus(record: Xxx, checked: boolean) {
    const doToggle = () => {
      toggleStatusMutation.mutate(
        { id: record.id, values: { status: checked ? 'enabled' : 'disabled' } },
        { onSuccess: () => Toast.success(checked ? '已启用' : '已停用') },
      );
    };
    if (checked) {
      doToggle();
    } else {
      Modal.confirm({
        title: '确认停用',
        content: `停用后「${record.name}」将不再可用，确认停用？`,
        onOk: doToggle,
      });
    }
  }

  // ─── 表格列定义 ────────────────────────────────────────────────────────
  const columns: ColumnProps<Xxx>[] = [
    {
      title: '名称',
      dataIndex: 'name',
      width: 200,
    },
    {
      title: '描述',
      dataIndex: 'description',
      width: 260,
      render: renderEllipsis,
    },
    createdAtColumn,  // 创建时间预置列（自动 formatDateTime）
    {
      // 状态列：放在操作列左侧紧靠操作列，必须 fixed: 'right'
      title: '状态',
      dataIndex: 'status',
      width: 80,
      fixed: 'right',
      render: (_: unknown, record: Xxx) => (
        <Switch
          checked={record.status === 'enabled'}
          loading={togglingId === record.id}
          disabled={!hasPermission('system:xxx:update')}
          onChange={(checked) => handleToggleStatus(record, checked)}
          size="small"
        />
      ),
    },
    createOperationColumn<Xxx>({
      width: 160,
      desktopInlineKeys: ['edit', 'delete'],
      actions: (record) => [
        ...(hasPermission('system:xxx:update') ? [{
          key: 'edit',
          label: '编辑',
          onClick: () => openEdit(record),
        }] : []),
        ...(hasPermission('system:xxx:delete') ? [{
          key: 'delete',
          label: '删除',
          danger: true,
          onClick: () => {
            Modal.confirm({
              title: '确定要删除吗？',
              content: '删除后不可恢复',
              onOk: () => handleDelete(record.id),
            });
          },
        }] : []),
      ],
    }),
  ];

  const renderKeywordSearch = () => (
    <Input
      prefix={<Search size={14} />}
      placeholder="搜索名称..."
      value={draftParams.keyword}
      onChange={(v) => setDraftParams((p) => ({ ...p, keyword: v }))}
      showClear
      style={{ width: 220 }}
      onEnterPress={handleSearch}
    />
  );

  const renderStatusFilter = () => (
    <Select
      placeholder="全部状态"
      value={draftParams.status || undefined}
      onChange={(v) =>
        setDraftParams((p) => ({ ...p, status: (v as string) ?? '' }))
      }
      showClear
      style={{ width: 120 }}
      optionList={statusItems.map((i) => ({ value: i.value, label: i.label }))}
    />
  );

  const renderSearchButton = () => (
    <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
  );

  const renderResetButton = () => (
    <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>
  );

  const renderCreateButton = () => hasPermission('system:xxx:create') ? (
    <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>新增</Button>
  ) : null;

  const renderExportButtons = () => hasPermission('system:xxx:export') ? (
    <ExportButton entity="system.xxxs" query={buildExportQuery()} />
  ) : null;

  const renderMobileExportActions = () => hasPermission('system:xxx:export') ? (
    <ExportButton entity="system.xxxs" query={buildExportQuery()} label="导出" variant="flat" />
  ) : null;

  // mobileActions 中的普通操作按钮统一使用 theme="borderless"；
  // 导出操作优先使用 ExportButton variant="flat"。

  // ════════════════════════════════════════════════════════════════════════
  // 渲染
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="page-container">
      {/* 搜索区：筛选/操作较多时使用结构化 SearchToolbar，移动端自动精简 */}
      <SearchToolbar
        primary={(
          <>
            {renderKeywordSearch()}
            {renderStatusFilter()}
            {renderSearchButton()}
            {renderResetButton()}
          </>
        )}
        actions={(
          <>
            {renderExportButtons()}
            {renderCreateButton()}
          </>
        )}
        mobilePrimary={(
          <>
            {renderKeywordSearch()}
            {renderSearchButton()}
            {renderCreateButton()}
          </>
        )}
        mobileFilters={(
          <>
            {renderStatusFilter()}
          </>
        )}
        mobileActions={renderMobileExportActions()}
        filterTitle="筛选条件"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      {/* 数据表格 */}
      <ConfigurableTable
        bordered
        columns={columns}
        dataSource={list}
        loading={listQuery.isFetching}
        rowKey="id"
        size="small"
        empty="暂无数据"
        onRefresh={() => void listQuery.refetch()}
        refreshLoading={listQuery.isFetching}
        pagination={buildPagination(total)}
      />

      {/* 新增/编辑弹窗（共用一个） */}
      {/*
        AppModal 宽度规则：
        - 有 3 对以上可并排的普通字段 → width={660}，双列布局
        - 字段较少或含 TreeSelect/TextArea 等宽字段 → width 480-520，单列布局
      */}
      <AppModal
        title={editingRecord ? '编辑XXX' : '新增XXX'}
        visible={modalVisible}
        onOk={handleModalOk}
        onCancel={closeModal}
        okButtonProps={{ loading: saveMutation.isPending, disabled: modalDetailLoading }}
        width={660}
        closeOnEsc
      >
        <Spin spinning={modalDetailLoading} wrapperClassName="modal-spin-wrapper">
          <Form
            key={editingRecord?.id ?? 'new'}  // key 变化时强制重置 Form 内部状态
            getFormApi={(api) => {
              formApi.current = api;
            }}
            allowEmpty
            initValues={formInitValues}
            labelPosition="left"
            labelWidth={90}  {/* 3字标签→ 72，4-5字→ 90，6字+→ 110+ */}
          >
            {/* 全宽字段（跨两列，如树形选择、长文本）：直接写，不包裹 Col */}
            <Form.TreeSelect
              field="parentId"
              label="上级"
              style={{ width: '100%' }}
              treeData={[]}
              placeholder="请选择上级"
              filterTreeNode
              showClear
            />
            {/* 双列布局：Row gutter={16} + Col span={12}，每行放 2 个字段 */}
            <Row gutter={16}>
              <Col span={12}>
                <Form.Input
                  field="name"
                  label="名称"
                  placeholder="请输入名称"
                  rules={[{ required: true, message: '名称不能为空' }]}
                />
              </Col>
              <Col span={12}>
                <Form.Input
                  field="code"
                  label="编码"
                  placeholder="请输入编码"
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Select
                  field="status"
                  label="状态"
                  style={{ width: '100%' }}
                  optionList={statusItems.map((i) => ({
                    value: i.value,
                    label: i.label,
                  }))}
                  rules={[{ required: true, message: '请选择状态' }]}
                />
              </Col>
              {/* 奇数个字段时，最后一个 Col span={12} 单独占左半列 */}
            </Row>
            {/* 如需关联选择，在此添加 Form.Select 多选等 */}
          </Form>
        </Spin>
      </AppModal>
    </div>
  );
}
```

---

## 关键规范说明

### 数据获取补充规范

- **弹窗内交互态从查询数据播种**（如授权勾选）：`useEffect(() => { if (visible) setCheckedIds(detailQuery.data?.menuIds ?? []); }, [visible, detailQuery.data]);`
- **轮询**：`useQuery({ ..., refetchInterval: 5000 })`；条件轮询用函数形式 `refetchInterval: (query) => hasRunning(query.state.data) ? 5000 : false`。
- **上传进度**：`request.postForm(url, formData, { onProgress })` 包进 mutationFn，参数形如 `{ formData, onProgress }`（参考 `hooks/queries/users.ts` 的 import mutation）。
- **enabled 门控查询的 loading 判断**：`enabled: false` 时 `isPending` 恒为 true，整页 loading 判断必须写成 `(!!id && query.isPending)`，否则新建模式会卡死在 Spin。
- **member C 端 SPA**（`src/member/`）：使用独立 `memberQueryClient`（`member/lib/member-query.ts`）+ `memberRequest` 传输层，hooks 位于 `member/hooks/queries.ts`，其余约定与后台一致。

### 页面级多 Tab 布局

当页面最外层是多个业务 Tab（如「列表/统计」「配置/日志」「全部/未读/已读」）时，使用统一页面壳层：

```tsx
return (
  <div className="page-container page-tabs-page">
    <Tabs activeKey={activeTab} onChange={handleTabChange} type="line" lazyRender keepDOM={false}>
      <TabPane tab="列表" itemKey="list">
        <SearchToolbar>
          {/* 当前 tab 的筛选与操作按钮 */}
        </SearchToolbar>
        <ConfigurableTable bordered ... />
      </TabPane>
      <TabPane tab="统计分析" itemKey="stats">
        <StatsPanel />
      </TabPane>
    </Tabs>
  </div>
);
```

规则：

- 每个 `TabPane` 内承载该 tab 的完整内容：`SearchToolbar`、操作按钮、空状态、`ConfigurableTable` 或统计面板。
- 禁止把 `TabPane` 写成空 tab 后在 `Tabs` 外部根据 `activeTab` 渲染表格、空状态或按钮。
- tab 相关操作按钮（如「全部标记为已读」「清理日志」「刷新当前 tab」）放在对应 `TabPane` 内的 `SearchToolbar`，不要放在 TabBar 右侧。
- `page-tabs-page` 只用于页面最外层业务 Tabs；抽屉、弹窗、卡片内代码示例、左右分栏内部小 tabs 不使用。
- 非激活 tab 的查询建议用 `enabled: activeTab === 'xxx'` 门控，切换时自动懒加载并缓存。

### 弹窗表单布局规范

**必须在 Form 中加 `labelPosition="left"` 以实现 label 与输入框同行。**

**Modal 宽度与表单列数：**

- 有 **3 对及以上可并排的普通字段**（Input / Select / InputNumber 等）→ 使用双列布局，`width={660}`
- 字段较少，或主要是 TreeSelect / TextArea 等不适合并排的字段 → 使用单列布局，`width` 在 480–520 之间酌情选取

所有 Modal 必须加 `closeOnEsc`。

**双列布局规则（用 `Row` + `Col`，来自 `@douyinfe/semi-ui`）：**

```tsx
import { Row, Col } from '@douyinfe/semi-ui';

// 每行两个字段：Row gutter={16} + Col span={12}
<Row gutter={16}>
  <Col span={12}>
    <Form.Input field="name" label="名称" ... />
  </Col>
  <Col span={12}>
    <Form.Input field="code" label="编码" ... />
  </Col>
</Row>

// 全宽字段（树形选择、长文本、多行输入等）：不包 Col，直接写
<Form.TreeSelect field="parentId" label="上级" style={{ width: '100%' }} ... />

// 奇数个字段时最后一个单独占左半列（不强制凑满一行）
<Row gutter={16}>
  <Col span={12}>
    <Form.Select field="status" label="状态" style={{ width: '100%' }} ... />
  </Col>
</Row>
```

**labelWidth 选取原则：**

- 标签文字 ≤3 字（名称、状态、邮箱）→ `labelWidth={72}`
- 标签文字 4–5 字（部门名称、联系电话）→ `labelWidth={90}`
- 标签文字 ≥6 字（上级部门名称、所属租户等）→ `labelWidth={110}` 或 120
- 同一个 Form 内保持统一

### 状态字段显示

- 使用 `useDictItems('common_status')` 获取字典选项（内部为 useQuery，同一 code 全局共享缓存、自动去重）
- 表格中用 `<DictTag dictCode="common_status" value={status} />` 或手动 `find` 映射

### 时间格式化与省略文本

```ts
// ✅ 正确：使用预置列（自动格式化+省略 tooltip）
import { createdAtColumn, renderEllipsis } from '../../utils/table-columns';
// 使用：columns = [..., createdAtColumn];
// 省略列：render: renderEllipsis

// ✅ 仍可直接调用（非列 render 场景）
import { formatDateTime } from '../../utils/date';
formatDateTime(someDate)

// ❌ 禁止：不要在组件中使用原生 locale 或 ISO 时间格式化 API
```

### 操作列按钮样式

```tsx
// ✅ 正确：使用 createOperationColumn。默认桌面端内联全部动作；
// 设置 desktopInlineKeys 后，只把高频动作作为内联按钮展示，其余动作进入更多菜单。
// 移动端会自动收窄操作列，并将全部动作收进更多菜单。
createOperationColumn<Xxx>({
  width: 160,
  desktopInlineKeys: ['edit', 'delete'],
  actions: (record) => [
    { key: 'edit', label: '编辑', onClick: () => openEdit(record) },
    { key: 'delete', label: '删除', danger: true, onClick: () => handleDelete(record.id) },
  ],
})
```

### 搜索参数与分页联动

```ts
// ✅ 正确：draft/submitted 拆分 + 显式失效
// - draftParams 绑定输入框，输入过程不触发请求
// - submittedParams 进入 query key，变化自动请求
// - invalidateQueries 保证「条件未变时点查询」也强制回源刷新
function handleSearch() {
  setPage(1);
  setSubmittedParams(draftParams);
  void queryClient.invalidateQueries({ queryKey: xxxKeys.lists });
}

function handleReset() {
  setPage(1);
  setDraftParams(defaultSearchParams);
  setSubmittedParams(defaultSearchParams);
  void queryClient.invalidateQueries({ queryKey: xxxKeys.lists });
}

// 翻页：buildPagination(total) 内部 setPage/setPageSize → key 变化自动请求，无需回调
```

### 权限控制

```tsx
// 使用 hasPermission() 控制按钮显示
const { hasPermission } = usePermission();

{hasPermission('system:xxx:create') && <Button>新增</Button>}
{hasPermission('system:xxx:update') && <Button>编辑</Button>}
{hasPermission('system:xxx:delete') && <Button>删除</Button>}
```

---

## 批量操作前端模板

> 仅在用户确认需要批量操作时添加，并非所有列表都需要。

```tsx
// 1. 状态声明（deleteMutation 复用上文 useDeleteXxxs）
const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);

// 2. 批量删除 handler
const handleBatchDelete = () => {
  Modal.confirm({
    title: `确认删除选中的 ${selectedRowKeys.length} 条记录？`,
    content: '删除后无法恢复，请谨慎操作。',
    okButtonProps: { type: 'danger', theme: 'solid' },
    onOk: async () => {
      await deleteMutation.mutateAsync(selectedRowKeys);
      Toast.success('批量删除成功');
      setSelectedRowKeys([]);
    },
  });
};

// 3. 工具栏中的批量按钮（仅选中时显示，放在查询/重置按钮之后）
{selectedRowKeys.length > 0 && hasPermission('system:xxx:delete') && (
  <Button type="danger" theme="light" icon={<Trash2 size={14} />} onClick={handleBatchDelete}>
    批量删除 ({selectedRowKeys.length})
  </Button>
)}

// 4. ConfigurableTable 增加 rowSelection
<ConfigurableTable
  rowSelection={{
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys as number[]),
  }}
  bordered
  onRefresh={() => void listQuery.refetch()}
  refreshLoading={listQuery.isFetching}
  ...
/>
```

> `request.delete(url, body)` 支持传请求体（`packages/web/src/utils/request.ts` 已实现）；`useDeleteXxxs` 内部据 ids 长度自动选择单删/批量接口。

---

## 虚拟化表格（大数据量）

当列表数据量较大（通常 > 500 条，如地区省市县、日志等）时，为 `ConfigurableTable` 开启 `virtualized`。

### 弹性全宽方案（推荐）

让**一列不设 `width`**（通常是名称/标题主列），表格自动填满容器。`fixed: 'right'` 仅保留操作列，状态列等其他列去掉 `fixed`。

```tsx
const columns: ColumnProps<Region>[] = [
  {
    title: '地区名称',
    dataIndex: 'name',
    // 不设 width — 弹性列，填满剩余宽度
  },
  { title: '区划代码', dataIndex: 'code', width: 140 },
  { title: '级别',     dataIndex: 'level', width: 90 },
  {
    title: '状态',
    dataIndex: 'status',
    width: 90,
    // 注意：不加 fixed: 'right'，否则必须设 scroll.x 导致宽度固定
  },
  createOperationColumn<Region>({
    width: 160,
    actions: (record) => [
      { key: 'edit', label: '编辑', onClick: () => openEdit(record) },
    ],
  }),
];

<ConfigurableTable
  bordered
  virtualized
  scroll={{ y: 'calc(100vh - 260px)' }}  // 只设 y，不设 x
  columns={columns}
  dataSource={list}
  rowKey="id"
  pagination={false}
  onRefresh={() => void treeQuery.refetch()}
  refreshLoading={treeQuery.isFetching}
/>
```

### 固定宽度方案

所有列都有显式 `width` 时（含 `fixed: 'right'` 的状态列），必须设 `scroll.x` = 各列宽度之和，否则表头与数据行错位：

```tsx
<ConfigurableTable
  virtualized
  scroll={{ x: 1050, y: 'calc(100vh - 260px)' }}
  columns={columns}
/>
```

> 缺点：`scroll.x` 固定后表格在宽屏不填满容器。

### 注意事项

- `scroll.y` 是虚拟化生效的**必要条件**，`calc(100vh - 260px)` 适配大多数管理页面布局（260px ≈ 顶栏 + 工具栏 + 内边距）
- 菜单管理等数据量小（< 200 条）且有复杂自定义渲染器的树形表格，**不建议**开启 `virtualized`
- 开启 `virtualized` 后，`expandedRowKeys` 受控展开仍正常工作，无需额外处理

---

## ConfigurableTable 刷新按钮（必须实现）

**所有使用 `ConfigurableTable` 的列表页均必须传入 `onRefresh` 和 `refreshLoading`**，否则表格工具栏不会显示刷新按钮。

```tsx
<ConfigurableTable
  bordered
  columns={columns}
  dataSource={list}
  loading={listQuery.isFetching}
  rowKey="id"
  onRefresh={() => void listQuery.refetch()}   // ← 必须传
  refreshLoading={listQuery.isFetching}        // ← 必须传
  pagination={buildPagination(total)}
/>
```

规则：

- `onRefresh`：调用当前列表查询的 `refetch()`，保持分页位置不变；若组件无独立数据加载（如结构/上下文驱动的表格），可不传
- `refreshLoading`：与 `loading` 一样统一使用 `listQuery.isFetching`，按钮转圈期间防重复点击
- SideSheet / Modal 内的**次级**表格（投递记录、操作历史等）同样需要传入对应查询的 `refetch`

---

## 左右分栏布局（MasterDetailLayout）

适用于消息中心、智能对话、AI 侧边栏、数据库管理表浏览、日志文件等具有「左侧列表 + 右侧详情」结构的页面。统一使用 `MasterDetailLayout` 组件，路径：`packages/web/src/components/MasterDetailLayout.tsx`。

### 标准模式：页面直接作为 Outlet 根节点

页面直接从 `admin-content`（flex 容器，分配了确定高度）继承高度，**直接返回 MasterDetailLayout**，无需外层 wrapper：

```tsx
import MasterDetailLayout from '@/components/MasterDetailLayout';

export default function XxxPage() {
  return (
    <MasterDetailLayout
      defaultSize={260}        // 左栏默认宽度
      minSize={200}
      maxSize={480}
      persistKey="xxx-page"    // localStorage 持久化键
      master={(
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {/* 顶部固定区域（搜索/工具栏） */}
          <div style={{ padding: 12, borderBottom: '1px solid var(--semi-color-border)', flexShrink: 0 }}>
            ...
          </div>
          {/* 滚动列表区域 */}
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            ...
          </div>
        </div>
      )}
      detail={(
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          ...
        </div>
      )}
    />
  );
}
```

### 嵌套在 Semi Design Tabs 内时

Semi Design 的 `semi-tabs-pane-motion-overlay` 会打断高度继承链，必须采用以下完整写法：

**高度链约束**（缺一不可）：

1. 页面根 div：`height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden'`
2. `<Tabs>` 加 `className="tabs-fill-height"`（已在 `global.css` 定义）、`style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}`、`contentStyle={{ flex: 1, minHeight: 0, overflow: 'hidden' }}`
3. 需要全高的 `<TabPane>` 加 `style={{ height: '100%' }}`
4. TabPane 内层 wrapper div：`style={{ height: '100%' }}`

```tsx
export default function XxxPage() {
  return (
    <div style={{ height: '100%', boxSizing: 'border-box', padding: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Tabs
        className="tabs-fill-height"
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        contentStyle={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
        tabBarStyle={{ marginBottom: 8 }}
      >
        <TabPane tab="列表" itemKey="list" style={{ height: '100%' }}>
          <div style={{ height: '100%' }}>
            <MasterDetailLayout
              defaultSize={300}
              minSize={220}
              maxSize={520}
              persistKey="xxx-list"
              master={(
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  <div style={{ padding: 12, borderBottom: '1px solid var(--semi-color-border)', flexShrink: 0 }}>
                    {/* 搜索/过滤 */}
                  </div>
                  <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                    {/* 列表内容 */}
                  </div>
                </div>
              )}
              detail={<div>详情区域</div>}
            />
          </div>
        </TabPane>
        <TabPane tab="其他" itemKey="other">
          {/* 其他 tab 无高度限制需求时不需要加 style={{ height: '100%' }} */}
        </TabPane>
      </Tabs>
    </div>
  );
}
```

### 主侧在右时（`side="right"`）

某些页面左侧为主内容区，右侧为可收起的辅助面板（如 AI 侧边栏）：

- 将宽的内容放在 `detail`（左侧，`flex:1`）
- 将窄的可调整面板放在 `master`（右侧，`flexShrink:0`）
- 设置 `side="right"` 使 master 渲染在右边

```tsx
<MasterDetailLayout
  side="right"
  defaultSize={380}
  minSize={300}
  maxSize={600}
  collapsed={!panelVisible}
  persistKey="xxx-sidebar"
  detail={<MainContent />}    // 宽的主体内容（左侧）
  master={<SidePanel />}      // 窄的辅助面板（右侧，可调整宽度）
/>
```

### 常见陷阱

- **master 内需要头部 + 滚动列表**：必须在 master 内用 flex column 容器包裹，搜索头固定（`flexShrink: 0`），列表 flex: 1 + overflow: auto + minHeight: 0
- **不要把 master 的 div 写成 Fragment（`<>`）**：Fragment 无法接受 `height: '100%'`，列表将无高度约束
- **Tabs 嵌套时不加 `className="tabs-fill-height"`**：会导致 Semi Design 的动画层破坏高度链，列表内容撑满后无滚动
- **MasterDetailLayout 的 `gap` 默认为 0**：如不需要间距且无边框，保持默认即可

---

## 导出规范（导出中心）

- 若模块需要导出，后端统一在 `packages/server/src/lib/export-center/definitions/` 中新增 `defineExport` 实体定义，并在 `definitions/index.ts` 注册。
- 导出字段、Excel / CSV 格式、权限、同步 / 异步策略、文件留存、合并表头与自定义样式均写在导出实体定义中。
- 前端统一使用 `ExportButton`，通过 `entity` 指定导出实体编码，通过 `query` 传递当前提交的筛选条件。
- 列表页默认同步明文导出；大数据或特殊敏感场景由实体定义的 `execution` 策略调整。
- 若导出需带筛选条件，统一使用「当前提交查询参数」（`submittedParams`，而非 draft）构造 query，与列表查询保持一致。
