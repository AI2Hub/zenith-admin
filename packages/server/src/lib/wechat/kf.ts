import { wechatApiGet, wechatApiPost } from './api';
import type { MpCredential } from './api';

export interface WechatKfItem {
  kf_account: string;
  kf_nick: string;
  kf_id?: string;
  kf_headimgurl?: string;
  invite_status?: string;
  invite_wx?: string;
}

interface KfListResponse {
  errcode?: number;
  errmsg?: string;
  kf_list?: WechatKfItem[];
}

/** 获取所有客服账号 */
export async function getWechatKfList(account: MpCredential): Promise<WechatKfItem[]> {
  const data = await wechatApiGet<KfListResponse>(account, '/cgi-bin/customservice/getkflist');
  return data.kf_list ?? [];
}

/** 添加客服账号（kf_account 形如 xxx@公众号微信号） */
export async function addWechatKfAccount(account: MpCredential, kfAccount: string, nickname: string): Promise<void> {
  await wechatApiPost<{ errcode?: number; errmsg?: string }>(account, '/customservice/kfaccount/add', { kf_account: kfAccount, nickname });
}

/** 修改客服账号昵称 */
export async function updateWechatKfAccount(account: MpCredential, kfAccount: string, nickname: string): Promise<void> {
  await wechatApiPost<{ errcode?: number; errmsg?: string }>(account, '/customservice/kfaccount/update', { kf_account: kfAccount, nickname });
}

/** 删除客服账号 */
export async function delWechatKfAccount(account: MpCredential, kfAccount: string): Promise<void> {
  await wechatApiGet<{ errcode?: number; errmsg?: string }>(account, '/customservice/kfaccount/del', { kf_account: kfAccount });
}
