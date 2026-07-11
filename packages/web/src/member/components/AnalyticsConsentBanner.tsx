/**
 * 会员前台体验分析同意提示条：仅在同意状态为 unknown 时显示，
 * 接受/拒绝都会持久化到 localStorage 并关闭提示条，不会反复打扰用户。
 */
import { ShieldCheck } from 'lucide-react';
import { Button } from '@douyinfe/semi-ui';
import { useState } from 'react';
import { useAnalyticsConsent } from '../hooks/useAnalyticsConsent';

export function AnalyticsConsentBanner() {
  const { status, accept, reject } = useAnalyticsConsent();
  const [editing, setEditing] = useState(false);

  if (status !== 'unknown' && !editing) {
    return (
      <Button
        className="mc-consent-settings-button"
        theme="borderless"
        size="small"
        icon={<ShieldCheck size={14} />}
        onClick={() => setEditing(true)}
        aria-label="修改体验分析设置"
      >
        体验分析设置
      </Button>
    );
  }

  const handleReject = () => {
    reject();
    setEditing(false);
  };
  const handleAccept = () => {
    accept();
    setEditing(false);
  };

  return (
    <div className="mc-consent-banner" role="region" aria-label="体验分析同意提示">
      <div className="mc-consent-banner-text">
        <ShieldCheck size={18} className="mc-consent-banner-icon" aria-hidden="true" />
        <span>
          为了持续改善会员中心的使用体验，我们希望收集你的匿名页面浏览与功能点击等行为数据，仅用于产品分析，不会用于身份识别之外的用途。你可以随时更改此项设置。
        </span>
      </div>
      <div className="mc-consent-banner-actions">
        <Button type="tertiary" onClick={handleReject} aria-label="拒绝体验分析采集">暂不同意</Button>
        <Button type="primary" onClick={handleAccept} aria-label="同意体验分析采集">同意</Button>
      </div>
    </div>
  );
}
