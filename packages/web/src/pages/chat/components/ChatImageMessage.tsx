import { memo, useEffect, useRef, useState } from 'react';
import { Typography } from '@douyinfe/semi-ui';
import { safeLinkUrl } from '@/utils/safe-url';
import { isChatImageReady, markChatImageReady, warmChatImage } from '../image-cache';
import { CHAT_IMAGE_MAX_HEIGHT, CHAT_IMAGE_MAX_WIDTH, resolveChatImageBox } from '../utils';

const { Text } = Typography;

interface ImageRenderState {
  /** 状态对应的 src：切源时在渲染期直接重置，不留旧状态的一帧 */
  src: string;
  loaded: boolean;
  failed: boolean;
  natural: { width: number; height: number } | null;
}

function initialState(src: string): ImageRenderState {
  return { src, loaded: isChatImageReady(src), failed: false, natural: null };
}

/**
 * 图片消息气泡：按素材宽高比预留固定占位，消除图片到位前的 0 高度闪烁与
 * Virtuoso 列表的布局跳动（CLS）。
 *
 * 占位与成像之间不做任何过渡——两者在同一帧切换才是无闪烁的前提：
 * 发送流程已把图片预热到「可绘制」，首帧即命中 `image-cache`，此时既不渲染
 * 占位也不做淡入；真正需要等待的慢图（对方发来的、历史里滚回来的）才显示
 * 带延迟微光的占位。
 * 有宽高时占位盒与最终图等比等大；无宽高（老数据）时先给默认占位，
 * 加载完成后按自然尺寸收敛。
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
  const [state, setState] = useState<ImageRenderState>(() => initialState(safeSrc ?? ''));
  // 渲染期派生重置：走 useEffect 会先提交一帧旧状态，那正是「闪一下」的来源
  if (state.src !== safeSrc) setState(initialState(safeSrc ?? ''));
  const { loaded, failed, natural } = state;

  const imgRef = useRef<HTMLImageElement>(null);

  // 未就绪的图片顺手预热：虚拟列表滚走再滚回来时同样首帧成像
  useEffect(() => {
    if (!safeSrc || loaded || failed) return;
    void warmChatImage(safeSrc);
  }, [safeSrc, loaded, failed]);

  // 命中缓存的图片可能在 React 挂上监听前就完成加载、load 事件不再到达，用 complete 兜底
  useEffect(() => {
    const el = imgRef.current;
    if (!el || loaded || failed || !el.complete) return;
    setState((prev) => (prev.loaded || prev.failed ? prev : { ...prev, loaded: el.naturalWidth > 0, failed: el.naturalWidth === 0 }));
  }, [loaded, failed]);

  const box = resolveChatImageBox(width, height);
  // 无宽高时：加载完成后用自然尺寸（同样钳制上限）收敛，避免默认占位与实图比例不一致
  const display = !box.hasRatio && natural
    ? resolveChatImageBox(natural.width, natural.height)
    : box;

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
          // 就绪那一帧随图片一起让出底色（供透明 PNG 透出气泡背景），不加过渡：
          // 过渡会在图片上方叠一层灰底淡出，看起来就是整块图闪了一下
          background: loaded ? 'transparent' : 'var(--semi-color-fill-1)',
          borderRadius: 'var(--semi-border-radius-medium)',
          overflow: 'hidden',
        }}
      >
        {!loaded && <span className="chat-image-placeholder" />}
        <img
          ref={imgRef}
          src={safeSrc}
          alt={name ?? '图片'}
          loading="eager"
          decoding="async"
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            markChatImageReady(safeSrc);
            setState((prev) => (prev.loaded
              ? prev
              : {
                ...prev,
                loaded: true,
                natural: el.naturalWidth > 0 && el.naturalHeight > 0
                  ? { width: el.naturalWidth, height: el.naturalHeight }
                  : prev.natural,
              }));
          }}
          onError={() => setState((prev) => (prev.failed ? prev : { ...prev, failed: true }))}
          style={{
            position: 'relative',
            width: box.hasRatio ? '100%' : undefined,
            height: box.hasRatio ? '100%' : undefined,
            maxWidth: CHAT_IMAGE_MAX_WIDTH,
            maxHeight: CHAT_IMAGE_MAX_HEIGHT,
            objectFit: box.hasRatio ? 'cover' : 'contain',
            display: 'block',
            cursor: 'zoom-in',
            border: 'none',
            boxShadow: 'none',
          }}
        />
      </span>
    </button>
  );
});
