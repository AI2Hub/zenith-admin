import { ensureMpAccountExists } from './mp-account.service';
import { buildJsSdkConfig } from '../lib/wechat';
import { mapWechatError } from '../lib/wechat-error';
import type { JsSdkConfig } from '../lib/wechat/jssdk';

/** 生成 JS-SDK wx.config 注入参数（基于 jsapi_ticket 对目标 URL 做 sha1 签名）。 */
export async function getMpJsConfig(accountId: number, url: string): Promise<JsSdkConfig> {
  const account = await ensureMpAccountExists(accountId);
  try {
    return await buildJsSdkConfig(account, url);
  } catch (err) {
    return mapWechatError(err);
  }
}
