import { SEED_WORKFLOW_CATEGORIES } from '@zenith/shared';
import type { WorkflowCategory } from '@zenith/shared';
import { mockDateTime } from '@/mocks/utils/date';

export const mockWorkflowCategories: WorkflowCategory[] = SEED_WORKFLOW_CATEGORIES.map((c) => ({
  ...c,
  createdAt: mockDateTime(c.createdAt),
  updatedAt: mockDateTime(c.updatedAt),
}));

let nextCategoryId = Math.max(...mockWorkflowCategories.map((c) => c.id)) + 1;
export function getNextCategoryId(): number {
  return nextCategoryId++;
}
