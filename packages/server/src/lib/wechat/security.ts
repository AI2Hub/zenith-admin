import { wechatApiPost } from './api';
import type { MpCredential } from './api';

interface MsgSecCheckResponse {
  errcode?: number;
  errmsg?: string;
  /** v1 接口：内容是否含违规（errcode 87014 表示违规）；这里以 errcode 判断 */
  result?: { suggest?: string; label?: number };
}

export interface ContentSecResult {
  /** 是否通过（无风险） */
  pass: boolean;
  /** 命中标签/建议（risky/pass/review） */
  suggest?: string;
}

/**
 * 文本内容安全校验（msg_sec_check）。
 * 微信约定：errcode 0 通过；87014 命中违规内容。其余 errcode 由 wechatApiPost 抛 WechatApiError。
 * 这里对 87014 做特殊处理，返回 { pass:false }，而非抛错，便于上层给出业务级提示。
 */
export async function msgSecCheck(account: MpCredential, content: string): Promise<ContentSecResult> {
  try {
    const data = await wechatApiPost<MsgSecCheckResponse>(account, '/wxa/msg_sec_check', { version: 2, scene: 1, content });
    return { pass: true, suggest: data.result?.suggest ?? 'pass' };
  } catch (err) {
    // 87014 = 内容含有违法违规内容
    if (err instanceof Error && /87014/.test(err.message)) {
      return { pass: false, suggest: 'risky' };
    }
    throw err;
  }
}
