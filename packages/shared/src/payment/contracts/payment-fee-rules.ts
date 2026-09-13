import * as z from 'zod';
import { entityStatusQuery, entityStatusSchema, idParam, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { PAYMENT_CHANNELS, PAYMENT_METHODS } from '../constants';
import { createPaymentFeeRuleSchema, updatePaymentFeeRuleSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const paymentFeeRuleSchema = z.object({
  id: z.int(),
  name: z.string(),
  channel: z.enum(PAYMENT_CHANNELS),
  payMethod: z.enum(PAYMENT_METHODS).nullable().optional(),
  rateBps: z.int().meta({ description: '费率（万分比）' }),
  fixedFee: z.int().meta({ description: '固定手续费（分）' }),
  minFee: z.int().nullable().optional().meta({ description: '最低手续费（分）' }),
  maxFee: z.int().nullable().optional().meta({ description: '最高手续费（分）' }),
  status: entityStatusSchema,
  priority: z.int(),
  remark: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'PaymentFeeRule' });

export type PaymentFeeRule = z.infer<typeof paymentFeeRuleSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const paymentFeeRuleListQuery = paginationQuery.extend({
  channel: queryEnum(PAYMENT_CHANNELS),
  status: entityStatusQuery,
});

export const paymentFeeRuleContract = defineContract('/api/payment/fee-rules', {
  list: op.get('/', { access: { permission: 'payment:fee:list' }, query: paymentFeeRuleListQuery, response: paginated(paymentFeeRuleSchema), summary: '费率规则列表' }),
  detail: op.get('/{id}', { access: { permission: 'payment:fee:list' }, params: idParam, response: paymentFeeRuleSchema, summary: '费率规则详情' }),
  create: op.post('/', { access: { permission: 'payment:fee:create' }, audit: '新增支付费率规则', body: createPaymentFeeRuleSchema, response: paymentFeeRuleSchema, summary: '新增费率规则' }),
  update: op.put('/{id}', { access: { permission: 'payment:fee:update' }, audit: '编辑支付费率规则', params: idParam, body: updatePaymentFeeRuleSchema, response: paymentFeeRuleSchema, summary: '编辑费率规则' }),
  remove: op.delete('/{id}', { access: { permission: 'payment:fee:delete' }, audit: '删除支付费率规则', params: idParam, summary: '删除费率规则' }),
}, { auditModule: '支付中心', tags: ['支付中心-费率'] });
