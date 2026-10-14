import { Progress } from '@douyinfe/semi-ui';
import { UserAvatar } from '@/components/UserAvatar';
import type { UploadingItem } from '../types';
import { resolveChatImageBox } from '../utils';

/** 消息列表底部：当前会话上传中条目进度（自 ChatPage Virtuoso Footer 原样搬移） */
export function UploadingFooter({
  uploadingItems, activeConvId, isQuick,
}: Readonly<{
  uploadingItems: UploadingItem[];
  activeConvId: number | null;
  isQuick: boolean;
}>) {
                      const items = uploadingItems.filter((u) => u.convId === activeConvId && u.type === 'file');
                      if (items.length === 0) return null;
                      return (
                        <div style={{ padding: isQuick ? '4px 12px 8px' : '4px 20px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {items.map((item) => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, padding: '8px 14px', background: 'var(--semi-color-primary-light-default)', border: '1px solid var(--semi-color-primary-light-active)', borderRadius: 'var(--semi-border-radius-large)', maxWidth: 260, fontSize: 13, color: 'var(--semi-color-text-0)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.name}</span>
                                  <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--semi-color-primary)', fontWeight: 600 }}>{item.progress ?? 0}%</span>
                                </div>
                                <Progress percent={item.progress ?? 0} size="small" showInfo={false} style={{ margin: 0 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      );
}

/**
 * 上传中的图片直接作为消息行展示，头像和最终消息从同一帧开始出现。
 * 发送完成后只替换列表数据，不再从 Footer 行跳到消息行。
 */
export function UploadingImageMessage({
  item, userName, userAvatar,
}: Readonly<{
  item: UploadingItem;
  userName: string;
  userAvatar?: string | null;
}>) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row-reverse',
        gap: 8,
        alignItems: 'flex-end',
      }}
      aria-label="图片上传中"
    >
      <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
        <UserAvatar name={userName} avatar={userAvatar} size={32} />
      </span>
      <div style={{ maxWidth: '65%', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', cursor: 'default' }}>
            <UploadingImagePreview item={item} />
          </div>
          <div style={{ display: 'flex', gap: 2, flexShrink: 0, paddingBottom: 2, width: 20 }} />
        </div>
      </div>
    </div>
  );
}

/**
 * 上传中图片预览：尺寸算法与最终图片消息共用。
 * 进度只显示在角标中，不给整张图片加暗色蒙层，完成交接时亮度保持不变。
 */
function UploadingImagePreview({ item }: Readonly<{ item: UploadingItem }>) {
  const box = resolveChatImageBox(item.width, item.height);
  return (
    <div style={{ position: 'relative', width: box.width, height: box.height, flexShrink: 0 }}>
      {item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt={item.name}
          decoding="async"
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'var(--semi-border-radius-medium)', display: 'block', background: 'var(--semi-color-fill-1)' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', borderRadius: 'var(--semi-border-radius-medium)', background: 'var(--semi-color-fill-1)' }} />
      )}
      <div
        role="status"
        aria-label={`图片上传进度 ${item.progress ?? 0}%`}
        style={{
          position: 'absolute',
          right: 6,
          bottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: 68,
          boxSizing: 'border-box',
          justifyContent: 'center',
          padding: '3px 4px',
          borderRadius: 'var(--semi-border-radius-large)',
          background: 'rgba(0,0,0,0.62)',
          color: '#fff',
        }}
      >
        <Progress type="circle" percent={item.progress ?? 0} size="small" showInfo={false} stroke="#fff" orbitStroke="rgba(255,255,255,0.35)" />
        <span style={{ fontSize: 11, fontWeight: 600 }}>{item.progress ?? 0}%</span>
      </div>
    </div>
  );
}
