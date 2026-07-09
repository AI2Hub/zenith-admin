export const WORKFLOW_DIFF_KIND_META = {
  added: { text: '新增', color: 'green' },
  removed: { text: '删除', color: 'red' },
  modified: { text: '修改', color: 'orange' },
} as const;

export const WORKFLOW_HEALTH_SEVERITY_META = {
  critical: { text: '严重', color: 'red' },
  warning: { text: '警告', color: 'orange' },
  info: { text: '提示', color: 'blue' },
} as const;
