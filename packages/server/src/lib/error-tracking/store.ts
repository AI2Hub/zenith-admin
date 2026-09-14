import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import type { DbExecutor } from '../../db/types';
import { errorEvents, errorGroupIdentities, errorGroups } from '../../db/schema';
import type { ErrorEventInput, ErrorGroupBump, RecordedError } from './types';

const IDENTITY_MAX = 80;

/**
 * 在给定事务内写入一条错误事件：分组 upsert（次数 +1、最近发生、消息 / 版本刷新、已解决 → 重新打开）→
 * 事件行 → 影响面身份去重（首次出现 +1）。前端上报与服务端采集共用这一段，写入顺序即对账口径。
 */
export async function recordErrorEventWithin(tx: DbExecutor, input: ErrorEventInput): Promise<RecordedError> {
  const now = input.occurredAt;
  const [group] = await tx
    .insert(errorGroups)
    .values({
      tenantId: input.tenantId,
      fingerprint: input.fingerprint,
      source: input.source,
      errorType: input.errorType,
      level: input.level,
      message: input.message,
      release: input.release,
      environment: input.environment,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: errorGroups.fingerprint,
      set: {
        count: sql`${errorGroups.count} + 1`,
        lastSeenAt: now,
        message: input.message,
        release: input.release ?? sql`${errorGroups.release}`,
        status: sql`CASE WHEN ${errorGroups.status} = 'resolved' THEN 'unresolved'::error_status ELSE ${errorGroups.status} END`,
        resolvedAt: sql`CASE WHEN ${errorGroups.status} = 'resolved' THEN NULL ELSE ${errorGroups.resolvedAt} END`,
      },
    })
    .returning();

  await tx.insert(errorEvents).values({
    ...input.event,
    tenantId: input.tenantId,
    groupId: group.id,
    fingerprint: input.fingerprint,
    errorType: input.errorType,
    level: input.level,
    message: input.message,
    release: input.release,
    source: input.source,
    appId: input.appId,
    environment: input.environment,
    createdAt: now,
  });

  // 影响用户数 O(1) 增量维护：身份首次出现在该分组时 +1（替代 COUNT(DISTINCT) 懒回写）
  if (input.identity) {
    const inserted = await tx
      .insert(errorGroupIdentities)
      .values({ groupId: group.id, identity: input.identity.slice(0, IDENTITY_MAX) })
      .onConflictDoNothing()
      .returning({ groupId: errorGroupIdentities.groupId });
    if (inserted.length > 0) {
      await tx
        .update(errorGroups)
        .set({ affectedUsers: sql`${errorGroups.affectedUsers} + 1` })
        .where(eq(errorGroups.id, group.id));
    }
  }
  return { groupId: group.id, isNewGroup: group.count === 1, count: group.count };
}

/** 单条写入（自带事务） */
export function recordErrorEvent(input: ErrorEventInput): Promise<RecordedError> {
  return db.transaction((tx) => recordErrorEventWithin(tx, input));
}

/** 一批事件在同一事务内顺序写入（服务端采集的 flush 批） */
export function recordErrorEventBatch(inputs: readonly ErrorEventInput[]): Promise<RecordedError[]> {
  if (inputs.length === 0) return Promise.resolve([]);
  return db.transaction(async (tx) => {
    const results: RecordedError[] = [];
    for (const input of inputs) results.push(await recordErrorEventWithin(tx, input));
    return results;
  });
}

/**
 * 只累加分组次数（风暴限流：事件详情不再保存，但发生次数与最近时间必须准确）。
 * 分组不存在时静默跳过——能进入限流说明该指纹在本分钟内已有事件落库。
 */
export async function bumpErrorGroupCounts(bumps: readonly ErrorGroupBump[]): Promise<void> {
  if (bumps.length === 0) return;
  const byFingerprint = new Map<string, ErrorGroupBump>();
  for (const bump of bumps) {
    const prev = byFingerprint.get(bump.fingerprint);
    byFingerprint.set(bump.fingerprint, prev
      ? { fingerprint: bump.fingerprint, count: prev.count + bump.count, lastSeenAt: bump.lastSeenAt > prev.lastSeenAt ? bump.lastSeenAt : prev.lastSeenAt }
      : bump);
  }
  const merged = [...byFingerprint.values()];
  for (const bump of merged) {
    await db
      .update(errorGroups)
      .set({ count: sql`${errorGroups.count} + ${bump.count}`, lastSeenAt: sql`GREATEST(${errorGroups.lastSeenAt}, ${bump.lastSeenAt})` })
      .where(eq(errorGroups.fingerprint, bump.fingerprint));
  }
}
