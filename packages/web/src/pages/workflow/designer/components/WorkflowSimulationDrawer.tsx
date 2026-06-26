/**
 * 流程设计器仿真抽屉：收集测试表单数据并展示 dry-run 时间线。
 */
import { useMemo, useRef, useState } from 'react';
import { Banner, Button, Empty, Select, SideSheet, Space, Spin, Tag, TextArea, Timeline, Toast, Typography } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Flag, Play, Send, XCircle } from 'lucide-react';
import type { WorkflowFlowData, WorkflowFormField, WorkflowSimulationResult } from '@zenith/shared';
import { request } from '@/utils/request';
import WorkflowFormRenderer from './WorkflowFormRenderer';
import { timelineDot } from '@/components/workflow/timeline-dot';

interface UserOption {
  id: number;
  nickname: string;
}

interface WorkflowSimulationDrawerProps {
  visible: boolean;
  definitionId?: number | null;
  flowData: WorkflowFlowData;
  formFields: WorkflowFormField[];
  users: UserOption[];
  loading?: boolean;
  result: WorkflowSimulationResult | null;
  onResult: (result: WorkflowSimulationResult | null) => void;
  onClose: () => void;
}

const RESULT_META: Record<WorkflowSimulationResult['result'], { label: string; color: 'green' | 'red' | 'orange' | 'grey' | 'blue' }> = {
  finished: { label: '已完成', color: 'green' },
  rejected: { label: '已拒绝', color: 'red' },
  waiting: { label: '等待中', color: 'blue' },
  blocked: { label: '已阻塞', color: 'orange' },
  invalid: { label: '配置无效', color: 'red' },
  stepLimit: { label: '超过步数', color: 'orange' },
};

const STATUS_META: Record<WorkflowSimulationResult['timeline'][number]['status'], { label: string; color: string; icon: typeof CheckCircle2 }> = {
  entered: { label: '进入', color: 'var(--semi-color-primary)', icon: Send },
  waiting: { label: '等待', color: 'var(--semi-color-warning)', icon: Clock },
  approved: { label: '通过', color: 'var(--semi-color-success)', icon: CheckCircle2 },
  rejected: { label: '拒绝', color: 'var(--semi-color-danger)', icon: XCircle },
  autoApproved: { label: '自动通过', color: 'var(--semi-color-success)', icon: CheckCircle2 },
  skipped: { label: '跳过', color: 'var(--semi-color-tertiary)', icon: CircleDashed },
  blocked: { label: '阻塞', color: 'var(--semi-color-warning)', icon: AlertTriangle },
};

function parseJsonRecord(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function defaultFormDataFromFields(fields: WorkflowFormField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const visit = (items: WorkflowFormField[]) => {
    for (const field of items) {
      if (field.defaultValue !== undefined) out[field.key] = field.defaultValue;
      if (field.children) visit(field.children);
      if (field.columns) field.columns.forEach((col) => visit(col.fields));
      if (field.panes) field.panes.forEach((pane) => visit(pane.fields));
    }
  };
  visit(fields);
  return out;
}

export default function WorkflowSimulationDrawer({
  visible,
  definitionId,
  flowData,
  formFields,
  users,
  loading = false,
  result,
  onResult,
  onClose,
}: Readonly<WorkflowSimulationDrawerProps>) {
  const formApi = useRef<FormApi | null>(null);
  const [starterUserId, setStarterUserId] = useState<number | undefined>(undefined);
  const [formData, setFormData] = useState<Record<string, unknown>>(() => defaultFormDataFromFields(formFields));
  const [jsonDraft, setJsonDraft] = useState('{}');
  const [submitting, setSubmitting] = useState(false);

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: `${user.nickname} (#${user.id})` })),
    [users],
  );

  const effectiveFormData = async () => {
    if (formFields.length > 0 && formApi.current) {
      const values = await formApi.current.validate() as Record<string, unknown>;
      return values;
    }
    const parsed = parseJsonRecord(jsonDraft);
    if (!parsed) {
      Toast.warning('表单数据必须是 JSON 对象');
      return null;
    }
    return parsed;
  };

  const runSimulation = async () => {
    const values = await effectiveFormData();
    if (!values) return;
    setSubmitting(true);
    try {
      const res = await request.post<WorkflowSimulationResult>('/api/workflows/definitions/simulate', {
        definitionId: definitionId ?? undefined,
        flowData,
        formData: values,
        starterUserId,
        options: {
          maxSteps: 160,
          mockDelay: true,
          mockTrigger: true,
          expandSubProcess: false,
        },
      });
      if (res.code === 0 && res.data) {
        onResult(res.data);
        Toast.success('仿真完成');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetResult = () => {
    onResult(null);
    setJsonDraft('{}');
    setFormData(defaultFormDataFromFields(formFields));
    formApi.current?.reset();
  };

  const renderTimeline = () => {
    if (loading || submitting) {
      return <Spin style={{ width: '100%', padding: '32px 0' }} />;
    }
    if (!result) {
      return <Empty title="尚未开始仿真" description="填写测试数据后运行，可在画布上查看命中路径" />;
    }
    if (result.timeline.length === 0) {
      return <Empty title="没有仿真轨迹" description={result.warnings[0] ?? '流程未产生可执行节点'} />;
    }
    return (
      <Timeline style={{ paddingLeft: 4 }}>
        {result.timeline.map((item) => {
          const meta = STATUS_META[item.status];
          return (
            <Timeline.Item key={`${item.step}-${item.nodeKey}-${item.status}`} dot={timelineDot(meta.icon, meta.color)}>
              <div className="fd-simulation-timeline-item">
                <div className="fd-simulation-timeline-item__head">
                  <Typography.Text strong>{item.nodeName}</Typography.Text>
                  <Tag size="small" color="grey">{item.nodeType}</Tag>
                  <Tag size="small" color={item.status === 'rejected' ? 'red' : item.status === 'waiting' ? 'orange' : 'green'}>
                    {meta.label}
                  </Tag>
                </div>
                {item.assignees && item.assignees.length > 0 && (
                  <Typography.Text size="small" type="tertiary">
                    处理人：{item.assignees.map((user) => user.name).join('、')}
                  </Typography.Text>
                )}
                {item.reason && (
                  <Typography.Text size="small" type="tertiary">
                    {item.reason}
                  </Typography.Text>
                )}
              </div>
            </Timeline.Item>
          );
        })}
        <Timeline.Item dot={timelineDot(Flag, 'var(--semi-color-tertiary)')}>
          <Typography.Text strong>仿真结束</Typography.Text>
        </Timeline.Item>
      </Timeline>
    );
  };

  const resultMeta = result ? RESULT_META[result.result] : null;

  return (
    <SideSheet
      title="流程仿真"
      visible={visible}
      placement="right"
      width={560}
      onCancel={onClose}
      className="fd-simulation-drawer"
      footer={
        <div className="fd-simulation-drawer__footer">
          <Button type="tertiary" theme="borderless" onClick={resetResult}>重置</Button>
          <Space>
            <Button onClick={onClose}>关闭</Button>
            <Button type="primary" icon={<Play size={14} />} loading={submitting} onClick={() => void runSimulation()}>
              开始仿真
            </Button>
          </Space>
        </div>
      }
    >
      <div className="fd-simulation-drawer__body">
        <section className="fd-simulation-section">
          <div className="fd-simulation-section__title">仿真输入</div>
          <Select
            style={{ width: '100%', marginBottom: 12 }}
            placeholder="默认使用当前登录用户发起"
            showClear
            filter
            optionList={userOptions}
            value={starterUserId}
            onChange={(v) => setStarterUserId(typeof v === 'number' ? v : undefined)}
          />
          {formFields.length > 0 ? (
            <div className="fd-simulation-form-box">
              <WorkflowFormRenderer
                fields={formFields}
                initValues={formData}
                getFormApi={(api) => { formApi.current = api; }}
                onValueChange={setFormData}
                labelPosition="top"
              />
            </div>
          ) : (
            <TextArea
              value={jsonDraft}
              onChange={setJsonDraft}
              rows={8}
              placeholder={'{\n  "amount": 1200\n}'}
            />
          )}
        </section>

        <section className="fd-simulation-section">
          <div className="fd-simulation-section__title">
            仿真结果
            {resultMeta && <Tag color={resultMeta.color}>{resultMeta.label}</Tag>}
          </div>
          {result?.warnings.length ? (
            <Banner type={result.valid ? 'warning' : 'danger'} description={result.warnings.join('；')} style={{ marginBottom: 12 }} />
          ) : null}
          {renderTimeline()}
        </section>
      </div>
    </SideSheet>
  );
}
