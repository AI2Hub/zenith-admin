import { eq } from 'drizzle-orm';
import { db } from '../db';
import { chatConversationMembers } from '../db/schema';

/**
 * 会话成员 ID 内存缓存（WS 热路径专用）。
 *
 * typing / RTC 信令等高频 WS 事件每次都需要"取会话内其他成员"来转发，
 * 直接查库会导致每个 typing 事件一次 DB 往返。这里做短 TTL 缓存，
 * 成员变更（加人/踢人/退群）时由 chat.service 显式失效。
 */
const TTL_MS = 60_000;
const MAX_ENTRIES = 5000;

const cache = new Map<number, { memberIds: number[]; expiresAt: number }>();

/** 获取会话全部成员 ID（命中缓存则不查库） */
export async function getConversationMemberIds(conversationId: number): Promise<number[]> {
  const hit = cache.get(conversationId);
  if (hit && hit.expiresAt > Date.now()) return hit.memberIds;

  const rows = await db
    .select({ userId: chatConversationMembers.userId })
    .from(chatConversationMembers)
    .where(eq(chatConversationMembers.conversationId, conversationId));
  const memberIds = rows.map((r) => r.userId);

  if (cache.size >= MAX_ENTRIES) {
    // 简单容量保护：淘汰最早写入的条目（Map 保持插入序）
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.delete(conversationId); // 重插以刷新插入序
  cache.set(conversationId, { memberIds, expiresAt: Date.now() + TTL_MS });
  return memberIds;
}

/** 成员变更后失效缓存（加人/踢人/退群/解散） */
export function invalidateConversationMembers(conversationId: number): void {
  cache.delete(conversationId);
}
