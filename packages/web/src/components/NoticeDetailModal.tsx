import DOMPurify from 'dompurify';
import { Button, Tag, Space, Modal, Typography, Divider } from '@douyinfe/semi-ui';
import type { TagColor } from '@douyinfe/semi-ui/lib/es/tag';
import { BookOpen, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Notice } from '@zenith/shared';
import { formatDateTime } from '@/utils/date';

const { Text } = Typography;

type NoticeWithRead = Notice & { isRead?: boolean };

const TYPE_MAP: Record<string, { label: string; color: TagColor }> = {
  notice: { label: '通知', color: 'blue' },
  announcement: { label: '公告', color: 'cyan' },
  warning: { label: '预警', color: 'orange' },
};

const PRIORITY_MAP: Record<string, { label: string; color: TagColor }> = {
  high: { label: '紧急', color: 'red' },
  medium: { label: '重要', color: 'orange' },
  low: { label: '普通', color: 'cyan' },
};

interface NoticeDetailModalProps {
  visible: boolean;
  notice: NoticeWithRead | null;
  onClose: () => void;
  /** 上一条回调，传入时显示导航按钮 */
  onPrev?: () => void;
  /** 下一条回调，传入时显示导航按钮*/
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** 分页文字，如 "2 / 10" */
  indexLabel?: string;
}

export default function NoticeDetailModal({
  visible,
  notice,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  indexLabel,
}: NoticeDetailModalProps) {
  const hasNav = onPrev !== undefined && onNext !== undefined;

  const typeInfo = notice
    ? (TYPE_MAP[notice.type] ?? { label: notice.type, color: 'blue' as TagColor })
    : null;
  const priorityInfo = notice
    ? (PRIORITY_MAP[notice.priority] ?? { label: notice.priority, color: 'grey' as TagColor })
    : null;

  const footer = hasNav ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Space>
        <Button
          icon={<ChevronLeft size={14} />}
          disabled={!hasPrev}
          onClick={onPrev}
        >上一条</Button>
        <Button
          icon={<ChevronRight size={14} />}
          iconPosition="right"
          disabled={!hasNext}
          onClick={onNext}
        >下一条</Button>
      </Space>
      <Space>
        {indexLabel && <Text type="tertiary" size="small">{indexLabel}</Text>}
        <Button onClick={onClose}>关闭</Button>
      </Space>
    </div>
  ) : (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Button onClick={onClose}>关闭</Button>
    </div>
  );

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      width={640}
      title={
        <Space spacing={8}>
          <BookOpen size={16} strokeWidth={1.5} style={{ color: 'var(--semi-color-primary)', flexShrink: 0 }} />
          <span>{notice?.title ?? ''}</span>
        </Space>
      }
      footer={footer}
      closeOnEsc
    >
      {notice && (
        <div>
          {/* 元信息区 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: '1px solid var(--semi-color-border)',
          }}>
            {typeInfo && <Tag size="small" color={typeInfo.color}>{typeInfo.label}</Tag>}
            {priorityInfo && <Tag size="small" color={priorityInfo.color}>{priorityInfo.label}</Tag>}
            <Divider layout="vertical" style={{ height: 12, margin: '0 2px' }} />
            <Space spacing={4}>
              <Clock size={12} strokeWidth={1.5} style={{ color: 'var(--semi-color-text-2)', flexShrink: 0 }} />
              <Text type="tertiary" size="small">
                {formatDateTime(notice.publishTime ?? notice.createdAt)}
              </Text>
            </Space>
            {notice.isRead !== undefined && (
              <div style={{ marginLeft: 'auto' }}>
                <Tag color={notice.isRead ? 'grey' : 'blue'} size="small">
                  {notice.isRead ? '已读' : '未读'}
                </Tag>
              </div>
            )}
          </div>
          {/* 正文区 */}
          <div
            style={{
              lineHeight: 1.9,
              color: 'var(--semi-color-text-0)',
              minHeight: 80,
              fontSize: 14,
              padding: '0 2px',
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(notice.content) }}
          />
        </div>
      )}
    </Modal>
  );
}
