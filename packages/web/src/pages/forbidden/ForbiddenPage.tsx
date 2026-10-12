import { useNavigate } from 'react-router-dom';
import { Button } from '@douyinfe/semi-ui';
import ErrorStatePage from '@/components/ErrorStatePage';
import { emptyIllustration } from '@/components/EmptyIllustration';

export default function ForbiddenPage() {
  const navigate = useNavigate();
  // 越权访问语义事件：让 403 拦截在事件分析中可按 page_forbidden 单独统计
  return (
    <ErrorStatePage
      {...emptyIllustration('NoAccess', 200)}
      title="没有访问权限"
      description="您没有权限访问此页面，可通过站内信联系管理员申请权限"
      trackEventName="page_forbidden"
      extra={<Button onClick={() => navigate('/inbox')}>前往消息中心</Button>}
    />
  );
}
