import { useEffect, useState } from 'react';
import { SideSheet, Spin } from '@douyinfe/semi-ui';
import type { WorkflowInstance, WorkflowDefinition } from '@zenith/shared';
import { request } from '@/utils/request';
import WorkflowInstanceDetailPanel from '@/components/workflow/WorkflowInstanceDetailPanel';

/**
 * 只读流程实例详情抽屉（抄送我的 / 我已办 等场景复用）。
 * 自管理实例与定义的拉取，支持父/子流程跳转。
 */
export default function WorkflowInstanceDetailSheet({
  instanceId,
  visible,
  onClose,
  title = '流程详情',
}: Readonly<{
  instanceId: number | null;
  visible: boolean;
  onClose: () => void;
  title?: string;
}>) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WorkflowInstance | null>(null);
  const [definition, setDefinition] = useState<WorkflowDefinition | null>(null);
  const [viewId, setViewId] = useState<number | null>(instanceId);

  useEffect(() => {
    if (visible) setViewId(instanceId);
  }, [visible, instanceId]);

  useEffect(() => {
    if (!visible || !viewId) return;
    setLoading(true);
    setDefinition(null);
    const p = request.get<WorkflowInstance>(`/api/workflows/instances/${viewId}`)
      .then((res) => {
        if (res.code === 0) {
          setData(res.data);
          if (res.data.definitionSnapshot) return null;
          return request.get<WorkflowDefinition>(`/api/workflows/definitions/${res.data.definitionId}`, { silent: true });
        }
        return null;
      })
      .then((defRes) => { if (defRes?.code === 0) setDefinition(defRes.data); })
      .finally(() => setLoading(false));
    p.catch(() => undefined);
  }, [visible, viewId]);

  return (
    <SideSheet
      title={title}
      visible={visible}
      onCancel={onClose}
      width={760}
      bodyStyle={{ padding: 16 }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      ) : (
        <WorkflowInstanceDetailPanel
          instance={data}
          definition={definition}
          loading={loading}
          onOpenInstance={(id) => setViewId(id)}
        />
      )}
    </SideSheet>
  );
}
