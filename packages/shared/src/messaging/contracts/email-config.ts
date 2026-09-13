import * as z from 'zod';
import { auditFieldsSchema, entityStatusSchema } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { EMAIL_ENCRYPTIONS } from '../constants';
import { saveEmailConfigSchema, testEmailConfigSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 系统 SMTP 配置（单例；密码不回传） */
export const emailConfigSchema = z.object({
  id: z.int(),
  smtpHost: z.string(),
  smtpPort: z.int(),
  smtpUser: z.string(),
  fromName: z.string(),
  fromEmail: z.string(),
  encryption: z.enum(EMAIL_ENCRYPTIONS),
  status: entityStatusSchema,
  ...auditFieldsSchema,
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
}).meta({ id: 'EmailConfig' });

export type EmailConfig = z.infer<typeof emailConfigSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const emailConfigContract = defineContract('/api/email-config', {
  get: op.get('/', { access: { permission: 'system:email-config:view' }, response: emailConfigSchema, summary: '获取邮件配置' }),
  save: op.put('/', { access: { permission: 'system:email-config:update' }, audit: '更新邮件配置', body: saveEmailConfigSchema, response: emailConfigSchema, summary: '更新邮件配置' }),
  test: op.post('/test', { access: { permission: 'system:email-config:update' }, audit: '发送测试邮件', body: testEmailConfigSchema, summary: '发送测试邮件' }),
}, { auditModule: '邮件配置', tags: ['EmailConfig'] });
