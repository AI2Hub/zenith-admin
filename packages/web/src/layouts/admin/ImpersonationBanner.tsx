import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Tag, Toast } from '@douyinfe/semi-ui';
import { VenetianMask } from 'lucide-react';
import dayjs from 'dayjs';
import type { ImpersonationMarker } from '@/lib/impersonation-store';
import { DATE_TIME_FORMAT } from '@/utils/date';
import { formatClock } from '@/utils/format';
import './ImpersonationBanner.css';

const WARN_BEFORE_SECONDS = 5 * 60;

function secondsUntil(expiresAt: string): number {
  const diff = dayjs(expiresAt, DATE_TIME_FORMAT).diff(dayjs(), 'second');
  return Math.max(0, diff);
}

/**
 * 模拟登录常驻横幅：目标身份 / 模式 / 剩余时间 / 操作人 + 结束按钮。
 * 倒计时归零即视为令牌到期，自动结束并回到操作者身份；剩余 5 分钟提醒一次。
 */
export function ImpersonationBanner({
  impersonation,
  onEnd,
  ending,
}: Readonly<{
  impersonation: ImpersonationMarker;
  onEnd: () => void;
  ending: boolean;
}>) {
  const [remaining, setRemaining] = useState(() => secondsUntil(impersonation.expiresAt));
  const warnedRef = useRef(false);
  const expiredRef = useRef(false);

  useEffect(() => {
    setRemaining(secondsUntil(impersonation.expiresAt));
    const timer = setInterval(() => setRemaining(secondsUntil(impersonation.expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [impersonation.expiresAt]);

  useEffect(() => {
    if (remaining > 0 && remaining <= WARN_BEFORE_SECONDS && !warnedRef.current) {
      warnedRef.current = true;
      Toast.warning({ content: `模拟会话将在 ${formatClock(remaining)} 后到期，到期后自动返回你的账号`, duration: 5 });
    }
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      Toast.info({ content: '模拟会话已到期，正在返回你的账号…', duration: 3 });
      onEnd();
    }
  }, [onEnd, remaining]);

  return (
    <Banner
      type="warning"
      className="impersonation-banner"
      icon={<VenetianMask size={15} />}
      style={{ borderRadius: 0 }}
      closeIcon={null}
      description={(
        <span className="impersonation-banner__content">
          <span className="impersonation-banner__text">
            正在以 <strong>{impersonation.targetNickname}（{impersonation.targetUsername}）</strong> 的身份操作
            <Tag size="small" color={impersonation.readOnly ? 'orange' : 'red'} className="impersonation-banner__mode">
              {impersonation.readOnly ? '只读' : '可操作'}
            </Tag>
            <span className="impersonation-banner__meta">剩余 {formatClock(remaining)} · 操作人 {impersonation.operatorUsername}</span>
          </span>
          <Button size="small" theme="solid" type="warning" loading={ending} onClick={onEnd}>
            结束模拟
          </Button>
        </span>
      )}
    />
  );
}
