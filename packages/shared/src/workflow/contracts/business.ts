import * as z from 'zod';
import { idQuery, requiredIdQuery } from '../../core/api-schemas';
import { workflowFlowDataSchema } from './flow-data';
import { workflowApproverPreviewNodeSchema } from './definitions';
import { workflowInstanceSchema } from './instances';

/** 业务页面的提交前预览；未启用工作流的业务返回空定义。 */
export const workflowBusinessPreviewSchema = z.object({
  definition: z.object({
    id: z.int(), name: z.string(), description: z.string().nullable(), version: z.int(),
    flowData: workflowFlowDataSchema.nullable(),
  }).nullable(),
  nodes: z.array(workflowApproverPreviewNodeSchema),
}).meta({ id: 'WorkflowBusinessPreview' });
export type WorkflowBusinessPreview = z.infer<typeof workflowBusinessPreviewSchema>;

export const workflowBusinessContextSchema = z.object({
  instance: workflowInstanceSchema.nullable(),
  previousInstances: z.array(workflowInstanceSchema.pick({
    id: true, title: true, status: true, createdAt: true,
  }).extend({ definitionName: z.string().nullable() })),
}).meta({ id: 'WorkflowBusinessContext' });
export type WorkflowBusinessContext = z.infer<typeof workflowBusinessContextSchema>;

export const workflowBusinessContextQuery = z.object({ instanceId: idQuery('指定审批轮次') });
export const workflowBusinessApprovalQuery = z.object({ instanceId: requiredIdQuery('审批实例 ID') });
