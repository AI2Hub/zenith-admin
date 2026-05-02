import { eq, and, desc, count, gt, sql, inArray, or, ne } from 'drizzle-orm';
import { db } from '../db';
import {
  chatConversations, chatConversationMembers, chatMessages, users,
} from '../db/schema';
import { sendToUser } from '../lib/ws-manager';
import { currentUser } from '../lib/context';
import { formatDateTime } from '../lib/datetime';
import { pageOffset } from '../lib/pagination';
import { HTTPException } from 'hono/http-exception';
import type { SendChatMessageInput, ChatMessage, ChatConversation } from '@zenith/shared';

// ─── 数据映射 ─────────────────────────────────────────────────────────────────

export function mapChatMessage(
  row: typeof chatMessages.$inferSelect,
  sender?: { id: number; nickname: string; avatar: string | null } | null,
): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    senderName: sender?.nickname ?? null,
    senderAvatar: sender?.avatar ?? null,
    type: row.type as ChatMessage['type'],
    content: row.content,
    replyToId: row.replyToId,
    isRecalled: row.isRecalled,
    extra: (row.extra as Record<string, unknown> | null) ?? null,
    createdAt: formatDateTime(row.createdAt),
    updatedAt: formatDateTime(row.updatedAt),
  };
}

// ─── 会话列表 ─────────────────────────────────────────────────────────────────

export async function listConversations(): Promise<ChatConversation[]> {
  const me = currentUser();

  // 拿当前用户参与的所有会话
  const memberRows = await db
    .select({ conversationId: chatConversationMembers.conversationId, lastReadAt: chatConversationMembers.lastReadAt })
    .from(chatConversationMembers)
    .where(eq(chatConversationMembers.userId, me.userId));

  if (memberRows.length === 0) return [];

  const convIds = memberRows.map((r) => r.conversationId);
  const lastReadMap = new Map(memberRows.map((r) => [r.conversationId, r.lastReadAt]));

  // 批量拉取会话基本信息
  const convRows = await db
    .select()
    .from(chatConversations)
    .where(inArray(chatConversations.id, convIds));

  // 拉最后一条消息 + 未读数（per conversation）
  const results: ChatConversation[] = [];
  for (const conv of convRows) {
    const lastReadAt = lastReadMap.get(conv.id) ?? null;

    // 最新消息
    const [lastMsgRow] = await db
      .select({ msg: chatMessages, nickname: users.nickname, avatar: users.avatar })
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.senderId, users.id))
      .where(eq(chatMessages.conversationId, conv.id))
      .orderBy(desc(chatMessages.createdAt))
      .limit(1);

    // 未读数
    const [{ unread }] = await db
      .select({ unread: count() })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.conversationId, conv.id),
        ne(chatMessages.senderId, me.userId),
        lastReadAt ? gt(chatMessages.createdAt, lastReadAt) : sql`true`,
      ));

    // 对方用户信息（仅 direct 类型）
    let targetUser: ChatConversation['targetUser'] = null;
    if (conv.type === 'direct') {
      const [otherMember] = await db
        .select({ id: users.id, nickname: users.nickname, avatar: users.avatar })
        .from(chatConversationMembers)
        .innerJoin(users, eq(chatConversationMembers.userId, users.id))
        .where(and(
          eq(chatConversationMembers.conversationId, conv.id),
          ne(chatConversationMembers.userId, me.userId),
        ))
        .limit(1);
      if (otherMember) targetUser = otherMember;
    }

    results.push({
      id: conv.id,
      type: conv.type as ChatConversation['type'],
      name: conv.name,
      targetUser,
      lastMessage: lastMsgRow
        ? mapChatMessage(lastMsgRow.msg, { id: lastMsgRow.msg.senderId ?? 0, nickname: lastMsgRow.nickname ?? '', avatar: lastMsgRow.avatar ?? null })
        : null,
      unreadCount: Number(unread),
      createdAt: formatDateTime(conv.createdAt),
      updatedAt: formatDateTime(conv.updatedAt),
    });
  }

  // 按最新消息时间排序
  results.sort((a, b) => {
    const ta = a.lastMessage?.createdAt ?? a.createdAt;
    const tb = b.lastMessage?.createdAt ?? b.createdAt;
    return tb.localeCompare(ta);
  });

  return results;
}

// ─── 获取/创建单聊会话 ──────────────────────────────────────────────────────

export async function getOrCreateDirectConversation(targetUserId: number): Promise<ChatConversation> {
  const me = currentUser();
  if (targetUserId === me.userId) {
    throw new HTTPException(400, { message: '不能与自己创建会话' });
  }

  // 检查对方用户是否存在
  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, targetUserId),
    columns: { id: true, nickname: true, avatar: true },
  });
  if (!targetUser) throw new HTTPException(404, { message: '用户不存在' });

  // 查找已有的 direct 会话（双方都在的）
  const existingConvIds = await db
    .select({ conversationId: chatConversationMembers.conversationId })
    .from(chatConversationMembers)
    .where(eq(chatConversationMembers.userId, me.userId));

  const myConvIds = existingConvIds.map((r) => r.conversationId);

  if (myConvIds.length > 0) {
    const [existing] = await db
      .select({ conversationId: chatConversationMembers.conversationId })
      .from(chatConversationMembers)
      .innerJoin(chatConversations, eq(chatConversationMembers.conversationId, chatConversations.id))
      .where(and(
        eq(chatConversationMembers.userId, targetUserId),
        inArray(chatConversationMembers.conversationId, myConvIds),
        eq(chatConversations.type, 'direct'),
      ))
      .limit(1);

    if (existing) {
      // 会话已存在，走 listConversations 并返回对应的
      const all = await listConversations();
      const found = all.find((c) => c.id === existing.conversationId);
      if (found) return found;
    }
  }

  // 创建新会话
  const [conv] = await db.insert(chatConversations).values({
    type: 'direct',
    createdById: me.userId,
    tenantId: me.tenantId,
  }).returning();

  await db.insert(chatConversationMembers).values([
    { conversationId: conv.id, userId: me.userId },
    { conversationId: conv.id, userId: targetUserId },
  ]);

  return {
    id: conv.id,
    type: 'direct',
    name: null,
    targetUser,
    lastMessage: null,
    unreadCount: 0,
    createdAt: formatDateTime(conv.createdAt),
    updatedAt: formatDateTime(conv.updatedAt),
  };
}

// ─── 消息列表（分页） ─────────────────────────────────────────────────────────

export async function listMessages(conversationId: number, page: number, pageSize: number) {
  const me = currentUser();

  // 鉴权：确认当前用户是会话成员
  const member = await db.query.chatConversationMembers.findFirst({
    where: and(
      eq(chatConversationMembers.conversationId, conversationId),
      eq(chatConversationMembers.userId, me.userId),
    ),
  });
  if (!member) throw new HTTPException(403, { message: '无权访问该会话' });

  const [total, rows] = await Promise.all([
    db.$count(chatMessages, eq(chatMessages.conversationId, conversationId)),
    db
      .select({ msg: chatMessages, nickname: users.nickname, avatar: users.avatar })
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.senderId, users.id))
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(pageSize)
      .offset(pageOffset(page, pageSize)),
  ]);

  const list = rows.map((r) =>
    mapChatMessage(r.msg, r.msg.senderId ? { id: r.msg.senderId, nickname: r.nickname ?? '', avatar: r.avatar ?? null } : null),
  );

  return { list, total, page, pageSize };
}

// ─── 发送消息 ─────────────────────────────────────────────────────────────────

export async function sendMessage(conversationId: number, input: SendChatMessageInput): Promise<ChatMessage> {
  const me = currentUser();

  // 鉴权：确认当前用户是会话成员
  const member = await db.query.chatConversationMembers.findFirst({
    where: and(
      eq(chatConversationMembers.conversationId, conversationId),
      eq(chatConversationMembers.userId, me.userId),
    ),
  });
  if (!member) throw new HTTPException(403, { message: '无权向该会话发送消息' });

  const sender = await db.query.users.findFirst({
    where: eq(users.id, me.userId),
    columns: { id: true, nickname: true, avatar: true },
  });

  const [row] = await db.insert(chatMessages).values({
    conversationId,
    senderId: me.userId,
    type: input.type ?? 'text',
    content: input.content,
    replyToId: input.replyToId ?? null,
    extra: input.extra ?? null,
  }).returning();

  // 更新会话 updatedAt
  await db.update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId));

  const msg = mapChatMessage(row, sender ?? null);

  // 推送给会话内所有成员（含发送者——方便多端同步）
  const members = await db
    .select({ userId: chatConversationMembers.userId })
    .from(chatConversationMembers)
    .where(eq(chatConversationMembers.conversationId, conversationId));

  for (const { userId } of members) {
    sendToUser(userId, { type: 'chat:message', payload: msg });
  }

  return msg;
}

// ─── 撤回消息 ─────────────────────────────────────────────────────────────────

export async function recallMessage(messageId: number): Promise<void> {
  const me = currentUser();

  const msg = await db.query.chatMessages.findFirst({
    where: eq(chatMessages.id, messageId),
  });
  if (!msg) throw new HTTPException(404, { message: '消息不存在' });
  if (msg.senderId !== me.userId) throw new HTTPException(403, { message: '只能撤回自己的消息' });

  // 2 分钟内可撤回
  const TWO_MINUTES = 2 * 60 * 1000;
  if (Date.now() - new Date(msg.createdAt).getTime() > TWO_MINUTES) {
    throw new HTTPException(400, { message: '消息发送超过2分钟，无法撤回' });
  }

  await db.update(chatMessages)
    .set({ isRecalled: true, content: '消息已撤回' })
    .where(eq(chatMessages.id, messageId));

  // 推送撤回通知
  const members = await db
    .select({ userId: chatConversationMembers.userId })
    .from(chatConversationMembers)
    .where(eq(chatConversationMembers.conversationId, msg.conversationId));

  for (const { userId } of members) {
    sendToUser(userId, { type: 'chat:recall', payload: { conversationId: msg.conversationId, messageId } });
  }
}

// ─── 标记已读 ─────────────────────────────────────────────────────────────────

export async function markConversationRead(conversationId: number): Promise<void> {
  const me = currentUser();

  await db.update(chatConversationMembers)
    .set({ lastReadAt: new Date() })
    .where(and(
      eq(chatConversationMembers.conversationId, conversationId),
      eq(chatConversationMembers.userId, me.userId),
    ));

  // 通知会话内其他成员（用于显示"已读"）
  const members = await db
    .select({ userId: chatConversationMembers.userId })
    .from(chatConversationMembers)
    .where(and(
      eq(chatConversationMembers.conversationId, conversationId),
      ne(chatConversationMembers.userId, me.userId),
    ));

  for (const { userId } of members) {
    sendToUser(userId, { type: 'chat:read', payload: { conversationId, userId: me.userId } });
  }
}

// ─── 获取可聊天的用户列表 ──────────────────────────────────────────────────────

export async function listChatUsers(keyword?: string) {
  const me = currentUser();

  const rows = await db
    .select({ id: users.id, nickname: users.nickname, avatar: users.avatar, username: users.username })
    .from(users)
    .where(and(
      ne(users.id, me.userId),
      eq(users.status, 'enabled'),
      me.tenantId ? eq(users.tenantId, me.tenantId) : undefined,
      keyword
        ? or(
            sql`${users.nickname} ILIKE ${'%' + keyword + '%'}`,
            sql`${users.username} ILIKE ${'%' + keyword + '%'}`,
          )
        : undefined,
    ))
    .limit(50);

  return rows;
}
