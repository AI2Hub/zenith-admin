import * as z from 'zod';
import { auditFieldsSchema, idParam, idQuery, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { IDENTITY_PROVIDER_STATUSES, IDENTITY_PROVIDER_SYNC_STATUSES, IDENTITY_PROVIDER_TYPES } from '../constants';
import {
  createTenantIdentityProviderSchema,
  identityProviderAttributeMappingSchema,
  searchIdentityProviderUsersSchema,
  syncIdentityProviderUsersSchema,
  updateTenantIdentityProviderSchema,
} from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export type IdentityProviderAttributeMapping = z.infer<typeof identityProviderAttributeMappingSchema>;

/** 企业身份源配置；clientSecret / samlCertificate / ldapBindPassword 以掩码回显 */
export const tenantIdentityProviderSchema = z.object({
  id: z.int(),
  tenantId: z.int().nullable(),
  tenantName: z.string().nullable().optional(),
  name: z.string(),
  code: z.string(),
  type: z.enum(IDENTITY_PROVIDER_TYPES),
  status: z.enum(IDENTITY_PROVIDER_STATUSES),
  issuer: z.string().nullable().optional(),
  authorizationEndpoint: z.string().nullable().optional(),
  tokenEndpoint: z.string().nullable().optional(),
  userinfoEndpoint: z.string().nullable().optional(),
  jwksUri: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  clientSecret: z.string(),
  scopes: z.string(),
  samlSsoUrl: z.string().nullable().optional(),
  samlEntityId: z.string().nullable().optional(),
  samlCertificate: z.string(),
  ldapUrl: z.string().nullable().optional(),
  ldapStartTls: z.boolean(),
  ldapSkipTlsVerify: z.boolean(),
  ldapBaseDn: z.string().nullable().optional(),
  ldapBindDn: z.string().nullable().optional(),
  ldapBindPassword: z.string(),
  ldapUserFilter: z.string().nullable().optional(),
  ldapUserSearchFilter: z.string().nullable().optional(),
  ldapSyncFilter: z.string().nullable().optional(),
  ldapGroupBaseDn: z.string().nullable().optional(),
  ldapGroupFilter: z.string().nullable().optional(),
  ldapTimeoutMs: z.int(),
  attributeMapping: identityProviderAttributeMappingSchema,
  jitEnabled: z.boolean(),
  autoLinkByEmail: z.boolean(),
  defaultRoleIds: z.array(z.int()),
  remark: z.string().nullable().optional(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'TenantIdentityProvider' });

export type TenantIdentityProvider = z.infer<typeof tenantIdentityProviderSchema>;

export const ldapDirectoryUserSchema = z.object({
  dn: z.string(),
  subject: z.string(),
  email: z.string().nullable().optional(),
  username: z.string(),
  nickname: z.string(),
  phone: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
}).meta({ id: 'LdapDirectoryUser' });

export type LdapDirectoryUser = z.infer<typeof ldapDirectoryUserSchema>;

export const identityProviderConnectionTestResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  sampleUsers: z.array(ldapDirectoryUserSchema),
}).meta({ id: 'IdentityProviderConnectionTestResult' });

export type IdentityProviderConnectionTestResult = z.infer<typeof identityProviderConnectionTestResultSchema>;

export const identityProviderSyncResultSchema = z.object({
  logId: z.int(),
  status: z.enum(IDENTITY_PROVIDER_SYNC_STATUSES),
  total: z.int(),
  created: z.int(),
  linked: z.int(),
  updated: z.int(),
  skipped: z.int(),
  failed: z.int(),
  message: z.string(),
}).meta({ id: 'IdentityProviderSyncResult' });

export type IdentityProviderSyncResult = z.infer<typeof identityProviderSyncResultSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const identityProviderListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称 / 编码'),
  tenantId: idQuery(),
  type: queryEnum(IDENTITY_PROVIDER_TYPES),
  status: queryEnum(IDENTITY_PROVIDER_STATUSES, { dict: 'common_status' }),
});

export const identityProviderContract = defineContract('/api/identity-providers', {
  list: op.get('/', { access: { permission: 'system:identity-provider:manage' }, query: identityProviderListQuery, response: paginated(tenantIdentityProviderSchema), summary: '企业身份源列表' }),
  detail: op.get('/{id}', { access: { permission: 'system:identity-provider:manage' }, params: idParam, response: tenantIdentityProviderSchema, summary: '企业身份源详情' }),
  test: op.post('/{id}/test', { access: { permission: 'system:identity-provider:manage' }, params: idParam, response: identityProviderConnectionTestResultSchema, summary: '测试 LDAP/AD 身份源连接' }),
  ldapUsers: op.get('/{id}/ldap/users', { access: { permission: 'system:identity-provider:manage' }, params: idParam, query: searchIdentityProviderUsersSchema, response: z.array(ldapDirectoryUserSchema), summary: '搜索 LDAP/AD 目录用户' }),
  sync: op.post('/{id}/sync', { access: { permission: 'system:identity-provider:manage' }, audit: '同步目录用户', params: idParam, body: syncIdentityProviderUsersSchema, response: identityProviderSyncResultSchema, summary: '同步 LDAP/AD 目录用户' }),
  create: op.post('/', { access: { permission: 'system:identity-provider:manage' }, audit: '创建企业身份源', body: createTenantIdentityProviderSchema, response: tenantIdentityProviderSchema, summary: '创建企业身份源' }),
  update: op.put('/{id}', { access: { permission: 'system:identity-provider:manage' }, audit: '更新企业身份源', params: idParam, body: updateTenantIdentityProviderSchema, response: tenantIdentityProviderSchema, summary: '更新企业身份源' }),
  remove: op.delete('/{id}', { access: { permission: 'system:identity-provider:manage' }, audit: '删除企业身份源', params: idParam, summary: '删除企业身份源' }),
}, { auditModule: '企业身份源', tags: ['IdentityProviders'] });
