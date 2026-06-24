/**
 * Channel（站内公众号 / 系统号）服务
 *
 * 两种投递语义：
 *  - broadcast：全员可见（系统公告）
 *  - targeted ：仅指定用户可见（工作流待办等定向通知）
 *
 * 发送者身份由频道（name/avatar）承载，消息 publishedById 仅记录触发的管理员/系统（可空），
 * 不再依赖 users 表的机器人假用户。
 */
import { and, desc, eq, exists, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  channels, channelMessages, channelSubscriptions, channelMessageTargets, users,
  type ChannelRow, type ChannelMessageRow,
} from '../db/schema';
import type { Channel, ChannelAdmin, ChannelMessage, ChannelMessageType, ChatMessageExtra, CreateChannelInput, UpdateChannelInput, PublishChannelInput } from '@zenith/shared';
import { SYSTEM_CHANNEL_CODE } from '@zenith/shared';
import { HTTPException } from 'hono/http-exception';
import { rethrowPgUniqueViolation } from '../lib/db-errors';
import { currentUser } from '../lib/context';
import { formatDateTime } from '../lib/datetime';
import { pageOffset } from '../lib/pagination';
import { scheduleSendToUsers } from '../lib/ws-manager';
import { handleSubscribeAutoReply } from './channel-cs.service';

interface PublishInput {
  type: ChannelMessageType;
  content: string;
  title?: string | null;
  extra?: ChatMessageExtra | null;
  publishedById?: number | null;
}

export function mapChannelMessage(row: ChannelMessageRow, isRead: boolean, senderUserName: string | null = null): ChannelMessage {
  return {
    id: row.id,
    channelId: row.channelId,
    audienceType: row.audienceType,
    type: row.type,
    title: row.title,
    content: row.content,
    extra: (row.extra as ChatMessageExtra | null) ?? null,
    publishedById: row.publishedById,
    direction: row.direction,
    senderUserId: row.senderUserId,
    senderUserName,
    isRead,
    createdAt: formatDateTime(row.createdAt),
  };
}

/** 当前用户对某频道可见消息的 WHERE 条件（broadcast 全员 ∪ targeted 命中本人 ∪ 本人发出的 in 消息） */
function visibleMessageWhere(channelId: number, userId: number) {
  return and(
    eq(channelMessages.channelId, channelId),
    or(
      eq(channelMessages.audienceType, 'broadcast'),
      and(eq(channelMessages.direction, 'in'), eq(channelMessages.senderUserId, userId)),
      exists(
        db.select({ x: sql`1` }).from(channelMessageTargets).where(and(
          eq(channelMessageTargets.messageId, channelMessages.id),
          eq(channelMessageTargets.userId, userId),
        )),
      ),
    ),
  );
}

// ─── 系统号定位 ──────────────────────────────────────────────────────────────
let cachedSystemChannelId: number | null = null;

/** 内置「Zenith 助手」系统号 ID（种子写入，缓存命中后不再查库） */
export async function getSystemChannelId(): Promise<number | null> {
  if (cachedSystemChannelId != null) return cachedSystemChannelId;
  const ch = await db.query.channels.findFirst({
    where: eq(channels.code, SYSTEM_CHANNEL_CODE),
    columns: { id: true },
  });
  cachedSystemChannelId = ch?.id ?? null;
  return cachedSystemChannelId;
}

// ─── 发布 ────────────────────────────────────────────────────────────────────

/** 广播：发布一条全员可见的频道消息，并实时推送给所有用户 */
export async function publishBroadcast(channelId: number, input: PublishInput): Promise<ChannelMessage> {
  const [row] = await db.insert(channelMessages).values({
    channelId,
    audienceType: 'broadcast',
    type: input.type,
    title: input.title ?? null,
    content: input.content,
    extra: input.extra ?? null,
    publishedById: input.publishedById ?? null,
  }).returning();

  const msg = mapChannelMessage(row, false);
  const allUsers = await db.select({ userId: users.id }).from(users);
  scheduleSendToUsers(allUsers, { type: 'channel:message', payload: msg });
  return msg;
}

/** 定向：发布一条仅指定用户可见的频道消息，写入收件人并实时推送 */
export async function publishTargeted(
  channelId: number,
  userIds: number[],
  input: PublishInput,
): Promise<ChannelMessage | null> {
  const unique = [...new Set(userIds)].filter((id) => id > 0);
  if (unique.length === 0) return null;

  const [row] = await db.insert(channelMessages).values({
    channelId,
    audienceType: 'targeted',
    type: input.type,
    title: input.title ?? null,
    content: input.content,
    extra: input.extra ?? null,
    publishedById: input.publishedById ?? null,
  }).returning();

  await db.insert(channelMessageTargets).values(unique.map((userId) => ({ messageId: row.id, userId })));

  const msg = mapChannelMessage(row, false);
  scheduleSendToUsers(unique.map((userId) => ({ userId })), { type: 'channel:message', payload: msg });
  return msg;
}

// ─── 查询（HTTP 上下文） ───────────────────────────────────────────────────────

async function buildChannelView(ch: ChannelRow, userId: number, isSubscribed: boolean): Promise<Channel> {
  const sub = await db.query.channelSubscriptions.findFirst({
    where: and(eq(channelSubscriptions.channelId, ch.id), eq(channelSubscriptions.userId, userId)),
  });
  const lastReadAt = sub?.lastReadAt ?? null;

  const targetedMsgIds = db.select({ id: channelMessages.id }).from(channelMessages)
    .where(and(eq(channelMessages.channelId, ch.id), eq(channelMessages.audienceType, 'targeted')));

  const [broadcastUnread, targetedUnread, lastRows] = await Promise.all([
    db.$count(channelMessages, and(
      eq(channelMessages.channelId, ch.id),
      eq(channelMessages.audienceType, 'broadcast'),
      lastReadAt ? gt(channelMessages.createdAt, lastReadAt) : undefined,
    )),
    db.$count(channelMessageTargets, and(
      eq(channelMessageTargets.userId, userId),
      isNull(channelMessageTargets.readAt),
      inArray(channelMessageTargets.messageId, targetedMsgIds),
    )),
    db.select().from(channelMessages)
      .where(visibleMessageWhere(ch.id, userId))
      .orderBy(desc(channelMessages.id))
      .limit(1),
  ]);

  const last = lastRows[0];
  return {
    id: ch.id,
    code: ch.code,
    name: ch.name,
    avatar: ch.avatar,
    description: ch.description,
    type: ch.type,
    builtin: ch.builtin,
    status: ch.status,
    unreadCount: broadcastUnread + targetedUnread,
    lastMessage: last ? mapChannelMessage(last, true) : null,
    isMuted: sub?.isMuted ?? false,
    isSubscribed,
    tenantId: ch.tenantId,
    createdAt: formatDateTime(ch.createdAt),
    updatedAt: formatDateTime(ch.updatedAt),
  };
}

/** 我的频道列表（系统号全部强制可见 + 已订阅的运营号） */
export async function listMyChannels(): Promise<Channel[]> {
  const me = currentUser().userId;
  const subRows = await db.select({ channelId: channelSubscriptions.channelId })
    .from(channelSubscriptions).where(eq(channelSubscriptions.userId, me));
  const subscribedIds = new Set(subRows.map((r) => r.channelId));
  const chs = await db.query.channels.findMany({
    where: eq(channels.status, 'enabled'),
    orderBy: [desc(channels.builtin), channels.id],
  });
  const visible = chs.filter((ch) => ch.type === 'system' || subscribedIds.has(ch.id));
  return Promise.all(visible.map((ch) => buildChannelView(ch, me, ch.type === 'system' || subscribedIds.has(ch.id))));
}

/** 频道消息流（仅当前用户可见的消息，分页，按时间倒序） */
export async function listChannelMessages(channelId: number, page: number, pageSize: number) {
  const me = currentUser().userId;
  const sub = await db.query.channelSubscriptions.findFirst({
    where: and(eq(channelSubscriptions.channelId, channelId), eq(channelSubscriptions.userId, me)),
    columns: { lastReadAt: true },
  });
  const lastReadAt = sub?.lastReadAt ?? null;
  const where = visibleMessageWhere(channelId, me);

  const [total, rows] = await Promise.all([
    db.$count(channelMessages, where),
    db.select().from(channelMessages).where(where)
      .orderBy(desc(channelMessages.id))
      .limit(pageSize)
      .offset(pageOffset(page, pageSize)),
  ]);

  const targetedIds = rows.filter((r) => r.audienceType === 'targeted').map((r) => r.id);
  const readMap = new Map<number, Date | null>();
  if (targetedIds.length > 0) {
    const tg = await db.select({ messageId: channelMessageTargets.messageId, readAt: channelMessageTargets.readAt })
      .from(channelMessageTargets)
      .where(and(inArray(channelMessageTargets.messageId, targetedIds), eq(channelMessageTargets.userId, me)));
    tg.forEach((t) => readMap.set(t.messageId, t.readAt));
  }

  const list = rows.map((r) => {
    const isRead = r.audienceType === 'broadcast'
      ? (lastReadAt != null && r.createdAt <= lastReadAt)
      : (readMap.get(r.id) != null);
    return mapChannelMessage(r, isRead);
  });
  return { list, total, page, pageSize };
}

/** 标记频道已读：更新订阅已读基线 + 把定向消息收件人标记已读 */
export async function markChannelRead(channelId: number): Promise<void> {
  const me = currentUser().userId;
  const now = new Date();

  await db.insert(channelSubscriptions).values({ channelId, userId: me, lastReadAt: now })
    .onConflictDoUpdate({
      target: [channelSubscriptions.channelId, channelSubscriptions.userId],
      set: { lastReadAt: now },
    });

  const targetedMsgIds = db.select({ id: channelMessages.id }).from(channelMessages)
    .where(and(eq(channelMessages.channelId, channelId), eq(channelMessages.audienceType, 'targeted')));
  await db.update(channelMessageTargets).set({ readAt: now }).where(and(
    inArray(channelMessageTargets.messageId, targetedMsgIds),
    eq(channelMessageTargets.userId, me),
    isNull(channelMessageTargets.readAt),
  ));
}

/** 将某条卡片消息标记为已处理（置灰按钮 + 结果文案），并广播实时更新 */
export async function markChannelCardDone(messageId: number, statusText: string): Promise<void> {
  const row = await db.query.channelMessages.findFirst({ where: eq(channelMessages.id, messageId) });
  if (!row || row.type !== 'card') return;
  const extra = (row.extra as ChatMessageExtra | null) ?? {};
  if (!extra.card || extra.card.status === 'done') return;

  const newExtra: ChatMessageExtra = { ...extra, card: { ...extra.card, status: 'done', statusText } };
  const [updated] = await db.update(channelMessages).set({ extra: newExtra })
    .where(eq(channelMessages.id, messageId)).returning();

  const msg = mapChannelMessage(updated, false);
  if (updated.audienceType === 'broadcast') {
    const allUsers = await db.select({ userId: users.id }).from(users);
    scheduleSendToUsers(allUsers, { type: 'channel:message', payload: msg });
  } else {
    const tg = await db.select({ userId: channelMessageTargets.userId })
      .from(channelMessageTargets).where(eq(channelMessageTargets.messageId, messageId));
    scheduleSendToUsers(tg, { type: 'channel:message', payload: msg });
  }
}

/** 将某工作流任务对应的待审批卡片置灰（jsonb 包含查询定位，重启后仍可靠） */
export async function markChannelTaskCardsDone(taskId: number, statusText: string): Promise<void> {
  const match = JSON.stringify({ card: { status: 'pending', actions: [{ taskId }] } });
  const rows = await db.select({ id: channelMessages.id }).from(channelMessages)
    .where(and(eq(channelMessages.type, 'card'), sql`${channelMessages.extra} @> ${match}::jsonb`));
  for (const r of rows) {
    await markChannelCardDone(r.id, statusText);
  }
}

// ─── 管理后台 ────────────────────────────────────────────────────────────────

function mapChannelAdmin(ch: ChannelRow, subscriberCount: number, messageCount: number): ChannelAdmin {
  return {
    id: ch.id,
    code: ch.code,
    name: ch.name,
    avatar: ch.avatar,
    description: ch.description,
    type: ch.type,
    builtin: ch.builtin,
    status: ch.status,
    subscriberCount,
    messageCount,
    createdAt: formatDateTime(ch.createdAt),
    updatedAt: formatDateTime(ch.updatedAt),
  };
}

/** 系统号订阅数按全员计（懒创建订阅行不可靠），运营号按订阅表计 */
async function countSubscribers(ch: ChannelRow, userCount: number): Promise<number> {
  return ch.type === 'system'
    ? userCount
    : db.$count(channelSubscriptions, eq(channelSubscriptions.channelId, ch.id));
}

export async function listChannelsAdmin(page: number, pageSize: number, keyword?: string) {
  const where = keyword
    ? sql`(${channels.name} ILIKE ${'%' + keyword + '%'} OR ${channels.code} ILIKE ${'%' + keyword + '%'})`
    : undefined;
  const [total, rows, userCount] = await Promise.all([
    db.$count(channels, where),
    db.select().from(channels).where(where)
      .orderBy(desc(channels.builtin), channels.id)
      .limit(pageSize).offset(pageOffset(page, pageSize)),
    db.$count(users),
  ]);
  const list = await Promise.all(rows.map(async (ch) => {
    const [subscriberCount, messageCount] = await Promise.all([
      countSubscribers(ch, userCount),
      db.$count(channelMessages, eq(channelMessages.channelId, ch.id)),
    ]);
    return mapChannelAdmin(ch, subscriberCount, messageCount);
  }));
  return { list, total, page, pageSize };
}

export async function createChannel(input: CreateChannelInput): Promise<ChannelAdmin> {
  try {
    const [row] = await db.insert(channels).values({
      code: input.code,
      name: input.name,
      avatar: input.avatar ?? null,
      description: input.description ?? null,
      type: 'business',
      builtin: false,
      status: 'enabled',
    }).returning();
    return mapChannelAdmin(row, 0, 0);
  } catch (err) {
    rethrowPgUniqueViolation(err, '频道 code 已存在');
    throw err;
  }
}

export async function updateChannel(id: number, input: UpdateChannelInput): Promise<ChannelAdmin> {
  const ch = await db.query.channels.findFirst({ where: eq(channels.id, id) });
  if (!ch) throw new HTTPException(404, { message: '频道不存在' });
  const [row] = await db.update(channels).set({
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.avatar === undefined ? {} : { avatar: input.avatar }),
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.status === undefined ? {} : { status: input.status }),
  }).where(eq(channels.id, id)).returning();
  const userCount = await db.$count(users);
  const [subscriberCount, messageCount] = await Promise.all([
    countSubscribers(row, userCount),
    db.$count(channelMessages, eq(channelMessages.channelId, id)),
  ]);
  return mapChannelAdmin(row, subscriberCount, messageCount);
}

export async function deleteChannel(id: number): Promise<void> {
  const ch = await db.query.channels.findFirst({ where: eq(channels.id, id) });
  if (!ch) throw new HTTPException(404, { message: '频道不存在' });
  if (ch.builtin) throw new HTTPException(400, { message: '内置系统号不可删除' });
  await db.delete(channels).where(eq(channels.id, id));
}

/** 管理员手动向频道群发一条广播文本消息 */
export async function publishToChannel(id: number, input: PublishChannelInput): Promise<ChannelMessage> {
  const ch = await db.query.channels.findFirst({ where: eq(channels.id, id) });
  if (!ch) throw new HTTPException(404, { message: '频道不存在' });
  const me = currentUser();
  return publishBroadcast(id, {
    type: 'text',
    title: input.title ?? null,
    content: input.content,
    publishedById: me.userId,
  });
}

// ─── 订阅（运营号） ───────────────────────────────────────────────────────────

export async function subscribeChannel(channelId: number): Promise<void> {
  const me = currentUser().userId;
  const ch = await db.query.channels.findFirst({ where: eq(channels.id, channelId) });
  if (!ch) throw new HTTPException(404, { message: '频道不存在' });
  if (ch.type === 'system') throw new HTTPException(400, { message: '系统号默认全员订阅，无需操作' });
  const inserted = await db.insert(channelSubscriptions)
    .values({ channelId, userId: me, lastReadAt: null })
    .onConflictDoNothing()
    .returning({ channelId: channelSubscriptions.channelId });
  // 仅首次订阅时触发「关注欢迎语」自动回复
  if (inserted.length > 0) {
    await handleSubscribeAutoReply(channelId, me);
  }
}

export async function unsubscribeChannel(channelId: number): Promise<void> {
  const me = currentUser().userId;
  const ch = await db.query.channels.findFirst({ where: eq(channels.id, channelId) });
  if (!ch) throw new HTTPException(404, { message: '频道不存在' });
  if (ch.type === 'system') throw new HTTPException(400, { message: '系统号不可退订' });
  await db.delete(channelSubscriptions).where(and(
    eq(channelSubscriptions.channelId, channelId),
    eq(channelSubscriptions.userId, me),
  ));
}

/** 可发现（未订阅）的运营号列表 */
export async function listDiscoverableChannels(): Promise<Channel[]> {
  const me = currentUser().userId;
  const subRows = await db.select({ channelId: channelSubscriptions.channelId })
    .from(channelSubscriptions).where(eq(channelSubscriptions.userId, me));
  const subscribedIds = new Set(subRows.map((r) => r.channelId));
  const chs = await db.query.channels.findMany({
    where: and(eq(channels.status, 'enabled'), eq(channels.type, 'business')),
    orderBy: [channels.id],
  });
  const discoverable = chs.filter((ch) => !subscribedIds.has(ch.id));
  return Promise.all(discoverable.map((ch) => buildChannelView(ch, me, false)));
}
