import { fileStorageConfigs } from '../db/schema';
import type { DbExecutor } from '../db/types';
import type { createFileStorageConfigSchema } from '@zenith/shared';
import type { z } from '@hono/zod-openapi';

type StorageInput = z.infer<typeof createFileStorageConfigSchema>;

// ─── 数据映射 ─────────────────────────────────────────────────────────────────

export function mapFileStorageConfig(row: typeof fileStorageConfigs.$inferSelect) {
  return {
    ...row,
    basePath: row.basePath ?? null,
    localRootPath: row.localRootPath ?? null,
    ossRegion: row.ossRegion ?? null,
    ossEndpoint: row.ossEndpoint ?? null,
    ossBucket: row.ossBucket ?? null,
    ossAccessKeyId: row.ossAccessKeyId ?? null,
    ossAccessKeySecret: row.ossAccessKeySecret ?? null,
    s3Region: row.s3Region ?? null,
    s3Endpoint: row.s3Endpoint ?? null,
    s3Bucket: row.s3Bucket ?? null,
    s3AccessKeyId: row.s3AccessKeyId ?? null,
    s3SecretAccessKey: row.s3SecretAccessKey ?? null,
    s3ForcePathStyle: row.s3ForcePathStyle ?? null,
    cosRegion: row.cosRegion ?? null,
    cosBucket: row.cosBucket ?? null,
    cosSecretId: row.cosSecretId ?? null,
    cosSecretKey: row.cosSecretKey ?? null,
    remark: row.remark ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── 多态存储配置解包 ─────────────────────────────────────────────────────────

export function toStoragePayload(input: StorageInput) {
  const common = {
    name: input.name,
    provider: input.provider,
    status: input.status,
    isDefault: input.isDefault,
    basePath: input.basePath ?? null,
    remark: input.remark ?? null,
  };
  const nullS3 = { s3Region: null, s3Endpoint: null, s3Bucket: null, s3AccessKeyId: null, s3SecretAccessKey: null, s3ForcePathStyle: null };
  const nullCos = { cosRegion: null, cosBucket: null, cosSecretId: null, cosSecretKey: null };
  const nullOss = { ossRegion: null, ossEndpoint: null, ossBucket: null, ossAccessKeyId: null, ossAccessKeySecret: null };

  if (input.provider === 'local') {
    return { ...common, localRootPath: input.localRootPath ?? null, ...nullOss, ...nullS3, ...nullCos };
  }
  if (input.provider === 'oss') {
    return {
      ...common, localRootPath: null,
      ossRegion: input.ossRegion ?? null, ossEndpoint: input.ossEndpoint ?? null,
      ossBucket: input.ossBucket ?? null, ossAccessKeyId: input.ossAccessKeyId ?? null,
      ossAccessKeySecret: input.ossAccessKeySecret ?? null, ...nullS3, ...nullCos,
    };
  }
  if (input.provider === 's3') {
    return {
      ...common, localRootPath: null, ...nullOss,
      s3Region: input.s3Region ?? null, s3Endpoint: input.s3Endpoint ?? null,
      s3Bucket: input.s3Bucket ?? null, s3AccessKeyId: input.s3AccessKeyId ?? null,
      s3SecretAccessKey: input.s3SecretAccessKey ?? null, s3ForcePathStyle: input.s3ForcePathStyle ?? null,
      ...nullCos,
    };
  }
  return {
    ...common, localRootPath: null, ...nullOss, ...nullS3,
    cosRegion: input.cosRegion ?? null, cosBucket: input.cosBucket ?? null,
    cosSecretId: input.cosSecretId ?? null, cosSecretKey: input.cosSecretKey ?? null,
  };
}

// ─── 清除默认标记 ─────────────────────────────────────────────────────────────

export async function clearDefaultFlag(executor: DbExecutor) {
  await executor.update(fileStorageConfigs).set({ isDefault: false });
}
