import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Form, Space, Toast, Modal } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Plus, RotateCcw } from 'lucide-react';
import type { CheckinRule } from '@zenith/shared';
import { request } from '@/utils/request';
import { usePermission } from '@/hooks/usePermission';
import { SearchToolbar } from '@/components/SearchToolbar';
import ConfigurableTable from '@/components/ConfigurableTable';
import { AppModal } from '@/components/AppModal';
import { renderEllipsis } from '../../utils/table-columns';

export default function CheckinRulesPage() {
  const { hasPermission } = usePermission();
  const formApi = useRef<FormApi | null>(null);
  const [data, setData] = useState<CheckinRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<CheckinRule | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get<CheckinRule[]>('/api/checkin-rules');
      if (res.code === 0) setData(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleOk = async () => {
    let values: Record<string, unknown> | undefined;
    try {
      values = await formApi.current?.validate();
    } catch {
      throw new Error('validation');
    }
    const res = editing
      ? await request.put<CheckinRule>(`/api/checkin-rules/${editing.id}`, values)
      : await request.post<CheckinRule>('/api/checkin-rules', values);
    if (res.code === 0) {
      Toast.success(editing ? '更新成功' : '创建成功');
      setModalVisible(false);
      setEditing(null);
      void fetchData();
      return;
    }
    throw new Error(res.message);
  };

  const handleDelete = (record: CheckinRule) => {
    Modal.confirm({
      title: `确认删除第 ${record.dayNumber} 天规则？`,
      content: '删除后该连续天数的奖励配置将失效。',
      okButtonProps: { type: 'danger', theme: 'solid' },
      onOk: async () => {
        const res = await request.delete(`/api/checkin-rules/${record.id}`);
        if (res.code === 0) {
          Toast.success('删除成功');
          void fetchData();
        }
      },
    });
  };

  const columns: ColumnProps<CheckinRule>[] = [
    { title: '连续天数', dataIndex: 'dayNumber', width: 100 },
    { title: '积分奖励', dataIndex: 'points', width: 100 },
    { title: '经验奖励', dataIndex: 'experience', width: 100 },
    { title: '备注', dataIndex: 'remark', render: renderEllipsis },
    { title: '更新时间', dataIndex: 'updatedAt', width: 180 },
    {
      title: '操作',
      width: 130,
      fixed: 'right',
      render: (_: unknown, record: CheckinRule) => (
        <Space>
          {hasPermission('member:checkin:rule:update') && (
            <Button theme="borderless" size="small" onClick={() => { setEditing(record); setModalVisible(true); }}>
              编辑
            </Button>
          )}
          {hasPermission('member:checkin:rule:delete') && (
            <Button theme="borderless" type="danger" size="small" onClick={() => handleDelete(record)}>
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <SearchToolbar>
        <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={() => void fetchData()}>
          刷新
        </Button>
        {hasPermission('member:checkin:rule:create') && (
          <Button type="primary" icon={<Plus size={14} />} onClick={() => { setEditing(null); setModalVisible(true); }}>
            新增
          </Button>
        )}
      </SearchToolbar>

      <ConfigurableTable
        bordered
        columns={columns}
        dataSource={data}
        loading={loading}
        onRefresh={fetchData}
        refreshLoading={loading}
        rowKey="id"
        size="small"
        pagination={false}
        empty="暂无签到规则"
      />

      <AppModal
        title={editing ? '编辑签到规则' : '新增签到规则'}
        visible={modalVisible}
        width={520}
        closeOnEsc
        onCancel={() => { setModalVisible(false); setEditing(null); }}
        onOk={handleOk}
      >
        <Form
          key={editing?.id ?? 'new'}
          getFormApi={(api) => { formApi.current = api; }}
          initValues={editing ?? { dayNumber: 1, points: 0, experience: 0, remark: '' }}
          labelPosition="left"
          labelWidth={90}
        >
          <Form.InputNumber field="dayNumber" label="天数" min={1} style={{ width: '100%' }} rules={[{ required: true, message: '请输入天数' }]} />
          <Form.InputNumber field="points" label="积分奖励" min={0} style={{ width: '100%' }} rules={[{ required: true, message: '请输入积分奖励' }]} />
          <Form.InputNumber field="experience" label="经验奖励" min={0} style={{ width: '100%' }} rules={[{ required: true, message: '请输入经验奖励' }]} />
          <Form.TextArea field="remark" label="备注" maxCount={256} placeholder="请输入备注" />
        </Form>
      </AppModal>
    </div>
  );
}
