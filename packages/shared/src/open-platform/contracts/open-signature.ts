import * as z from 'zod';
import { defineContract, op } from '../../core/contract';
import { openSignatureVerifySchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 在线计算 / 校验签名的结果 */
export const openSignatureResultSchema = z.object({
  signature: z.string().meta({ description: 'HMAC-SHA256 十六进制签名，即 X-Signature' }),
  stringToSign: z.string(),
  matched: z.boolean().optional().meta({ description: '传入待校验签名时返回是否匹配' }),
}).meta({ id: 'OpenSignatureResult' });

export type OpenSignatureResult = z.infer<typeof openSignatureResultSchema>;

/** 签名算法说明（供验签工具页展示） */
export const openSignatureAlgorithmSchema = z.object({
  algorithm: z.string().meta({ example: 'HMAC-SHA256' }),
  timestampWindow: z.int().meta({ description: '允许的时间戳偏移窗口（秒）' }),
  headers: z.object({
    appKey: z.string(),
    timestamp: z.string(),
    nonce: z.string(),
    signature: z.string(),
  }),
  stringToSignFormat: z.string().meta({ description: '待签名字符串拼装格式' }),
  steps: z.array(z.string()),
}).meta({ id: 'OpenSignatureAlgorithm' });

export type OpenSignatureAlgorithm = z.infer<typeof openSignatureAlgorithmSchema>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const openSignatureContract = defineContract('/api/open-signature', {
  algorithm: op.get('/algorithm', { access: { permission: 'open:signature:use' }, response: openSignatureAlgorithmSchema, summary: '获取签名算法说明' }),
  verify: op.post('/verify', { access: { permission: 'open:signature:use' }, body: openSignatureVerifySchema, response: openSignatureResultSchema, summary: '在线计算 / 校验请求签名' }),
}, { tags: ['OpenSignature'] });
