import type { WorkflowDefinition, WorkflowDefinitionVersion, WorkflowFlowData, WorkflowInstance } from '@zenith/shared/workflow';
import { getWorkflowNumberingFields, resolveWorkflowNumberingParameters, validateWorkflowNumberingMapping } from '@zenith/shared/workflow';
import { numberingBindingRefSchema, parseNumberingTemplate } from '@zenith/shared/platform';
import { mockWorkflowForms } from '@/mocks/data/workflow-forms';
import { mockNumberingBindings, mockNumberingRules, mockNumberingVersions } from '@/mocks/data/numbering';
import { mockUsers } from '@/mocks/data/users';
import { mockDepartments } from '@/mocks/data/departments';
import { mockTenants } from '@/mocks/data/tenants';
import { MockHttpError } from './contract';
import { badRequest, conflict, nextIdFrom } from './handlers';
import { mockDateTime } from './date';
import { allocateMockBusinessNumber, attachMockBusinessNumber, resolveMockNumberingReference } from './numbering';

export function requirePinnedMockWorkflowNumbering(definition: Pick<WorkflowDefinition, 'id' | 'tenantId' | 'flowData'>) {
  const parsed = numberingBindingRefSchema.safeParse(definition.flowData?.settings?.numbering);
  if (!parsed.success) throw new MockHttpError(conflict('流程尚未固定编号规则版本，请重新发布', { status: 409 }));
  resolveMockNumberingReference({ scene: 'workflow.instance', tenantId: definition.tenantId ?? null, ownerKey: String(definition.id),
    ruleId: parsed.data.ruleId, ruleVersionId: parsed.data.versionId });
  return parsed.data;
}

export function pinMockWorkflowNumbering(definition: Pick<WorkflowDefinition, 'id' | 'tenantId' | 'flowData' | 'formId' | 'formType' | 'customForm' | 'version'>,
  requirePinned = false, publishedVersions: readonly WorkflowDefinitionVersion[] = []): WorkflowFlowData {
  const flowData = definition.flowData;
  if (!flowData) throw new MockHttpError(badRequest('流程图不能为空', { status: 400 }));
  const ref = flowData.settings?.numbering;
  if (requirePinned) {
    const fixed = requirePinnedMockWorkflowNumbering(definition);
    const published = publishedVersions.find(version => version.definitionId === definition.id && version.version === definition.version
      && (version.tenantId ?? null) === (definition.tenantId ?? null));
    const saved = numberingBindingRefSchema.safeParse(published?.flowData?.settings?.numbering);
    const entries = (mapping: Record<string, string>) => Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b));
    if (!saved.success || saved.data.ruleId !== fixed.ruleId || saved.data.versionId !== fixed.versionId
      || JSON.stringify(entries(saved.data.parameterMapping)) !== JSON.stringify(entries(fixed.parameterMapping))) {
      throw new MockHttpError(conflict('编号引用与已发布流程版本不一致，请重新发布', { status: 409 }));
    }
    return flowData;
  }
  const resolved = resolveMockNumberingReference({ scene: 'workflow.instance', tenantId: definition.tenantId ?? null, ownerKey: String(definition.id), ruleId: ref?.ruleId, ruleVersionId: ref?.versionId });
  const parameterMapping = ref?.parameterMapping ?? resolved.parameterMapping;
  const formSchema = mockWorkflowForms.find(form => form.id === definition.formId
    && (form.tenantId == null || form.tenantId === definition.tenantId))?.schema;
  const fields = getWorkflowNumberingFields(definition.formType, formSchema && 'fields' in formSchema ? formSchema.fields : [], definition.customForm);
  const errors = validateWorkflowNumberingMapping(parameterMapping, fields);
  const config = mockNumberingVersions.find(version => version.id === resolved.versionId)!.config;
  if (parseNumberingTemplate(config.template).some(segment => segment.kind === 'parameter' && segment.value === 'categoryCode') && !parameterMapping.categoryCode) errors.push('编号规则使用业务分类编码，请先映射表单字段');
  if (errors.length) throw new MockHttpError(badRequest(errors[0]!, { status: 400 }));
  const rule = mockNumberingRules.find(item => item.id === resolved.ruleId)!;
  const version = mockNumberingVersions.find(item => item.id === resolved.versionId)!;
  const now = mockDateTime();
  const tenantId = definition.tenantId ?? null;
  const ownerKey = String(definition.id);
  const binding = mockNumberingBindings.find(item => item.scene === 'workflow.instance' && item.tenantId === tenantId && item.ownerKey === ownerKey);
  const values = { ruleId: rule.id, versionId: version.id, ruleName: rule.name, version: version.version, parameterMapping: structuredClone(parameterMapping), updatedAt: now };
  if (binding) Object.assign(binding, values);
  else mockNumberingBindings.push({ id: nextIdFrom(mockNumberingBindings), scene: 'workflow.instance', tenantId, ownerKey, ...values, createdAt: now });
  return { ...flowData, settings: { allowWithdraw: true, allowResubmit: true, notifyInitiator: true, ...flowData.settings, numbering: { ...resolved, parameterMapping } } };
}

export function numberMockWorkflowInstance(instance: WorkflowInstance): void {
  if (instance.serialNo) return;
  const ref = instance.definitionSnapshot?.flowData?.settings?.numbering;
  if (!ref) throw new MockHttpError(conflict('流程尚未固定编号规则版本，请重新发布', { status: 409 }));
  const initiator = mockUsers.find(user => user.id === instance.initiatorId);
  if (!initiator || (initiator.tenantId != null && initiator.tenantId !== instance.tenantId)) {
    throw new MockHttpError(badRequest('编号发起人不存在或不属于当前租户', { status: 400 }));
  }
  const department = mockDepartments.find(item => item.id === initiator.departmentId);
  const tenant = mockTenants.find(item => item.id === instance.tenantId);
  let parameters: Record<string, string | number>;
  try { parameters = resolveWorkflowNumberingParameters(ref.parameterMapping, instance.formData ?? {}); }
  catch (error) { throw new MockHttpError(badRequest(error instanceof Error ? error.message : '编号参数无效', { status: 400 })); }
  const request = { scene: 'workflow.instance', tenantId: instance.tenantId ?? null, ownerKey: String(instance.definitionId) };
  const number = allocateMockBusinessNumber({ ...request, allocationKey: `instance:${instance.id}`, ruleId: ref.ruleId, ruleVersionId: ref.versionId,
    context: { ...parameters, username: initiator.username, nickname: initiator.nickname ?? '', departmentId: initiator.departmentId ?? '',
      departmentCode: department?.code ?? '', departmentName: department?.name ?? '', tenantCode: tenant?.code ?? '' },
  });
  attachMockBusinessNumber({ ...request, number, businessKey: String(instance.id) });
  instance.serialNo = number;
}
