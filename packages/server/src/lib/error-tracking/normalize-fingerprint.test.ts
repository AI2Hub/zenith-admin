import { describe, expect, it } from 'vitest';
import { normalizeThrown } from './normalize';
import { computeServerFingerprint, extractInAppFrames, normalizeErrorMessage } from './fingerprint';
import { pickHeaders, scrubBody } from './scrub';

const APP_STACK = [
  'Error: relation "users" does not exist',
  '    at PgPreparedQuery.execute (C:\\repo\\node_modules\\drizzle-orm\\postgres-js\\session.js:88:20)',
  '    at listUsers (file:///C:/repo/packages/server/src/services/identity/user.service.ts:120:15)',
  '    at async handler (file:///C:/repo/packages/server/src/routes/identity/users.ts:33:9)',
  '    at async dispatch (C:\\repo\\node_modules\\hono\\dist\\compose.js:29:17)',
  '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
].join('\n');

describe('normalizeThrown', () => {
  it('Error：名称 / 消息 / code / cause 链堆栈', () => {
    const inner = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED', syscall: 'connect', address: '127.0.0.1', port: 5432 });
    const outer = new Error('查询用户失败', { cause: inner });
    const normalized = normalizeThrown(outer);
    expect(normalized.name).toBe('Error');
    expect(normalized.message).toBe('查询用户失败');
    expect(normalized.stack).toContain('Caused by: Error: connect ECONNREFUSED');
    expect(normalized.code).toBeNull();
    expect(normalized.details).toBeNull();

    const innerNormalized = normalizeThrown(inner);
    expect(innerNormalized.code).toBe('ECONNREFUSED');
    expect(innerNormalized.details).toMatchObject({ syscall: 'connect', address: '127.0.0.1', port: 5432 });
  });

  it('PG 错误：SQLSTATE 与约束名进入 code / details；ZodError 只记 issue 数', () => {
    const pg = Object.assign(new Error('duplicate key value violates unique constraint "users_username_unique"'), { name: 'PostgresError', code: '23505', constraint_name: 'users_username_unique', detail: 'Key (username)=(admin) already exists.' });
    const normalized = normalizeThrown(pg);
    expect(normalized.name).toBe('PostgresError');
    expect(normalized.code).toBe('23505');
    expect(normalized.details).toMatchObject({ constraint_name: 'users_username_unique' });

    const zod = Object.assign(new Error('invalid'), { name: 'ZodError', issues: [{ path: ['a'] }, { path: ['b'] }] });
    expect(normalizeThrown(zod).details).toEqual({ issueCount: 2 });
  });

  it('非 Error 值：字符串 / 对象 / undefined 都能归一', () => {
    expect(normalizeThrown('boom')).toMatchObject({ name: 'NonError', message: 'boom', stack: null });
    expect(normalizeThrown({ reason: 'x' }).message).toBe('{"reason":"x"}');
    expect(normalizeThrown(undefined).message).toBe('undefined');
  });

  it('循环 cause 与 AggregateError 不会死循环', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as { cause?: unknown }).cause = b;
    expect(normalizeThrown(a).stack?.split('Caused by:').length).toBeLessThanOrEqual(3);
    const agg = new AggregateError([new Error('x'), 'y'], 'many');
    const stack = normalizeThrown(agg).stack ?? '';
    expect(stack).toContain('[errors[0]] Error: x');
    expect(stack).toContain('[errors[1]] y');
  });
});

describe('服务端指纹', () => {
  it('消息归一：数字 / UUID / 十六进制占位，引号内字面量保留', () => {
    expect(normalizeErrorMessage('user 42 not found (id=8f14e45f-ceea-467a-9575-6a1d2c0b8c1e) at 0x1f')).toBe('user N not found (id=UUID) at HEX');
    expect(normalizeErrorMessage('violates unique constraint "users_username_unique"')).toContain('"users_username_unique"');
  });

  it('只取应用内帧、去行列号与 async 前缀、路径相对到 src/', () => {
    expect(extractInAppFrames(APP_STACK)).toEqual([
      'listUsers@src/services/identity/user.service.ts',
      'handler@src/routes/identity/users.ts',
    ]);
  });

  it('没有应用帧时退回前两帧（驱动内部抛出的错误也能稳定分组）', () => {
    const stack = 'Error: x\n    at a (C:\\repo\\node_modules\\pg\\lib\\client.js:1:1)\n    at b (node:internal/x:2:2)\n    at c (C:\\repo\\node_modules\\pg\\lib\\pool.js:3:3)';
    expect(extractInAppFrames(stack)).toHaveLength(2);
    expect(extractInAppFrames(stack)[0]).toBe('a@pg/lib/client.js');
  });

  it('同一错误在不同行号 / 不同 id 下指纹一致；不同错误名或不同帧不一致', () => {
    const base = { environment: 'production', errorType: 'server_exception', errorName: 'PostgresError', message: 'relation "users" does not exist (id 1)', stack: APP_STACK };
    const moved = { ...base, message: 'relation "users" does not exist (id 2)', stack: APP_STACK.replace(':120:15', ':131:7') };
    expect(computeServerFingerprint(base)).toBe(computeServerFingerprint(moved));
    expect(computeServerFingerprint({ ...base, errorName: 'TypeError' })).not.toBe(computeServerFingerprint(base));
    expect(computeServerFingerprint({ ...base, stack: APP_STACK.replace('listUsers', 'listRoles') })).not.toBe(computeServerFingerprint(base));
    expect(computeServerFingerprint({ ...base, environment: 'development' })).not.toBe(computeServerFingerprint(base));
    expect(computeServerFingerprint(base)).toHaveLength(32);
  });

  it('显式 fingerprint 覆盖堆栈分组', () => {
    const a = computeServerFingerprint({ environment: 'production', errorType: 'job_failure', errorName: 'Error', message: 'a', stack: null, override: ['export-job', 'timeout'] });
    const b = computeServerFingerprint({ environment: 'production', errorType: 'job_failure', errorName: 'TypeError', message: 'completely different', stack: APP_STACK, override: ['export-job', 'timeout'] });
    expect(a).toBe(b);
  });
});

describe('请求快照脱敏', () => {
  it('请求头只保留白名单，凭证类根本不进快照', () => {
    const headers = new Headers({ authorization: 'Bearer x', cookie: 'sid=1', 'content-type': 'application/json', 'x-request-id': 'req-1', 'x-api-key': 'k' });
    expect(pickHeaders(headers)).toEqual({ 'content-type': 'application/json', 'x-request-id': 'req-1' });
  });

  it('请求体：内置敏感字段 + 设置追加字段打码，超长退化为截断字符串', () => {
    const body = { username: 'admin', password: 'p', nested: { token: 't', idNumber: '110101199001011234' } };
    expect(scrubBody(body, { maxBytes: 4096, extraKeys: ['idNumber'] })).toEqual({ username: 'admin', password: '***', nested: { token: '***', idNumber: '***' } });
    const long = scrubBody({ text: 'x'.repeat(5000) }, { maxBytes: 100, extraKeys: [] });
    expect(typeof long).toBe('string');
    expect(long as string).toMatch(/…\(truncated \d+ bytes\)$/);
    expect(scrubBody({ a: 1 }, { maxBytes: 0, extraKeys: [] })).toBeUndefined();
  });
});
