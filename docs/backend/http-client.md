# 外呼 HTTP 客户端

外呼 HTTP 客户端位于 `packages/server/src/lib/http-client.ts`，基于 `undici` 封装 `httpRequest`、`httpGet`、`httpPost`、`httpPut`、`httpPatch`、`httpDelete`，并与出站 HTTP 日志、代理、重试、熔断、SSRF 防护集成。

## 默认行为

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `timeout` | `0` | 不设置客户端超时 |
| `retries` | `0` | 不重试 |
| `retryDelay` | `300` | 重试基础延迟，单位毫秒 |
| `circuitBreaker` | `true` | 启用按 host 熔断 |
| `ssrfProtection` | `false` | 默认不启用 SSRF 防护 |
| `logBodyLimit` | `2048` | 出站日志 body 采样上限 |

响应非 2xx 不会自动抛错，调用方应检查 `resp.ok` 或 `resp.status`。网络错误、超时、熔断、SSRF 拦截等会抛出错误。

## 代理与 Dispatcher

客户端使用 undici `Agent` / `ProxyAgent`。调用方可通过选项指定代理；启用 SSRF 防护时禁止代理，因为代理会绕过本地 DNS 与私网校验。

## 重试

重试只覆盖网络异常和可重试错误。`retries` 控制额外尝试次数，`retryDelay` 是基础延迟。涉及第三方幂等语义的写请求，应由调用方确认远端支持幂等键后再开启重试。

## 熔断

熔断按 host 维度统计：

- 连续 5 次失败打开熔断；
- 打开后 30 秒内直接拒绝请求；
- 半开状态下单次成功会重置；失败会重新打开。

可通过 `circuitBreaker: false` 跳过熔断。

## SSRF 防护

启用 `ssrfProtection` 时会调用出站 URL 校验逻辑：

- 只允许安全协议与可解析主机；
- DNS 解析结果会过滤内网、回环、链路本地等地址，除非命中允许清单；
- 强制 `redirect: 'error'`，避免跳转绕过校验；
- 禁止与代理同时使用。

相关允许清单由具体业务配置传入，例如报表、AI 或开放平台 Webhook 的私网联调白名单。

## 日志

每次外呼会进入 `http-logger` 出站日志链路。日志级别、格式和 body 限制由 `HTTP_LOG_OUTGOING_*` 环境变量控制（默认总开关关闭，开发模式默认开启且取 `access` 级；详见 [HTTP 流量日志](./http-logging.md)）；敏感头会被脱敏。

## 使用建议

- 第三方 API 适配器统一使用本客户端，不直接使用 `fetch`。
- 需要访问用户可配置 URL 的场景必须开启 SSRF 防护。
- 写请求开启重试前要确认远端幂等性。
- 大响应体不要依赖日志排查，应在业务层记录摘要或 request id。
