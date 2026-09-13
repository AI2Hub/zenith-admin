# 幂等防重复提交

幂等保护由 `packages/server/src/middleware/idempotency.ts` 提供，用于审批、支付、发券、CMS 发布等不可安全重复执行的写接口。

## 使用方式

在路由中显式追加 `idempotencyGuard()`（认证 / 权限门禁由契约 `access` 自动装配，`middleware` 里的中间件在门禁之后执行）：

```ts
defineContractRoute(xxxContract.submit, {
  middleware: [idempotencyGuard({ ttlSeconds: 10 })],
  handler: async (c) => { /* … */ },
});
```

常用参数：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `ttlSeconds` | `10` | 锁与成功响应缓存时间 |
| `message` | `请勿重复提交` | 重复提交时返回消息 |
| `autoFingerprint` | `true` | 自动用方法、路径、查询、JSON body 生成指纹 |
| `fingerprint` | - | 自定义指纹函数 |

## 判定键

Redis key 前缀为 `${REDIS_KEY_PREFIX}idempotency:`。Actor 命名空间按以下顺序确定：

1. Open Platform client：`clientId`；
2. 会员：`m:{memberId}`；
3. 管理员：`u:{tenantId ?? 0}:{userId}`；
4. `x-forwarded-for` 首个 IP；
5. `anon`。

默认 fingerprint 包含 HTTP 方法、路径、查询参数和 JSON 请求体；因此同一用户对同一路径提交不同 payload 不会互相阻塞。

## 响应行为

- 首次请求占用 `processing` 锁。
- 首次请求成功且响应为 JSON 2xx 时，响应体会在 TTL 内缓存。
- TTL 内相同 actor + fingerprint 再次提交：
  - 若已有成功缓存，直接回放缓存响应；
  - 若仍在处理中、响应非 JSON 或首次请求失败，返回 `429` 与 `message`。
- Redis 异常时 fail-open，不阻断业务请求。

## 已接入场景

代码中通过 `idempotencyGuard()` 显式接入，主要覆盖：

- 工作流审批、驳回、批量处理、转办、委派、加签、减签、退回、发起流程；
- 支付下单、退款、预授权、转账、合同、账户、争议；
- 会员积分、余额、优惠券、续费、自助资料和 CMS 互动；
- CMS 静态化、发布任务、内容分发；
- 公众号群发、二维码；
- 开放平台 CMS 写入接口；
- 用户反馈与演示请假接口。

## 设计注意

- 幂等中间件不是事务锁；它只降低重复提交进入业务层的概率。
- 涉及余额、库存、审批状态流转的接口仍需在 Service 层使用事务与条件更新。
- TTL 不宜过长，避免正常重试被误判为重复提交。
- 对第三方回调类接口，应优先使用业务方提供的事件 ID、订单号或幂等键作为自定义 fingerprint。
