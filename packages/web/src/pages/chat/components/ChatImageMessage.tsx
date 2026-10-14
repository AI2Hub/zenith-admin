import { useEffect, useState } from 'react';
import { Spin, Typography } from '@douyinfe/semi-ui';
import { safeLinkUrl } from '@/utils/safe-url';
import {
  CHAT_IMAGE_MAX_HEIGHT,
  CHAT_IMAGE_MAX_WIDTH,
  resolveChatImageBox,
} from '../utils';

const { Text } = Typography;

/**
 * 图片消息气泡：按素材宽高比预留固定占位 + 加载淡入，消除图片解码前的
 * 0 高度闪烁与 Virtuoso 列表的布局跳动（CLS）。
 * 有宽高时占位盒与最终图等比等大；无宽高（老数据）时先给默认占位，
 * 加载完成后按自然尺寸收敛。
 */
export function ChatImageMessage({
  src, name, width, height, onOpen,
}: Readonly<{
  src: string;
  name?: string | null;
  width?: number | null;
  height?: number | null;
  onOpen?: () => void;
}>) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setNatural(null);
  }, [src]);

  const box = resolveChatImageBox(width, height);
  // 无宽高时：加载完成后用自然尺寸（同样钳制上限）收敛，避免默认占位与实图比例不一致
  const display = !box.hasRatio && natural
    ? resolveChatImageBox(natural.width, natural.height)
    : box;
  const safeSrc = safeLinkUrl(src);

  if (failed || !safeSrc) {
    return (
      <div
        style={{
          width: display.width,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--semi-color-fill-1)',
          borderRadius: 'var(--semi-border-radius-medium)',
        }}
      >
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
      <span
        style={{
          position: 'relative',
          display: 'block',
          width: display.width,
          height: box.hasRatio ? display.height : undefined,
          minHeight: box.hasRatio ? undefined : 120,
          maxWidth: CHAT_IMAGE_MAX_WIDTH,
          background: loaded ? 'transparent' : 'var(--semi-color-fill-1)',
          borderRadius: 'var(--semi-border-radius-medium)',
          overflow: 'hidden',
          transition: 'background 160ms ease',
        }}
      >
        {!loaded && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: box.hasRatio ? display.width : '100%',
              height: box.hasRatio ? display.height : '100%',
            }}
          >
            <Spin size="small" />
          </span>
        )}
        <img
          src={safeSrc}
          alt={name ?? '图片'}
          loading="eager"
          decoding="async"
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth > 0 && el.naturalHeight > 0) {
              setNatural({ width: el.naturalWidth, height: el.naturalHeight });
            }
            setLoaded(true);
          }}
          onError={() => setFailed(true)}
          style={{
            width: box.hasRatio ? '100%' : undefined,
            height: box.hasRatio ? '100%' : undefined,
            maxWidth: CHAT_IMAGE_MAX_WIDTH,
            maxHeight: CHAT_IMAGE_MAX_HEIGHT,
            objectFit: box.hasRatio ? 'cover' : 'contain',
            display: 'block',
            cursor: 'zoom-in',
            border: 'none',
            boxShadow: 'none',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 160ms ease',
          }}
        />
      </span>
    </button>
  );
}
