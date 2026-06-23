import { wechatApiGet, wechatApiPost } from './api';
import type { MpCredential } from './api';

export interface WechatTemplate {
  template_id: string;
  title: string;
  content: string;
  example: string;
  primary_industry?: string;
  deputy_industry?: string;
}

interface GetAllResponse {
  errcode?: number;
  errmsg?: string;
  template_list?: WechatTemplate[];
}

/** 获取已添加至账号下的所有模板 */
export async function getAllPrivateTemplates(account: MpCredential): Promise<WechatTemplate[]> {
  const data = await wechatApiGet<GetAllResponse>(account, '/cgi-bin/template/get_all_private_template');
  return data.template_list ?? [];
}

interface SendResponse {
  errcode?: number;
  errmsg?: string;
  msgid?: number;
}

/** 发送模板消息，返回 msgid */
export async function sendTemplateMessage(
  account: MpCredential,
  params: { openid: string; templateId: string; url?: string; data: Record<string, { value: string; color?: string }> },
): Promise<string> {
  const data = await wechatApiPost<SendResponse>(account, '/cgi-bin/message/template/send', {
    touser: params.openid,
    template_id: params.templateId,
    url: params.url ?? '',
    data: params.data,
  });
  return data.msgid != null ? String(data.msgid) : '';
}
