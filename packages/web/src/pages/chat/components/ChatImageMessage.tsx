import { memo, useEffect, useRef, useState } from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { safeLinkUrl } from '@/utils/safe-url';
import { getChatImageHandoff, releaseChatImageHandoff } from '../image-cache';
import { CHAT_IMAGE_MAX_HEIGHT, CHAT_IMAGE_MAX_WIDTH, resolveChatImageBox } from '../utils';

const { Text } = Typography;

/**
 * 图片消息使用固定画布承载真实 img：尺寸先由素材元数据确定，图片加载期间只显示
 * 同一块稳定底色，不挂载 spinner、shimmer 或透明度过渡。这样发送完成时不会因为
 * 占位层、解码状态和图片节点交替挂载而产生额外闪烁。
 */
export const ChatImageMessage = memo(function ChatImageMessage({
  src, name, width, height, onOpen,
}: Readonly<{
  src: string;
  name?: string | null;
  width?: number | null;
  height?: number | null;
  onOpen?: () => void;
}>) {
  const safeSrc = safeLinkUrl(src);
  const handoffPreview = getChatImageHandoff(safeSrc);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [readySrc, setReadySrc] = useState<string | null>(null);
  const remoteImgRef = useRef<HTMLImageElement>(null);
  const box = resolveChatImageBox(width, height);
  const remoteReady = !handoffPreview || readySrc === safeSrc;
  const failed = !safeSrc || failedSrc === safeSrc;

  useEffect(() => {
    if (!safeSrc || !handoffPreview || remoteReady) return;
    const img = remoteImgRef.current;
    if (!img?.complete || img.naturalWidth <= 0) return;
    setReadySrc(safeSrc);
    releaseChatImageHandoff(safeSrc);
  }, [handoffPreview, remoteReady, safeSrc]);

  const handleRemoteLoad = () => {
    if (!safeSrc) return;
    setReadySrc(safeSrc);
    releaseChatImageHandoff(safeSrc);
  };
  const frameStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: box.width,
    height: box.height,
    maxWidth: CHAT_IMAGE_MAX_WIDTH,
    maxHeight: CHAT_IMAGE_MAX_HEIGHT,
    background: 'var(--semi-color-fill-1)',
    borderRadius: 'var(--semi-border-radius-medium)',
    overflow: 'hidden',
  };

  if (failed) {
    return (
      <div style={frameStyle} role="img" aria-label={name ?? '图片'}>
        <Text type="tertiary" style={{ fontSize: 12 }}>图片加载失败</Text>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={name ?? '图片'}
      style={{ background: 'transparent', padding: 0, border: 'none', borderRadius: 0, cursor: 'zoom-in' }}
    >
      <span style={{ ...frameStyle, position: 'relative' }}>
        {handoffPreview && !remoteReady && (
          <img
            src={handoffPreview}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={{
              display: 'block',
              width: box.hasRatio ? '100%' : 'auto',
              height: box.hasRatio ? '100%' : 'auto',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              border: 'none',
              boxShadow: 'none',
            }}
          />
        )}
        <img
          ref={remoteImgRef}
          src={safeSrc}
          alt={name ?? '图片'}
          width={width && width > 0 ? width : undefined}
          height={height && height > 0 ? height : undefined}
          loading="eager"
          decoding="async"
          draggable={false}
          onLoad={handleRemoteLoad}
          onError={() => { if (!handoffPreview) setFailedSrc(safeSrc); }}
          style={{
            display: 'block',
            position: handoffPreview ? 'absolute' : 'relative',
            inset: handoffPreview ? 0 : undefined,
            margin: handoffPreview && !box.hasRatio ? 'auto' : undefined,
            width: box.hasRatio ? '100%' : 'auto',
            height: box.hasRatio ? '100%' : 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            visibility: handoffPreview && !remoteReady ? 'hidden' : 'visible',
            cursor: 'zoom-in',
            border: 'none',
            boxShadow: 'none',
          }}
        />
      </span>
    </button>
  );
});
