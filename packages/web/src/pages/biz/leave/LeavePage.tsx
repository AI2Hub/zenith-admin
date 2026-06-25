/**
 * 业务接入示例：请假管理（业务模块自有列表页）
 *
 * 演示「业务模块自存数据 + 工作流编排」：请假数据存 biz_leaves，提交审批时由后端
 * 通过 workflow-biz-bridge 发起并关联工作流；列表展示业务状态，详情跳转到流程实例整页。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Form, Input, Modal, Select, Space, Tag, Toast, Typography,
} from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Plus, RotateCcw, Search, Send } from 'lucide-react';
import dayjs from 'dayjs';
import type { BizLeave, PaginatedResponse } from '@zenith/shared';
import { request } from '@/utils/request';
import { SearchToolbar } from '@/components/SearchToolbar';
import ConfigurableTable from '@/components/ConfigurableTable';
import { createOperationColumn } from '@/components/ResponsiveTableActions';
import { usePagination } from '@/hooks/usePagination';
import { formatDateForApi } from '@/utils/date';
import { createdAtColumn, renderEllipsis } from '@/utils/table-columns';

type TagColor = 'grey' | 'blue' | 'green' | 'red' | 'orange';

const STATUS_MAP: Record<string, { text: string; color: TagColor }> = {
  draft: { text: '草稿', color: 'grey' },
  pending: { text: '审批中', color: 'blue' },
  approved: { text: '已通过', color: 'green' },
  rejected: { text: '已驳回', color: 'red' },
  cancelled: { text: '已取消', color: 'orange' },
};

const LEAVE_TYPE_OPTIONS = [
  { value: 'annual', label: '年假' },
  { value: 'sick', label: '病假' },
  { value: 'personal', label: '事假' },
  { value: 'marriage', label: '婚假' },
  { value: 'other', label: '其他' },
];
const LEAVE_TYPE_TEXT = Object.fromEntries(LEAVE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

interface LeaveSearchParams {
  keyword: string;
  status: BizLeave['status'] | '';
}

const DEFAULT_LEAVE_SEARCH_PARAMS: LeaveSearchParams = {
  keyword: '',
  status: '',
};

export default function LeavePage() {
  const navigate = useNavigate();
  const { page, pageSize, setPage, resetPage, buildPagination } = usePagination();
  const [list, setList] = useState<BizLeave[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState<LeaveSearchParams>(DEFAULT_LEAVE_SEARCH_PARAMS);
  const searchParamsRef = useRef<LeaveSearchParams>(DEFAULT_LEAVE_SEARCH_PARAMS);
  searchParamsRef.current = searchParams;

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<BizLeave | null>(null);
  const [saving, setSaving] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const formApi = useRef<FormApi | null>(null);

  const fetchList = useCallback(async (p = page, ps = pageSize, params?: LeaveSearchParams) => {
    const activeParams = params ?? searchParamsRef.current;
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({ page: String(p), pageSize: String(ps) });
      if (activeParams.keyword.trim()) queryParams.set('keyword', activeParams.keyword.trim());
      if (activeParams.status) queryParams.set('status', activeParams.status);
      const res = await request.get<PaginatedResponse<BizLeave>>(`/api/biz/leaves?${queryParams.toString()}`);
      if (res.code === 0) { setList(res.data.list); setTotal(res.data.total); }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void fetchList(1, pageSize);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => { resetPage(); void fetchList(1, pageSize); };
  const handleReset = () => {
    setSearchParams(DEFAULT_LEAVE_SEARCH_PARAMS);
    resetPage();
    void fetchList(1, pageSize, DEFAULT_LEAVE_SEARCH_PARAMS);
  };

  const openCreate = () => { setEditing(null); setModalVisible(true); setTimeout(() => formApi.current?.reset(), 0); };
  const openEdit = (record: BizLeave) => {
    setEditing(record);
    setModalVisible(true);
    setTimeout(() => {
      formApi.current?.setValues({
        leaveType: record.leaveType,
        dateRange: [dayjs(record.startDate).toDate(), dayjs(record.endDate).toDate()],
        days: record.days,
        reason: record.reason ?? '',
      });
    }, 0);
  };

  const collectPayload = async () => {
    if (!formApi.current) return null;
    let values: Record<string, unknown>;
    try { values = await formApi.current.validate() as Record<string, unknown>; } catch { return; }
    const range = values.dateRange as [Date, Date] | undefined;
    if (!range || range.length !== 2) { Toast.error('请选择请假日期'); return null; }
    return {
      leaveType: String(values.leaveType ?? ''),
      startDate: formatDateForApi(range[0]),
      endDate: formatDateForApi(range[1]),
      days: Number(values.days),
      reason: (values.reason as string) || null,
    };
  };

  const saveLeave = async (payload: Awaited<ReturnType<typeof collectPayload>>) => {
    if (!payload) return null;
    const res = editing
      ? await request.put<BizLeave>(`/api/biz/leaves/${editing.id}`, payload)
      : await request.post<BizLeave>('/api/biz/leaves', payload);
    return res.code === 0 ? res.data : null;
  };

  const handleSubmit = async () => {
    const payload = await collectPayload();
    if (!payload) return;
    setSaving(true);
    try {
      const saved = await saveLeave(payload);
      if (saved) { Toast.success('保存成功'); setModalVisible(false); void fetchList(); }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitFromModal = async () => {
    const payload = await collectPayload();
    if (!payload) return;
    setSubmittingApproval(true);
    try {
      const saved = await saveLeave(payload);
      if (!saved) return;
      const res = await request.post<BizLeave>(`/api/biz/leaves/${saved.id}/submit`, {});
      if (res.code === 0) {
        Toast.success('已提交审批');
        setModalVisible(false);
        void fetchList();
      }
    } finally {
      setSubmittingApproval(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await request.delete(`/api/biz/leaves/${id}`);
    if (res.code === 0) { Toast.success('已删除'); void fetchList(); }
  };

  const handleSubmitApproval = async (id: number) => {
    const res = await request.post(`/api/biz/leaves/${id}/submit`, {});
    if (res.code === 0) { Toast.success('已提交审批'); void fetchList(); }
  };

  const openWorkflow = (record: BizLeave) => {
    if (!record.workflowInstanceId) return;
    navigate(`/workflow/instance/${record.workflowInstanceId}`, { state: { tabTitle: `请假审批 - ${record.applicantName ?? ''}` } });
  };

  const columns: ColumnProps<BizLeave>[] = [
    { title: '请假类型', dataIndex: 'leaveType', width: 110, render: (v: string) => LEAVE_TYPE_TEXT[v] ?? v },
    { title: '日期', width: 200, render: (_: unknown, r: BizLeave) => `${r.startDate} ~ ${r.endDate}` },
    { title: '天数', dataIndex: 'days', width: 90, render: (v: number) => `${v} 天` },
    { title: '事由', dataIndex: 'reason', render: renderEllipsis },
    createdAtColumn as ColumnProps<BizLeave>,
    {
      title: '状态', dataIndex: 'status', width: 110, fixed: 'right',
      render: (v: string) => { const s = STATUS_MAP[v]; return s ? <Tag color={s.color}>{s.text}</Tag> : <span>{v}</span>; },
    },
    createOperationColumn<BizLeave>({
      width: 220,
      actions: (record) => [
        {
          key: 'edit',
          label: '编辑',
          hidden: record.status !== 'draft',
          onClick: () => openEdit(record),
        },
        {
          key: 'submit',
          label: '提交审批',
          type: 'primary',
          hidden: record.status !== 'draft',
          onClick: () => {
            Modal.confirm({
              title: '确定提交审批吗？',
              onOk: () => handleSubmitApproval(record.id),
            });
          },
        },
        {
          key: 'workflow',
          label: '流程详情',
          hidden: !record.workflowInstanceId,
          onClick: () => openWorkflow(record),
        },
        {
          key: 'delete',
          label: '删除',
          danger: true,
          hidden: record.status !== 'draft',
          onClick: () => {
            Modal.confirm({
              title: '确定删除吗？',
              okButtonProps: { type: 'danger', theme: 'solid' },
              onOk: () => handleDelete(record.id),
            });
          },
        },
      ],
    }),
  ];

  const renderKeywordSearch = () => (
    <Input
      prefix={<Search size={14} />}
      placeholder="搜索事由"
      value={searchParams.keyword}
      onChange={(value) => setSearchParams((prev) => ({ ...prev, keyword: value }))}
      onEnterPress={handleSearch}
      showClear
      style={{ width: 220, maxWidth: '100%' }}
    />
  );

  const renderStatusFilter = () => (
    <Select
      placeholder="状态"
      value={searchParams.status || undefined}
      onChange={(value) => setSearchParams((prev) => ({ ...prev, status: (value as LeaveSearchParams['status']) ?? '' }))}
      showClear
      style={{ width: 140, maxWidth: '100%' }}
      optionList={Object.entries(STATUS_MAP).map(([value, s]) => ({ value, label: s.text }))}
    />
  );

  const renderSearchButton = () => <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>;
  const renderResetButton = () => <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>;
  const renderCreateButton = () => <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>新建请假</Button>;

  return (
    <div className="page-container">
      <SearchToolbar
        primary={(
          <>
            {renderKeywordSearch()}
            {renderStatusFilter()}
            {renderSearchButton()}
            {renderResetButton()}
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
        mobileFilters={renderStatusFilter()}
        filterTitle="请假筛选"
        onFilterApply={handleSearch}
        onFilterReset={handleReset}
      />

      <ConfigurableTable
        bordered
        columns={columns}
        dataSource={list}
        loading={loading}
        rowKey="id"
        columnSettingsKey="biz-leave"
        pagination={buildPagination(total, fetchList)}
        onRefresh={() => void fetchList()}
        refreshLoading={loading}
      />

      <Modal
        title={editing ? '编辑请假单' : '新建请假单'}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={(
          <Space>
            <Button onClick={() => setModalVisible(false)}>取消</Button>
            <Button loading={saving} disabled={submittingApproval} onClick={() => void handleSubmit()}>保存草稿</Button>
            <Button type="primary" loading={submittingApproval} disabled={saving} onClick={() => void handleSubmitFromModal()}>提交审批</Button>
          </Space>
        )}
        closeOnEsc
        width={520}
      >
        <Form getFormApi={(api) => { formApi.current = api; }} labelPosition="left" labelWidth={90}>
          <Form.Select field="leaveType" label="请假类型" optionList={LEAVE_TYPE_OPTIONS} rules={[{ required: true, message: '请选择请假类型' }]} style={{ width: '100%' }} />
          <Form.DatePicker field="dateRange" label="请假日期" type="dateRange" style={{ width: '100%' }} rules={[{ required: true, message: '请选择请假日期' }]} />
          <Form.InputNumber field="days" label="天数" min={0.5} step={0.5} style={{ width: '100%' }} rules={[{ required: true, message: '请输入天数' }]} />
          <Form.TextArea field="reason" label="事由" autosize rows={2} maxCount={500} />
        </Form>
        <Typography.Text type="tertiary" size="small">
          <Send size={12} style={{ verticalAlign: -2, marginRight: 4 }} />可保存为草稿稍后提交，也可直接「提交审批」发起请假审批流程。
        </Typography.Text>
      </Modal>
    </div>
  );
}
