/**
 * 行为中心阶段 1：服务端权威事件核心持久化逻辑单测（persistServerEvent）。
 *
 * 覆盖要点：
 *  1. eventId 幂等：onConflictDoNothing 未命中新行时，画像 upsert / 事件字典登记均跳过
 *  2. source 恒为 'server'，environment 按 NODE_ENV 映射（仅 production/development 两值落地）
 *  3. 身份优先级：memberId > userId > `server:{appId}`；memberId/userId 互斥（同时传入以会员为准）
 *  4. properties 安全裁剪：键数 / 嵌套深度 / 序列化体积超限时整体丢弃为 null，不截断半条数据
 *  5. 不创建 analyticsSessions 行（tx 内仅 insert userEvents 一次）
 *  6. 治理复用：evaluateEvents 全部拒收时不落库；strict schema 问题落库后仍会记录质量问题
 *  7. eventId 非 UUID 稳定 ID 时确定性派生（跨重投幂等）
 *
 * Mock 策略：db / analytics-governance.service / analytics-event-meta.service /
 * analytics-profile.service 全部 mock；不 mock config/logger（真实实现足够轻量）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { transaction, txInsert, evaluateEvents, recordSchemaIssues, touchEventMeta, upsertUserProfilesBatch } = vi.hoisted(() => ({
  transaction: vi.fn(),
  txInsert: vi.fn(),
  evaluateEvents: vi.fn(),
  recordSchemaIssues: vi.fn(async () => undefined),
  touchEventMeta: vi.fn(async () => undefined),
  upsertUserProfilesBatch: vi.fn(async () => undefined),
}));

vi.mock('../../db', () => ({ db: { transaction } }));
vi.mock('./analytics-governance.service', () => ({ evaluateEvents, recordSchemaIssues }));
vi.mock('./analytics-event-meta.service', () => ({ touchEventMeta }));
vi.mock('./analytics-profile.service', () => ({ upsertUserProfilesBatch }));

import { persistServerEvent } from './analytics-server-events.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 构造一个"冲突命中（已存在同 eventId）"的 tx.insert 链，幂等场景 */
function mockConflictInsert() {
  txInsert.mockReturnValueOnce({
    values: () => ({
      onConflictDoNothing: () => ({
        returning: async () => [],
      }),
    }),
  });
}

let capturedRow: Record<string, unknown> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  capturedRow = undefined;
  transaction.mockImplementation(async (callback: (tx: { insert: typeof txInsert }) => Promise<unknown>) =>
    callback({ insert: txInsert }));
  evaluateEvents.mockImplementation(async (events: unknown[]) => ({ accepted: events, pendingSchemaIssues: [] }));
});

/** 捕获实际写入 userEvents 的行：values() 调用参数 */
function mockFreshInsertCapturing(eventId: string) {
  txInsert.mockReturnValueOnce({
    values: (row: Record<string, unknown>) => {
      capturedRow = row;
      return {
        onConflictDoNothing: () => ({
          returning: async () => [{ eventId }],
        }),
      };
    },
  });
}

describe('persistServerEvent — 幂等 / 事务边界', () => {
  it('新事件：insert 命中新行 → 画像 upsert + 事件字典登记均执行一次', async () => {
    mockFreshInsertCapturing('11111111-1111-1111-1111-111111111111');
    await persistServerEvent({ eventName: 'payment.succeeded', eventId: '11111111-1111-1111-1111-111111111111', properties: { orderNo: 'SO-1' } });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txInsert).toHaveBeenCalledTimes(1); // 仅 insert userEvents 一次，绝不额外创建 analyticsSessions 行
    expect(capturedRow!.sessionId).toBeNull(); // 无会话语义：落 null 防止 COUNT(DISTINCT session_id) 虚增会话数
    expect(upsertUserProfilesBatch).toHaveBeenCalledTimes(1);
    expect(touchEventMeta).toHaveBeenCalledTimes(1);
  });

  it('eventId 幂等命中（onConflictDoNothing 未插入新行）→ 画像 / 事件字典登记均跳过', async () => {
    mockConflictInsert();
    await persistServerEvent({ eventName: 'payment.succeeded', eventId: '22222222-2222-2222-2222-222222222222' });

    expect(txInsert).toHaveBeenCalledTimes(1);
    expect(upsertUserProfilesBatch).not.toHaveBeenCalled();
    expect(touchEventMeta).not.toHaveBeenCalled();
  });

  it('非 UUID 稳定 eventId → 确定性派生为合法 UUID（同一稳定 ID 跨重投映射到同一 UUID）', async () => {
    mockFreshInsertCapturing('placeholder');
    await persistServerEvent({ eventName: 'payment.succeeded', eventId: 'payment-outbox-123' });

    expect(capturedRow).toBeDefined();
    const firstDerived = String(capturedRow!.eventId);
    expect(firstDerived).not.toBe('payment-outbox-123');
    expect(firstDerived).toMatch(UUID_RE);

    // outbox at-least-once 重投：同一稳定 ID 必须派生出同一 UUID，唯一索引才能跨投递去重
    mockFreshInsertCapturing('placeholder');
    await persistServerEvent({ eventName: 'payment.succeeded', eventId: 'payment-outbox-123' });
    expect(String(capturedRow!.eventId)).toBe(firstDerived);

    // 不同稳定 ID 派生出不同 UUID
    mockFreshInsertCapturing('placeholder');
    await persistServerEvent({ eventName: 'payment.succeeded', eventId: 'payment-outbox-124' });
    expect(String(capturedRow!.eventId)).not.toBe(firstDerived);
  });

  it('未传 eventId → 生成合法 UUID', async () => {
    mockFreshInsertCapturing('placeholder');
    await persistServerEvent({ eventName: 'workflow.instance_started' });
    expect(String(capturedRow!.eventId)).toMatch(UUID_RE);
  });
});

describe('persistServerEvent — source / environment', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('source 恒为 server', async () => {
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'member.registered' });
    expect(capturedRow!.source).toBe('server');
  });

  it('NODE_ENV=production → environment=production', async () => {
    process.env.NODE_ENV = 'production';
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'member.registered' });
    expect(capturedRow!.environment).toBe('production');
  });

  it.each(['development', 'test', undefined])('NODE_ENV=%s → environment=development（非 production 一律归为 development）', async (env) => {
    process.env.NODE_ENV = env;
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'member.registered' });
    expect(capturedRow!.environment).toBe('development');
  });
});

describe('persistServerEvent — 身份优先级与 distinctId', () => {
  it('memberId 优先：distinctId=m:{id}，userId 强制置空，identityType=member', async () => {
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'member.registered', memberId: 8, userId: 999 });
    expect(capturedRow!.distinctId).toBe('m:8');
    expect(capturedRow!.userId).toBeNull();
    expect(capturedRow!.memberId).toBe(8);
  });

  it('无 memberId 时 userId 生效：distinctId=u:{id}', async () => {
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'workflow.task_completed', userId: 42 });
    expect(capturedRow!.distinctId).toBe('u:42');
    expect(capturedRow!.memberId).toBeNull();
  });

  it('两者皆无：distinctId=server:{appId} 匿名兜底', async () => {
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'payment.closed' });
    expect(capturedRow!.distinctId).toBe('server:server');
  });

  it('自定义 appId → distinctId 匿名兜底使用该 appId', async () => {
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'payment.closed', appId: 'billing-worker' });
    expect(capturedRow!.distinctId).toBe('server:billing-worker');
    expect(capturedRow!.appId).toBe('billing-worker');
  });
});

describe('persistServerEvent — properties 安全裁剪', () => {
  it('properties 键数超限（>50）→ 整体丢弃为 null', async () => {
    mockFreshInsertCapturing('id');
    const huge: Record<string, number> = {};
    for (let i = 0; i < 60; i++) huge[`k${i}`] = i;
    await persistServerEvent({ eventName: 'member.points.earned', properties: huge });
    expect(capturedRow!.properties).toBeNull();
  });

  it('properties 嵌套深度超限（>6）→ 整体丢弃为 null', async () => {
    mockFreshInsertCapturing('id');
    let deep: unknown = 'leaf';
    for (let i = 0; i < 8; i++) deep = { nested: deep };
    await persistServerEvent({ eventName: 'member.points.earned', properties: { deep } });
    expect(capturedRow!.properties).toBeNull();
  });

  it('properties 序列化体积超限 → 整体丢弃为 null', async () => {
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'member.points.earned', properties: { big: 'x'.repeat(20000) } });
    expect(capturedRow!.properties).toBeNull();
  });

  it('properties 非普通对象（数组）→ 丢弃为 null', async () => {
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'member.points.earned', properties: [1, 2, 3] as unknown as Record<string, unknown> });
    expect(capturedRow!.properties).toBeNull();
  });

  it('合法小体积 properties → 原样落库', async () => {
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'member.points.earned', properties: { amount: 10, bizType: 'checkin' } });
    expect(capturedRow!.properties).toEqual({ amount: 10, bizType: 'checkin' });
  });
});

describe('persistServerEvent — 治理复用（阻断 / strict schema）', () => {
  it('evaluateEvents 全部拒收（全局屏蔽/租户禁用/strict）→ 不开事务、不落库', async () => {
    evaluateEvents.mockResolvedValue({ accepted: [], pendingSchemaIssues: [] });
    await persistServerEvent({ eventName: 'blocked.event' });
    expect(transaction).not.toHaveBeenCalled();
    expect(touchEventMeta).not.toHaveBeenCalled();
  });

  it('strict 模式命中 schema 问题但仍放行（pendingSchemaIssues）→ 落库后记录质量问题', async () => {
    const event = { eventId: 'e1', eventName: 'member.points.earned' };
    evaluateEvents.mockResolvedValue({
      accepted: [event],
      pendingSchemaIssues: [{ event, tenantId: 9, issues: [{ key: 'amount', issueType: 'missing_required', expected: 'number', actualType: 'undefined' }] }],
    });
    mockFreshInsertCapturing('id');
    await persistServerEvent({ eventName: 'member.points.earned', tenantId: 9 });
    expect(recordSchemaIssues).toHaveBeenCalledTimes(1);
    expect(recordSchemaIssues).toHaveBeenCalledWith(9, 'member.points.earned', expect.any(Array));
  });
});

describe('persistServerEvent — 异常兜底（never throws）', () => {
  it('缺少 eventName → 直接忽略，不抛出', async () => {
    await expect(persistServerEvent({ eventName: '' })).resolves.toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('db.transaction 抛出异常 → 被吞掉，不向外抛出', async () => {
    transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(persistServerEvent({ eventName: 'member.registered' })).resolves.toBeUndefined();
  });

  it('evaluateEvents 抛出异常 → 被吞掉，不向外抛出（不同于 web 采集的降级放行，服务端事件直接安全丢弃本次）', async () => {
    evaluateEvents.mockRejectedValueOnce(new Error('governance down'));
    await expect(persistServerEvent({ eventName: 'member.registered' })).resolves.toBeUndefined();
  });
});
