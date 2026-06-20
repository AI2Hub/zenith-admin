# 业务接入

业务模块（会员、订单、充值等）通过**统一支付门面**接入支付能力，无需感知任何渠道差异。接入一个新业务点约等于「调用 1 个下单函数 + 订阅 1 个成功事件」。

## 1. 统一支付门面（需求 ②④）

```ts
// services/payment.service.ts —— 业务模块唯一入口
createPayment(input: {
  bizType: string; bizId: string; amount: number; subject: string;
  payMethod: PayMethod; channelConfigId?: number;   // 不传则用 isDefault 渠道
  userId?: number; openId?: string; clientIp: string; expireMinutes?: number;
}): Promise<{ orderNo: string; payParams: CreatePaymentResult }>;

queryPayment(orderNo: string): Promise<PaymentOrder>;
refund(input: { orderNo: string; refundAmount: number; reason?: string; operatorId?: number }): Promise<{ refundNo: string; status: string }>;
closePayment(orderNo: string): Promise<void>;
```

- 业务模块直接 `import { createPayment } from '../services/payment.service'`，**无需 HTTP 往返**；
- 同时提供后台 HTTP 路由 `/api/payment/*`（发起、查询、手动退款），供后台运营使用；
- 下单 / 退款接口挂 [`idempotencyGuard`](../idempotency)（15s 窗口，自动指纹或客户端 `X-Idempotency-Key`）防重复提交。

### 字段约定

| 字段 | 说明 |
| --- | --- |
| `bizType` | 业务类型标识（如 `membership` / `order` / `member_recharge`），事件回调据此路由 |
| `bizId` | 业务方主键（字符串），用于回填业务状态 |
| `amount` | 金额，**整数分**（如 `9900` = 99.00 元） |
| `payMethod` | 支付方式，门面据 `PAYMENT_METHOD_CHANNEL` 自动选渠道 |
| `openId` | 微信 JSAPI 必填 |
| `expireMinutes` | 订单过期分钟数，默认 30，超时由 cron 关单 |

## 2. 监听支付结果（事件总线）

支付 / 退款结果通过 **`paymentEventBus`** 进程内事件总线广播，业务模块订阅对应事件完成履约（发货、开通会员、入账等），与支付中心解耦。

### 事件类型

| 事件 | 触发时机 |
| --- | --- |
| `payment.succeeded` | 支付成功（回调验签成功或主动查单确认） |
| `payment.closed` | 订单关闭（超时关单 / 主动关闭） |
| `payment.failed` | 支付失败 |
| `refund.succeeded` | 退款成功 |
| `refund.failed` | 退款失败 |

### 事件载荷

```ts
interface PaymentEvent {
  eventId: string;          // 幂等键
  type: PaymentEventType;
  occurredAt: string;
  orderNo: string;
  outTradeNo: string;
  bizType: string;
  bizId: string;
  channel: PaymentChannel;
  amount: number;           // 分
  refundNo?: string;        // 退款事件
  refundAmount?: number;
  userId?: number | null;
  tenantId?: number | null;
}
```

### 订阅示例

```ts
import { createPayment } from '../services/payment.service';
import { paymentEventBus } from '../lib/payment-event-bus';

// 1) 下单（拿到二维码 / 跳转链接给前端）
const { orderNo, payParams } = await createPayment({
  bizType: 'membership',
  bizId: String(membershipOrder.id),
  amount: 9900,                 // 99.00 元
  subject: '会员充值-年度套餐',
  payMethod: 'wechat_native',
  clientIp: c.req.header('x-forwarded-for') ?? '',
});

// 2) 监听支付成功，履约
paymentEventBus.on('payment.succeeded', async (e) => {
  if (e.bizType === 'membership') {
    await activateMembership(e.bizId);
  }
});
```

> 实际案例参考会员钱包充值：下单时 `bizType='member_recharge'`，订阅 `payment.succeeded` 入账（`services/payment-subscribers.ts`）。

## 3. 幂等要求（重要）

业务订阅者**必须自身幂等**：同一笔支付成功事件可能被**实时路径**与 **Outbox 兜底**各投递一次（at-least-once）。处理时应：

- 用 `eventId` 或 `orderNo` 去重；
- 或让履约操作天然幂等（如「若已开通会员则跳过」）。

事件投递的可靠性机制详见 [异步通知与对账](./callback)。

## 4. 金额规范

- **全链路整数分**（`integer`），杜绝浮点误差；
- 退款金额 ≤ 原单可退余额（门面在事务内 `SELECT ... FOR UPDATE` 锁单校验，防并发超退）；
- 前端展示 `¥${(cents / 100).toFixed(2)}`，提交时 `Math.round(yuan * 100)`。
