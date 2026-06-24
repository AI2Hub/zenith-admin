import { wechatApiPost } from './api';
import type { MpCredential } from './api';

interface CustomSendResponse {
  errcode?: number;
  errmsg?: string;
}

/** 发送客服文本消息（需在用户最近 48 小时内有交互） */
export async function sendCustomTextMessage(account: MpCredential, openid: string, content: string): Promise<void> {
  await wechatApiPost<CustomSendResponse>(account, '/cgi-bin/message/custom/send', {
    touser: openid,
    msgtype: 'text',
    text: { content },
  });
}

export interface CustomMessagePayload {
  msgType: 'text' | 'image' | 'voice' | 'video' | 'news';
  /** 文本内容（text）/ 视频标题（video） */
  content?: string | null;
  /** 素材 media_id（image/voice/video 用永久素材，news 用图文素材 media_id） */
  mediaId?: string | null;
}

/** 发送客服富媒体消息（文本/图片/语音/视频/图文，需用户最近 48 小时内有交互） */
export async function sendCustomServiceMessage(account: MpCredential, openid: string, payload: CustomMessagePayload): Promise<void> {
  const body: Record<string, unknown> = { touser: openid, msgtype: payload.msgType === 'news' ? 'mpnews' : payload.msgType };
  switch (payload.msgType) {
    case 'text': body.text = { content: payload.content ?? '' }; break;
    case 'image': body.image = { media_id: payload.mediaId ?? '' }; break;
    case 'voice': body.voice = { media_id: payload.mediaId ?? '' }; break;
    case 'video': body.video = { media_id: payload.mediaId ?? '', title: payload.content ?? '', description: '' }; break;
    case 'news': body.mpnews = { media_id: payload.mediaId ?? '' }; break;
  }
  await wechatApiPost<CustomSendResponse>(account, '/cgi-bin/message/custom/send', body);
}

