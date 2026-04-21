import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';

// Accepts both Zod v3 and Zod v4 schemas (mirrors @hono/zod-validator's ZodSchema type)
type ZodValidatorSchema = Parameters<typeof zValidator>[1];

/**
 * 封装 @hono/zod-validator，统一错误响应格式为 { code: 400, message: string, data: null }
 *
 * @example
 * router.post('/', guard(...), zValidate('json', createSchema), async (c) => {
 *   const body = c.req.valid('json'); // 已验证，类型安全
 * });
 */
export function zValidate<T extends ZodValidatorSchema, K extends keyof ValidationTargets>(
  target: K,
  schema: T,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        { code: 400, message: result.error.issues[0]?.message ?? '参数校验失败', data: null },
        400,
      );
    }
  });
}
