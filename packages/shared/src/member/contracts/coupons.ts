import * as z from 'zod';
import { idParam, idQuery, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { COUPON_TEMPLATE_STATUSES, COUPON_TYPES, COUPON_VALID_TYPES, MEMBER_COUPON_STATUSES } from '../constants';
import { createCouponSchema, issueCouponSchema, redeemCouponSchema, updateCouponSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 优惠券模板 */
export const couponSchema = z.object({
  id: z.int(),
  name: z.string(),
  type: z.enum(COUPON_TYPES),
  faceValue: z.int().meta({ description: 'amount 型为减免金额（分）；percent 型为折扣百分比' }),
  threshold: z.int().meta({ description: '使用门槛（分，0 = 无门槛）' }),
  maxDiscount: z.int().nullable().meta({ description: 'percent 型最高减免（分）' }),
  totalQuantity: z.int().meta({ description: '发放总量（0 = 不限量）' }),
  issuedQuantity: z.int(),
  perLimit: z.int().meta({ description: '每人限领（0 = 不限）' }),
  validType: z.enum(COUPON_VALID_TYPES),
  validStart: z.string().nullable(),
  validEnd: z.string().nullable(),
  validDays: z.int().nullable(),
  exchangePoints: z.int().meta({ description: '积分兑换所需积分（0 = 不可积分兑换）' }),
  status: z.enum(COUPON_TEMPLATE_STATUSES),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'Coupon' });

export type Coupon = z.infer<typeof couponSchema>;

/** 会员持有的券码 */
export const memberCouponSchema = z.object({
  id: z.int(),
  couponId: z.int(),
  memberId: z.int(),
  code: z.string(),
  status: z.enum(MEMBER_COUPON_STATUSES),
  receivedAt: z.string(),
  usedAt: z.string().nullable(),
  expireAt: z.string().nullable(),
  coupon: couponSchema.optional().meta({ description: '所属模板（列表 / 详情附加）' }),
  memberName: z.string().optional().meta({ description: '会员昵称（后台领券记录附加）' }),
  createdAt: z.string(),
}).meta({ id: 'MemberCoupon' });

export type MemberCoupon = z.infer<typeof memberCouponSchema>;

// ─── 契约（后台） ────────────────────────────────────────────────────────────

export const couponListQuery = paginationQuery.extend({
  keyword: keywordQuery(),
  status: queryEnum(COUPON_TEMPLATE_STATUSES),
  type: queryEnum(COUPON_TYPES),
});

export const memberCouponRecordListQuery = paginationQuery.extend({
  memberKeyword: z.string().optional().meta({ description: '会员昵称 / 手机号 / 用户名模糊匹配；纯数字额外按会员 ID 精确匹配' }),
  couponId: idQuery(),
  status: queryEnum(MEMBER_COUPON_STATUSES),
});

export const couponCodeParam = z.object({
  code: z.string().min(4).max(32).meta({ description: '券码', example: 'CP0123456789ABCDEF' }),
});

export const couponContract = defineContract('/api/coupons', {
  list: op.get('/', { access: { permission: 'member:coupon:list' }, query: couponListQuery, response: paginated(couponSchema), summary: '优惠券模板列表' }),
  records: op.get('/records', { access: { permission: 'member:coupon:list' }, query: memberCouponRecordListQuery, response: paginated(memberCouponSchema), summary: '领券记录' }),
  revokeRecord: op.post('/records/{id}/revoke', { access: { permission: 'member:coupon:revoke' }, audit: '作废优惠券', params: idParam, summary: '作废券码' }),
  byCode: op.get('/code/{code}', { access: { permission: 'member:coupon:list' }, params: couponCodeParam, response: memberCouponSchema, summary: '按券码查询券详情' }),
  redeem: op.post('/redeem', { access: { permission: 'member:coupon:update' }, audit: '核销优惠券', body: redeemCouponSchema, response: memberCouponSchema, summary: '核销券码' }),
  detail: op.get('/{id}', { access: { permission: 'member:coupon:list' }, params: idParam, response: couponSchema, summary: '优惠券详情' }),
  create: op.post('/', { access: { permission: 'member:coupon:create' }, audit: '创建优惠券', body: createCouponSchema, response: couponSchema, summary: '创建优惠券' }),
  update: op.put('/{id}', { access: { permission: 'member:coupon:update' }, audit: '更新优惠券', params: idParam, body: updateCouponSchema, response: couponSchema, summary: '更新优惠券' }),
  issue: op.post('/{id}/issue', { access: { permission: 'member:coupon:issue' }, audit: '发放优惠券', params: idParam, body: issueCouponSchema, response: memberCouponSchema, summary: '发券给会员' }),
  remove: op.delete('/{id}', { access: { permission: 'member:coupon:delete' }, audit: '删除优惠券', params: idParam, summary: '删除优惠券' }),
}, { auditModule: '优惠券', tags: ['优惠券'] });
