/**
 * 缓存 key 分类元数据：key 去掉命名空间后的首段 → 展示名称与配色。
 *
 * 缓存管理页按此聚合左侧分类；未登记的首段归入「其他」。
 * 新增 Redis key 前缀时在这里登记一次，服务端分类与前端配色同时生效。
 * 名称与首段必须一一对应：按分类删除按 segment 扫描 key，同名会让删除目标产生歧义。
 */
export const CACHE_CATEGORY_COLORS = [
  'amber', 'blue', 'cyan', 'green', 'indigo', 'light-blue', 'light-green',
  'lime', 'orange', 'pink', 'purple', 'red', 'teal', 'violet', 'yellow',
] as const;

export type CacheCategoryColor = (typeof CACHE_CATEGORY_COLORS)[number];

export interface CacheCategoryDefinition {
  /** key 去掉命名空间后的首段 */
  readonly segment: string;
  /** 分类展示名称，全局唯一 */
  readonly label: string;
  /** 左侧分类圆点与详情报头标签配色 */
  readonly color: CacheCategoryColor;
}

export const CACHE_UNCATEGORIZED_LABEL = '其他';

export const CACHE_CATEGORIES: readonly CacheCategoryDefinition[] = [
  // 管理员认证与权限
  { segment: 'session', label: '会话 Token', color: 'blue' },
  { segment: 'refresh', label: '刷新令牌', color: 'light-blue' },
  { segment: 'user-sessions', label: '用户会话索引', color: 'indigo' },
  { segment: 'blacklist', label: '强制下线黑名单', color: 'red' },
  { segment: 'perm', label: '权限缓存', color: 'teal' },
  { segment: 'perm-generation', label: '权限版本', color: 'teal' },
  { segment: 'login_attempt', label: '登录失败计数', color: 'orange' },
  { segment: 'login_sources', label: '登录失败来源', color: 'orange' },
  { segment: 'login_failures', label: '登录失败总量', color: 'orange' },
  { segment: 'login_burst', label: '登录突增告警', color: 'red' },
  { segment: 'login_challenge', label: '登录验证码挑战', color: 'amber' },
  { segment: 'login_lock', label: '登录锁定', color: 'amber' },
  { segment: 'captcha', label: '图形验证码', color: 'cyan' },
  { segment: 'access-approval-mfa', label: '敏感操作验证', color: 'violet' },
  { segment: 'oauth-state', label: 'OAuth 登录状态', color: 'violet' },
  { segment: 'mfa-challenge', label: 'MFA 验证挑战', color: 'violet' },
  { segment: 'session-conflict', label: '会话冲突票据', color: 'blue' },
  // SSO 身份提供方
  { segment: 'idp-oidc-state', label: 'OIDC 登录状态', color: 'violet' },
  { segment: 'idp-saml-state', label: 'SAML 登录状态', color: 'violet' },
  { segment: 'idp-saml-request', label: 'SAML 认证请求', color: 'violet' },
  { segment: 'idp-saml-login-ticket', label: 'SAML 登录票据', color: 'violet' },
  // 请求防护
  { segment: 'rl', label: '接口限流计数', color: 'green' },
  { segment: 'rlban', label: '接口封禁', color: 'red' },
  { segment: 'rlstats', label: '限流统计', color: 'lime' },
  { segment: 'idempotency', label: '幂等控制', color: 'cyan' },
  // 会员体系
  { segment: 'member-session', label: '会员会话', color: 'light-blue' },
  { segment: 'member-refresh', label: '会员刷新令牌', color: 'light-blue' },
  { segment: 'member-sessions', label: '会员会话索引', color: 'indigo' },
  { segment: 'member-blacklist', label: '会员下线黑名单', color: 'red' },
  { segment: 'member', label: '会员安全', color: 'orange' },
  // AI 服务
  { segment: 'ai', label: 'AI 服务', color: 'purple' },
  // 开放平台
  { segment: 'openrl', label: '开放平台限流', color: 'indigo' },
  { segment: 'opennonce', label: '开放平台防重放', color: 'indigo' },
  { segment: 'openquota-gate', label: '开放平台配额告警', color: 'indigo' },
  { segment: 'openquota-exceeded', label: '开放平台配额超限', color: 'red' },
  // 工作流
  { segment: 'wf', label: '工作流自动化', color: 'pink' },
  { segment: 'wfconn', label: '工作流连接器', color: 'pink' },
  // 内容与数据
  { segment: 'mp', label: '公众号凭证', color: 'light-green' },
  { segment: 'report', label: '报表中心', color: 'yellow' },
  { segment: 'analytics', label: '埋点分析', color: 'cyan' },
  { segment: 'cms', label: 'CMS 站点缓存', color: 'green' },
  { segment: 'drive', label: '企业网盘临时态', color: 'light-blue' },
  { segment: 'shortlink', label: '短链跳转缓存', color: 'cyan' },
  { segment: 'iot', label: '物联网运行态', color: 'green' },
];

export const CACHE_CATEGORY_BY_SEGMENT: Readonly<Record<string, CacheCategoryDefinition>> = Object.fromEntries(
  CACHE_CATEGORIES.map((category) => [category.segment, category]),
);

export const CACHE_CATEGORY_COLOR_BY_LABEL: Readonly<Record<string, CacheCategoryColor>> = Object.fromEntries(
  CACHE_CATEGORIES.map((category) => [category.label, category.color]),
);

/** key 首段 → 分类名称；未登记返回「其他」 */
export function getCacheCategoryLabel(segment: string): string {
  return CACHE_CATEGORY_BY_SEGMENT[segment]?.label ?? CACHE_UNCATEGORIZED_LABEL;
}
