import * as z from 'zod';
import { auditFieldsSchema } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { OAUTH_PROVIDERS } from '../constants';
import { updateOauthConfigSchema } from '../validation';
import { oauthProviderParam } from './oauth';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 第三方登录配置（平台级，每个 provider 一行；clientSecret 以掩码回显） */
export const oauthConfigSchema = z.object({
  id: z.int(),
  provider: z.enum(OAUTH_PROVIDERS),
  clientId: z.string(),
  clientSecret: z.string().meta({ description: '已配置时回显 ******，未配置为空串' }),
  agentId: z.string().nullable().optional(),
  corpId: z.string().nullable().optional(),
  enabled: z.boolean(),
  autoLinkByEmail: z.boolean().meta({ description: '登录时按提供方断言的已验证邮箱自动关联既有本地账号（平台超管永不自动关联）' }),
  ...auditFieldsSchema,
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
}).meta({ id: 'OAuthConfig' });

export type OAuthConfig = z.infer<typeof oauthConfigSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const oauthConfigContract = defineContract('/api/oauth-config', {
  list: op.get('/', { access: { permission: 'system:oauth-config:view', platformOnly: 'multi-tenant' }, response: z.array(oauthConfigSchema), summary: '获取所有 OAuth 配置' }),
  update: op.put('/{provider}', { access: { permission: 'system:oauth-config:update', platformOnly: 'multi-tenant' }, audit: '更新OAuth配置', params: oauthProviderParam, body: updateOauthConfigSchema, response: oauthConfigSchema.nullable(), summary: '更新指定 provider 的 OAuth 配置' }),
}, { auditModule: 'OAuth配置', tags: ['OAuthConfig'] });
