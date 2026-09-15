import * as z from 'zod';
import { defineContract, op } from '../../core/contract';
import { sqlMonitorHistoryQuerySchema, sqlMonitorQueriesQuerySchema, sqlMonitorSessionActionSchema } from '../validation';

const availabilitySchema = z.object({
  available: z.boolean(),
  reason: z.string().nullable(),
}).meta({ id: 'SqlMonitorAvailability' });

export const sqlMonitorQuerySchema = z.object({
  databaseName: z.string(),
  queryId: z.string(),
  query: z.string().nullable(),
  calls: z.number(),
  totalMs: z.number(),
  meanMs: z.number(),
  rows: z.number(),
  sharedBlksHit: z.number(),
  sharedBlksRead: z.number(),
  tempBlksRead: z.number(),
  tempBlksWritten: z.number(),
  cacheHitRatio: z.number().nullable(),
}).meta({ id: 'SqlMonitorQuery' });

export const sqlMonitorSessionSchema = z.object({
  pid: z.int(),
  username: z.string().nullable(),
  applicationName: z.string().nullable(),
  clientAddress: z.string().nullable(),
  database: z.string().nullable(),
  state: z.string().nullable(),
  waitEventType: z.string().nullable(),
  waitEvent: z.string().nullable(),
  backendType: z.string().nullable(),
  query: z.string().nullable(),
  querySeconds: z.number().nullable(),
  transactionSeconds: z.number().nullable(),
  backendSeconds: z.number().nullable(),
  queryStart: z.string().nullable(),
  backendStart: z.string().nullable(),
  backendStartToken: z.string().nullable(),
  blockedBy: z.array(z.int()),
  isCurrent: z.boolean(),
}).meta({ id: 'SqlMonitorSession' });

export const sqlMonitorLockSchema = z.object({
  pid: z.int(),
  blockedBy: z.array(z.int()),
  relation: z.string().nullable(),
  lockType: z.string(),
  mode: z.string(),
  granted: z.boolean(),
  waitSeconds: z.number().nullable(),
  query: z.string().nullable(),
}).meta({ id: 'SqlMonitorLock' });

export const sqlMonitorHistoryPointSchema = z.object({
  sampledAt: z.string(),
  queryCount: z.int(),
  calls: z.number(),
  totalMs: z.number(),
  meanMs: z.number().nullable(),
}).meta({ id: 'SqlMonitorHistoryPoint' });

export const sqlMonitorOverviewSchema = z.object({
  stats: availabilitySchema,
  databaseName: z.string().nullable(),
  sampledAt: z.string().nullable(),
  queryCount: z.int(),
  calls: z.number(),
  totalMs: z.number(),
  meanMs: z.number().nullable(),
  activeSessions: z.int(),
  waitingSessions: z.int(),
  blockedSessions: z.int(),
  deadlocks: z.number(),
  cacheHitRatio: z.number().nullable(),
  sampleIntervalMinutes: z.int(),
  sampleRetentionDays: z.int(),
  topQueries: z.array(sqlMonitorQuerySchema),
}).meta({ id: 'SqlMonitorOverview' });

export const sqlMonitorQueriesResponseSchema = z.object({
  stats: availabilitySchema,
  list: z.array(sqlMonitorQuerySchema),
}).meta({ id: 'SqlMonitorQueriesResponse' });

export const sqlMonitorSessionsResponseSchema = z.object({
  list: z.array(sqlMonitorSessionSchema),
}).meta({ id: 'SqlMonitorSessionsResponse' });

export const sqlMonitorLocksResponseSchema = z.object({
  list: z.array(sqlMonitorLockSchema),
}).meta({ id: 'SqlMonitorLocksResponse' });

export const sqlMonitorHistoryResponseSchema = z.object({
  stats: availabilitySchema,
  points: z.array(sqlMonitorHistoryPointSchema),
}).meta({ id: 'SqlMonitorHistoryResponse' });

export const sqlMonitorActionResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
}).meta({ id: 'SqlMonitorActionResponse' });

export const sqlMonitorContract = defineContract('/api/sql-monitor', {
  overview: op.get('/', { access: { permission: 'system:sql-monitor:list', platformOnly: 'multi-tenant' }, response: sqlMonitorOverviewSchema, summary: '获取 SQL 监控概览' }),
  queries: op.get('/queries', { access: { permission: 'system:sql-monitor:list', platformOnly: 'multi-tenant' }, query: sqlMonitorQueriesQuerySchema, response: sqlMonitorQueriesResponseSchema, summary: '查询 SQL 统计' }),
  sessions: op.get('/sessions', { access: { permission: 'system:sql-monitor:list', platformOnly: 'multi-tenant' }, response: sqlMonitorSessionsResponseSchema, summary: '查询数据库活动会话' }),
  locks: op.get('/locks', { access: { permission: 'system:sql-monitor:list', platformOnly: 'multi-tenant' }, response: sqlMonitorLocksResponseSchema, summary: '查询数据库锁与阻塞' }),
  history: op.get('/history', { access: { permission: 'system:sql-monitor:list', platformOnly: 'multi-tenant' }, query: sqlMonitorHistoryQuerySchema, response: sqlMonitorHistoryResponseSchema, summary: '查询 SQL 历史趋势' }),
  sessionAction: op.post('/sessions/action', { access: { permission: 'system:sql-monitor:terminate', platformOnly: 'multi-tenant' }, body: sqlMonitorSessionActionSchema, response: sqlMonitorActionResponseSchema, summary: '取消或终止数据库会话' }),
  reset: op.post('/reset', { access: { permission: 'system:sql-monitor:manage', platformOnly: 'multi-tenant' }, response: sqlMonitorActionResponseSchema, summary: '重置 SQL 统计' }),
}, { tags: ['SQL Monitor'] });

export type SqlMonitorQuery = z.infer<typeof sqlMonitorQuerySchema>;
export type SqlMonitorSession = z.infer<typeof sqlMonitorSessionSchema>;
export type SqlMonitorLock = z.infer<typeof sqlMonitorLockSchema>;
export type SqlMonitorOverview = z.infer<typeof sqlMonitorOverviewSchema>;
export type SqlMonitorHistoryPoint = z.infer<typeof sqlMonitorHistoryPointSchema>;

