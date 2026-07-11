/**
 * 行为中心阶段 1：属性过滤条件 → 安全 SQL 转换单测。
 * 覆盖：
 *  - 非法 key（jsonb 路径注入尝试）一律拒绝，杜绝 sql.raw(用户输入)
 *  - 全部比较值均以绑定参数传入，不拼接进 SQL 文本（即便值本身包含单引号/分号等注入字符）
 *  - in 运算符数组长度边界（0 / >100）
 *  - 不支持的运算符抛 400
 */
import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { HTTPException } from 'hono/http-exception';
import { userEvents, analyticsUserProfiles } from '../../db/schema';
import { buildJsonPropertyCondition, buildColumnCompareCondition, PROPERTY_KEY_RE } from './analytics-property-filter';

const dialect = new PgDialect();
function render(sqlObj: ReturnType<typeof buildJsonPropertyCondition>) {
  return dialect.sqlToQuery(sqlObj);
}

describe('PROPERTY_KEY_RE — 属性 key 白名单', () => {
  it('accepts alphanumeric/underscore/dot/dash keys up to 64 chars', () => {
    expect(PROPERTY_KEY_RE.test('amount')).toBe(true);
    expect(PROPERTY_KEY_RE.test('utm_source')).toBe(true);
    expect(PROPERTY_KEY_RE.test('a.b-c_1')).toBe(true);
    expect(PROPERTY_KEY_RE.test('a'.repeat(64))).toBe(true);
  });

  it('rejects keys exceeding 64 chars, empty keys, or keys with disallowed characters', () => {
    expect(PROPERTY_KEY_RE.test('a'.repeat(65))).toBe(false);
    expect(PROPERTY_KEY_RE.test('')).toBe(false);
    expect(PROPERTY_KEY_RE.test("key' OR '1'='1")).toBe(false);
    expect(PROPERTY_KEY_RE.test('key; DROP TABLE users;--')).toBe(false);
    expect(PROPERTY_KEY_RE.test('key->>other')).toBe(false);
    expect(PROPERTY_KEY_RE.test('key)')).toBe(false);
    expect(PROPERTY_KEY_RE.test('key with space')).toBe(false);
  });
});

describe('buildJsonPropertyCondition — jsonb ->> key 安全比较', () => {
  it('rejects a key containing SQL injection payloads before ever touching the DB column', () => {
    expect(() => buildJsonPropertyCondition(userEvents.properties, { key: "amount'; DROP TABLE users;--", op: 'eq', value: 1 }))
      .toThrow(HTTPException);
  });

  it('rejects a jsonb-path-traversal-style key (e.g. attempting ->> chaining)', () => {
    expect(() => buildJsonPropertyCondition(userEvents.properties, { key: 'a->>b', op: 'eq', value: 1 }))
      .toThrow(HTTPException);
  });

  it('binds eq comparison value as a parameter, never inlined into SQL text', () => {
    const evil = "x'); DROP TABLE users; --";
    const cond = buildJsonPropertyCondition(userEvents.properties, { key: 'name', op: 'eq', value: evil });
    const { sql, params } = render(cond);
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toContain('->>');
    expect(params).toContain(evil);
  });

  it('casts numeric comparisons (gt/gte/lt/lte) to numeric and binds the numeric value', () => {
    const cond = buildJsonPropertyCondition(userEvents.properties, { key: 'amount', op: 'gte', value: 100 });
    const { sql, params } = render(cond);
    expect(sql).toContain('::numeric >=');
    expect(params).toEqual(['amount', 100]);
  });

  it('neq allows for a missing key (IS NULL) OR an unequal value, value still bound', () => {
    const cond = buildJsonPropertyCondition(userEvents.properties, { key: 'status', op: 'neq', value: 'closed' });
    const { sql, params } = render(cond);
    expect(sql).toContain('IS NULL');
    expect(sql).toContain('!=');
    expect(params).toEqual(['status', 'status', 'closed']);
  });

  it('in operator binds every array element as a separate parameter', () => {
    const cond = buildJsonPropertyCondition(userEvents.properties, { key: 'tier', op: 'in', value: ['gold', 'platinum'] });
    const { sql, params } = render(cond);
    expect(sql).toMatch(/IN \(\$\d+, \$\d+\)/);
    expect(params).toEqual(['tier', 'gold', 'platinum']);
  });

  it('rejects an empty in-array', () => {
    expect(() => buildJsonPropertyCondition(userEvents.properties, { key: 'tier', op: 'in', value: [] }))
      .toThrow(HTTPException);
  });

  it('rejects an in-array exceeding 100 elements', () => {
    const values = Array.from({ length: 101 }, (_, i) => `v${i}`);
    expect(() => buildJsonPropertyCondition(userEvents.properties, { key: 'tier', op: 'in', value: values }))
      .toThrow(HTTPException);
  });

  it('rejects an unsupported compare operator', () => {
    expect(() => buildJsonPropertyCondition(userEvents.properties, { key: 'tier', op: 'contains' as never, value: 'x' }))
      .toThrow(HTTPException);
  });
});

describe('buildColumnCompareCondition — 直接列比较（identityType/userId/memberId 等）', () => {
  it('casts the column to text before comparing, and binds the value as a parameter', () => {
    const evil = "1'); DROP TABLE analytics_user_profiles; --";
    const cond = buildColumnCompareCondition(analyticsUserProfiles.userId, 'eq', evil);
    const { sql, params } = render(cond);
    expect(sql).toContain('::text');
    expect(sql).not.toContain('DROP TABLE');
    expect(params).toEqual([evil]);
  });

  it('supports the in operator against a directly-compared column', () => {
    const cond = buildColumnCompareCondition(analyticsUserProfiles.identityType, 'in', ['admin', 'member']);
    const { sql, params } = render(cond);
    expect(sql).toMatch(/IN \(\$\d+, \$\d+\)/);
    expect(params).toEqual(['admin', 'member']);
  });
});
