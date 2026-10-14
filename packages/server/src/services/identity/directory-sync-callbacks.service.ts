import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { directorySyncSources, oauthConfigs, type DirectorySyncSourceRow } from '../../db/schema';
import { msgSignature, decryptWechatMessage, encryptWechatMessage } from '../../lib/wechat/crypto';
import { timingSafeCompare } from '../../lib/wechat/signature';
import { parseWechatXml } from '../../lib/wechat/xml';
import { decryptFeishuEvent } from '../../lib/feishu-crypto';
import logger from '../../lib/logger';

/**
 * 平台通讯录变更回调（钉钉 / 企业微信 / 飞书）。
 *
 * 设计：回调只做验签 + 置位 `pendingCallbackSync`，由系统调度 tick（每分钟）
 * 消费该标记并对源执行一次幂等全量同步（trigger = callback）。
 * 不做单事件增量写入——同步引擎本身幂等，事件仅作为触发器，多事件天然合并。
 */

/** 按回调 URL Key 加载启用的同步源（回调无登录上下文，不做租户过滤） */
export async function getSourceByCallbackKey(key: string): Promise<DirectorySyncSourceRow | null> {
  if (!key || key.length > 64) return null;
  const [row] = await db.select().from(directorySyncSources)
    .where(eq(directorySyncSources.callbackUrlKey, key))
    .limit(1);
  return row ?? null;
}

/** 置位回调同步标记；tick 扫描到后触发一次同步并复位 */
export async function markCallbackSyncPending(sourceId: number): Promise<void> {
  await db.update(directorySyncSources).set({
    pendingCallbackSync: true,
    callbackLastEventAt: new Date(),
  }).where(and(eq(directorySyncSources.id, sourceId), eq(directorySyncSources.status, 'enabled')));
}

export interface CallbackHandleResult {
  status: 200 | 403 | 400;
  /** 响应体：字符串按 text/plain 返回，对象按 JSON 返回 */
  body: string | Record<string, unknown>;
}

// ─── 钉钉 ─────────────────────────────────────────────────────────────────────
/** 钉钉回调关注的通讯录事件（其余事件验签通过后直接确认，不触发同步） */
const DINGTALK_CONTACT_EVENTS = new Set([
  'user_add_org', 'user_modify_org', 'user_leave_org', 'user_active_org',
  'org_dept_create', 'org_dept_modify', 'org_dept_remove',
]);

async function dingTalkReceiveId(): Promise<string> {
  const [row] = await db.select({ clientId: oauthConfigs.clientId }).from(oauthConfigs)
    .where(eq(oauthConfigs.provider, 'dingtalk')).limit(1);
  return row?.clientId ?? '';
}

/**
 * 钉钉事件回调：JSON body { encrypt }，query signature/timestamp/nonce。
 * 无论何种事件都必须返回加密的 "success" 确认包，否则钉钉持续重推。
 */
export async function handleDingTalkCallback(
  source: DirectorySyncSourceRow,
  query: { signature?: string; timestamp?: string; nonce?: string },
  body: { encrypt?: string },
): Promise<CallbackHandleResult> {
  const token = source.callbackToken?.trim();
  const aesKey = source.callbackAesKey?.trim();
  if (!token || !aesKey) return { status: 403, body: 'callback not configured' };
  const encrypt = body.encrypt;
  if (!encrypt || !query.timestamp || !query.nonce) return { status: 400, body: 'bad request' };
  if (!timingSafeCompare(msgSignature(token, query.timestamp, query.nonce, encrypt), query.signature)) {
    return { status: 403, body: 'invalid signature' };
  }
  try {
    // 钉钉与微信同一套 WXBizMsgCrypt；receiveId 因应用形态而异，此处不强校验
    const plain = decryptWechatMessage(aesKey, '', encrypt);
    const event = JSON.parse(plain) as { EventType?: string };
    if (DINGTALK_CONTACT_EVENTS.has(event.EventType ?? '')) {
      await markCallbackSyncPending(source.id);
    }
  } catch (err) {
    logger.warn(`[directory-sync] 钉钉回调解密失败（source ${source.id}）: ${(err as Error).message}`);
    return { status: 403, body: 'decrypt failed' };
  }
  // 加密 success 确认包
  const receiveId = await dingTalkReceiveId();
  const responseEncrypt = encryptWechatMessage(aesKey, receiveId, 'success');
  const timeStamp = String(Date.now());
  const nonce = Math.random().toString(36).slice(2, 10);
  return {
    status: 200,
    body: {
      msg_signature: msgSignature(token, timeStamp, nonce, responseEncrypt),
      timeStamp,
      nonce,
      encrypt: responseEncrypt,
    },
  };
}

// ─── 企业微信 ─────────────────────────────────────────────────────────────────
async function weComReceiveId(): Promise<string> {
  const [row] = await db.select({ corpId: oauthConfigs.corpId }).from(oauthConfigs)
    .where(eq(oauthConfigs.provider, 'wechat_work')).limit(1);
  return row?.corpId ?? '';
}

/** 企业微信 URL 验证（GET）：验签后解密 echostr 并原样返回明文 */
export async function handleWeComVerify(
  source: DirectorySyncSourceRow,
  query: { msg_signature?: string; timestamp?: string; nonce?: string; echostr?: string },
): Promise<CallbackHandleResult> {
  const token = source.callbackToken?.trim();
  const aesKey = source.callbackAesKey?.trim();
  if (!token || !aesKey) return { status: 403, body: 'callback not configured' };
  const { echostr } = query;
  if (!echostr || !query.timestamp || !query.nonce) return { status: 400, body: 'bad request' };
  if (!timingSafeCompare(msgSignature(token, query.timestamp, query.nonce, echostr), query.msg_signature)) {
    return { status: 403, body: 'invalid signature' };
  }
  try {
    const receiveId = await weComReceiveId();
    return { status: 200, body: decryptWechatMessage(aesKey, receiveId, echostr) };
  } catch (err) {
    logger.warn(`[directory-sync] 企微 URL 验证解密失败（source ${source.id}）: ${(err as Error).message}`);
    return { status: 403, body: 'decrypt failed' };
  }
}

/** 企业微信通讯录变更回调（POST，XML 密文） */
export async function handleWeComCallback(
  source: DirectorySyncSourceRow,
  query: { msg_signature?: string; timestamp?: string; nonce?: string },
  rawXml: string,
): Promise<CallbackHandleResult> {
  const token = source.callbackToken?.trim();
  const aesKey = source.callbackAesKey?.trim();
  if (!token || !aesKey) return { status: 403, body: 'callback not configured' };
  const encrypt = parseWechatXml(rawXml).Encrypt;
  if (!encrypt || !query.timestamp || !query.nonce) return { status: 400, body: 'bad request' };
  if (!timingSafeCompare(msgSignature(token, query.timestamp, query.nonce, encrypt), query.msg_signature)) {
    return { status: 403, body: 'invalid signature' };
  }
  try {
    const receiveId = await weComReceiveId();
    const plain = decryptWechatMessage(aesKey, receiveId, encrypt);
    const fields = parseWechatXml(plain);
    // 通讯录事件：Event=change_contact，ChangeType=create_user/update_user/delete_user/create_party/...
    if (fields.Event === 'change_contact') {
      await markCallbackSyncPending(source.id);
    }
  } catch (err) {
    logger.warn(`[directory-sync] 企微回调解密失败（source ${source.id}）: ${(err as Error).message}`);
    return { status: 403, body: 'decrypt failed' };
  }
  return { status: 200, body: 'success' };
}

// ─── 飞书 ─────────────────────────────────────────────────────────────────────
interface FeishuEventBody {
  encrypt?: string;
  type?: string;
  challenge?: string;
  token?: string;
  schema?: string;
  header?: { event_type?: string; token?: string };
  event?: Record<string, unknown>;
}

/** 飞书事件订阅回调：支持明文与 Encrypt Key 加密两种模式，含 url_verification 握手 */
export async function handleFeishuCallback(
  source: DirectorySyncSourceRow,
  body: FeishuEventBody,
): Promise<CallbackHandleResult> {
  let event = body;
  if (typeof body.encrypt === 'string') {
    const aesKey = source.callbackAesKey?.trim();
    if (!aesKey) return { status: 403, body: 'encrypt key not configured' };
    try {
      event = JSON.parse(decryptFeishuEvent(aesKey, body.encrypt)) as FeishuEventBody;
    } catch (err) {
      logger.warn(`[directory-sync] 飞书回调解密失败（source ${source.id}）: ${(err as Error).message}`);
      return { status: 403, body: 'decrypt failed' };
    }
  }
  // Verification Token 校验（明文模式与解密后均携带）
  const expectedToken = source.callbackToken?.trim();
  const actualToken = event.token ?? event.header?.token;
  if (expectedToken && !timingSafeCompare(expectedToken, actualToken)) {
    return { status: 403, body: 'invalid token' };
  }
  if (event.type === 'url_verification') {
    return { status: 200, body: { challenge: event.challenge ?? '' } };
  }
  const eventType = event.header?.event_type ?? '';
  if (eventType.startsWith('contact.')) {
    await markCallbackSyncPending(source.id);
  }
  return { status: 200, body: {} };
}
