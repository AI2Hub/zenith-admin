import { Banner, Spin } from '@douyinfe/semi-ui';
import type { WorkflowBusinessFormProps } from '@/components/workflow/BusinessFormHost';
import { useBizLeaveDetail } from '@/hooks/queries/biz-leave';
import LeaveDetails from './LeaveDetails';

/** 指定审批轮次的当前业务资料；流程信息由审批容器展示。 */
export default function LeaveApprovalView({ bizId, instanceId }: Readonly<WorkflowBusinessFormProps>) {
  const detailQuery = useBizLeaveDetail(bizId, instanceId ?? undefined);
  if (detailQuery.isLoading) return <Spin />;
  if (detailQuery.error) return <Banner type="warning" closeIcon={null} description={detailQuery.error.message} />;
  return <LeaveDetails data={detailQuery.data} />;
}
