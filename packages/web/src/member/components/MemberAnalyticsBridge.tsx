/**
 * 会员前台埋点桥接组件：挂载于 MemberAuthProvider + HashRouter 内部，负责：
 * - 路由标题映射 + 页面浏览/离开自动采集（仅在用户同意后才记录，usePageTracker 的 enabled 参数）
 * - 登录/注册后使用 identifyMember 关联会员身份（distinctId 前缀 `m:`，触发携带会员 token 的配置重拉）
 * - 退出登录后身份重置（logout 已在移除 token 前调用 prepareTrackerLogout，这里负责 reset）
 *
 * 仅需在 MemberApp 顶层挂载一次，不应逐页重复调用。
 */
import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageTracker } from '@/hooks/usePageTracker';
import { identifyMember, resetIdentity } from '@/utils/tracker';
import { useMemberAuth } from '../hooks/useMemberAuth';
import { useAnalyticsConsent } from '../hooks/useAnalyticsConsent';

// 集中维护的路由 → 页面标题映射，避免逐页重复接入 usePageTracker
const ROUTE_TITLES: Record<string, string> = {
  '/': '会员中心-落地页',
  '/features': '会员中心-权益说明',
  '/levels': '会员中心-等级说明',
  '/promotions': '会员中心-优惠活动',
  '/about': '会员中心-关于我们',
  '/forgot-password': '会员中心-忘记密码',
  '/home': '会员中心-首页',
  '/points': '会员中心-积分',
  '/wallet': '会员中心-钱包',
  '/coupons': '会员中心-优惠券',
  '/checkin': '会员中心-签到',
  '/level': '会员中心-等级详情',
  '/messages': '会员中心-消息通知',
  '/invite': '会员中心-邀请好友',
  '/profile': '会员中心-个人资料',
  '/profile/edit': '会员中心-编辑资料',
  '/profile/password': '会员中心-修改密码',
  '/login-history': '会员中心-登录历史',
};

export function MemberAnalyticsBridge() {
  const location = useLocation();
  const { member } = useMemberAuth();
  const { status } = useAnalyticsConsent();
  const consented = status === 'accepted';

  const pageTitle = useMemo(() => ROUTE_TITLES[location.pathname] ?? location.pathname, [location.pathname]);
  usePageTracker(pageTitle, consented);

  useEffect(() => {
    if (member) identifyMember(member.id, member.nickname || member.username || undefined);
    else resetIdentity();
  }, [member]);

  return null;
}
