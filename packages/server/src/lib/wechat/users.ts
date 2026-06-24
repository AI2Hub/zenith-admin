import { wechatApiGet, wechatApiPost } from './api';
import type { MpCredential } from './api';

interface UserGetResponse {
  errcode?: number;
  errmsg?: string;
  total?: number;
  count?: number;
  data?: { openid: string[] };
  next_openid?: string;
}

/** 拉取一批关注者 openid（每次最多 10000 个，用 next_openid 翻页） */
export async function getFollowerOpenids(
  account: MpCredential,
  nextOpenid = '',
): Promise<{ openids: string[]; total: number; nextOpenid: string }> {
  const data = await wechatApiGet<UserGetResponse>(
    account,
    '/cgi-bin/user/get',
    nextOpenid ? { next_openid: nextOpenid } : {},
  );
  return { openids: data.data?.openid ?? [], total: data.total ?? 0, nextOpenid: data.next_openid ?? '' };
}

export interface WechatFanInfo {
  openid: string;
  /** 0=未关注 1=已关注 */
  subscribe: number;
  nickname?: string;
  /** 0 未知 / 1 男 / 2 女 */
  sex?: number;
  language?: string;
  city?: string;
  province?: string;
  country?: string;
  headimgurl?: string;
  subscribe_time?: number;
  remark?: string;
  tagid_list?: number[];
}

interface BatchGetResponse {
  errcode?: number;
  errmsg?: string;
  user_info_list?: WechatFanInfo[];
}

/** 批量拉取粉丝详情（每次最多 100 个 openid，由调用方分片） */
export async function batchGetFanInfo(account: MpCredential, openids: string[]): Promise<WechatFanInfo[]> {
  if (openids.length === 0) return [];
  const body = { user_list: openids.map((openid) => ({ openid, lang: 'zh_CN' })) };
  const data = await wechatApiPost<BatchGetResponse>(account, '/cgi-bin/user/info/batchget', body);
  return data.user_info_list ?? [];
}

interface BlacklistGetResponse {
  errcode?: number;
  errmsg?: string;
  total?: number;
  count?: number;
  data?: { openid: string[] };
  next_openid?: string;
}

/** 拉取黑名单 openid（每次最多 10000 个，用 begin_openid 翻页） */
export async function getWechatBlacklist(
  account: MpCredential,
  beginOpenid = '',
): Promise<{ openids: string[]; total: number; nextOpenid: string }> {
  const data = await wechatApiPost<BlacklistGetResponse>(account, '/cgi-bin/tags/members/getblacklist', beginOpenid ? { begin_openid: beginOpenid } : {});
  return { openids: data.data?.openid ?? [], total: data.total ?? 0, nextOpenid: data.next_openid ?? '' };
}

/** 批量拉黑粉丝（每次最多 20 个 openid） */
export async function batchBlacklistFans(account: MpCredential, openids: string[]): Promise<void> {
  await wechatApiPost<{ errcode?: number; errmsg?: string }>(account, '/cgi-bin/tags/members/batchblacklist', { openid_list: openids });
}

/** 批量移出黑名单（每次最多 20 个 openid） */
export async function batchUnblacklistFans(account: MpCredential, openids: string[]): Promise<void> {
  await wechatApiPost<{ errcode?: number; errmsg?: string }>(account, '/cgi-bin/tags/members/batchunblacklist', { openid_list: openids });
}
