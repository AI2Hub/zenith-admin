import * as z from 'zod';
import { partialForUpdate } from '../core/validation';
import { BIZ_LEAVE_TYPES } from './constants';

// ── 业务接入示例：请假 ──
export const bizLeaveTypeSchema = z.enum(BIZ_LEAVE_TYPES);

export const createBizLeaveSchema = z.object({
  leaveType: bizLeaveTypeSchema,
  startDate: z.string().min(1, '请选择开始日期'),
  endDate: z.string().min(1, '请选择结束日期'),
  days: z.coerce.number().positive('请假天数必须大于 0'),
  reason: z.string().max(500).nullable().optional(),
});

export const updateBizLeaveSchema = partialForUpdate(createBizLeaveSchema);
export const previewBizLeaveWorkflowSchema = z.object({
  days: createBizLeaveSchema.shape.days.optional(),
  leaveType: bizLeaveTypeSchema.optional(),
});

export type CreateBizLeaveInput = z.infer<typeof createBizLeaveSchema>;

export type UpdateBizLeaveInput = z.infer<typeof updateBizLeaveSchema>;

// ─── 业务接入示例：支付接入 ───────────────────────────────────────────────────
/** 新建示例单（金额单位：分） */
export const createBizPayDemoSchema = z.object({
  subject: z.string().min(1, '请输入示例事项名称').max(128),
  amount: z.coerce.number().int().positive('金额必须大于 0'), // 分
});

/** 发起支付（选择支付方式，微信 JSAPI 需 openId） */
export const payBizPayDemoSchema = z.object({
  applicationId: z.number().int().positive(),
  payMethod: z.enum(['wechat_native', 'wechat_jsapi', 'wechat_h5', 'alipay_page', 'alipay_wap', 'alipay_app', 'unionpay_qr']),
  openId: z.string().max(128).optional(),
});

export type CreateBizPayDemoInput = z.infer<typeof createBizPayDemoSchema>;

export type PayBizPayDemoInput = z.infer<typeof payBizPayDemoSchema>;
