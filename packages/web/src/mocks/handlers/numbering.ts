import {
  NUMBERING_SCENES, getNumberingScene, getNumberingTemplateBusinessParameters, numberingAllocationContract, numberingDefaultContract,
  numberingRuleContract, previewBusinessNumbers, validateNumberingConfig,
  type NumberingConfig, type NumberingDefault, type NumberingRule, type NumberingRuleUsage,
} from '@zenith/shared/platform';
import { mockNumberingAllocations, mockNumberingBindings, mockNumberingCounters, mockNumberingRules, mockNumberingVersions } from '@/mocks/data/numbering';
import { mockWorkflowDefinitions, mockWorkflowInstances } from '@/mocks/data/workflow';
import { mockTenants } from '@/mocks/data/tenants';
import { mock, MockHttpError } from '@/mocks/utils/contract';
import { requireItem } from '@/mocks/utils/crud';
import { mockDateTime } from '@/mocks/utils/date';
import { matchesFilter } from '@/mocks/utils/filter';
import { badRequest, conflict, forbidden, nextIdFrom, unauthorized } from '@/mocks/utils/handlers';
import { currentMockSession, isMockPlatformAdmin, type MockSession } from '@/mocks/utils/auth';
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

function requireSession(request: Request): MockSession {
  const session = currentMockSession(request);
  if (!session) throw new MockHttpError(unauthorized('请先登录', { status: 401 }));
  return session;
}

function tenantFor(session: MockSession): number | null {
  return session.viewingTenantId ?? session.user.tenantId ?? null;
}

function mapDefault(sceneCode: string, session: MockSession): NumberingDefault {
  const scene = getNumberingScene(sceneCode);
  const tenantId = tenantFor(session);
  const own = scene.tenantCustomizable || tenantId === null
    ? mockNumberingBindings.find(binding => binding.scene === scene.code && binding.ownerKey === '*' && binding.tenantId === tenantId) : undefined;
  const platform = mockNumberingBindings.find(binding => binding.scene === scene.code && binding.ownerKey === '*' && binding.tenantId === null);
  const effective = own ?? platform;
  const rule = effective && mockNumberingRules.find(item => item.id === effective.ruleId);
  const version = effective && mockNumberingVersions.find(item => item.id === effective.versionId && item.ruleId === effective.ruleId);
  const canUpdate = tenantId === null ? isMockPlatformAdmin(session.user) : scene.tenantCustomizable;
  const sourceTenantId = effective?.tenantId ?? null;
  return {
    scene: scene.code, businessName: scene.label, description: scene.description, tenantCustomizable: scene.tenantCustomizable,
    tenantId, sourceTenantId, sourceTenantName: !effective ? null : sourceTenantId === null ? '平台' : mockTenants.find(item => item.id === sourceTenantId)?.name ?? null,
    inherited: tenantId !== null && own === undefined && platform !== undefined,
    ruleId: rule?.id ?? null, ruleName: rule?.name ?? null, versionId: version?.id ?? null, version: version?.version ?? null,
    template: version?.config.template ?? null, scope: version?.config.scope ?? null,
    expectedVersionId: own?.versionId ?? null, canUpdate, canReset: canUpdate && tenantId !== null && own !== undefined && platform !== undefined,
  };
}

function visibleTenant(tenantId: number | null, session: MockSession): boolean {
  return (isMockPlatformAdmin(session.user) && tenantFor(session) === null) || tenantId === tenantFor(session);
}

function usagesFor(ruleId: number, session: MockSession): NumberingRuleUsage[] {
  const rule = requireItem(mockNumberingRules, ruleId, '编号规则不存在');
  if (rule.tenantId !== null && !visibleTenant(rule.tenantId, session)) throw new MockHttpError(forbidden('编号规则不属于当前租户', { status: 403 }));
  const businessName = getNumberingScene(rule.scene).label;
  const tenantName = (tenantId: number | null) => tenantId === null ? '平台' : mockTenants.find(item => item.id === tenantId)?.name ?? null;
  const defaults: NumberingRuleUsage[] = mockNumberingBindings.flatMap(binding => {
    if (binding.ruleId !== ruleId || binding.ownerKey !== '*' || (binding.tenantId !== null && !visibleTenant(binding.tenantId, session))) return [];
    const version = mockNumberingVersions.find(item => item.id === binding.versionId && item.ruleId === ruleId);
    if (!version) return [];
    return [{ kind: 'default', scene: binding.scene, businessName, name: binding.tenantId === null ? '平台默认规则' : '租户默认规则', tenantId: binding.tenantId,
      tenantName: tenantName(binding.tenantId), versionId: version.id, version: version.version, objectKey: null, destination: null }];
  });
  const workflows: NumberingRuleUsage[] = mockWorkflowDefinitions.flatMap(definition => {
    const ref = definition.flowData?.settings?.numbering;
    const tenantId = definition.tenantId ?? null;
    if (!['published', 'disabled'].includes(definition.status) || ref?.ruleId !== ruleId || !visibleTenant(tenantId, session)) return [];
    const version = mockNumberingVersions.find(item => item.id === ref.versionId && item.ruleId === ruleId);
    if (!version) return [];
    return [{ kind: 'workflow', scene: 'workflow.instance', businessName, name: definition.name, tenantId, tenantName: tenantName(tenantId),
      versionId: version.id, version: version.version, objectKey: String(definition.id), destination: `/workflow/designer/${definition.id}` }];
  });
  return [...defaults, ...workflows];
}

export const numberingHandlers = [
  mock(numberingRuleContract.scenes, ({ ok }) => ok(NUMBERING_SCENES.map(scene => ({ ...scene, allowedScopes: [...scene.allowedScopes], parameters: [...scene.parameters] })))),
  mock(numberingRuleContract.all, ({ query, ok }) => ok(mockNumberingRules
    .filter(rule => rule.status === 'enabled' && rule.currentVersion > 0 && matchesFilter(rule.scene, query.scene))
    .map(rule => {
      const version = mockNumberingVersions.find(version => version.ruleId === rule.id && version.version === rule.currentVersion)!;
      return { id: rule.id, code: rule.code, name: rule.name, scene: rule.scene, currentVersion: rule.currentVersion, versionId: version.id,
        template: version.config.template,
        requiredParameters: getNumberingTemplateBusinessParameters(version.config.template),
      };
    }))),
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
  mock(numberingRuleContract.usages, ({ params, request, ok }) => ok(usagesFor(params.id, requireSession(request)))),
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
      if (body.status === 'disabled' && rule.status !== 'disabled') {
        if (mockNumberingBindings.some(binding => binding.ruleId === rule.id && binding.ownerKey === '*') || mockNumberingAllocations.some(allocation => allocation.ruleId === rule.id)) {
          throw new MockHttpError(conflict(rule.scene === 'workflow.instance'
            ? '规则已被流程使用，不能停用；修改编号中心绑定不会改变固定版本，请在流程设计器选择新规则版本后重新发布'
            : '规则已被业务使用，不能停用；请先为业务切换规则', { status: 409 }));
        }
        const definition = mockWorkflowDefinitions.some(item => ['published', 'disabled'].includes(item.status) && item.flowData?.settings?.numbering?.ruleId === rule.id);
        const draft = mockWorkflowInstances.some(item => ['draft', 'returned'].includes(item.status) && item.serialNo == null
          && item.definitionSnapshot?.flowData?.settings?.numbering?.ruleId === rule.id);
        if (definition || draft) throw new MockHttpError(conflict('规则仍被流程或待提交申请的固定版本引用，不能停用；请在流程设计器选择新规则版本后重新发布，并先处理待提交申请', { status: 409 }));
      }
      const { expectedRevision: _revision, ...patch } = body;
      Object.assign(rule, patch, { revision: rule.revision + 1, updatedAt: now });
    },
    beforeRemove: rule => rule.isBuiltin ? '内置编号规则不能删除' : mockNumberingVersions.some(version => version.ruleId === rule.id) ? '已发布规则不能删除，请停用规则' :
      mockNumberingBindings.some(binding => binding.ruleId === rule.id && binding.ownerKey === '*') || mockNumberingAllocations.some(allocation => allocation.ruleId === rule.id) ? '规则已被业务引用，不能删除' : undefined,
  }),
  mock(numberingDefaultContract.list, ({ request, ok }) => {
    const session = requireSession(request);
    return ok(NUMBERING_SCENES.map(scene => mapDefault(scene.code, session)));
  }),
  mock(numberingDefaultContract.update, ({ params, body, ok, request }) => {
    const session = requireSession(request);
    const tenantId = tenantFor(session);
    const current = mapDefault(params.scene, session);
    if (!current.canUpdate) return forbidden('当前视角不允许修改该业务默认规则', { status: 403 });
    if (current.expectedVersionId !== body.expectedVersionId) return conflict('默认编号规则已被修改，请刷新后重试', { status: 409 });
    const rule = requireItem(mockNumberingRules, body.ruleId, '编号规则不存在');
    const version = mockNumberingVersions.find(item => item.id === body.versionId && item.ruleId === rule.id);
    if (rule.scene !== params.scene || !version || rule.status !== 'enabled' || (rule.tenantId !== null && rule.tenantId !== tenantId)) return badRequest('请选择该业务和当前租户启用规则的已发布版本', { status: 400 });
    const values = { ruleId: rule.id, versionId: version.id, parameterMapping: {}, ruleName: rule.name, version: version.version, updatedAt: mockDateTime() };
    const binding = mockNumberingBindings.find(item => item.scene === params.scene && item.ownerKey === '*' && item.tenantId === tenantId);
    if (binding) Object.assign(binding, values);
    else {
      mockNumberingBindings.push({ id: nextIdFrom(mockNumberingBindings), scene: params.scene, ownerKey: '*', tenantId, ...values, createdAt: mockDateTime() });
    }
    return ok(mapDefault(params.scene, session), '默认规则已更新');
  }),
  mock(numberingDefaultContract.reset, ({ params, body, request, ok }) => {
    const session = requireSession(request);
    const tenantId = tenantFor(session);
    if (!mapDefault(params.scene, session).canUpdate) return forbidden('只能恢复当前租户的可定制业务默认规则', { status: 403 });
    if (tenantId === null) return conflict('平台默认编号规则不能删除，请直接选择其他规则版本', { status: 409 });
    const current = mapDefault(params.scene, session);
    if (current.expectedVersionId !== body.expectedVersionId) return conflict('默认编号规则已被修改，请刷新后重试', { status: 409 });
    if (!current.canReset) return conflict('当前业务没有可恢复的平台默认规则或租户覆盖', { status: 409 });
    const binding = mockNumberingBindings.find(item => item.scene === params.scene && item.ownerKey === '*' && item.tenantId === tenantId)!;
    mockNumberingBindings.splice(mockNumberingBindings.indexOf(binding), 1);
    return ok(mapDefault(params.scene, session), '已恢复平台默认规则');
  }),
  ...mockResource(numberingAllocationContract, { store: mockNumberingAllocations, notFound: '编号记录不存在', keyword: allocation => [allocation.number, allocation.businessKey, allocation.allocationKey], sort: (a, b) => b.id - a.id }),
];
