/**
 * 业务逻辑异常，由 Service 层抛出，由全局 onError 统一处理并返回标准 JSON 响应。
 *
 * 使用示例：
 *   throw new AppError('用户名已存在', 400);
 *   throw new AppError('资源不存在', 404);
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
