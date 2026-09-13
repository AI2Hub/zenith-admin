import * as z from 'zod';
import { dateRangeQuery, idParam, idQuery, paginated, paginationQuery, queryBool, queryEnum, keywordQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { MONITOR_ALERT_EVENT_STATUSES,
  MONITOR_ALERT_HANDLE_STATUSES,
  MONITOR_ALERT_LEVELS,
  MONITOR_ALERT_NOTIFY_STATUSES,
  MONITOR_ALERT_OPERATORS,
  MONITOR_ALERT_OVERVIEW_RANGES,
  MONITOR_ALERT_STATES,
  MONITOR_METRICS, MONITOR_ALERT_LEVEL_OPTIONS, MONITOR_ALERT_STATE_OPTIONS } from '../constants';
import {
  batchHandleMonitorAlertEventsSchema,
  batchSetMonitorAlertRulesEnabledSchema,
  createMonitorAlertRuleSchema,
  handleMonitorAlertEventSchema,
  monitorAlertRuleIdsBody,
  setMonitorAlertRuleEnabledSchema,
  updateMonitorAlertRuleSchema,
} from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const monitorAlertRuleSchema = z.object({
  id: z.int(),
  name: z.string(),
  metric: z.enum(MONITOR_METRICS),
  operator: z.enum(MONITOR_ALERT_OPERATORS),
  threshold: z.number(),
  durationMinutes: z.int().meta({ description: '持续达标分钟数（0=瞬时触发）' }),
  level: z.enum(MONITOR_ALERT_LEVELS),
  channels: z.array(z.string()),
  webhookUrl: z.string().nullable(),
  recipientUserIds: z.array(z.int()),
  recipientEmails: z.array(z.string()),
  silenceMinutes: z.int(),
  enabled: z.boolean(),
  state: z.enum(MONITOR_ALERT_STATES).meta({ description: '运行态：ok / firing' }),
  lastTriggeredAt: z.string().nullable(),
  lastValue: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'MonitorAlertRule' });

export type MonitorAlertRule = z.infer<typeof monitorAlertRuleSchema>;

export const monitorAlertEventSchema = z.object({
  id: z.int(),
  ruleId: z.int().nullable(),
  ruleName: z.string(),
  metric: z.enum(MONITOR_METRICS),
  level: z.enum(MONITOR_ALERT_LEVELS),
  operator: z.enum(MONITOR_ALERT_OPERATORS),
  threshold: z.number(),
  value: z.number(),
  status: z.enum(MONITOR_ALERT_EVENT_STATUSES),
  message: z.string(),
  notifyStatus: z.enum(MONITOR_ALERT_NOTIFY_STATUSES).meta({ description: '最近一次通知派发的真实结果' }),
  notifyChannels: z.array(z.string()).meta({ description: '本次实际尝试的渠道快照' }),
  notifyError: z.string().nullable(),
  notifiedAt: z.string().nullable(),
  handleStatus: z.enum(MONITOR_ALERT_HANDLE_STATUSES).meta({ description: '人工处理状态，与 status 正交' }),
  acknowledgedAt: z.string().nullable(),
  handledBy: z.int().nullable(),
  handledByName: z.string().nullable(),
  handledAt: z.string().nullable(),
  handleNote: z.string().nullable(),
  triggeredAt: z.string(),
  resolvedAt: z.string().nullable(),
}).meta({ id: 'MonitorAlertEvent' });

export type MonitorAlertEvent = z.infer<typeof monitorAlertEventSchema>;

export const monitorAlertLevelCountSchema = z.object({
  level: z.enum(MONITOR_ALERT_LEVELS),
  count: z.int(),
}).meta({ id: 'MonitorAlertLevelCount' });

export type MonitorAlertLevelCount = z.infer<typeof monitorAlertLevelCountSchema>;

export const monitorAlertTrendPointSchema = z.object({
  date: z.string(),
  fired: z.int(),
  resolved: z.int(),
}).meta({ id: 'MonitorAlertTrendPoint' });

export type MonitorAlertTrendPoint = z.infer<typeof monitorAlertTrendPointSchema>;

export const monitorAlertTopRuleSchema = z.object({
  ruleId: z.int().nullable(),
  ruleName: z.string(),
  count: z.int(),
}).meta({ id: 'MonitorAlertTopRule' });

export type MonitorAlertTopRule = z.infer<typeof monitorAlertTopRuleSchema>;

export const monitorAlertOverviewSchema = z.object({
  range: z.enum(MONITOR_ALERT_OVERVIEW_RANGES),
  firingTotal: z.int().meta({ description: '当前处于告警中的事件数（不受时间范围限制）' }),
  firingByLevel: z.array(monitorAlertLevelCountSchema),
  pendingTotal: z.int().meta({ description: '告警中且无人认领的事件数' }),
  oldestPendingAt: z.string().nullable(),
  oldestPendingMinutes: z.number().nullable(),
  firedInRange: z.int(),
  resolvedInRange: z.int(),
  notifyFailedInRange: z.int(),
  mttaMinutes: z.number().nullable().meta({ description: '平均确认耗时（分钟），无样本时为 null' }),
  mttrMinutes: z.number().nullable().meta({ description: '平均恢复耗时（分钟），无样本时为 null' }),
  trend: z.array(monitorAlertTrendPointSchema),
  topRules: z.array(monitorAlertTopRuleSchema),
}).meta({ id: 'MonitorAlertOverview' });

export type MonitorAlertOverview = z.infer<typeof monitorAlertOverviewSchema>;

/** 规则试发通知的结果：直接暴露各渠道派发情况，便于定位是哪一个渠道配错了 */
export const monitorAlertTestResultSchema = z.object({
  status: z.enum(MONITOR_ALERT_NOTIFY_STATUSES),
  channels: z.array(z.string()),
  error: z.string().nullable(),
}).meta({ id: 'MonitorAlertTestResult' });

export type MonitorAlertTestResult = z.infer<typeof monitorAlertTestResultSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const monitorAlertRuleListQuery = paginationQuery.extend({
  keyword: keywordQuery(undefined, { max: 128 }),
  metric: queryEnum(MONITOR_METRICS),
  level: queryEnum(MONITOR_ALERT_LEVELS, { options: MONITOR_ALERT_LEVEL_OPTIONS }),
  enabled: queryBool('启用状态；规则是否参与定时评估', { labels: ['已启用', '已停用'] }),
  state: queryEnum(MONITOR_ALERT_STATES, { description: '规则当前是否处于告警中', options: MONITOR_ALERT_STATE_OPTIONS }),
});

export type MonitorAlertRuleQuery = z.infer<typeof monitorAlertRuleListQuery>;

export const monitorAlertEventListQuery = paginationQuery.extend({
  keyword: keywordQuery(undefined, { max: 128 }),
  metric: queryEnum(MONITOR_METRICS),
  level: queryEnum(MONITOR_ALERT_LEVELS),
  status: queryEnum(MONITOR_ALERT_EVENT_STATUSES),
  notifyStatus: queryEnum(MONITOR_ALERT_NOTIFY_STATUSES),
  handleStatus: queryEnum(MONITOR_ALERT_HANDLE_STATUSES),
  ruleId: idQuery(),
  ...dateRangeQuery('触发时间'),
});

export type MonitorAlertEventQuery = z.infer<typeof monitorAlertEventListQuery>;

export const monitorAlertOverviewQuery = z.object({
  range: queryEnum(MONITOR_ALERT_OVERVIEW_RANGES).default('24h'),
});

export type MonitorAlertOverviewQuery = z.infer<typeof monitorAlertOverviewQuery>;

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const monitorAlertContract = defineContract('/api/monitor-alerts', {
  overview: op.get('/overview', { access: { permission: 'alert:overview:list' }, query: monitorAlertOverviewQuery, response: monitorAlertOverviewSchema, summary: '获取告警概览' }),
  events: op.get('/events', { access: { permission: 'alert:event:list' }, query: monitorAlertEventListQuery, response: paginated(monitorAlertEventSchema), summary: '获取告警事件列表' }),
  handleEventsBatch: op.patch('/events/batch/handle', { access: { permission: 'alert:event:handle' }, audit: '批量处理告警事件', body: batchHandleMonitorAlertEventsSchema, summary: '批量处理告警事件' }),
  handleEvent: op.patch('/events/{id}/handle', { access: { permission: 'alert:event:handle' }, audit: '处理告警事件', params: idParam, body: handleMonitorAlertEventSchema, response: monitorAlertEventSchema, summary: '处理告警事件' }),
  list: op.get('/', { access: { permission: 'alert:rule:list' }, query: monitorAlertRuleListQuery, response: paginated(monitorAlertRuleSchema), summary: '获取告警规则列表' }),
  create: op.post('/', { access: { permission: 'alert:rule:create' }, audit: '创建告警规则', body: createMonitorAlertRuleSchema, response: monitorAlertRuleSchema, summary: '创建告警规则' }),
  setEnabledBatch: op.patch('/batch/enabled', { access: { permission: 'alert:rule:update' }, audit: '批量切换告警规则状态', body: batchSetMonitorAlertRulesEnabledSchema, summary: '批量启用/禁用告警规则' }),
  removeBatch: op.delete('/batch', { access: { permission: 'alert:rule:delete' }, audit: '批量删除告警规则', body: monitorAlertRuleIdsBody, summary: '批量删除告警规则' }),
  test: op.post('/{id}/test', { access: { permission: 'alert:rule:test' }, audit: '试发告警通知', params: idParam, response: monitorAlertTestResultSchema, summary: '试发告警通知' }),
  update: op.put('/{id}', { access: { permission: 'alert:rule:update' }, audit: '更新告警规则', params: idParam, body: updateMonitorAlertRuleSchema, response: monitorAlertRuleSchema, summary: '更新告警规则' }),
  setEnabled: op.patch('/{id}/enabled', { access: { permission: 'alert:rule:update' }, audit: '切换告警规则状态', params: idParam, body: setMonitorAlertRuleEnabledSchema, response: monitorAlertRuleSchema, summary: '启用/禁用告警规则' }),
  remove: op.delete('/{id}', { access: { permission: 'alert:rule:delete' }, audit: '删除告警规则', params: idParam, summary: '删除告警规则' }),
}, { auditModule: '告警中心', tags: ['AlertCenter'] });
