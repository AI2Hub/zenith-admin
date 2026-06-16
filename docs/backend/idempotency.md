# 幂等防重复提交

Zenith Admin 提供 `idempotencyGuard` 中间件，基于 **Redis `SET NX EX` 原子操作**拦截重复请求，防止双击、网络重试、前端误操作导致的重复下单 / 重复退款 / 重复提交。实现位于 [`packages/server/src/middleware/idempotency.ts`](https://github.com/iwangbowen/zenith-admin/blob/master/packages/server/src/middleware/idempotency.ts)。

> 与「接口限流」（`rate-limit.ts`）是两套独立机制：**限流防频率**（单位时间请求数），**幂等防重复**（同一操作只生效一次）。

---

## 两种工作模式

中间件按优先级选择幂等 key 的来源：**客户端 Token > 服务端自动指纹**。

| 模式 | 触发条件 | Key 来源 | 适用场景 |
| --- | --- | --- | --- |
| **① 客户端 Token** | 请求头携带 `X-Idempotency-Key` | 该 Token（截断至 128 字符） | 支付创单、退款等需前端显式保证唯一性的高价值操作 |
| **② 服务端自动指纹** | 无 `X-Idempotency-Key` 且 `autoFingerprint !== false` | `SHA-256(identity \| method \| path \| bodyHash)` | 普通表单防双击，无需前端改造 |

### 模式 ① 客户端 Token

客户端在发起请求前自行生成唯一 key（通常是 UUID），放入请求头：

```http
POST /api/payment/orders HTTP/1.1
X-Idempotency-Key: 7c9e6679-7425-40de-944b-e07fc1f90ae7
Content-Type: application/json
```

TTL 窗口内再次携带**同一 key** 的请求会被直接拒绝。适合整个业务操作周期较长、必须由前端保证「同一笔操作只提交一次」的场景。

### 模式 ② 服务端自动指纹

无需前端改造，服务端自动根据以下要素计算指纹：

```text
identity | method | pathname | bodyHash
   │         │         │          └── SHA-256(请求体) 前 16 位；空 body 记为 'nobody'
   │         │         └── 请求路径
   │         └── HTTP 方法
   └── 已登录取 u{userId}；未登录取 X-Forwarded-For 首个 IP；兜底 0.0.0.0
```

最终对该字符串再做一次 SHA-256（取前 32 位）作为 Redis key。**相同用户、相同接口、相同请求体**在 TTL 窗口内只会放行一次。

---

## 用法

在 `createRoute` 的 `middleware` 数组中声明，置于 `authMiddleware` 之后、`guard(...)` 之前：

```ts
import { idempotencyGuard } from '../middleware/idempotency';

const orderCreateRoute = defineOpenAPIRoute({
  route: createRoute({
    method: 'post',
    path: '/orders',
    middleware: [
      authMiddleware,
      idempotencyGuard({ ttlSeconds: 15, message: '下单处理中，请勿重复提交' }),
      guard({ permission: 'payment:order:create', audit: { /* ... */ } }),
    ] as const,
    // ...
  }),
  handler: async (c) => { /* ... */ },
});
```

### 配置项

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `ttlSeconds` | `number` | `10` | 幂等窗口（秒）。Token 模式建议 30～300s（覆盖整个操作周期）；指纹模式建议 5～15s（仅防双击/重试） |
| `message` | `string` | `'请勿重复提交'` | 命中重复时返回的提示文案 |
| `autoFingerprint` | `boolean` | `true` | 无 `X-Idempotency-Key` 时是否自动降级为指纹模式。设为 `false` 则仅在客户端提供 key 时才检查 |

### 命中重复时的响应

```json
{ "code": 429, "message": "请勿重复提交", "data": null }
```

HTTP 状态码为 `429`，`message` 取自 `message` 配置项。

---

## 工作机制

```text
请求进入
  │
  ├── 1. 确定幂等 key
  │     ├── 有 X-Idempotency-Key → 取该 Token（模式 ①）
  │     ├── 无 Token 且 autoFingerprint=true → 计算请求指纹（模式 ②）
  │     └── 无 Token 且 autoFingerprint=false → 直接放行（不做幂等检查）
  │
  ├── 2. Redis SET key '1' EX ttl NX  ← 原子操作
  │     ├── 返回 OK（key 不存在）→ 首次请求，放行
  │     └── 返回 null（key 已存在）→ 重复请求，返回 429
  │
  └── Redis 不可用 → 降级放行（fail-open），记 error 日志，不阻断业务
```

- **Redis key 前缀**：`{REDIS_KEY_PREFIX}idempotency:`（默认 `zenith:idempotency:`），与其他命名空间隔离。
- **并发安全**：`SET NX EX` 是单条原子命令，多个并发请求只有一个能成功写入，其余全部命中拒绝。
- **读取 body 不消耗原始流**：指纹模式通过 `c.req.raw.clone()` 读取请求体，不影响后续 handler 取值。

---

## 在支付中心的应用

支付中心的两个高危写接口已启用幂等防护（窗口 15s）：

| 接口 | 中间件 | 说明 |
| --- | --- | --- |
| `POST /api/payment/orders` | `idempotencyGuard({ ttlSeconds: 15 })` | 防止重复下单。前端可额外携带 `X-Idempotency-Key` 进一步保证 |
| `POST /api/payment/refunds` | `idempotencyGuard({ ttlSeconds: 15 })` | 防止重复退款 |

> **支付回调的去重是另一套机制**：渠道异步回调（`/api/public/payment/notify/{channel}`）**不使用** `idempotencyGuard`，而是在 `markOrderPaid` / `finalizeRefund` 中用「**原子条件更新**」（`UPDATE ... WHERE status NOT IN (...)` + `.returning()`）保证 exactly-once 履约——仅当真正更新到行时才发出 `payment.succeeded` / `refund.succeeded` 事件。即便微信/支付宝重发回调，也不会重复履约。详见[支付中心](./payment)。

---

## 注意事项与限制

1. **失败不释放锁（纯 TTL）**：首次请求无论成功或失败，key 都会占满整个 TTL 窗口；窗口内的重试会被拦截。因此：
   - 指纹模式请用**短窗口**（5～15s），仅用于防双击；
   - Token 模式若设较长 TTL，一次失败的提交会在窗口内挡住正常重试——前端应在失败后更换新的 `X-Idempotency-Key` 再重试。
2. **不回放原始结果**：命中重复时仅返回 `429`，**不会**返回首次请求的处理结果。客户端需自行处理「请求可能已成功」的情况（如刷新查询订单状态）。
3. **Redis 不可用时 fail-open**：为不阻断业务，Redis 异常时降级放行并记 error 日志。这意味着 Redis 宕机期间幂等保护失效，需结合业务侧的最终一致兜底（如支付回调的原子更新、唯一约束）。
4. **指纹模式依赖请求体一致**：请求体只要有一个字节不同，指纹即不同、视为不同请求。携带时间戳/随机数的请求体不适合指纹模式，应改用 Token 模式。
