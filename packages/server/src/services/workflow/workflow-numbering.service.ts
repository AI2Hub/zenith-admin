import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { WorkflowCustomFormConfig, WorkflowFlowData, WorkflowFormField, WorkflowFormType, WorkflowInstanceFormSnapshot } from '@zenith/shared/workflow';
import { getWorkflowNumberingFields, resolveWorkflowNumberingMapping, resolveWorkflowNumberingParameters, validateWorkflowNumberingMapping } from '@zenith/shared/workflow';
import { getNumberingTemplateBusinessParameters, numberingBindingRefSchema, validateNumberingParameterMapping } from '@zenith/shared/platform';
import type { DbTransaction } from '../../db/types';
import { departments, numberingBindings, tenants, users, workflowDefinitionVersions, workflowForms } from '../../db/schema';
import { allocateBusinessNumber, attachBusinessNumber, resolveNumberingVersion } from '../platform/numbering-runtime';
import { lockNumberingBinding } from '../platform/numbering-binding-lock';
import { buildWhere } from '../../lib/where-helpers';
import { exactTenantCondition, inheritedTenantCondition } from '../../lib/tenant';

/** Validate an already frozen reference and hold its rule's shared lock without rereading mutable form definitions. */
export async function requirePinnedWorkflowNumbering(tx: DbTransaction, input: {
  id: number; tenantId: number | null; flowData: WorkflowFlowData;
}) {
  const parsed = numberingBindingRefSchema.safeParse(input.flowData.settings?.numbering);
  if (!parsed.success) throw new HTTPException(409, { message: '流程尚未固定编号规则版本，请重新发布' });
  const reference = parsed.data;
  await resolveNumberingVersion(tx, {
    scene: 'workflow.instance', tenantId: input.tenantId, ownerKey: String(input.id),
    ruleId: reference.ruleId, ruleVersionId: reference.versionId,
  });
  return reference;
}

/** Freeze the resolved platform rule into the published workflow, including default bindings. */
export async function pinWorkflowNumbering(tx: DbTransaction, input: {
  id: number; tenantId: number | null; flowData: WorkflowFlowData; formId: number | null;
  formType?: WorkflowFormType; customForm?: WorkflowCustomFormConfig | null;
  version?: number;
}, requirePinned = false): Promise<WorkflowFlowData> {
  const reference = input.flowData.settings?.numbering;
  if (requirePinned) {
    const fixed = await requirePinnedWorkflowNumbering(tx, input);
    const [published] = input.version == null ? [] : await tx.select({ flowData: workflowDefinitionVersions.flowData })
      .from(workflowDefinitionVersions).where(buildWhere(
        eq(workflowDefinitionVersions.definitionId, input.id), eq(workflowDefinitionVersions.version, input.version),
        exactTenantCondition(workflowDefinitionVersions.tenantId, input.tenantId),
      )).limit(1);
    const saved = numberingBindingRefSchema.safeParse((published?.flowData as WorkflowFlowData | undefined)?.settings?.numbering);
    const mappingEntries = (mapping: Record<string, string>) => Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b));
    if (!saved.success || saved.data.ruleId !== fixed.ruleId || saved.data.versionId !== fixed.versionId
      || JSON.stringify(mappingEntries(saved.data.parameterMapping)) !== JSON.stringify(mappingEntries(fixed.parameterMapping))) {
      throw new HTTPException(409, { message: '编号引用与已发布流程版本不一致，请重新发布' });
    }
    return input.flowData;
  }
  const owner = { scene: 'workflow.instance', tenantId: input.tenantId, ownerKey: String(input.id) };
  // Every binding writer acquires the stable owner lock before the rule lock.
  await lockNumberingBinding(tx, owner);
  const resolved = await resolveNumberingVersion(tx, {
    ...owner,
    ruleId: reference?.ruleId, ruleVersionId: reference?.versionId,
  });
  const requestedMapping = reference?.parameterMapping ?? resolved.binding?.parameterMapping ?? {};
  const [form] = input.formId == null || input.formType === 'custom' || input.formType === 'external' ? []
    : await tx.select({ schema: workflowForms.schema }).from(workflowForms).where(buildWhere(
      eq(workflowForms.id, input.formId), inheritedTenantCondition(workflowForms.tenantId, input.tenantId),
    )).limit(1);
  const fields = getWorkflowNumberingFields(input.formType ?? 'designer',
    (form?.schema as { fields?: WorkflowFormField[] } | undefined)?.fields ?? [], input.customForm);
  const errors = validateNumberingParameterMapping('workflow.instance', requestedMapping);
  if (errors.length) throw new HTTPException(400, { message: errors[0] });
  let parameterMapping: Record<string, string>;
  try { parameterMapping = resolveWorkflowNumberingMapping(getNumberingTemplateBusinessParameters(resolved.version.config.template), requestedMapping, fields); }
  catch (error) { throw new HTTPException(400, { message: error instanceof Error ? error.message : '编号参数映射无效' }); }
  await tx.insert(numberingBindings).values({ ...owner, ruleId: resolved.rule.id, versionId: resolved.version.id, parameterMapping }).onConflictDoUpdate({
    target: [numberingBindings.scene, numberingBindings.ownerKey, numberingBindings.tenantId],
    set: { ruleId: resolved.rule.id, versionId: resolved.version.id, parameterMapping, updatedAt: new Date() },
  });
  return { ...input.flowData, settings: {
    allowWithdraw: true, allowResubmit: true, notifyInitiator: true, ...input.flowData.settings,
    numbering: { ruleId: resolved.rule.id, versionId: resolved.version.id, parameterMapping },
  } };
}

/** Real initiator context, independent from HTTP/currentUser (jobs and subprocesses have no user session). */
export async function allocateWorkflowInstanceNumber(tx: DbTransaction, input: {
  instanceId: number; definitionId: number; tenantId: number | null; initiatorId: number;
  flowData: WorkflowFlowData; formData: Record<string, unknown>; formSnapshot: WorkflowInstanceFormSnapshot | null;
}): Promise<string> {
  const reference = input.flowData.settings?.numbering;
  if (!reference) throw new HTTPException(409, { message: '流程尚未固定编号规则版本，请重新发布' });
  const [initiator] = await tx.select({ username: users.username, nickname: users.nickname, departmentId: users.departmentId,
    departmentCode: departments.code, departmentName: departments.name,
  }).from(users).leftJoin(departments, eq(departments.id, users.departmentId)).where(buildWhere(
    eq(users.id, input.initiatorId), inheritedTenantCondition(users.tenantId, input.tenantId),
  )).limit(1);
  if (!initiator) throw new HTTPException(400, { message: '编号发起人不存在或不属于当前租户' });
  const [tenant] = input.tenantId == null ? [] : await tx.select({ code: tenants.code }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
  let parameters: Record<string, string | number>;
  const fields = getWorkflowNumberingFields(input.formSnapshot?.formType ?? 'designer', input.formSnapshot?.fields ?? [], input.formSnapshot?.customForm);
  const mappingErrors = validateWorkflowNumberingMapping(reference.parameterMapping, fields);
  if (mappingErrors.length) throw new HTTPException(400, { message: mappingErrors[0] });
  try { parameters = resolveWorkflowNumberingParameters(reference.parameterMapping, input.formData); }
  catch (error) { throw new HTTPException(400, { message: error instanceof Error ? error.message : '编号参数无效' }); }
  const request = { scene: 'workflow.instance', tenantId: input.tenantId, ownerKey: String(input.definitionId) };
  const number = await allocateBusinessNumber(tx, {
    ...request, ruleId: reference.ruleId, ruleVersionId: reference.versionId, allocationKey: `instance:${input.instanceId}`,
    context: { ...parameters, username: initiator.username, nickname: initiator.nickname ?? '',
      departmentId: initiator.departmentId ?? '', departmentCode: initiator.departmentCode ?? '',
      departmentName: initiator.departmentName ?? '', tenantCode: tenant?.code ?? '' },
  });
  await attachBusinessNumber(tx, { ...request, number, businessKey: String(input.instanceId) });
  return number;
}
