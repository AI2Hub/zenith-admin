import * as z from 'zod';
import { auditFieldsSchema, entityStatusQuery, entityStatusSchema, idParam, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { MP_ACCOUNT_TYPES, MP_ENCRYPT_MODES, MP_ACCOUNT_TYPE_OPTIONS } from '../constants';
import { createMpAccountSchema, updateMpAccountSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const mpAccountSchema = z.object({
  id: z.int(),
  name: z.string(),
  account: z.string().nullable().meta({ description: '微信号（原始 ID）' }),
  appId: z.string(),
  appSecret: z.string().meta({ description: '脱敏：列表 / 写操作返回掩码，编辑回显为空串' }),
  token: z.string(),
  encodingAesKey: z.string().nullable(),
  encryptMode: z.enum(MP_ENCRYPT_MODES),
  type: z.enum(MP_ACCOUNT_TYPES),
  qrCodeUrl: z.string().nullable(),
  isDefault: z.boolean(),
  autoCreateMember: z.boolean(),
  contentCheckEnabled: z.boolean(),
  status: entityStatusSchema,
  remark: z.string().nullable(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'MpAccount' });

export type MpAccount = z.infer<typeof mpAccountSchema>;

export const mpConnectionTestSchema = z.object({
  success: z.boolean(),
  message: z.string(),
}).meta({ id: 'MpConnectionTest' });

export type MpConnectionTest = z.infer<typeof mpConnectionTestSchema>;

// ─── 查询参数 ────────────────────────────────────────────────────────────────

export const mpAccountListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称 / 微信号 / AppID '),
  type: queryEnum(MP_ACCOUNT_TYPES, { options: MP_ACCOUNT_TYPE_OPTIONS }),
  status: entityStatusQuery,
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const mpAccountContract = defineContract('/api/mp/accounts', {
  list: op.get('/', { access: { permission: 'mp:account:list' }, query: mpAccountListQuery, response: paginated(mpAccountSchema), summary: '公众号列表' }),
  detail: op.get('/{id}', { access: { permission: 'mp:account:list' }, params: idParam, response: mpAccountSchema, summary: '获取公众号详情' }),
  create: op.post('/', { access: { permission: 'mp:account:create' }, audit: '创建公众号', body: createMpAccountSchema, response: mpAccountSchema, summary: '创建公众号' }),
  update: op.put('/{id}', { access: { permission: 'mp:account:update' }, audit: '更新公众号', params: idParam, body: updateMpAccountSchema, response: mpAccountSchema, summary: '更新公众号' }),
  setDefault: op.post('/{id}/default', { access: { permission: 'mp:account:default' }, audit: '设为默认公众号', params: idParam, response: mpAccountSchema, summary: '设为默认公众号' }),
  testConnection: op.post('/{id}/test', {
    access: { permission: 'mp:account:token' }, audit: '测试公众号连接',
    params: idParam,
    response: mpConnectionTestSchema,
    summary: '测试公众号连接',
    description: '使用账号 AppID/AppSecret 向微信换取 access_token，验证配置有效性并缓存 token。',
  }),
  remove: op.delete('/{id}', { access: { permission: 'mp:account:delete' }, audit: '删除公众号', params: idParam, summary: '删除公众号' }),
}, { auditModule: '公众号管理', tags: ['公众号管理'] });
