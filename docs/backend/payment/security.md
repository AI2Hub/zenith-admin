# 安全设计

支付涉及资金与密钥，安全是支付中心的第一关注点。下表是六个维度的安全措施，覆盖密钥存储、响应脱敏、回调验签、幂等、金额校验与审计取证。

## 安全措施总览（需求 ⑥）

| 维度 | 措施 |
| --- | --- |
| 密钥存储 | API V3 Key / 商户私钥 / 支付宝应用私钥一律 `encryptField()` 存密文，字段名 `xxxEncrypted` |
| 响应脱敏 | 列表 / 详情 DTO 用 `hasXxx` 布尔位标识是否已配置，**永不返回密文或明文** |
| 回调验签 | 微信：按 `Wechatpay-Serial` 自动下载平台证书（12h 缓存，应对轮换）RSA-SHA256 验签 + AES-256-GCM 解密；支付宝：`RSA2` / `RSA` 验签，配置 `alipayPublicKey` 时校验同步响应签名。处理幂等 + 原子，重放无害 |
| 幂等 | 下单 / 退款挂 [`idempotencyGuard`](../idempotency)（Redis `SET NX EX`）；回调去重靠 `markOrderPaid` / `finalizeRefund` 的**原子条件更新**（非中间件）；Outbox at-least-once 投递要求业务订阅者自身幂等 |
| 金额 | 全链路整数分；退款金额 ≤ 原单可退余额（事务内 `SELECT ... FOR UPDATE` 锁单校验） |
| 外呼 | 全部走 [`http-client`](../http-client)（熔断 + Header 脱敏 + 结构化日志） |
| 权限 / 审计 | `payment:*` 权限码 + `guard({ audit })` 写操作日志；退款按权限控制并记录操作审计 |
| 取证 | `payment_notify_logs` 留存回调原文与请求头，争议时可复核 |

## 1. 密钥存储与脱敏

- 所有密钥字段以 `encryptField()`（项目统一加密）存密文，列名以 `Encrypted` 结尾；
- DTO 映射时**不读取明文**，仅返回 `hasWechatApiV3Key` / `hasWechatPrivateKey` / `hasAlipayPrivateKey` 等布尔位；
- 更新时密钥字段**留空表示不修改**，仅当传入非空值才重新加密覆盖，避免前端回显密文导致泄露或误清空。

## 2. 回调验签与防重放

- 公开回调端点**先验签再处理**，验签失败立即拒绝并落 `payment_notify_logs`（`signatureValid=false`）；
- 微信平台证书按 `Wechatpay-Serial` 自动下载并缓存 12h，配置中的 `wechatPlatformCert` 作为验签回退证书；
- 处理逻辑**幂等**：`markOrderPaid` / `finalizeRefund` 用原子条件更新（仅在订单 / 退款单尚未终态时更新），同一回调重放无副作用。

## 3. 幂等防重复

- **下单 / 退款**：后台下单 / 退款路由挂 [`idempotencyGuard`](../idempotency)（15s 窗口，Redis `SET NX EX`，支持客户端 `X-Idempotency-Key` 或服务端自动指纹）；会员钱包充值路由使用 10s 窗口；
- **回调处理**：靠 `markOrderPaid` / `finalizeRefund` 原子条件更新去重；
- **业务订阅者**：须自身幂等，应对 Outbox at-least-once 投递（见 [异步通知与对账](./callback)）。

## 4. 权限与审计

权限码清单（菜单 / 按钮在 `seed-data.ts` 中配置，超管自动绑定）：

| 权限码 | 用途 |
| --- | --- |
| `payment:channel:list` / `payment:channel:create` / `payment:channel:update` / `payment:channel:delete` | 渠道配置查看 / 新增 / 编辑（含设为默认、连通性测试、启停）/ 删除 |
| `payment:order:list` | 订单列表 / 详情 / 查单 / 统计 / 趋势 / 导出 |
| `payment:order:create` | 手动发起支付下单 |
| `payment:order:close` | 关闭订单 |
| `payment:order:refund` | 发起退款（按权限控制） |
| `payment:refund:list` | 退款记录查看 / 退款查单 / 导出 |
| `payment:log:list` | 回调日志查看 |

关键写操作经 `guard({ audit })` 进入操作日志，关键字段变更可在「操作日志」中追溯。

## 5. 争议取证

`payment_notify_logs` 追加型留存每次回调的原始 body、请求头、验签结果与来源 IP，发生对账争议或验签失败时可在后台「回调日志」页复核原文。
