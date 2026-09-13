import * as z from 'zod';
import { entityStatusSchema, idParam, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { RULE_LIST_MATCH_MODES, RULE_LIST_TYPES, RULE_LIST_TYPE_OPTIONS } from '../constants';
import {
  batchRuleListItemsSchema,
  checkRuleListSchema,
  createRuleListItemSchema,
  createRuleListSchema,
  updateRuleListSchema,
} from '../validation';
import { ruleUsageItemSchema } from './common';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const ruleListSchema = z.object({
  id: z.int(),
  key: z.string(),
  name: z.string(),
  type: z.enum(RULE_LIST_TYPES),
  description: z.string().nullable(),
  status: entityStatusSchema,
  itemCount: z.int().optional().meta({ description: '条目数（列表接口返回）' }),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'RuleList' });

export type RuleList = z.infer<typeof ruleListSchema>;

export const ruleListItemSchema = z.object({
  id: z.int(),
  listId: z.int(),
  value: z.string(),
  label: z.string().nullable(),
  matchMode: z.enum(RULE_LIST_MATCH_MODES),
  expiresAt: z.string().nullable().meta({ description: '过期时间；到期后自动不再命中' }),
  remark: z.string().nullable(),
  createdAt: z.string(),
}).meta({ id: 'RuleListItem' });

export type RuleListItem = z.infer<typeof ruleListItemSchema>;

export const ruleListCheckResultSchema = z.object({
  hit: z.boolean(),
  listType: z.enum(RULE_LIST_TYPES).optional(),
  item: z.object({
    value: z.string(),
    label: z.string().nullable().optional(),
    matchMode: z.enum(RULE_LIST_MATCH_MODES).optional(),
    expiresAt: z.string().nullable().optional(),
  }).optional(),
}).meta({ id: 'RuleListCheckResult' });

export type RuleListCheckResult = z.infer<typeof ruleListCheckResultSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const ruleListListQuery = paginationQuery.extend({
  keyword: keywordQuery('名称'),
  type: queryEnum(RULE_LIST_TYPES, { options: RULE_LIST_TYPE_OPTIONS }),
});

export const ruleListItemListQuery = paginationQuery.extend({
  keyword: keywordQuery('条目值'),
});

export const ruleListItemParam = idParam.extend({
  itemId: z.coerce.number().int().positive().meta({ description: '条目 ID', example: 1 }),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const ruleListContract = defineContract('/api/rules/lists', {
  list: op.get('/', { access: { permission: 'rule:list:list' }, query: ruleListListQuery, response: paginated(ruleListSchema), summary: '名单分页列表' }),
  check: op.post('/check', { access: { permission: 'rule:list:list' }, body: checkRuleListSchema, response: ruleListCheckResultSchema, summary: '名单命中判定（对外通用，支持 zat_ API Token 调用）' }),
  create: op.post('/', { access: { permission: 'rule:list:create' }, audit: '创建名单', body: createRuleListSchema, response: ruleListSchema, summary: '创建名单' }),
  usages: op.get('/{id}/usages', { access: { permission: 'rule:list:list' }, params: idParam, response: z.array(ruleUsageItemSchema), summary: '名单引用分析（where-used）' }),
  update: op.put('/{id}', { access: { permission: 'rule:list:update' }, audit: '更新名单', params: idParam, body: updateRuleListSchema, response: ruleListSchema, summary: '更新名单（含启停）' }),
  remove: op.delete('/{id}', { access: { permission: 'rule:list:delete' }, audit: '删除名单', params: idParam, summary: '删除名单（级联删除条目）' }),
  items: op.get('/{id}/items', { access: { permission: 'rule:list:list' }, params: idParam, query: ruleListItemListQuery, response: paginated(ruleListItemSchema), summary: '名单条目分页列表' }),
  createItem: op.post('/{id}/items', { access: { permission: 'rule:list:item' }, audit: '新增名单条目', params: idParam, body: createRuleListItemSchema, response: ruleListItemSchema, summary: '新增名单条目' }),
  createItemsBatch: op.post('/{id}/items/batch', { access: { permission: 'rule:list:item' }, audit: '批量导入名单条目', params: idParam, body: batchRuleListItemsSchema, summary: '批量导入条目（去重，最多 500 条）' }),
  removeItem: op.delete('/{id}/items/{itemId}', { access: { permission: 'rule:list:item' }, audit: '删除名单条目', params: ruleListItemParam, summary: '删除名单条目' }),
  purgeExpiredItems: op.post('/{id}/items/purge-expired', { access: { permission: 'rule:list:item' }, audit: '清理过期名单条目', params: idParam, summary: '清理已过期条目' }),
}, { auditModule: '规则中心', tags: ['RuleLists'] });
