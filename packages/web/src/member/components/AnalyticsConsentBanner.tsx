/**
 * 会员前台体验分析同意提示条：仅在用户尚未表态时显示。
 * 用户完成选择后，后续修改入口位于「个人设置」。
 */
import { ShieldCheck } from 'lucide-react';
import { Button } from '@douyinfe/semi-ui';
import { useState } from 'react';
import { useAnalyticsConsent } from '../hooks/useAnalyticsConsent';

const CONSENT_DESCRIPTION = '为了持续改善会员中心的使用体验，我们希望收集你的匿名页面浏览与功能点击等行为数据，仅用于产品分析，不会用于身份识别之外的用途。';

function ConsentActions({ onReject, onAccept }: Readonly<{ onReject: () => void; onAccept: () => void }>) {
  return (
    <div className="mc-consent-banner-actions">
      <Button type="tertiary" onClick={onReject} aria-label="拒绝体验分析采集">暂不同意</Button>
      <Button type="primary" onClick={onAccept} aria-label="同意体验分析采集">同意</Button>
    </div>
  );
}

export function AnalyticsConsentBanner() {
  const { status, accept, reject } = useAnalyticsConsent();

  if (status !== 'unknown') return null;

  return (
    <div className="mc-consent-banner" role="region" aria-label="体验分析同意提示">
      <div className="mc-consent-banner-text">
        <ShieldCheck size={18} className="mc-consent-banner-icon" aria-hidden="true" />
        <span>{CONSENT_DESCRIPTION} 你可以在个人设置中随时更改此项设置。</span>
      </div>
      <ConsentActions onReject={reject} onAccept={accept} />
    </div>
  );
}

export function AnalyticsConsentSettings() {
  const { status, accept, reject } = useAnalyticsConsent();
  const [editing, setEditing] = useState(status === 'unknown');

  if (editing) {
    return (
      <div className="mc-consent-settings-card" role="region" aria-label="体验分析设置">
        <div className="mc-consent-settings-content">
          <ShieldCheck size={18} className="mc-consent-banner-icon" aria-hidden="true" />
          <div>
            <div className="mc-consent-settings-title">体验分析设置</div>
            <div className="mc-consent-settings-description">{CONSENT_DESCRIPTION}</div>
          </div>
        </div>
        <ConsentActions
          onReject={() => { reject(); setEditing(false); }}
          onAccept={() => { accept(); setEditing(false); }}
        />
      </div>
    );
  }

  return (
    <div className="mc-consent-settings-card" role="region" aria-label="体验分析设置">
      <div className="mc-consent-settings-content">
        <ShieldCheck size={18} className="mc-consent-banner-icon" aria-hidden="true" />
        <div>
          <div className="mc-consent-settings-title">体验分析设置</div>
          <div className="mc-consent-settings-description">
            当前状态：{status === 'accepted' ? '已同意匿名体验分析' : '暂不同意体验分析采集'}
          </div>
        </div>
      </div>
      <Button theme="borderless" size="small" onClick={() => setEditing(true)} aria-label="修改体验分析设置">
        修改设置
      </Button>
    </div>
  );
}
