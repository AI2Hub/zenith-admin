import { z } from '@hono/zod-openapi';
import { CreatePaymentResultDTO } from './payment';

/** 业务接入示例：支付接入实体 DTO */
export const BizPayDemoDTO = z
  .object({
    id: z.number().int(),
    subject: z.string(),
    amount: z.number().int().openapi({ description: '金额（分）', example: 9900 }),
    payMethod: z.string().nullable(),
    status: z.enum(['pending', 'paying', 'paid', 'closed']),
    paymentOrderNo: z.string().nullable(),
    paidAt: z.string().nullable(),
    fulfillRemark: z.string().nullable(),
    tenantId: z.number().int().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('BizPayDemo');

/** 发起支付返回：业务单 + 支付参数（二维码 / 跳转链接 / JSAPI 参数） */
export const BizPayDemoPayResultDTO = z
  .object({
    demo: BizPayDemoDTO,
    payParams: CreatePaymentResultDTO,
  })
  .openapi('BizPayDemoPayResult');
