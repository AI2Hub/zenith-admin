import * as z from 'zod';
import { defineContract, op } from '../core/contract';
import { authSettingsSchema } from './modules/auth';
import { driveSettingsSchema } from './modules/drive';
import { filesSettingsSchema } from './modules/files';
import { identitySecuritySettingsSchema } from './modules/identity-security';
import { rulesSettingsSchema } from './modules/rules';
import { terminalSettingsSchema } from './modules/terminal';
import { uiSettingsSchema } from './modules/ui';

export const publicSettingsSchema = z.object({
  auth: authSettingsSchema.pick({ captchaEnabled: true, captchaComplexity: true, allowRegistration: true, forgotPasswordEnabled: true }),
  identitySecurity: identitySecuritySettingsSchema.pick({ password: true }),
}).meta({ id: 'PublicSettings' });

export type PublicSettings = z.output<typeof publicSettingsSchema>;

export const mySettingsSchema = z.object({
  auth: authSettingsSchema.pick({ captchaEnabled: true, captchaComplexity: true, allowRegistration: true, forgotPasswordEnabled: true }),
  identitySecurity: identitySecuritySettingsSchema.pick({ password: true, impersonation: true, session: true }),
  ui: uiSettingsSchema.pick({ watermark: true, quickChatEnabled: true, feedbackEntryEnabled: true, preferencesEntryEnabled: true, preferences: true }),
  files: filesSettingsSchema.pick({ chunkThresholdMb: true, chunkSizeMb: true }),
  // 带 License 门控的模块：租户套餐未含该特性时不返回
  terminal: terminalSettingsSchema.pick({ recordingEnabled: true }).optional(),
  rules: rulesSettingsSchema.pick({ publishApproval: true }).optional(),
  drive: driveSettingsSchema.pick({ previewWatermarkEnabled: true }).optional(),
}).meta({ id: 'MySettings' });

export type MySettings = z.output<typeof mySettingsSchema>;

export const publicSettingsQuery = z.object({
  tenantCode: z.string().trim().max(64).optional().meta({ description: '多租户模式下按租户编码解析租户级设置；缺省或无效时返回平台值' }),
});


/** 登录和布局只依赖投影，不初始化后台版本写入契约。 */
export const settingsProjectionContract = defineContract('/api/settings', {
  public: op.get('/public', { query: publicSettingsQuery, response: publicSettingsSchema, public: true, summary: '匿名可见的设置投影（登录 / 注册页）' }),
  me: op.get('/me', { access: 'authenticated', response: mySettingsSchema, summary: '登录用户可见的设置投影（布局开关 / 密码规则 / 终端录屏）' }),
}, { tags: ['Settings'] });
