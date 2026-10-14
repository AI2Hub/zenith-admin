import { useEffect } from 'react';
import type { PendingImage, Setter } from '../types';

/** 覆盖层与引用同步：emoji/reaction 外点关闭、pendingImagesRef 同步、卸载回收预览 URL */
export function useOverlayDismiss({
  emojiVisible, setEmojiVisible, emojiContainerRef, emojiPickerRef, reactionPickerVisible, setReactionPickerVisible,
  reactionPickerRef, pendingImages, pendingImagesRef,
}: {
  emojiVisible: boolean;
  setEmojiVisible: Setter<boolean>;
  emojiContainerRef: React.RefObject<HTMLDivElement | null>;
  emojiPickerRef: React.RefObject<HTMLDivElement | null>;
  reactionPickerVisible: boolean;
  setReactionPickerVisible: Setter<boolean>;
  reactionPickerRef: React.RefObject<HTMLDivElement | null>;
  pendingImages: PendingImage[];
  pendingImagesRef: React.RefObject<PendingImage[]>;
}) {
  // 点击 emoji 选择器外部时关闭
  useEffect(() => {
    if (!emojiVisible) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inButton = emojiContainerRef.current?.contains(target);
      const inPicker = emojiPickerRef.current?.contains(target);
      if (!inButton && !inPicker) setEmojiVisible(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [emojiVisible]);

  // 点击 reaction picker 外部时关闭
  useEffect(() => {
    if (!reactionPickerVisible) return;
    const handler = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setReactionPickerVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [reactionPickerVisible]);

  useEffect(() => {
    pendingImagesRef.current = pendingImages;
  }, [pendingImages]);

  useEffect(() => () => {
    pendingImagesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);
}
