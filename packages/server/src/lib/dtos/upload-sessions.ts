/**
 * 分片上传会话相关 DTO
 */
import { z } from '@hono/zod-openapi';

export const UploadSessionInitDTO = z
  .object({
    uploadId: z.string(),
    chunkSize: z.number().int(),
    totalChunks: z.number().int(),
    received: z.array(z.number().int()).openapi({ description: '已接收的分片序号（从 0 计），用于断点续传' }),
  })
  .openapi('UploadSessionInit');

export const UploadChunkResultDTO = z
  .object({
    index: z.number().int(),
    received: z.array(z.number().int()),
  })
  .openapi('UploadChunkResult');

export const UploadSessionStatusDTO = z
  .object({
    uploadId: z.string(),
    status: z.enum(['uploading', 'completed', 'aborted']),
    chunkSize: z.number().int(),
    totalChunks: z.number().int(),
    received: z.array(z.number().int()),
  })
  .openapi('UploadSessionStatus');
