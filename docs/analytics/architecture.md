# 架构与数据模型

## 数据表

| 表 | 说明 |
|----|------|
| `user_events` | 原始事件流（含幂等 `eventId`、`properties` JSONB、UTM、身份、设备、地域、性能指标及 11 个索引） |
| `analytics_sessions` | 会话聚合（时长 / 页数 / 入口出口页 / 是否跳出） |
| `analytics_daily_rollup` | 每日预聚合指标（`tenantId` 非空默认 0，保证 upsert 唯一约束生效） |
| `analytics_event_meta` | 事件字典 / 埋点元数据治理（事件名全局唯一） |
| `analytics_settings` | 按租户唯一的采集、远程配置与保留策略 |
| `error_groups` | 错误分组（Issue，`fingerprint` 全局唯一索引） |
| `error_events` | 单次错误事件（堆栈 / 面包屑 / 上下文 / 解析后 UA / HTTP 详情） |
| `error_alert_rules` | 错误告警规则（条件、阈值、时间窗口、渠道、收件人、去抖时间） |
| `source_maps` | 上传的 Source Map（堆栈还原，replace 语义维护） |

> 修改这些表后需 `npm run db:generate && npm run db:migrate`，并在 `packages/shared/src/seed-data.ts` 同步菜单/权限。

## 服务端实现

| 层 | 文件 |
|----|------|
| 路由 | `routes/analytics/analytics.ts`、`routes/analytics/frontend-errors.ts` |
| Service | `services/analytics/analytics.service.ts`、`analytics-event-meta.service.ts`、`analytics-settings.service.ts`、`analytics-rollup.service.ts`、`frontend-errors.service.ts`、`error-alert.service.ts`、`analytics-profile.service.ts`（身份画像 upsert 公共 helper）、`analytics-server-events.service.ts`（服务端权威事件写入）、`analytics-server-event-subscribers.ts`（业务总线 → 权威事件桥接） |
| 公共库 | `lib/analytics-helpers.ts`（UA / 地域 / 指纹 / 性能评级）、`lib/source-map-symbolicate.ts`（堆栈还原） |
| DTO | `lib/dtos/analytics.ts`、`lib/dtos/frontend-errors.ts` |

- 采集 / 错误上报端点使用 `optionalAuthMiddleware`，支持匿名上报，并分别受 `analytics-ingest` / `error-report` IP 限流保护；其余分析端点均在 `authMiddleware` + `guard()` 之后。
- UA 解析复用 `ua-parser-js`，IP → 地域复用离线库 `node-ip2region`，无需外部服务。
- 行为事件与会话更新、错误 Issue 与错误事件写入均在事务中完成；SDK 事件通过 `eventId` 唯一索引实现重试幂等。
- 生产环境建议配置 `REQUEST_BODY_LIMIT=23068672`（22MiB）：可容纳 20MB Source Map 与 JSON 包装开销，同时给匿名采集入口设置全局请求体上限。
- **服务端权威事件**（`source='server'`）不经 HTTP，由 `paymentEventBus` / `workflowEventBus` 订阅与会员业务 Service 调用点直接写入 `user_events`，与 SDK 采集（`source='web'`）共用同一张表、同一套治理（`analytics-ingest-governance`）与查询/漏斗/事件分析能力。详见 [埋点采集 SDK · 服务端权威事件](./tracking#服务端权威事件sourceserver)。

## 数据链路

```text
tracker.ts / error-reporter.ts
  ↓ POST /api/analytics/events 或 POST /api/frontend-errors
routes/analytics/analytics.ts / routes/analytics/frontend-errors.ts
  ↓ Service 写入、UA/IP 解析、会话维护、错误指纹计算
user_events / analytics_sessions / error_groups / error_events
  ↓ 查询接口实时聚合，定时任务维护 analytics_daily_rollup 与保留清理
packages/web/src/pages/analytics/*

paymentEventBus / workflowEventBus / 会员 Service 调用点（成功后 best-effort）
  ↓ analytics-server-event-subscribers.ts（总线 onAny 映射）或直接调用
services/analytics/analytics-server-events.service.ts::trackServerEvent()
  ↓ queueMicrotask 异步、治理复用（evaluateEvents）、eventId 幂等（ON CONFLICT DO NOTHING）
user_events（source='server'，不创建 analytics_sessions）
  ↓ 与 SDK 事件混合参与既有查询 / 漏斗 / 事件分析接口，无需新增 API
```

## 定时任务

| Handler | 频率 | 作用 |
|---------|------|------|
| `analyticsRollupDaily` | 每日 01:00 | 重建最近 2 个完整自然日的每日聚合 |
| `analyticsRetention` | 每日 02:00 | 按每个租户各自的保留策略清理过期埋点 / 会话 / 错误 |
| `evaluateErrorAlerts` | 每 5 分钟 | 评估错误告警规则并通知 |

注册于 `lib/pg-boss-scheduler.ts`，种子数据见 `shared/seed-data.ts` 的 `SEED_CRON_JOBS`。

## 权限码

| 权限码 | 含义 |
|--------|------|
| `analytics:view` | 查看行为分析 |
| `analytics:manage` | 数据管理 / 事件字典 / 设置 / 聚合 |
| `analytics:clean` | 清理埋点数据 |
| `analytics:export` | 导出埋点事件 |
| `monitor:error:list` | 查看错误监控 |
| `monitor:error:manage` | 处理 / 删除错误、上传 Source Map |
| `monitor:alert:list` / `monitor:alert:manage` | 查看 / 管理告警规则 |

## 多租户隔离

- 行为事件、会话、错误分组、错误事件、Source Map 与告警规则按 `tenantId` 隔离；分析查询和存在性校验使用 `tenantScope()`。
- 登录态 SDK 配置与 IP 匿名化策略按当前租户读取；匿名请求使用平台级（`tenantId=null`）默认配置。
- 数据保留任务逐租户执行，未配置的租户使用埋点 180 天、错误 90 天默认值。
- 错误指纹含 `tenantId` 因子，不同租户的相同错误分属不同 Issue。
- 事件字典为平台级全局分类（事件名跨租户共享）；屏蔽、解除屏蔽或删除已屏蔽事件仅允许平台超级管理员。
- 服务端权威事件（`source='server'`）同样携带来源业务的 `tenantId`（支付/工作流事件复用总线事件自带的 `tenantId`；会员事件取会员/操作上下文的 `tenantId`，当前会员体系未启用多租户时为 `null`），与 SDK 事件遵循相同的 `tenantScope()` 过滤规则，不单独绕过隔离。
