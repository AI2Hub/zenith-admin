import * as z from 'zod';
import { batchIdsBody, idParam, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { RULE_DECISION_STATUSES, RULE_EVALUATE_REASONS, RULE_FLOW_SKIP_REASONS, RULE_HIT_POLICIES } from '../constants';
import {
  createDecisionFlowSchema,
  evaluateDecisionTableSchema,
  evaluateRuleByKeySchema,
  ruleFlowStepSchema,
  toggleDecisionTableSchema,
  updateDecisionFlowSchema,
} from '../validation';
import { ruleAssetVersionSchema, ruleVersionParam } from './common';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 决策流步骤：顺序执行，前序输出并入 scope 供后续步骤条件/输入引用 */
export type RuleFlowStep = z.infer<typeof ruleFlowStepSchema>;

export const ruleDecisionFlowSchema = z.object({
  id: z.int(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(RULE_DECISION_STATUSES),
  steps: z.array(ruleFlowStepSchema),
  publishedSteps: z.array(ruleFlowStepSchema).nullable().meta({ description: '最近一次发布的步骤快照（运行时按此执行，编辑态不影响线上）' }),
  version: z.int(),
  publishedAt: z.string().nullable(),
  dirty: z.boolean().optional().meta({ description: '编辑态与已发布快照不一致' }),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'DecisionFlow' });

export type RuleDecisionFlow = z.infer<typeof ruleDecisionFlowSchema>;

export const ruleFlowStepTraceSchema = z.object({
  stepId: z.string(),
  tableKey: z.string(),
  label: z.string().optional(),
  skipped: z.boolean(),
  skipReason: z.enum(RULE_FLOW_SKIP_REASONS).optional(),
  matched: z.boolean(),
  outputs: z.record(z.string(), z.unknown()),
  matchedRowIds: z.array(z.string()),
  hitPolicy: z.enum(RULE_HIT_POLICIES).optional().meta({ description: '该步骤引用决策表的实际命中策略（skipped 时缺省）' }),
  reason: z.enum(RULE_EVALUATE_REASONS).optional(),
  error: z.string().optional(),
}).meta({ id: 'RuleFlowStepTrace' });

export type RuleFlowStepTrace = z.infer<typeof ruleFlowStepTraceSchema>;

export const ruleFlowEvaluateResultSchema = z.object({
  outputs: z.record(z.string(), z.unknown()),
  steps: z.array(ruleFlowStepTraceSchema),
}).meta({ id: 'RuleFlowEvaluateResult' });

export type RuleFlowEvaluateResult = z.infer<typeof ruleFlowEvaluateResultSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const decisionFlowListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称'),
  status: queryEnum(RULE_DECISION_STATUSES),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const decisionFlowContract = defineContract('/api/rules/decision-flows', {
  list: op.get('/', { access: { permission: 'rule:flow:list' }, query: decisionFlowListQuery, response: paginated(ruleDecisionFlowSchema), summary: '决策流分页列表' }),
  detail: op.get('/{id}', { access: { permission: 'rule:flow:list' }, params: idParam, response: ruleDecisionFlowSchema, summary: '决策流详情' }),
  versions: op.get('/{id}/versions', { access: { permission: 'rule:flow:list' }, params: idParam, response: z.array(ruleAssetVersionSchema), summary: '决策流版本历史' }),
  rollback: op.post('/{id}/rollback/{version}', { access: { permission: 'rule:flow:update' }, audit: '回滚决策流版本', params: ruleVersionParam, response: ruleDecisionFlowSchema, summary: '回滚到历史版本（覆盖编辑态，置为草稿）' }),
  create: op.post('/', { access: { permission: 'rule:flow:create' }, audit: '创建决策流', body: createDecisionFlowSchema, response: ruleDecisionFlowSchema, summary: '创建决策流' }),
  update: op.put('/{id}', { access: { permission: 'rule:flow:update' }, audit: '更新决策流', params: idParam, body: updateDecisionFlowSchema, response: ruleDecisionFlowSchema, summary: '更新决策流' }),
  publish: op.post('/{id}/publish', { access: { permission: 'rule:flow:publish' }, audit: '发布决策流', params: idParam, response: ruleDecisionFlowSchema, summary: '发布决策流（步骤固化为运行时快照）' }),
  toggle: op.post('/{id}/toggle', { access: { permission: 'rule:flow:publish' }, audit: '启用/停用决策流', params: idParam, body: toggleDecisionTableSchema, response: ruleDecisionFlowSchema, summary: '启用/停用决策流' }),
  test: op.post('/{id}/test', { access: { permission: 'rule:flow:evaluate' }, params: idParam, body: evaluateDecisionTableSchema, response: ruleFlowEvaluateResultSchema, summary: '测试求值（编辑态步骤，逐步 trace）' }),
  evaluate: op.post('/evaluate', { access: { permission: 'rule:flow:evaluate' }, body: evaluateRuleByKeySchema, response: ruleFlowEvaluateResultSchema, summary: '按 key 求值（对外通用，支持 zat_ API Token 调用）' }),
  removeBatch: op.delete('/batch', { access: { permission: 'rule:flow:delete' }, audit: '批量删除决策流', body: batchIdsBody, summary: '批量删除决策流' }),
  remove: op.delete('/{id}', { access: { permission: 'rule:flow:delete' }, audit: '删除决策流', params: idParam, summary: '删除决策流' }),
}, { auditModule: '规则中心', tags: ['DecisionFlows'] });
