# 埋点采集 SDK

埋点 SDK 位于 `packages/web/src/utils/tracker.ts`，在应用启动时由 `App` 调用 `initTracker()` 自动初始化，对标 PostHog autocapture / 神策全埋点。

## 自动采集（零代码）

初始化后默认开启以下全自动采集，**无需在业务页面写任何埋点代码**：

| 能力 | 说明 |
|------|------|
| 页面浏览 | `AdminLayout` 全局接入 `usePageTracker`，所有后台页面自动记录 `$pageview` 进入 + `$pageleave` 离开（含停留时长），标题取自菜单 |
| 元素点击 | 全局捕获 `button` / `a` / `[role=button]` / `input[type="submit"]` / `input[type="button"]` / `[data-track]` 点击，上报 `$autocapture`（按钮文案作为 `elementLabel`） |
| Web Vitals | 自动采集 `LCP` / `INP` / `CLS` / `FCP` / `TTFB`，上报为 `perf` 事件（`eventName=$web_vitals`） |
| API 监控 | 拦截 `fetch` / `XHR`，记录慢请求（>2s）与 4xx/5xx，上报 `api_request`；5xx / 网络失败额外转为 `http_error` 错误上报 |

### 声明式埋点（data-track）

给元素加 `data-*` 属性可控制自动采集的标识，便于稳定统计：

```tsx
<Button
  data-track="user-export"          // 稳定 elementKey
  data-track-label="导出用户"        // 展示用 elementLabel
  data-area="user-toolbar"          // componentArea 区域
>
  导出
</Button>
```

## 手动埋点 API

需要**语义化业务事件**（如转化、关键操作）时，显式调用：

```ts
import { trackEvent, trackFeature, trackAreaClick, identify, resetIdentity } from '@/utils/tracker';

// 自定义事件（带属性袋）
trackEvent('order_submit', { amount: 199, channel: 'wechat' });

// 功能点击（稳定 key + 标签 + 区域）
trackFeature('export-btn', '导出', 'search-toolbar');

// 区域点击（点击分布）
const ref = useRef<HTMLDivElement>(null);
<div ref={ref} onClick={(e) => ref.current && trackAreaClick(e, ref.current, 'table')}>…</div>
```

> 由于点击已被 autocapture 全量采集，业务页一般**无需**再写 `trackFeature`；它主要用于需要稳定 key 的关键转化点。

## 身份识别

- 登录后自动 `identify(userId, username)`；退出前先使用旧 token 尽力发送旧身份缓冲，再重置会话与采样状态，避免共享设备上的跨账号数据串写。
- 未登录时使用持久化的 `anonymousId`（localStorage）；登录后事件携带 `distinctId = u:{userId}`，实现匿名 → 登录的身份合并。
- 登录请求的 `distinctId` 最终由服务端 JWT 身份强制生成，客户端无法伪造其他登录用户。

## 上报字段与接口

埋点统一批量上报到 `POST /api/analytics/events`，请求体为 `{ "events": [...] }`（单批最多 100 条）。每条事件包含：

- 幂等、身份与会话：`eventId`（UUID）、`sessionId`、`anonymousId`、`distinctId`
- 事件：`eventType`（`page_view` / `page_leave` / `feature_use` / `area_click` / `custom` / `perf` / `api_request` / `identify`）、`eventName`
- 页面与元素：`pagePath`、`pageTitle`、`elementKey`、`elementLabel`、`componentArea`
- 行为数值：`clickX` / `clickY`（0–100 归一化坐标）、`scrollDepth`、`durationMs`
- 属性与来源：`properties`、`referrer`、`utmSource` / `utmMedium` / `utmCampaign` / `utmTerm` / `utmContent`
- 环境与性能：`screenW`、`screenH`、`language`、`metricName`、`metricValue`

服务端根据请求 IP 与 UA 补充浏览器、操作系统、设备类型、IP 与地域字段。

## 会话与停留

- `sessionId` 存于 sessionStorage，闲置超过 `sessionTimeoutMinutes`（默认 30 分钟）自动开启新会话。
- 服务端按 `sessionId` 聚合维护 `analytics_sessions`：页数、事件数、入口/出口页、时长、是否跳出。

## 远程配置

SDK 启动时拉取 `GET /api/analytics/config`，应用「数据管理 → 采集设置」中的配置：

- `enabled`：总开关
- `sampleRate`：采样率（按会话决定是否采集）
- `trackClicks` / `trackPerformance` / `trackApi`：点击、性能、API 自动监听开关
- `trackErrors`：API 5xx / 网络失败转报 `http_error` 的开关
- `blacklistPaths`：路径黑名单（命中则不采集）
- `respectDnt`：是否尊重浏览器 Do Not Track
- `sessionTimeoutMinutes`：会话闲置超时

错误监控使用同一组 `enabled` / `trackErrors` / `respectDnt` 开关；关闭采集或错误采集后不会继续上传堆栈和行为面包屑。

## 可靠性

- **批量缓冲**：内存缓冲满 50 条或每 15 秒自动 flush，减少请求次数。
- **离线缓存重试**：上报失败 / 断网时事件落 localStorage 队列（上限 500 条），启动时及每 15 秒周期性补传。
- **卸载兜底**：匿名事件优先使用 `sendBeacon` 分片；登录态事件使用带 Authorization 的 `fetch keepalive`，避免卸载事件丢失租户归属。
- **幂等重放**：每条新事件携带稳定 `eventId`，服务端重复接收时不会再次累计事件或会话。
- **兼容窗口**：旧离线队列中没有 `eventId` 的事件仍可接收，服务端会累计告警计数；确认旧队列归零后再收紧为必填。
- **不影响主应用**：所有采集逻辑包裹在 try/catch，异常静默丢弃，绝不阻塞业务。

## 隐私合规

- `maskInputs`：默认不采集输入框值。
- `respectDnt`：开启后遵循浏览器 DNT 信号停止采集。
- `blacklistPaths`：可排除登录页等敏感路径。
