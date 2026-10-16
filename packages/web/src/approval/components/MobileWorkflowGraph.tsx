import { lazy, Suspense, useRef, useState, type PointerEvent } from 'react';
import { Button, SideSheet, Spin } from '@douyinfe/semi-ui';
import { Minus, Plus, RotateCcw, Workflow } from 'lucide-react';
import type { WorkflowFlowData, WorkflowFormField, WorkflowTask, WorkflowTaskConsult } from '@zenith/shared/workflow';

const WorkflowGraphView = lazy(() => import('@/components/workflow/WorkflowGraphView'));

type Point = { x: number; y: number };
type Gesture =
  | { mode: 'pan'; startPoint: Point; startPan: Point }
  | { mode: 'pinch'; startCenter: Point; startDistance: number; startPan: Point; startZoom: number };

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function center(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

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
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const setClampedZoom = (next: number) => setZoom(Math.min(1.4, Math.max(0.6, Number(next.toFixed(2)))));
  const openGraph = () => {
    setPan({ x: 0, y: 0 });
    setZoom(0.85);
    setVisible(true);
  };
  const resetGraph = () => {
    setPan({ x: 0, y: 0 });
    setZoom(0.85);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 1) {
      gesture.current = { mode: 'pan', startPoint: points[0], startPan: pan };
    } else if (points.length >= 2) {
      gesture.current = {
        mode: 'pinch',
        startCenter: center(points[0], points[1]),
        startDistance: Math.max(distance(points[0], points[1]), 1),
        startPan: pan,
        startZoom: zoom,
      };
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const activeGesture = gesture.current;
    if (!activeGesture) return;
    if (activeGesture.mode === 'pan' && points.length === 1) {
      setPan({
        x: activeGesture.startPan.x + points[0].x - activeGesture.startPoint.x,
        y: activeGesture.startPan.y + points[0].y - activeGesture.startPoint.y,
      });
      return;
    }
    if (activeGesture.mode === 'pinch' && points.length >= 2) {
      const currentCenter = center(points[0], points[1]);
      const currentDistance = Math.max(distance(points[0], points[1]), 1);
      setClampedZoom(activeGesture.startZoom * currentDistance / activeGesture.startDistance);
      setPan({
        x: activeGesture.startPan.x + currentCenter.x - activeGesture.startCenter.x,
        y: activeGesture.startPan.y + currentCenter.y - activeGesture.startCenter.y,
      });
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const remaining = [...pointers.current.values()];
    if (remaining.length === 1) {
      gesture.current = { mode: 'pan', startPoint: remaining[0], startPan: pan };
    } else {
      gesture.current = null;
    }
  };

  return (
    <>
      <Button
        theme="borderless"
        size="small"
        icon={<Workflow size={16} />}
        onClick={openGraph}
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
                <Button theme="borderless" size="small" icon={<RotateCcw size={14} />} onClick={resetGraph} aria-label="重置流程图缩放和位置" />
              </div>
            </div>
            <div
              className="ap-mobile-graph__viewport"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              aria-label="流程图画布，可拖动查看"
            >
              <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin size="large" /></div>}>
                <WorkflowGraphView
                  flowData={flowData}
                  tasks={tasks}
                  consults={consults}
                  instanceStatus={instanceStatus}
                  formFields={formFields}
                  zoom={zoom}
                  pan={pan}
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
