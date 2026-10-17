import { Banner, Descriptions, Spin, Tag, Typography } from '@douyinfe/semi-ui';
import type { WorkflowBusinessFormProps } from '@/components/workflow/BusinessFormHost';
import { useAccessRequestDetail } from '@/hooks/queries/identity-access-governance';

const { Text } = Typography;
const RISK_LABELS = { low: '普通', high: '高危', critical: '极高危' } as const;

export default function AccessRequestApprovalView({ bizId }: Readonly<WorkflowBusinessFormProps>) {
  const requestId = Number(bizId);
  const query = useAccessRequestDetail(Number.isInteger(requestId) ? requestId : undefined);
  if (query.isLoading) return <Spin />;
  if (query.error) return <Banner type="warning" closeIcon={null} description={query.error.message} />;
  const request = query.data;
  if (!request) return <Banner type="warning" closeIcon={null} description="权限申请不存在" />;
  return <div style={{ display: 'grid', gap: 16 }}><Descriptions row size="small" data={[{ key: '申请人', value: request.applicantName ?? request.applicantUserId }, { key: '目标用户', value: request.targetUserName ?? request.targetUserId }, { key: '风险等级', value: <Tag color={request.riskLevel === 'critical' ? 'red' : request.riskLevel === 'high' ? 'orange' : 'green'}>{RISK_LABELS[request.riskLevel]}</Tag> }, { key: '有效期', value: `${request.startsAt} 至 ${request.expiresAt}` }, { key: '业务关联', value: request.businessReference || '—' }]} /><div><Text strong>申请原因</Text><div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{request.reason}</div></div><div><Text strong>申请权限</Text><div style={{ display: 'grid', gap: 6, marginTop: 8 }}>{request.items.map((item) => <div key={item.id}><Tag>{item.permissionCode ?? String(item.snapshot.menuTitle ?? item.snapshot.roleName ?? item.itemType)}</Tag>{item.permissionLabel && <Text type="tertiary"> {item.permissionLabel}</Text>}</div>)}</div></div></div>;
}
