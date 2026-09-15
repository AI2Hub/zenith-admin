import * as z from 'zod';

export const SIGNATURE_POLICIES = ['reusable', 'handwritten'] as const;
export const signaturePolicySchema = z.enum(SIGNATURE_POLICIES);
export type SignaturePolicy = z.infer<typeof signaturePolicySchema>;
export const SIGNATURE_SOURCES = ['drawn', 'saved'] as const;
export const SIGNATURE_MAX_IMAGE_BYTES = 512 * 1024;
export const SIGNATURE_MAX_WIDTH = 2048;
export const SIGNATURE_MAX_HEIGHT = 1024;
export const SIGNATURE_MAX_DATA_URL_LENGTH = 22 + Math.ceil(SIGNATURE_MAX_IMAGE_BYTES / 3) * 4;

/** 只接受 PNG data URL；图片解码、尺寸及空白校验由服务端执行。 */
export const signatureDataUrlSchema = z.string().max(SIGNATURE_MAX_DATA_URL_LENGTH)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, '请提供 PNG 格式的手写签名');
export const signatureInputSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('drawn'), dataUrl: signatureDataUrlSchema }).strict(),
  z.object({ source: z.literal('saved'), signatureId: z.number().int().positive(), version: z.number().int().positive() }).strict(),
]).meta({ id: 'SignatureInput' });
export type SignatureInput = z.infer<typeof signatureInputSchema>;

/** 签署时固化的证据；客户端不能以此对象替代新的签名输入。 */
export const signatureSnapshotSchema = z.object({
  dataUrl: signatureDataUrlSchema,
  source: z.enum(SIGNATURE_SOURCES),
  signerId: z.number().int().positive(),
  signerName: z.string(),
  signedAt: z.string(),
  signatureId: z.number().int().positive().nullable(),
  signatureVersion: z.number().int().positive().nullable(),
}).strict().meta({ id: 'SignatureSnapshot' });
export type SignatureSnapshot = z.infer<typeof signatureSnapshotSchema>;
