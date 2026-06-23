import { wechatApiPost } from './api';
import type { MpCredential } from './api';

export interface WechatMaterialItem {
  media_id: string;
  name: string;
  update_time: number;
  url?: string;
}

interface BatchgetResponse {
  errcode?: number;
  errmsg?: string;
  total_count?: number;
  item_count?: number;
  item?: WechatMaterialItem[];
}

/** 批量拉取永久素材（type: image/voice/video/news） */
export async function batchGetWechatMaterials(
  account: MpCredential,
  type: 'image' | 'voice' | 'video' | 'news',
  offset = 0,
  count = 20,
): Promise<{ total: number; items: WechatMaterialItem[] }> {
  const data = await wechatApiPost<BatchgetResponse>(account, '/cgi-bin/material/batchget_material', { type, offset, count });
  return { total: data.total_count ?? 0, items: data.item ?? [] };
}

/** 删除永久素材 */
export async function deleteWechatMaterial(account: MpCredential, mediaId: string): Promise<void> {
  await wechatApiPost<{ errcode?: number; errmsg?: string }>(account, '/cgi-bin/material/del_material', { media_id: mediaId });
}
