import {
  NUMBERING_SCENES, getNumberingScene, numberingAllocationContract, numberingBindingContract,
  NUMBERING_SYSTEM_PARAMETERS, numberingRuleContract, parseNumberingTemplate, previewBusinessNumbers, validateNumberingConfig, validateNumberingParameterMapping,
  type NumberingBinding, type NumberingConfig, type NumberingRule,
} from '@zenith/shared/platform';
import { mockNumberingAllocations, mockNumberingBindings, mockNumberingCounters, mockNumberingRules, mockNumberingVersions } from '@/mocks/data/numbering';
import { mock, MockHttpError } from '@/mocks/utils/contract';
import { requireItem } from '@/mocks/utils/crud';
import { mockDateTime } from '@/mocks/utils/date';
import { filterByKeyword, matchesFilter } from '@/mocks/utils/filter';
import { badRequest, conflict, forbidden, nextIdFrom } from '@/mocks/utils/handlers';
import { currentMockSession, isMockPlatformAdmin } from '@/mocks/utils/auth';
import { mockResource } from '@/mocks/utils/resource';

function validate(config: NumberingConfig, scene: string) {
  const errors = validateNumberingConfig(config, scene);
  if (errors.length) throw new MockHttpError(badRequest(errors.join('；')));
}

function sequencePolicyChanged(ruleId: number, config: NumberingConfig) {
  const prior = mockNumberingVersions.find(version => version.ruleId === ruleId);
  const fields = ['start', 'step', 'resetPeriod', 'scope', 'timezone'] as const;
  return prior !== undefined && fields.some(field => config[field] !== prior.config[field]);
}

function mapBinding(binding: NumberingBinding): NumberingBinding {
  const rule = requireItem(mockNumberingRules, binding.ruleId, '编号规则不存在');
  const version = requireItem(mockNumberingVersions, binding.versionId, '编号版本不存在');
  return { ...binding, ruleName: rule.name, version: version.version };
}

export const numberingHandlers = [
  mock(numberingRuleContract.scenes, ({ ok }) => ok(NUMBERING_SCENES.map(scene => ({ ...scene, allowedScopes: [...scene.allowedScopes], parameters: [...scene.parameters] })))),
  mock(numberingRuleContract.all, ({ query, ok }) => ok(mockNumberingRules
    .filter(rule => rule.status === 'enabled' && rule.currentVersion > 0 && matchesFilter(rule.scene, query.scene))
    .map(rule => ({ id: rule.id, code: rule.code, name: rule.name, scene: rule.scene, currentVersion: rule.currentVersion,
      versionId: mockNumberingVersions.find(version => version.ruleId === rule.id && version.version === rule.currentVersion)!.id })))),
  mock(numberingRuleContract.preview, ({ body, ok }) => {
    try { return ok(previewBusinessNumbers(body.config, { scene: body.scene, at: body.at ?? new Date(), context: body.context, count: body.count })); }
    catch (error) { return badRequest(error instanceof Error ? error.message : '预览失败'); }
  }),
  mock(numberingRuleContract.versions, ({ params, ok }) => {
    requireItem(mockNumberingRules, params.id, '编号规则不存在');
    return ok(mockNumberingVersions.filter(version => version.ruleId === params.id).sort((a, b) => b.version - a.version));
  }),
  mock(numberingRuleContract.counters, ({ params, ok }) => {
    requireItem(mockNumberingRules, params.id, '编号规则不存在');
    return ok(mockNumberingCounters.filter(counter => counter.ruleId === params.id).map(({ scopeKey, periodKey, value }) => ({ scopeKey, periodKey, value })));
  }),
  mock(numberingRuleContract.publish, ({ params, body, ok }) => {
    const rule = requireItem(mockNumberingRules, params.id, '编号规则不存在');
    if (rule.revision !== body.expectedRevision) return conflict('编号规则已被修改，请刷新后重试');
    if (rule.status !== 'enabled') return badRequest('请先启用编号规则');
    validate(rule.draft, rule.scene);
    if (sequencePolicyChanged(rule.id, rule.draft)) return conflict('首次发布后序列设置不可修改，请复制规则建立新序列');
    rule.currentVersion += 1;
    rule.revision += 1;
    rule.updatedAt = mockDateTime();
    mockNumberingVersions.push({ id: nextIdFrom(mockNumberingVersions), ruleId: rule.id, version: rule.currentVersion, config: structuredClone(rule.draft), createdBy: null, createdAt: mockDateTime() });
    return ok(rule, '发布成功');
  }),
  ...mockResource(numberingRuleContract, {
    store: mockNumberingRules, notFound: '编号规则不存在', keyword: rule => [rule.name, rule.code],
    unique: { field: 'code', message: '编号规则编码已存在' },
    create: (body, id, now): NumberingRule => {
      validate(body.draft, body.scene);
      return { id, ...body, description: body.description ?? null, tenantId: null, isBuiltin: false, revision: 1, currentVersion: 0, createdAt: now, updatedAt: now };
    },
    update: (rule, body, now) => {
      if (rule.revision !== body.expectedRevision) throw new MockHttpError(conflict('编号规则已被修改，请刷新后重试'));
      if (body.draft) validate(body.draft, rule.scene);
      if (body.draft && sequencePolicyChanged(rule.id, body.draft)) throw new MockHttpError(conflict('首次发布后序列设置不可修改，请复制规则建立新序列'));
      if (body.status === 'disabled' && (mockNumberingBindings.some(binding => binding.ruleId === rule.id) || mockNumberingAllocations.some(allocation => allocation.ruleId === rule.id))) {
        throw new MockHttpError(conflict('规则已被业务使用，不能停用；请先为业务切换规则'));
      }
      const { expectedRevision: _revision, ...patch } = body;
      Object.assign(rule, patch, { revision: rule.revision + 1, updatedAt: now });
    },
    beforeRemove: rule => rule.isBuiltin ? '内置编号规则不能删除' : mockNumberingVersions.some(version => version.ruleId === rule.id) ? '已发布规则不能删除，请停用规则' :
      mockNumberingBindings.some(binding => binding.ruleId === rule.id) || mockNumberingAllocations.some(allocation => allocation.ruleId === rule.id) ? '规则已被业务引用，不能删除' : undefined,
  }),
  mock(numberingBindingContract.list, ({ query, paginate, ok }) => {
    const filtered = filterByKeyword(mockNumberingBindings, query.ownerKey, [binding => binding.ownerKey])
      .filter(binding => matchesFilter(binding.scene, query.scene) && matchesFilter(binding.ruleId, query.ruleId));
    const page = paginate(filtered);
    return ok({ ...page, list: page.list.map(mapBinding) });
  }),
  ...mockResource(numberingBindingContract, { store: mockNumberingBindings, notFound: '业务绑定不存在', exclude: ['list'],
    beforeRemove: binding => binding.tenantId === null && binding.ownerKey === '*' ? '平台默认业务绑定不可删除' : undefined,
  }),
  mock(numberingBindingContract.upsert, ({ body, ok, request }) => {
    const session = currentMockSession(request);
    const tenantId = session?.viewingTenantId ?? session?.user.tenantId ?? null;
    if (tenantId === null && body.ownerKey === '*' && (!session || !isMockPlatformAdmin(session.user))) return forbidden('只有平台管理员可以修改平台默认业务绑定');
    getNumberingScene(body.scene);
    const rule = requireItem(mockNumberingRules, body.ruleId, '编号规则不存在');
    const version = requireItem(mockNumberingVersions, body.versionId, '编号版本不存在');
    if (rule.scene !== body.scene || version.ruleId !== rule.id || rule.status !== 'enabled') return badRequest('请选择该业务启用规则的已发布版本');
    const errors = validateNumberingParameterMapping(body.scene, body.parameterMapping);
    if (errors.length) return badRequest(errors.join('；'));
    const missing = body.scene === 'workflow.instance' ? parseNumberingTemplate(version.config.template).find(segment => segment.kind === 'parameter' && !(NUMBERING_SYSTEM_PARAMETERS as readonly string[]).includes(segment.value) && !body.parameterMapping[segment.value]) : undefined;
    if (missing?.kind === 'parameter') return badRequest(`请配置参数 ${missing.value} 的表单字段映射`);
    let binding = mockNumberingBindings.find(item => item.scene === body.scene && item.ownerKey === body.ownerKey && item.tenantId === tenantId);
    if (binding) Object.assign(binding, body, { ruleName: rule.name, version: version.version, updatedAt: mockDateTime() });
    else {
      binding = { id: nextIdFrom(mockNumberingBindings), ...body, tenantId, ruleName: rule.name, version: version.version, createdAt: mockDateTime(), updatedAt: mockDateTime() };
      mockNumberingBindings.push(binding);
    }
    return ok(mapBinding(binding), '绑定成功');
  }),
  ...mockResource(numberingAllocationContract, { store: mockNumberingAllocations, notFound: '编号记录不存在', keyword: allocation => [allocation.number, allocation.businessKey, allocation.allocationKey], sort: (a, b) => b.id - a.id }),
];
