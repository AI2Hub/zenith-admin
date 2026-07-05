/**
 * 会员成长链路（补签 / 连续签到 / 里程碑 / 成长定级）— 数据库集成测试（默认跳过）。
 *
 * 覆盖人工最难验证的并发正确性与约束持久化：
 * - doMakeupCheckin(admin)：并发补签同一日期防双签（唯一约束 → 400）、
 *   连续天数按前一日记录累计、日期边界（今天/未来/超回溯窗口）拒绝
 * - 里程碑：达标发放恰好一次，后续签到不重复发放（awards 防重）
 * - addGrowthValue()：成长值增减自动升降级、0 下限钳制（真实阈值匹配 SQL）
 *
 * 需要可用的 PostgreSQL（默认连接见 .env）。为避免普通 `npm test` 触库，
 * 仅在显式 opt-in 时运行：
 *   PowerShell:  $env:MEMBER_ENGAGEMENT_DB_IT='1'; npx vitest run src/services/member/member-engagement.it.test.ts
 *   Bash:        MEMBER_ENGAGEMENT_DB_IT=1 npx vitest run src/services/member/member-engagement.it.test.ts
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dayjs from 'dayjs';
import { HTTPException } from 'hono/http-exception';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

const RUN = process.env.MEMBER_ENGAGEMENT_DB_IT === '1';

const CONCURRENT = { timeout: 20_000 };

function splitResults<T>(results: PromiseSettledResult<T>[]) {
  const fulfilled = results.filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled').map((r) => r.value);
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => r.reason as unknown);
  return { fulfilled, rejected };
}

function expectAllHttpErrors(rejected: unknown[], allowedStatuses: number[]) {
  for (const err of rejected) {
    expect(err).toBeInstanceOf(HTTPException);
    expect(allowedStatuses).toContain((err as HTTPException).status);
  }
}

describe.runIf(RUN)('member engagement (DB integration)', () => {
  let db: typeof import('../../db')['db'];
  let schema: typeof import('../../db/schema');
  let checkinSvc: typeof import('./member-checkin.service');
  let levelsSvc: typeof import('./member-levels.service');
  let settingsSvc: typeof import('./checkin-settings.service');

  const tag = Date.now();
  let seq = 0;
  const memberIds: number[] = [];
  const milestoneIds: number[] = [];
  const levelIds: number[] = [];
  let makeupMaxDays = 7;

  const day = (offset: number) => dayjs().add(offset, 'day').format('YYYY-MM-DD');

  async function newMember(patch: Partial<typeof schema.members.$inferInsert> = {}): Promise<number> {
    seq += 1;
    const [m] = await db
      .insert(schema.members)
      .values({ nickname: `it-eng-${tag}-${seq}`, username: `it_eng_${tag}_${seq}`, ...patch })
      .returning({ id: schema.members.id });
    memberIds.push(m.id);
    return m.id;
  }

  const checkinRows = (memberId: number) =>
    db.select().from(schema.memberCheckins)
      .where(eq(schema.memberCheckins.memberId, memberId))
      .orderBy(asc(schema.memberCheckins.checkinDate));

  const memberRow = async (memberId: number) =>
    (await db.select().from(schema.members).where(eq(schema.members.id, memberId)))[0];

  beforeAll(async () => {
    db = (await import('../../db')).db;
    schema = await import('../../db/schema');
    checkinSvc = await import('./member-checkin.service');
    levelsSvc = await import('./member-levels.service');
    settingsSvc = await import('./checkin-settings.service');
    makeupMaxDays = (await settingsSvc.getCheckinSettingsRow()).makeupMaxDays;

    // seed 以显式 id 写入这两张表会使 serial 序列滞后，插入测试行前幂等地向前同步（只进不退）
    for (const table of ['checkin_milestones', 'member_levels']) {
      await db.execute(sql`
        SELECT setval(
          pg_get_serial_sequence(${table}, 'id'),
          GREATEST((SELECT COALESCE(MAX(id), 0) + 1 FROM ${sql.raw(`"${table}"`)}), nextval(pg_get_serial_sequence(${table}, 'id'))),
          false
        )
      `);
    }
  });

  afterAll(async () => {
    // members 级联清理签到记录/积分账户/流水/里程碑发放；里程碑与等级单独清理
    if (milestoneIds.length) await db.delete(schema.checkinMilestones).where(inArray(schema.checkinMilestones.id, milestoneIds));
    if (memberIds.length) await db.delete(schema.members).where(inArray(schema.members.id, memberIds));
    if (levelIds.length) await db.delete(schema.memberLevels).where(inArray(schema.memberLevels.id, levelIds));
    await (await import('../../db')).closeDb();
  });

  // ─── 补签：日期边界与防双签 ───────────────────────────────────────────────────
  describe('doMakeupCheckin(admin) — 日期校验与并发防双签', () => {
    it('今天与未来日期不可补签（400）', async () => {
      const mid = await newMember();
      await expect(checkinSvc.doMakeupCheckin({ memberId: mid, date: day(0), mode: 'admin' })).rejects.toHaveProperty('status', 400);
      await expect(checkinSvc.doMakeupCheckin({ memberId: mid, date: day(2), mode: 'admin' })).rejects.toHaveProperty('status', 400);
    });

    it('超出回溯窗口的日期不可补签（400）', async () => {
      const mid = await newMember();
      await expect(
        checkinSvc.doMakeupCheckin({ memberId: mid, date: day(-(makeupMaxDays + 1)), mode: 'admin' }),
      ).rejects.toHaveProperty('status', 400);
    });

    it('非法日期格式拒绝（400），会员不存在抛 404', async () => {
      const mid = await newMember();
      await expect(checkinSvc.doMakeupCheckin({ memberId: mid, date: 'not-a-date', mode: 'admin' })).rejects.toHaveProperty('status', 400);
      await expect(checkinSvc.doMakeupCheckin({ memberId: 999_999_999, date: day(-1), mode: 'admin' })).rejects.toHaveProperty('status', 404);
    });

    it('连续天数按前一日记录累计（前天=1 → 昨天=2）', async () => {
      const mid = await newMember();
      const first = await checkinSvc.doMakeupCheckin({ memberId: mid, date: day(-2), mode: 'admin' });
      expect(first.consecutiveDays).toBe(1);

      const second = await checkinSvc.doMakeupCheckin({ memberId: mid, date: day(-1), mode: 'admin' });
      expect(second.consecutiveDays).toBe(2);

      const rows = await checkinRows(mid);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.isMakeup)).toBe(true);
    });

    it('同日重复补签被拒（400）', async () => {
      const mid = await newMember();
      await checkinSvc.doMakeupCheckin({ memberId: mid, date: day(-1), mode: 'admin' });
      await expect(checkinSvc.doMakeupCheckin({ memberId: mid, date: day(-1), mode: 'admin' })).rejects.toHaveProperty('status', 400);
    });

    it('并发补签同一日期仅一次成功（唯一约束防双签，失败均 400）', CONCURRENT, async () => {
      const mid = await newMember();
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () => checkinSvc.doMakeupCheckin({ memberId: mid, date: day(-1), mode: 'admin' })),
      );
      const { fulfilled, rejected } = splitResults(results);
      expect(fulfilled).toHaveLength(1);
      expectAllHttpErrors(rejected, [400]);

      const rows = await checkinRows(mid);
      expect(rows).toHaveLength(1); // 失败事务完整回滚，不残留记录
      expect(rows[0].checkinDate).toBe(day(-1));
    });
  });

  // ─── 里程碑：达标发放恰好一次 ─────────────────────────────────────────────────
  describe('里程碑 — 防重复发放', () => {
    it('累计达标发放一次，后续签到不重复发放（awards 唯一）', async () => {
      const [ms] = await db
        .insert(schema.checkinMilestones)
        .values({ title: `it-ms-${tag}`, cumulativeDays: 1, rewardType: 'points', rewardPoints: 77, enabled: true })
        .returning({ id: schema.checkinMilestones.id });
      milestoneIds.push(ms.id);

      const mid = await newMember();
      await checkinSvc.doMakeupCheckin({ memberId: mid, date: day(-2), mode: 'admin' }); // totalDays=1 达标
      await checkinSvc.doMakeupCheckin({ memberId: mid, date: day(-1), mode: 'admin' }); // totalDays=2 仍达标但已领

      const awards = await db.select().from(schema.memberCheckinMilestoneAwards)
        .where(and(
          eq(schema.memberCheckinMilestoneAwards.memberId, mid),
          eq(schema.memberCheckinMilestoneAwards.milestoneId, ms.id),
        ));
      expect(awards).toHaveLength(1);
      expect(awards[0].rewardPoints).toBe(77);

      // 里程碑积分流水恰好一条
      const msTxs = await db.select().from(schema.memberPointTransactions)
        .where(and(
          eq(schema.memberPointTransactions.memberId, mid),
          eq(schema.memberPointTransactions.bizType, 'checkin_milestone'),
        ));
      expect(msTxs).toHaveLength(1);
      expect(msTxs[0].amount).toBe(77);
    });
  });

  // ─── 成长值自动定级 ───────────────────────────────────────────────────────────
  describe('addGrowthValue — 阈值定级（真实 SQL 匹配）', () => {
    // 超大阈值 + 超大 level 序号，与库内真实等级完全隔离
    const T1 = 10_000_000;
    const T2 = 20_000_000;
    let lvl1 = 0;
    let lvl2 = 0;

    beforeAll(async () => {
      const rows = await db
        .insert(schema.memberLevels)
        .values([
          { name: `it-lvl1-${tag}`, level: 900_001, growthThreshold: T1, status: 'enabled' },
          { name: `it-lvl2-${tag}`, level: 900_002, growthThreshold: T2, status: 'enabled' },
        ])
        .returning({ id: schema.memberLevels.id });
      lvl1 = rows[0].id;
      lvl2 = rows[1].id;
      levelIds.push(lvl1, lvl2);
    });

    it('成长值跨过阈值自动升至最高满足档', async () => {
      const mid = await newMember({ growthValue: 0 });
      await levelsSvc.addGrowthValue(mid, T2 + 5);

      const m = await memberRow(mid);
      expect(m.growthValue).toBe(T2 + 5);
      expect(m.levelId).toBe(lvl2);
    });

    it('扣减跌破高档阈值自动降级', async () => {
      const mid = await newMember({ growthValue: 0 });
      await levelsSvc.addGrowthValue(mid, T2);
      await levelsSvc.addGrowthValue(mid, -(T2 - T1)); // 剩 T1，恰好满足一档

      const m = await memberRow(mid);
      expect(m.growthValue).toBe(T1);
      expect(m.levelId).toBe(lvl1);
    });

    it('扣减超过当前值钳制为 0（不为负）', async () => {
      const mid = await newMember({ growthValue: 0 });
      await levelsSvc.addGrowthValue(mid, 100);
      await levelsSvc.addGrowthValue(mid, -99_999);

      const m = await memberRow(mid);
      expect(m.growthValue).toBe(0);
      expect(m.levelId).not.toBe(lvl1); // 不再满足测试档阈值
    });

    it('会员不存在抛 404', async () => {
      await expect(levelsSvc.addGrowthValue(999_999_999, 10)).rejects.toHaveProperty('status', 404);
    });
  });
});
