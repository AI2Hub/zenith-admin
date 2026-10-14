import type { Setter } from '../types';
import { ThemedEmojiPicker } from './ThemedEmojiPicker';

/** 消息表情回应选择浮层 */
export function ReactionPickerOverlay({
  reactionPickerRef, reactionPickerAnchor, reactionTargetMsgId, handleReaction, setReactionPickerVisible,
}: Readonly<{
  reactionPickerRef: React.RefObject<HTMLDivElement | null>;
  reactionPickerAnchor: { top: number; right: number };
  reactionTargetMsgId: number | null;
  handleReaction: (messageId: number, emoji: string) => void;
  setReactionPickerVisible: Setter<boolean>;
}>) {
  return (
        <div
          ref={reactionPickerRef}
          style={{
            position: 'fixed',
            bottom: window.innerHeight - reactionPickerAnchor.top + 4,
            right: reactionPickerAnchor.right,
            zIndex: 9999,
          }}
        >
          <ThemedEmojiPicker
            onEmojiSelect={(emoji: { native: string }) => {
              if (reactionTargetMsgId !== null) handleReaction(reactionTargetMsgId, emoji.native);
              setReactionPickerVisible(false);
            }}
          />
        </div>
  );
}
