import { Progress } from '@douyinfe/semi-ui';
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
                      const items = uploadingItems.filter((u) => u.convId === activeConvId);
                      if (items.length === 0) return null;
                      return (
                        <div style={{ padding: isQuick ? '4px 12px 8px' : '4px 20px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {items.map((item) => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              {item.type === 'image' ? (
                                <UploadingImagePreview item={item} />
                              ) : (
                                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, padding: '8px 14px', background: 'var(--semi-color-primary-light-default)', border: '1px solid var(--semi-color-primary-light-active)', borderRadius: 'var(--semi-border-radius-large)', maxWidth: 260, fontSize: 13, color: 'var(--semi-color-text-0)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.name}</span>
                                    <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--semi-color-primary)', fontWeight: 600 }}>{item.progress ?? 0}%</span>
                                  </div>
                                  <Progress percent={item.progress ?? 0} size="small" showInfo={false} style={{ margin: 0 }} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
}

/**
 * 上传中图片预览：与最终图片消息同尺寸算法（等比、不放大），
 * 发送完成时占位移除、消息进列表，两者等高、无视觉跳动。
 * 预览不做压暗：压暗会在占位移除的瞬间产生一次亮度跳变，看起来就是「闪一下」。
 */
function UploadingImagePreview({ item }: Readonly<{ item: UploadingItem }>) {
  const box = resolveChatImageBox(item.width, item.height);
  return (
    <div style={{ position: 'relative', width: box.hasRatio ? box.width : 120, height: box.hasRatio ? box.height : 120, flexShrink: 0 }}>
      {item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt={item.name}
          decoding="async"
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--semi-border-radius-medium)', display: 'block' }}
        />
      ) : (
        <div style={{ width: '100%', height: '100%', borderRadius: 'var(--semi-border-radius-medium)', background: 'var(--semi-color-fill-1)' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--semi-border-radius-medium)', background: 'rgba(0,0,0,0.35)', gap: 6 }}>
        <Progress type="circle" percent={item.progress ?? 0} size="small" showInfo={false} stroke="#fff" orbitStroke="rgba(255,255,255,0.25)" />
        <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>{item.progress ?? 0}%</span>
      </div>
    </div>
  );
}
