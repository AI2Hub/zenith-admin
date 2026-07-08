import { useContext, createContext } from 'react';
import type { ThemeMode } from '@/hooks/useTheme';

export type NavLayout = 'vertical' | 'horizontal' | 'mixed' | 'double';
export type TabAnimation = 'none' | 'fade' | 'slide' | 'scale';
export type TabStyle = 'line' | 'pill' | 'card' | 'chrome';
export type TableSizePreference = 'small' | 'default' | 'middle';
export type RouteAnimation = 'none' | 'fade' | 'slide-up' | 'slide-left';
export type BorderRadiusPreference = 'none' | 'small' | 'medium' | 'large';

/** Web 终端文件夹收藏项 */
export interface TerminalFavorite {
  /** 目录绝对路径 */
  path: string;
  /** 展示名称 */
  name: string;
}

export type TerminalTabPosition = 'top' | 'left' | 'right' | 'bottom';

/** Web 终端个性化配置 */
export interface TerminalPreferences {
  /** 默认 shell id（空字符串表示用服务端探测到的默认值） */
  defaultShell: string;
  /** 暗色模式下使用的主题 id */
  themeDark: string;
  /** 亮色模式下使用的主题 id */
  themeLight: string;
  /** 字号 */
  fontSize: number;
  /** 字体 */
  fontFamily: string;
  /** 行高 */
  lineHeight: number;
  /** 文件夹收藏列表 */
  favorites: TerminalFavorite[];
  /** 标签栏位置（top / right / bottom），默认 top */
  tabPosition: TerminalTabPosition;
  /** 右侧标签栏是否折叠为仅图标模式（仅 tabPosition=right 时生效） */
  tabCollapsed: boolean;
  /** 滚回缓冲区行数（默认 5000） */
  scrollback: number;
  /** 光标样式 */
  cursorStyle: 'block' | 'underline' | 'bar';
  /** 光标是否闪烁 */
  cursorBlink: boolean;
  /** 选中文本时自动复制到剪贴板 */
  copyOnSelect: boolean;
  /** 渲染模式：canvas（默认）或 webgl（性能更好，部分环境不支持） */
  rendererType: 'canvas' | 'webgl';
  /** 按住 Alt 快速滚动时的行数倍率（默认 5） */
  fastScrollSensitivity: number;
  /** 字母间距（px，默认 0） */
  letterSpacing: number;
  /** 字体粗细，如 'normal'、'bold'、'600' */
  fontWeight: string;
  /** 右键是否选词（false = 弹出浏览器菜单） */
  rightClickSelectsWord: boolean;
  /** 最小对比度（1–21，1 = 不限制） */
  minimumContrastRatio: number;
  /** 是否显示终端底部状态栏 */
  showStatusBar: boolean;
}

export interface UserPreferences {
  enableTabs: boolean;
  keepTabs: boolean;
  /** 页面缓存：菜单开启 keepAlive 的页面在切换页签时保留组件状态（React Activity） */
  enablePageCache: boolean;
  tabsMaxCount: number;
  showTabIcon: boolean;
  tabStyle: TabStyle;
  navLayout: NavLayout;
  showBreadcrumb: boolean;
  /** 面包屑是否显示图标 */
  breadcrumbIcon: boolean;
  /** 面包屑导航是否从首页开始（显示首页作为第一项） */
  breadcrumbShowHome: boolean;
  tabAnimation: TabAnimation;
  colorMode: ThemeMode;
  themeColor: string;
  sidebarDarkMode: boolean;
  headerDarkMode: boolean;
  showMenuSearch: boolean;
  showFullscreen: boolean;
  showQuickChat: boolean;
  showLogo: boolean;
  /** 显示收藏快捷入口（面包屑收藏按鈕 + 顶部 Popover） */
  showFavorites: boolean;
  dynamicTitle: boolean;
  filesViewMode: 'list' | 'grid';
  sidebarStickyScroll: boolean;
  showTableColumnSettings: boolean;
  tableBordered: boolean;
  tableStriped: boolean;
  tableSize: TableSizePreference;
  /** 列表默认分页大小 */
  tablePageSize: number;
  enableLockScreen: boolean;
  /** 侧边栏手风琴展开：同级只允许展开一个子菜单 */
  sidebarAccordion: boolean;
  /** 侧边栏悬浮模式：开启后，侧边栏居按展开，鼠标入内时临时滑出，移开则自动收起 */
  sidebarHoverTrigger: boolean;
  /** 面包屑可点击跳转：false 时仅展示文字路径，防止误触导致表单中断 */
  breadcrumbClickable: boolean;
  /** 项目目录节点的子菜单 Popover */
  breadcrumbSubMenu: boolean;
  /** 新开标签页插入行为：append 数尾 / insert-next 现当前标签页后插入 */
  openTabBehavior: 'append' | 'insert-next';
  /** 菜单选中时自动滚动到可视区 */
  scrollMenuIntoView: boolean;
  /** 双击页签行为：refresh 刷新 / close 关闭 / none 无 */
  tabDoubleClickAction: 'refresh' | 'close' | 'none';
  /** 路由切换动画 */
  routeAnimation: RouteAnimation;
  /** 最大标签页超限后的关闭策略: fifo 最早打开，lru 最近最少使用 */
  tabEvictPolicy: 'fifo' | 'lru';
  /** 灰色模式（国家公祭日等场景） */
  grayscale: boolean;
  /** 色弱模式（反转色/高对比） */
  colorBlind: boolean;
  /** 内容区域宽度模式：fluid 流式充满（默认）/ fixed 固定最大宽度居中 */
  contentWidth: 'fluid' | 'fixed';
  /** 侧边栏展开宽度（px），默认 216 */
  sidebarWidth: number;
  /** 全局圆角大小：none 直角 / small 小 / medium 默认（Semi 原生）/ large 大 */
  borderRadius: BorderRadiusPreference;
  /** 显示回到顶部按钮（滚动超过 400px 后浮现） */
  showBackTop: boolean;
  /** 页面切换时顶部显示加载进度条 */
  showProgressBar: boolean;
  /** 全局键盘快捷键（Alt+L 锁屏 / Alt+S 侧边栏 / Alt+C 内容全屏 / Ctrl+K 搜索菜单） */
  enableShortcuts: boolean;
  /** 登录后默认进入的页面路径，'/' 表示首页仪表盘 */
  homePath: string;
  /** 标签栏右侧显示标签切换器（chevron 下拉列表） */
  showTabSwitcher: boolean;
  /** Web 终端个性化配置（主题/字体/默认 shell/文件夹收藏） */
  terminal: TerminalPreferences;
}

export const defaultPreferences: UserPreferences = {
  enableTabs: true,
  keepTabs: true,
  enablePageCache: true,
  tabsMaxCount: 20,
  showTabIcon: true,
  tabStyle: 'line',
  navLayout: 'vertical',
  showBreadcrumb: true,
  breadcrumbIcon: true,
  breadcrumbShowHome: true,
  tabAnimation: 'fade',
  colorMode: 'light',
  themeColor: 'wechat',
  sidebarDarkMode: false,
  headerDarkMode: false,
  showMenuSearch: true,
  showFullscreen: true,
  showQuickChat: true,
  showLogo: true,
  showFavorites: false,
  dynamicTitle: true,
  filesViewMode: 'list',
  sidebarStickyScroll: true,
  showTableColumnSettings: true,
  tableBordered: true,
  tableStriped: false,
  tableSize: 'small',
  tablePageSize: 10,
  enableLockScreen: false,
  sidebarAccordion: true,
  sidebarHoverTrigger: false,
  breadcrumbClickable: true,
  breadcrumbSubMenu: false,
  openTabBehavior: 'append',
  scrollMenuIntoView: true,
  tabDoubleClickAction: 'refresh',
  tabEvictPolicy: 'fifo',
  routeAnimation: 'fade',
  grayscale: false,
  colorBlind: false,
  contentWidth: 'fluid',
  sidebarWidth: 216,
  borderRadius: 'medium',
  showBackTop: true,
  showProgressBar: true,
  enableShortcuts: true,
  homePath: '/',
  showTabSwitcher: true,
  terminal: {
    defaultShell: '',
    themeDark: 'catppuccin-mocha',
    themeLight: 'vscode-light',
    fontSize: 14,
    fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
    lineHeight: 1.2,
    scrollback: 5000,
    favorites: [],
    tabPosition: 'top' as const,
    tabCollapsed: false,
    cursorStyle: 'block' as const,
    cursorBlink: true,
    copyOnSelect: true,
    rendererType: 'canvas' as const,
    fastScrollSensitivity: 5,
    letterSpacing: 0,
    fontWeight: 'normal',
    rightClickSelectsWord: false,
    minimumContrastRatio: 1,
    showStatusBar: true,
  },
};

export interface PreferencesContextValue {
  preferences: UserPreferences;
  setPreferences: (partial: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
  /** 服务器偏好已拉取完成（成功或失败均视为就绪），用于依赖偏好的一次性决策（如登录后默认首页跳转） */
  ready: boolean;
}

/** 枚举型偏好的合法值白名单（导入校验用），须与各 union type 保持一致 */
const PREF_ENUM_VALUES: Partial<Record<keyof UserPreferences, readonly string[]>> = {
  navLayout: ['vertical', 'horizontal', 'mixed', 'double'],
  tabStyle: ['line', 'pill', 'card', 'chrome'],
  tabAnimation: ['none', 'fade', 'slide', 'scale'],
  routeAnimation: ['none', 'fade', 'slide-up', 'slide-left'],
  tableSize: ['small', 'default', 'middle'],
  colorMode: ['light', 'dark', 'system'],
  contentWidth: ['fluid', 'fixed'],
  openTabBehavior: ['append', 'insert-next'],
  tabDoubleClickAction: ['refresh', 'close', 'none'],
  tabEvictPolicy: ['fifo', 'lru'],
  filesViewMode: ['list', 'grid'],
  borderRadius: ['none', 'small', 'medium', 'large'],
};

/**
 * 校验并过滤导入的偏好 JSON：
 * 仅保留 defaultPreferences 中已知的 key 且基础类型匹配的项，枚举字段额外校验合法值；
 * 无任何有效字段时返回 null。
 */
export function sanitizeImportedPreferences(raw: unknown): Partial<UserPreferences> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, defVal] of Object.entries(defaultPreferences) as [keyof UserPreferences, unknown][]) {
    if (!(key in source)) continue;
    const val = source[key];
    if (key === 'terminal') {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = { ...defaultPreferences.terminal, ...(val as Record<string, unknown>) };
      }
      continue;
    }
    if (typeof val !== typeof defVal) continue;
    const allowed = PREF_ENUM_VALUES[key];
    if (allowed && !allowed.includes(val as string)) continue;
    result[key] = val;
  }
  return Object.keys(result).length > 0 ? (result as Partial<UserPreferences>) : null;
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function useOptionalPreferences() {
  return useContext(PreferencesContext);
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return ctx;
}
