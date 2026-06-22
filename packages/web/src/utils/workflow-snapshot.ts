import type {
  WorkflowCustomFormConfig,
  WorkflowDefinition,
  WorkflowDefinitionSnapshot,
  WorkflowFlowData,
  WorkflowFormField,
  WorkflowFormSettings,
  WorkflowFormType,
  WorkflowInstance,
  WorkflowInstanceFormSnapshot,
} from '@zenith/shared';

export type WorkflowDetailDefinition = WorkflowDefinition | WorkflowDefinitionSnapshot;

export function normalizeWorkflowFormSnapshot(
  snapshot: WorkflowInstance['formSnapshot'],
): WorkflowInstanceFormSnapshot | null {
  if (!snapshot) return null;
  if (Array.isArray(snapshot)) {
    return { fields: snapshot, settings: null };
  }
  if (typeof snapshot !== 'object') return null;
  const value = snapshot as Partial<WorkflowInstanceFormSnapshot>;
  return {
    formType: value.formType,
    formId: value.formId ?? null,
    formName: value.formName ?? null,
    fields: Array.isArray(value.fields) ? value.fields : [],
    settings: value.settings ?? null,
    customForm: value.customForm ?? null,
  };
}

export function resolveWorkflowDetailDefinition(
  instance: WorkflowInstance | null | undefined,
  fallback?: WorkflowDefinition | null,
): WorkflowDetailDefinition | null {
  return instance?.definitionSnapshot ?? fallback ?? null;
}

export function resolveWorkflowFormType(
  instance: WorkflowInstance | null | undefined,
  definition?: WorkflowDetailDefinition | null,
): WorkflowFormType {
  const snapshot = normalizeWorkflowFormSnapshot(instance?.formSnapshot);
  return (instance?.definitionSnapshot?.formType ?? snapshot?.formType ?? definition?.formType ?? 'designer') as WorkflowFormType;
}

export function resolveWorkflowCustomForm(
  instance: WorkflowInstance | null | undefined,
  definition?: WorkflowDetailDefinition | null,
): WorkflowCustomFormConfig | null {
  const snapshot = normalizeWorkflowFormSnapshot(instance?.formSnapshot);
  return instance?.definitionSnapshot?.customForm ?? snapshot?.customForm ?? definition?.customForm ?? null;
}

export function resolveWorkflowFormFields(
  instance: WorkflowInstance | null | undefined,
  definition?: WorkflowDetailDefinition | null,
): WorkflowFormField[] {
  const snapshot = normalizeWorkflowFormSnapshot(instance?.formSnapshot);
  return snapshot?.fields ?? definition?.formFields ?? [];
}

export function resolveWorkflowFormSettings(
  instance: WorkflowInstance | null | undefined,
  definition?: WorkflowDetailDefinition | null,
): WorkflowFormSettings | null {
  const snapshot = normalizeWorkflowFormSnapshot(instance?.formSnapshot);
  return snapshot?.settings ?? definition?.formSettings ?? null;
}

export function resolveWorkflowFlowData(
  instance: WorkflowInstance | null | undefined,
  definition?: WorkflowDetailDefinition | null,
): WorkflowFlowData | null {
  return instance?.definitionSnapshot?.flowData ?? definition?.flowData ?? null;
}
