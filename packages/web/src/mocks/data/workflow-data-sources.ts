import { SEED_WORKFLOW_DATA_SOURCES } from '@zenith/shared';
import type { WorkflowDataSource } from '@zenith/shared';
import { mockDateTime } from '@/mocks/utils/date';

const now = mockDateTime();
export const mockWorkflowDataSources: WorkflowDataSource[] = SEED_WORKFLOW_DATA_SOURCES.map((x) => ({
  ...x,
  createdAt: now,
  updatedAt: now,
}));

let nextId = Math.max(0, ...mockWorkflowDataSources.map((x) => x.id)) + 1;
export function getNextDataSourceId(): number {
  return nextId++;
}

// Demo 模式无法真正代理外部接口，返回一组示例选项用于「测试拉取」与设计器预览
export const MOCK_DATA_SOURCE_OPTIONS = [
  { value: '1', label: 'Leanne Graham' },
  { value: '2', label: 'Ervin Howell' },
  { value: '3', label: 'Clementine Bauch' },
  { value: '4', label: 'Patricia Lebsack' },
  { value: '5', label: 'Chelsey Dietrich' },
];
