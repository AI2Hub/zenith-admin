import { Button, Empty, Typography } from '@douyinfe/semi-ui';
import { RefreshCw } from 'lucide-react';
import { emptyIllustration } from '@/components/EmptyIllustration';
import { usePublicMaintenanceStatus } from '@/hooks/queries/maintenance';

const { Text } = Typography;

interface MaintenanceInfo {
  message: string;
  estimatedEndAt: string | null;
  startedAt: string | null;
}

interface Props {
  info: MaintenanceInfo;
}

export default function MaintenanceOverlay({ info }: Readonly<Props>) {
  // 轮询交给查询本身：本组件只在维护生效期间挂载，卸载即自动停止，
  // 无需手写 setInterval。恢复后 App 依据同一份缓存直接停止渲染本遮罩。
  const { isFetching, refetch } = usePublicMaintenanceStatus({ refetchInterval: 30_000 });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-content-bg)',
        padding: 24,
        overflow: 'auto',
      }}
    >
      {/* 维护态复用 Semi 空状态：插画、标题、描述与操作区的间距交给组件默认排版。
          「建设中」表达"正在施工、能力暂不可用"，比「神游四方」的"空/发呆"语义更贴近计划内维护 */}
      <Empty
        {...emptyIllustration('Construction', 160)}
        title="系统维护中"
        description={info.message || '系统正在进行维护升级，请稍后再试。'}
        style={{ maxWidth: 460, width: '100%' }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {info.estimatedEndAt && (
            <div
              style={{
                background: 'var(--semi-color-fill-1)',
                borderRadius: 'var(--semi-border-radius-medium)',
                padding: '10px 20px',
              }}
            >
              <Text type="secondary" size="small">预计恢复时间：</Text>
              <Text strong>{info.estimatedEndAt}</Text>
            </div>
          )}

          <Button
            icon={<RefreshCw size={14} />}
            loading={isFetching}
            onClick={() => void refetch()}
          >
            检查是否恢复
          </Button>

          <Text type="tertiary" size="small">每 30 秒自动检查一次</Text>
        </div>
      </Empty>
    </div>
  );
}
