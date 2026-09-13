import * as z from 'zod';
import { idParam, paginated, paginationQuery, queryEnum, keywordQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { uploadCertSchema } from '../../platform/validation';
import { SSL_CERT_DOWNLOAD_KINDS, SSL_CERT_STATUSES, SSL_CERT_TYPES, SSL_CERT_TYPE_OPTIONS } from '../constants';
import { generateSelfSignedCertSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const sslCertificateSchema = z.object({
  id: z.int(),
  name: z.string(),
  domain: z.string(),
  type: z.enum(SSL_CERT_TYPES),
  certPath: z.string().nullable(),
  keyPath: z.string().nullable(),
  issuer: z.string().nullable(),
  subject: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  fingerprint: z.string().nullable(),
  serialNumber: z.string().nullable(),
  status: z.enum(SSL_CERT_STATUSES),
  autoRenew: z.boolean(),
  daysRemaining: z.int().nullable().meta({ description: '距到期天数；无有效期信息为 null' }),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'SslCertificate' });

export type SslCertificate = z.infer<typeof sslCertificateSchema>;

export const sslCertificateCreatedSchema = z.object({ id: z.int() }).meta({ id: 'SslCertificateCreated' });

export type SslCertificateCreated = z.infer<typeof sslCertificateCreatedSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const sslCertificateListQuery = paginationQuery.extend({
  keyword: keywordQuery(undefined, { max: 256 }),
  type: queryEnum(SSL_CERT_TYPES, { options: SSL_CERT_TYPE_OPTIONS }),
});

export const sslCertificateDownloadQuery = z.object({
  kind: queryEnum(SSL_CERT_DOWNLOAD_KINDS).default('cert').meta({ description: '下载证书（cert）或私钥（key）', example: 'cert' }),
});

export const sslCertificateContract = defineContract('/api/ssl-certificates', {
  list: op.get('/', { access: { permission: 'system:ssl:view' }, query: sslCertificateListQuery, response: paginated(sslCertificateSchema), summary: 'SSL 证书列表' }),
  generate: op.post('/generate', { access: { permission: 'system:ssl:create' }, audit: { description: '生成 SSL 证书', recordBody: false }, body: generateSelfSignedCertSchema, response: sslCertificateCreatedSchema, summary: '生成自签名证书' }),
  upload: op.post('/upload', { access: { permission: 'system:ssl:create' }, audit: { description: '上传 SSL 证书', recordBody: false }, body: uploadCertSchema, response: sslCertificateCreatedSchema, summary: '上传自定义证书' }),
  detail: op.get('/{id}', { access: { permission: 'system:ssl:view' }, params: idParam, response: sslCertificateSchema, summary: 'SSL 证书详情' }),
  download: op.get('/{id}/download', { access: { permission: 'system:ssl:view' }, params: idParam, query: sslCertificateDownloadQuery, kind: 'file', summary: '下载 SSL 证书文件' }),
  remove: op.delete('/{id}', { access: { permission: 'system:ssl:delete' }, audit: '删除 SSL 证书', params: idParam, summary: '删除 SSL 证书' }),
}, { auditModule: 'SSL 证书', tags: ['SslCertificates'] });
