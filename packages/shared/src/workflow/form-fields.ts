import type { WorkflowFormField } from './types';

/** 布局容器不改变取值路径；明细保留为数组字段，子列不属于顶层 formData。 */
export function flattenWorkflowValueFields(fields: readonly WorkflowFormField[]): WorkflowFormField[] {
  return fields.flatMap(field => {
    if (field.type === 'row') return (field.columns ?? []).flatMap(column => flattenWorkflowValueFields(column.fields));
    if (field.type === 'tabs' || field.type === 'steps') return (field.panes ?? []).flatMap(pane => flattenWorkflowValueFields(pane.fields));
    if (field.type === 'group') return flattenWorkflowValueFields(field.children ?? []);
    if (field.type === 'divider' || field.type === 'description') return [];
    return [field];
  });
}
