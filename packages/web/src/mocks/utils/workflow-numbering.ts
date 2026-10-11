import type { WorkflowDefinition, WorkflowDefinitionVersion, WorkflowFlowData, WorkflowInstance } from '@zenith/shared/workflow';
import { getWorkflowNumberingFields, resolveWorkflowNumberingMapping, resolveWorkflowNumberingParameters, validateWorkflowNumberingMapping } from '@zenith/shared/workflow';
import { getNumberingTemplateBusinessParameters, numberingBindingRefSchema, validateNumberingParameterMapping } from '@zenith/shared/platform';
import { mockWorkflowForms } from '@/mocks/data/workflow-forms';
import { mockNumberingVersions } from '@/mocks/data/numbering';
import { mockUsers } from '@/mocks/data/users';
import { mockDepartments } from '@/mocks/data/departments';
import { mockTenants } from '@/mocks/data/tenants';
import { MockHttpError } from './contract';
import { badRequest, conflict } from './handlers';
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
  const resolved = resolveMockNumberingReference({ scene: 'workflow.instance', tenantId: definition.tenantId ?? null, ownerKey: ref ? String(definition.id) : '*', ruleId: ref?.ruleId, ruleVersionId: ref?.versionId });
  const requestedMapping = ref?.parameterMapping ?? resolved.parameterMapping;
  const formSchema = mockWorkflowForms.find(form => form.id === definition.formId
    && (form.tenantId == null || form.tenantId === definition.tenantId))?.schema;
  const fields = getWorkflowNumberingFields(definition.formType, formSchema && 'fields' in formSchema ? formSchema.fields : [], definition.customForm);
  const errors = validateNumberingParameterMapping('workflow.instance', requestedMapping);
  const config = mockNumberingVersions.find(version => version.id === resolved.versionId)!.config;
  if (errors.length) throw new MockHttpError(badRequest(errors[0]!, { status: 400 }));
  let parameterMapping: Record<string, string>;
  try { parameterMapping = resolveWorkflowNumberingMapping(getNumberingTemplateBusinessParameters(config.template), requestedMapping, fields); }
  catch (error) { throw new MockHttpError(badRequest(error instanceof Error ? error.message : '编号参数映射无效', { status: 400 })); }
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
  const fields = getWorkflowNumberingFields(instance.formSnapshot?.formType ?? 'designer', instance.formSnapshot?.fields ?? [], instance.formSnapshot?.customForm);
  const errors = validateWorkflowNumberingMapping(ref.parameterMapping, fields);
  if (errors.length) throw new MockHttpError(badRequest(errors[0]!, { status: 400 }));
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
