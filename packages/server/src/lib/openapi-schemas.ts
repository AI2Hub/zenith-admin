/**
 * 通用 OpenAPI / Zod schema 工具，供所有路由模块复用。
 *
 * 统一接口响应结构：{ code, message, data }
 *  - 成功：code = 0
 *  - 失败：code 为非零（400/401/403/404/500 等）
 *
 * 分页响应：{ list, total, page, pageSize }
 */
import { z } from '@hono/zod-openapi';

/** 通用成功响应封装：code=0 + 任意 data */
export function apiResponse<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    code: z.literal(0),
    message: z.string(),
    data,
  });
}

/** 通用成功响应（data 为 null） */
export const MessageResponse = z.object({
  code: z.literal(0),
  message: z.string(),
  data: z.null().optional(),
});

/** 通用错误响应 */
export const ErrorResponse = z.object({
  code: z.number(),
  message: z.string(),
  data: z.null().optional().nullable(),
});

/** 分页响应 */
export function paginatedResponse<T extends z.ZodTypeAny>(item: T) {
  return apiResponse(
    z.object({
      list: z.array(item),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    }),
  );
}

/** 构造 application/json content */
export function jsonContent<T extends z.ZodTypeAny>(schema: T) {
  return { 'application/json': { schema } };
}

/** 常用分页入参 */
export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(10),
});

/** 常用错误响应集合（复制到 responses 里） */
export const commonErrorResponses = {
  400: { content: jsonContent(ErrorResponse), description: '请求参数错误' },
  401: { content: jsonContent(ErrorResponse), description: '未登录或 token 失效' },
  403: { content: jsonContent(ErrorResponse), description: '无权限' },
  404: { content: jsonContent(ErrorResponse), description: '资源不存在' },
  500: { content: jsonContent(ErrorResponse), description: '服务端错误' },
} as const;

/** id 参数 schema（path/query 通用） */
export const IdParam = z.object({
  id: z.coerce.number().int().positive(),
});

/** 成功响应常量：200 + ApiResponse<any> */
export function ok<T extends z.ZodTypeAny>(schema: T, description = '操作成功') {
  return {
    200: { content: jsonContent(apiResponse(schema)), description },
  };
}

/** 分页成功响应 */
export function okPaginated<T extends z.ZodTypeAny>(item: T, description = '列表数据') {
  return {
    200: { content: jsonContent(paginatedResponse(item)), description },
  };
}
