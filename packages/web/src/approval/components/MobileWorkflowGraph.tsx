import { lazy, Suspense, useState } from 'react';
import { Button, SideSheet, Spin } from '@douyinfe/semi-ui';
import { Minus, Plus, RotateCcw, Workflow } from 'lucide-react';
import type { WorkflowFlowData, WorkflowFormField, WorkflowTask, WorkflowTaskConsult } from '@zenith/shared/workflow';

const WorkflowGraphView = lazy(() => import('@/components/workflow/WorkflowGraphView'));

interface Props {
  flowData: WorkflowFlowData | null | undefined;
  tasks?: WorkflowTask[];
  consults?: WorkflowTaskConsult[];
  instanceStatus?: string;
  formFields?: ReadonlyArray<Pick<WorkflowFormField, 'key' | 'label' | 'type'>>;
  label?: string;
}

/** 移动审批端复用后台的流程图运行态预览，按需加载图编辑依赖。 */
export default function MobileWorkflowGraph({
  flowData,
  tasks,
  consults,
  instanceStatus,
  formFields,
  label = '流程图',
}: Readonly<Props>) {
  const [visible, setVisible] = useState(false);
  const [zoom, setZoom] = useState(0.85);
  const setClampedZoom = (next: number) => setZoom(Math.min(1.4, Math.max(0.6, Number(next.toFixed(2)))));

  return (
    <>
      <Button
        theme="borderless"
        size="small"
        icon={<Workflow size={16} />}
        onClick={() => setVisible(true)}
        aria-label="查看流程图"
      >
        {label}
      </Button>
      <SideSheet
        placement="bottom"
        height="82vh"
        title="流程图"
        visible={visible}
        onCancel={() => setVisible(false)}
        className="ap-sheet"
        bodyStyle={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}
      >
        {visible ? (
          <div className="ap-mobile-graph">
            <div className="ap-mobile-graph__toolbar">
              <span className="ap-mobile-graph__toolbar-label">拖动查看流程，使用缩放调整大小</span>
              <div className="ap-mobile-graph__zoom-controls">
                <Button theme="borderless" size="small" icon={<Minus size={15} />} onClick={() => setClampedZoom(zoom - 0.1)} aria-label="缩小流程图" disabled={zoom <= 0.6} />
                <span className="ap-mobile-graph__zoom-value">{Math.round(zoom * 100)}%</span>
                <Button theme="borderless" size="small" icon={<Plus size={15} />} onClick={() => setClampedZoom(zoom + 0.1)} aria-label="放大流程图" disabled={zoom >= 1.4} />
                <Button theme="borderless" size="small" icon={<RotateCcw size={14} />} onClick={() => setZoom(0.85)} aria-label="重置流程图缩放" />
              </div>
            </div>
            <div className="ap-mobile-graph__viewport">
              <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin size="large" /></div>}>
                <WorkflowGraphView
                  flowData={flowData}
                  tasks={tasks}
                  consults={consults}
                  instanceStatus={instanceStatus}
                  formFields={formFields}
                  zoom={zoom}
                  height="100%"
                />
              </Suspense>
            </div>
          </div>
        ) : null}
      </SideSheet>
    </>
  );
}
