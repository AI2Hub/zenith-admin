# HTTP 流量日志

HTTP 流量日志由 `packages/server/src/lib/http-logger.ts` 和 `packages/server/src/middleware/http-logger.ts` 实现，覆盖入站请求与 `http-client` 发起的出站请求。

## 日志级别

`HttpLogLevel` 支持：

| 级别 | 内容 |
| --- | --- |
| `off` | 不记录 |
| `access` | 方法、路径、状态、耗时、大小等访问日志 |
| `headers` | 访问日志 + 请求 / 响应头 |
| `body` | 访问日志 + body 采样 |
| `full` | 访问日志 + headers + body |

格式支持 `json`、`text`、`curl`。

## 默认行为与开发档

入站与出站流量日志各有一个**总开关，开箱为关闭**（`HTTP_LOG_INCOMING_ENABLED` / `HTTP_LOG_OUTGOING_ENABLED`）：
关闭时中间件在链路上直接跳过，不产出任何流量日志行。下文各处的「默认配置」均指**开关打开后**的档位。

例外只有一处：`npm run dev`（`NODE_ENV=development`，由 `scripts/dev.mjs` 注入）下两个开关默认打开，
且入站与出站都取 `access` 级，用于本地看清「谁调了谁、通不通」；出站在该档位不用 `full`，
避免逐条倾倒 headers 与 body。任何显式环境变量赋值都优先于这个开发档，其余环境（含未设置 `NODE_ENV`）行为不变。

输出位置由两个 `*_FILE` 开关决定：默认 `false` 时合并进主日志 `app.*.log`（带 `[http-in]` / `[http-out]` 前缀）；
置为 `true` 时写入独立的 `http-traffic.YYYY-MM-DD.N.log`，避免流量日志淹没应用日志。

## 入站日志

默认配置：

- level：`access`
- max body bytes：`65536`
- 记录请求 body；默认不记录响应 body

内置排除路径：

- `/api/health`
- `/api/ws`
- `/api/metrics`
- `/docs`
- `/api/ui`
- `/favicon.ico`

入站日志位于全局中间件链路中，早于业务路由执行。请求 body 采样不改变后续业务读取。

## 出站日志

出站日志由 HTTP 客户端触发。默认配置：

- level：`full`
- max body bytes：`4096`
- 记录请求 body 与响应 body

出站日志会记录目标 URL、方法、状态码、耗时、重试、错误和 body 采样。

## 脱敏

日志会对敏感 header 做脱敏处理，例如：

- `authorization`
- `cookie`
- `set-cookie`
- `x-api-key`

body 只做长度采样，不替代业务字段级脱敏；涉及密码、token、密钥的业务接口应避免在响应中返回敏感值。

## 环境变量

配置项按入站和出站分组，位于 `packages/server/src/config.ts`，完整清单见 `packages/server/.env.example`：

| 入站 | 出站 | 说明 |
| --- | --- | --- |
| `HTTP_LOG_INCOMING_ENABLED` | `HTTP_LOG_OUTGOING_ENABLED` | 总开关，默认关闭（开发模式默认开启） |
| `HTTP_LOG_INCOMING_LEVEL` | `HTTP_LOG_OUTGOING_LEVEL` | 默认级别；入站 `access`，出站 `full`（开发模式 `access`） |
| `HTTP_LOG_INCOMING_FORMAT` | `HTTP_LOG_OUTGOING_FORMAT` | 输出格式（`json` / `text` / `curl`） |
| `HTTP_LOG_INCOMING_MAX_BODY` | `HTTP_LOG_OUTGOING_MAX_BODY` | body 截断阈值；入站 `65536`，出站 `4096` |
| `HTTP_LOG_INCOMING_RESPONSE_BODY` | `HTTP_LOG_OUTGOING_RESPONSE_BODY` | 是否记录响应 body；入站默认关闭 |
| `HTTP_LOG_INCOMING_FILE` | `HTTP_LOG_OUTGOING_FILE` | 写独立 `http-traffic.*.log` 而非合并进主日志 |
| `HTTP_LOG_INCOMING_EXCLUDE` | — | 追加排除路径（逗号分隔） |
| `HTTP_LOG_INCOMING_METHOD_*` | `HTTP_LOG_OUTGOING_METHOD_*` | 方法级覆盖，如 `HTTP_LOG_INCOMING_METHOD_POST=full` |

方法级覆盖的 `*` 取值为 `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / `OPTIONS` / `HEAD`。

## 使用建议

- 生产环境建议入站使用 `access` 或 `headers`，谨慎开启响应 body。
- 排查第三方接口时可临时提高出站日志级别。
- 长连接、WebSocket、健康检查和文档资源应保持排除，避免噪音和日志膨胀。
