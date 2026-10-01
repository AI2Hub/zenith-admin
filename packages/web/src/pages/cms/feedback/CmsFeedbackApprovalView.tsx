import { Banner } from '@douyinfe/semi-ui';
import PageLoading from '@/components/PageLoading';
import type { WorkflowBusinessFormProps } from '@/components/workflow/BusinessFormHost';
import { useCmsFeedbackApprovalDetail } from '@/hooks/queries/cms-operations';
import { CmsFeedbackDetails } from '../CmsFeedbackSheet';

export default function CmsFeedbackApprovalView({ bizId, instanceId }: Readonly<WorkflowBusinessFormProps>) {
  const query = useCmsFeedbackApprovalDetail(bizId ? Number(bizId) : undefined, instanceId ?? undefined);
  if (query.isLoading) return <PageLoading inline />;
  if (!query.data) return <Banner type="warning" description={query.error?.message ?? '无法读取来信办理资料'} />;
  return <CmsFeedbackDetails feedback={query.data} />;
}
