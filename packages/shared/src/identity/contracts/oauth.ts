import * as z from 'zod';
import { defineContract, op } from '../../core/contract';
import { OAUTH_PROVIDERS } from '../constants';
import { oauthBindSchema, oauthCallbackSchema } from '../validation';
import { loginResultSchema } from './auth';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 当前用户绑定的第三方账号 */
export const oauthAccountSchema = z.object({
  id: z.int(),
  provider: z.enum(OAUTH_PROVIDERS),
  openId: z.string(),
  nickname: z.string().nullable(),
  avatar: z.string().nullable(),
  createdAt: z.string(),
}).meta({ id: 'OAuthAccount' });

export type OAuthAccount = z.infer<typeof oauthAccountSchema>;

/** 发起第三方登录 / 绑定时的授权链接与一次性 state（前端须暂存 state，回调时原样带回） */
export const oauthAuthUrlSchema = z.object({
  authUrl: z.string(),
  state: z.string(),
}).meta({ id: 'OAuthAuthUrl' });

export type OAuthAuthUrl = z.infer<typeof oauthAuthUrlSchema>;

/** 已启用且配置完整、可发起登录的提供方 key 列表（公开接口，不含凭据） */
export const oauthEnabledProvidersSchema = z.array(z.enum(OAUTH_PROVIDERS)).meta({ id: 'OAuthEnabledProviders', example: ['github', 'feishu'] });

/** 回调未匹配到本地账号时返回，前端转入绑定流程 */
export const oauthNeedBindSchema = z.object({
  needBind: z.literal(true),
  oauthInfo: z.object({
    provider: z.string(),
    openId: z.string(),
    nickname: z.string(),
    avatar: z.string().nullable().optional(),
  }),
}).meta({ id: 'OAuthNeedBind' });

export type OAuthNeedBind = z.infer<typeof oauthNeedBindSchema>;

export const oauthLoginResultSchema = z.union([loginResultSchema, oauthNeedBindSchema]);

export type OAuthLoginResult = z.infer<typeof oauthLoginResultSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const oauthProviderParam = z.object({
  provider: z.string().meta({ description: 'OAuth 提供方', example: 'github' }),
});

export const oauthContract = defineContract('/api/auth/oauth', {
  accounts: op.get('/accounts', { access: 'authenticated', response: z.array(oauthAccountSchema), summary: '当前用户绑定列表' }),
  providers: op.get('/providers', {
    response: oauthEnabledProvidersSchema,
    summary: '已启用的第三方登录提供方',
    description: '返回已启用且凭据配置完整、可发起登录的提供方 key，不含任何凭据；未配置任何提供方时为空数组',
    public: true,
  }),
  authUrl: op.get('/{provider}', {
    params: oauthProviderParam,
    response: oauthAuthUrlSchema,
    summary: '获取登录授权链接',
    description: '返回的 state 为一次性登录凭据：前端须在跳转前暂存并在回调时原样带回，服务端单次消费',
    public: true,
  }),
  bindUrl: op.get('/{provider}/bind', {
    access: 'authenticated',
    params: oauthProviderParam,
    response: oauthAuthUrlSchema,
    summary: '获取绑定授权链接（当前用户）',
    description: 'state 绑定到当前登录用户，回调时只能由同一用户经 POST /bind 完成，不会替换当前会话',
  }),
  callback: op.post('/{provider}/callback', { params: oauthProviderParam, body: oauthCallbackSchema, response: oauthLoginResultSchema, summary: 'OAuth 登录回调', public: true }),
  bind: op.post('/bind', { access: 'authenticated', body: oauthBindSchema, summary: '绑定 OAuth 账号' }),
  unbind: op.delete('/unbind/{provider}', { access: 'authenticated', params: oauthProviderParam, summary: '解绑 OAuth 账号' }),
}, { tags: ['OAuth'] });
