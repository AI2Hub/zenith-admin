import { useEffect, useRef } from 'react';
import { UserAvatar } from '@/components/UserAvatar';
import { MicOff } from 'lucide-react';

/** 单个参与者画面：有视频轨显示视频，否则显示头像 */
export function MediaTile({
  stream, name, avatar, muted, mirror, label, showAvatarFallback = true, audioOnly,
}: Readonly<{
  stream: MediaStream | null;
  name: string;
  avatar?: string | null;
  /** 本地预览需静音避免回声 */
  muted?: boolean;
  mirror?: boolean;
  label?: string;
  showAvatarFallback?: boolean;
  /** 标记该参与者麦克风关闭（角标） */
  audioOnly?: boolean;
}>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#1c1c20', borderRadius: 'var(--semi-border-radius-large)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          transform: mirror ? 'scaleX(-1)' : undefined,
          display: hasVideo ? 'block' : 'none',
        }}
      />
      {!hasVideo && showAvatarFallback && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <UserAvatar name={name} avatar={avatar ?? null} size={64} />
        </div>
      )}
      {label && (
        <div style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 'var(--semi-border-radius-medium)', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 12, maxWidth: 'calc(100% - 16px)' }}>
          {audioOnly && <MicOff size={12} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        </div>
      )}
    </div>
  );
}
