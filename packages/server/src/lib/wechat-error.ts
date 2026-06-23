import { HTTPException } from 'hono/http-exception';
import { WechatApiError } from './wechat';

/** 将微信调用异常统一映射为 HTTP 错误：业务错误 400，网络/其它 502。 */
export function mapWechatError(err: unknown): never {
  if (err instanceof WechatApiError) throw new HTTPException(400, { message: err.message });
  throw new HTTPException(502, { message: '调用微信接口失败，请检查网络或稍后重试' });
}
