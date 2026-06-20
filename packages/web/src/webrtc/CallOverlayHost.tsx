import { useEffect, useRef } from 'react';
import { Modal, Toast } from '@douyinfe/semi-ui';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { callManager } from './callManager';
import { useCallManager } from './useCallManager';
import { CallWindow } from './CallWindow';
import type { CallParticipant } from './callManager';

/** 远端音频持久播放：独立于可见 UI（最小化后仍可听），统一在此播放避免与视频元素重复出声 */
function RemoteAudio({ participant }: Readonly<{ participant: CallParticipant }>) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && participant.stream && el.srcObject !== participant.stream) {
      el.srcObject = participant.stream;
    }
  }, [participant.stream]);
  return <audio ref={ref} autoPlay style={{ display: 'none' }} />;
}

/**
 * 全局通话宿主：挂载一次（AdminLayout），负责
 * - 注入当前用户身份与 WebSocket 信令
 * - 渲染来电弹窗 / 通话窗口 / 远端音频 / 来电提示音
 */
export default function CallOverlayHost() {
  const { user } = useAuth();
  const snapshot = useCallManager();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // 注入身份
  useEffect(() => {
    if (user?.id) {
      callManager.configure({ userId: user.id, nickname: user.nickname ?? user.username ?? '我', avatar: user.avatar ?? null });
    }
  }, [user?.id, user?.nickname, user?.username, user?.avatar]);

  // 注入信令
  useWebSocket((msg) => { void callManager.handleSignal(msg); });

  // 来电提示音（WebAudio，无需音频资源）
  useEffect(() => {
    const ringing = snapshot.phase === 'incoming' || snapshot.phase === 'outgoing';
    const stop = () => {
      if (ringTimerRef.current) { clearInterval(ringTimerRef.current); ringTimerRef.current = undefined; }
    };
    if (!ringing) { stop(); return; }
    const beep = () => {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        audioCtxRef.current = audioCtxRef.current ?? new Ctor();
        const ctx = audioCtxRef.current;
        void ctx.resume?.();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(snapshot.phase === 'incoming' ? 620 : 440, ctx.currentTime);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.55);
      } catch { /* ignore */ }
    };
    beep();
    ringTimerRef.current = setInterval(beep, snapshot.phase === 'incoming' ? 1500 : 3500);
    return stop;
  }, [snapshot.phase]);

  if (!user?.id) return null;
  const self = { userId: user.id, nickname: user.nickname ?? user.username ?? '我', avatar: user.avatar ?? null };

  const incoming = snapshot.incoming;
  const isIncoming = snapshot.phase === 'incoming' && !!incoming;
  const callerName = incoming?.from.nickname ?? '对方';
  const incomingTitle = incoming?.mode === 'group'
    ? `${incoming.from.nickname} 发起了${incoming.callType === 'video' ? '视频' : '语音'}群通话`
    : `${callerName} 邀请你${incoming?.callType === 'video' ? '视频' : '语音'}通话`;

  return (
    <>
      {/* 远端音频（最小化也持续播放） */}
      {snapshot.participants.map((p) => (
        <RemoteAudio key={p.info.userId} participant={p} />
      ))}

      {/* 来电弹窗 */}
      <Modal
        visible={isIncoming}
        footer={null}
        closable={false}
        maskClosable={false}
        centered
        width={360}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 4px 4px' }}>
          <UserAvatar name={callerName} avatar={incoming?.from.avatar ?? null} size={72} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{incomingTitle}</div>
            {incoming?.mode === 'group' && incoming.conversationName && (
              <div style={{ fontSize: 13, color: 'var(--semi-color-text-2)', marginTop: 4 }}>{incoming.conversationName}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 32, marginTop: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => callManager.reject()}
                style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', background: 'var(--semi-color-danger)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                title="拒绝"
              >
                <PhoneOff size={24} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>拒绝</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => { void callManager.accept().catch((e) => Toast.error(e instanceof Error ? e.message : '接听失败')); }}
                style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', background: 'var(--semi-color-success)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                title="接听"
              >
                {incoming?.callType === 'video' ? <Video size={24} /> : <Phone size={24} />}
              </button>
              <span style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>接听</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* 通话窗口（呼叫中 / 通话中） */}
      {(snapshot.phase === 'outgoing' || snapshot.phase === 'connected') && (
        <CallWindow snapshot={snapshot} self={self} />
      )}
    </>
  );
}
