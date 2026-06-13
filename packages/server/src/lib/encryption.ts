/**
 * 字段级 AES-256-GCM 对称加密工具。
 * 用于在数据库中安全存储 SSH 密码、私钥等敏感字段。
 *
 * 加密密钥由环境变量 `FIELD_ENCRYPTION_KEY`（32 字节 hex 字符串）提供；
 * 若未配置，则回退到 `JWT_SECRET` 派生密钥，保证开发环境也能运行。
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? 'zenith-default-dev-key-not-for-production';
  // 统一 SHA-256 派生出 32 字节密钥，兼容任意长度的环境变量
  return createHash('sha256').update(raw).digest();
}

/**
 * 加密明文字符串，返回 base64 格式：`<iv(12B)><ciphertext><tag(16B)>`。
 * 若 plaintext 为 null/undefined，返回 null。
 */
export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

/**
 * 解密 `encryptField()` 生成的 base64 字符串。
 * 若 ciphertext 为 null/undefined，返回 null。
 */
export function decryptField(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null) return null;
  try {
    const key = getKey();
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(buf.length - TAG_BYTES);
    const encrypted = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return null;
  }
}
