import type { WorkflowDefinitionSnapshot, WorkflowFlowData, WorkflowInstance, WorkflowEventActor } from '@zenith/shared/workflow';
import type { workflowInstances, workflowTasks } from '../db/schema';
import type { DbExecutor } from '../db/types';

export type WorkflowBusinessInstance = typeof workflowInstances.$inferSelect;
export type WorkflowBusinessTask = typeof workflowTasks.$inferSelect;
export type WorkflowBusinessCaller = { userId: number; username: string; tenantId: number | null; roles?: string[]; viewingTenantId?: number | null };
export type PreparedWorkflowBusinessApproval = { assertInTransaction: (executor: DbExecutor) => Promise<void> };

export interface WorkflowBusinessAdapter {
  readonly businessType: string;
  prepare?: (context: {
    mode: 'preview' | 'submit'; definition: WorkflowDefinitionSnapshot; formData: Record<string, unknown>; flowData: WorkflowFlowData; actor: WorkflowBusinessCaller;
  }) => Promise<{ formData: Record<string, unknown>; flowData: WorkflowFlowData }>;
  attachInTransaction?: (executor: DbExecutor, instance: WorkflowBusinessInstance) => Promise<void>;
  onOutcomeInTransaction?: (executor: DbExecutor, instance: WorkflowInstance, actorId: number | null) => Promise<void>;
  assertDeletable?: (instance: WorkflowBusinessInstance) => void | Promise<void>;
  prepareApproval?: (context: {
    instance: WorkflowBusinessInstance; task: WorkflowBusinessTask; actor: WorkflowEventActor; input?: Record<string, unknown>; formUpdates?: Record<string, unknown>;
  }) => Promise<PreparedWorkflowBusinessApproval>;
  assertTaskAssigneeInTransaction?: (executor: DbExecutor, context: {
    instanceId: number; tenantId: number | null; businessType: string; businessId: string | null; nodeKey?: string; toUserId: number;
  }) => Promise<void>;
}
