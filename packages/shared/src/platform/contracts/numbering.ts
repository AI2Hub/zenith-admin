import * as z from 'zod';
import { auditFieldsSchema, dateRangeQuery, entityStatusQuery, entityStatusSchema, idParam, idQuery, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { NUMBERING_SCENE_CODES, NUMBERING_SCOPES, NUMBERING_UNIQUE_SCOPES } from '../constants';
import { NUMBERING_SCENE_OPTIONS } from '../numbering-scenes';
import { createNumberingRuleSchema, numberingConfigSchema, numberingPreviewSchema, publishNumberingRuleSchema, resetNumberingDefaultSchema, updateNumberingDefaultSchema, updateNumberingRuleSchema } from '../numbering-validation';

export const numberingRuleSchema = z.object({
  id: z.int(), code: z.string(), name: z.string(), scene: z.enum(NUMBERING_SCENE_CODES),
  description: z.string().nullable(), tenantId: z.int().nullable(), isBuiltin: z.boolean(),
  status: entityStatusSchema, draft: numberingConfigSchema, revision: z.int(), currentVersion: z.int(),
  ...auditFieldsSchema, createdAt: z.string(), updatedAt: z.string(),
}).meta({ id: 'NumberingRule' });
export type NumberingRule = z.infer<typeof numberingRuleSchema>;

export const numberingVersionSchema = z.object({
  id: z.int(), ruleId: z.int(), version: z.int(), config: numberingConfigSchema,
  createdBy: z.int().nullable(), createdAt: z.string(),
}).meta({ id: 'NumberingVersion' });
export type NumberingVersion = z.infer<typeof numberingVersionSchema>;

export const numberingCounterSchema = z.object({
  scopeKey: z.string(), periodKey: z.string(), value: z.string(),
}).meta({ id: 'NumberingCounter' });
export type NumberingCounter = z.infer<typeof numberingCounterSchema>;

export const numberingRuleOptionSchema = z.object({
  id: z.int(), code: z.string(), name: z.string(), scene: z.enum(NUMBERING_SCENE_CODES),
  currentVersion: z.int(), versionId: z.int(),
  template: z.string(), requiredParameters: z.array(z.string()),
}).meta({ id: 'NumberingRuleOption' });
export type NumberingRuleOption = z.infer<typeof numberingRuleOptionSchema>;

export const numberingSceneSchema = z.object({
  code: z.enum(NUMBERING_SCENE_CODES), label: z.string(), description: z.string(),
  uniqueNamespace: z.string(), uniqueScope: z.enum(NUMBERING_UNIQUE_SCOPES),
  allowedScopes: z.array(z.enum(NUMBERING_SCOPES)),
  parameters: z.array(z.object({ key: z.string(), label: z.string(), example: z.string() })),
  maxLength: z.int(), characterPattern: z.string(), tenantCustomizable: z.boolean(),
}).meta({ id: 'NumberingScene' });
export type NumberingScene = z.infer<typeof numberingSceneSchema>;

export const numberingBindingSchema = z.object({
  id: z.int(), scene: z.enum(NUMBERING_SCENE_CODES), ownerKey: z.string(),
  ruleId: z.int(), versionId: z.int(), tenantId: z.int().nullable(),
  ruleName: z.string(), version: z.int(),
  parameterMapping: z.record(z.string(), z.string()),
  ...auditFieldsSchema, createdAt: z.string(), updatedAt: z.string(),
}).meta({ id: 'NumberingBinding' });
export type NumberingBinding = z.infer<typeof numberingBindingSchema>;

export const numberingDefaultSchema = z.object({
  scene: z.enum(NUMBERING_SCENE_CODES), businessName: z.string(), description: z.string(), tenantCustomizable: z.boolean(),
  tenantId: z.int().nullable(), sourceTenantId: z.int().nullable(), sourceTenantName: z.string().nullable(), inherited: z.boolean(),
  ruleId: z.int().nullable(), ruleName: z.string().nullable(), versionId: z.int().nullable(), version: z.int().nullable(),
  template: z.string().nullable(), scope: z.enum(NUMBERING_SCOPES).nullable(), expectedVersionId: z.int().nullable(),
  canUpdate: z.boolean(), canReset: z.boolean(),
}).meta({ id: 'NumberingDefault' });
export type NumberingDefault = z.infer<typeof numberingDefaultSchema>;

export const numberingRuleUsageSchema = z.object({
  kind: z.enum(['default', 'workflow']), scene: z.enum(NUMBERING_SCENE_CODES), businessName: z.string(), name: z.string(),
  tenantId: z.int().nullable(), tenantName: z.string().nullable(), versionId: z.int(), version: z.int(),
  objectKey: z.string().nullable(), destination: z.string().nullable(),
}).meta({ id: 'NumberingRuleUsage' });
export type NumberingRuleUsage = z.infer<typeof numberingRuleUsageSchema>;

export const numberingAllocationSchema = z.object({
  id: z.int(), scene: z.enum(NUMBERING_SCENE_CODES), tenantId: z.int().nullable(),
  ownerKey: z.string(), allocationKey: z.string(), businessKey: z.string().nullable(),
  ruleId: z.int(), versionId: z.int(), number: z.string(),
  uniqueNamespace: z.string(), uniqueScope: z.string(), createdAt: z.string(),
}).meta({ id: 'NumberingAllocation' });
export type NumberingAllocation = z.infer<typeof numberingAllocationSchema>;

export const numberingPreviewResultSchema = z.object({ numbers: z.array(z.string()), periodKey: z.string() });
export type NumberingPreviewResult = z.infer<typeof numberingPreviewResultSchema>;

const sceneQuery = queryEnum(NUMBERING_SCENE_CODES, { description: '编号业务', options: NUMBERING_SCENE_OPTIONS });
export const numberingRuleListQuery = paginationQuery.extend({
  keyword: keywordQuery('规则名称 / 编码'), scene: sceneQuery, status: entityStatusQuery,
});

export const numberingRuleContract = defineContract('/api/numbering-rules', {
  list: op.get('/', { access: { permission: 'system:numbering:list' }, query: numberingRuleListQuery, response: paginated(numberingRuleSchema), summary: '编号规则列表' }),
  all: op.get('/all', { access: 'authenticated', query: z.object({ scene: sceneQuery }), response: z.array(numberingRuleOptionSchema), summary: '可用的已发布编号规则' }),
  scenes: op.get('/scenes', { access: { permission: 'system:numbering:list' }, response: z.array(numberingSceneSchema), summary: '已注册的编号业务' }),
  preview: op.post('/preview', { access: { permission: 'system:numbering:list' }, body: numberingPreviewSchema, response: numberingPreviewResultSchema, summary: '预览编号（不消耗正式号码）' }),
  detail: op.get('/{id}', { access: { permission: 'system:numbering:list' }, params: idParam, response: numberingRuleSchema, summary: '编号规则详情' }),
  create: op.post('/', { access: { permission: 'system:numbering:create' }, audit: '创建编号规则', body: createNumberingRuleSchema, response: numberingRuleSchema, summary: '创建编号规则草稿' }),
  update: op.put('/{id}', { access: { permission: 'system:numbering:update' }, audit: '修改编号规则', params: idParam, body: updateNumberingRuleSchema, response: numberingRuleSchema, summary: '修改编号规则草稿' }),
  remove: op.delete('/{id}', { access: { permission: 'system:numbering:delete' }, audit: '删除编号规则', params: idParam, summary: '删除未使用的编号规则' }),
  publish: op.post('/{id}/publish', { access: { permission: 'system:numbering:publish' }, audit: '发布编号规则', params: idParam, body: publishNumberingRuleSchema, response: numberingRuleSchema, summary: '发布不可变编号规则版本' }),
  versions: op.get('/{id}/versions', { access: { permission: 'system:numbering:list' }, params: idParam, response: z.array(numberingVersionSchema), summary: '编号规则历史版本' }),
  counters: op.get('/{id}/counters', { access: { permission: 'system:numbering:list' }, params: idParam, response: z.array(numberingCounterSchema), summary: '编号规则各范围及周期的当前流水' }),
  usages: op.get('/{id}/usages', { access: { permission: 'system:numbering:list' }, params: idParam, response: z.array(numberingRuleUsageSchema), summary: '编号规则的实际使用位置' }),
}, { auditModule: '编号规则', tags: ['NumberingRules'] });

const numberingSceneParam = z.object({ scene: z.enum(NUMBERING_SCENE_CODES) });
export const numberingDefaultContract = defineContract('/api/numbering-defaults', {
  list: op.get('/', { access: { permission: 'system:numbering:list' }, response: z.array(numberingDefaultSchema), summary: '当前视角各业务类型的默认编号规则' }),
  update: op.put('/{scene}', { access: { permission: 'system:numbering:bind' }, audit: '配置业务默认编号规则', params: numberingSceneParam, body: updateNumberingDefaultSchema, response: numberingDefaultSchema, summary: '配置业务类型的默认编号规则' }),
  reset: op.delete('/{scene}', { access: { permission: 'system:numbering:bind' }, audit: '恢复业务默认编号规则', params: numberingSceneParam, body: resetNumberingDefaultSchema, response: numberingDefaultSchema, summary: '删除租户覆盖并恢复平台默认' }),
}, { auditModule: '编号规则', tags: ['NumberingDefaults'] });

export const numberingAllocationContract = defineContract('/api/numbering-allocations', {
  list: op.get('/', {
    access: { permission: 'system:numbering:allocation' },
    query: paginationQuery.extend({ scene: sceneQuery, ruleId: idQuery('编号规则 ID'), keyword: keywordQuery('编号 / 业务键'), ...dateRangeQuery('生成时间') }),
    response: paginated(numberingAllocationSchema), summary: '编号分配记录（幂等与防重数据）',
  }),
}, { tags: ['NumberingAllocations'] });
