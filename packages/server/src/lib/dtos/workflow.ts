/**
 * 工作流相关 DTO
 */
import { z } from '@hono/zod-openapi';
import { auditFields } from './_audit';

export const WorkflowCategoryDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    code: z.string().nullable(),
    icon: z.string().nullable(),
    color: z.string().nullable(),
    sort: z.number().int(),
    description: z.string().nullable(),
    tenantId: z.number().int().nullable(),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('WorkflowCategory');

export const WorkflowFormDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    code: z.string().nullable(),
    description: z.string().nullable(),
    categoryId: z.number().int().nullable(),
    categoryName: z.string().nullable().optional(),
    schema: z.unknown().nullable(),
    status: z.enum(['enabled', 'disabled']),
    usageCount: z.number().int().optional(),
    tenantId: z.number().int().nullable(),
    ...auditFields,
    createdByName: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('WorkflowForm');

export const WorkflowDefinitionDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    description: z.string().nullable(),
    categoryId: z.number().int().nullable(),
    initiatorScopeType: z.enum(['all', 'users', 'departments', 'roles']),
    initiatorScopeIds: z.array(z.number().int()).nullable(),
    categoryName: z.string().nullable().optional(),
    categoryColor: z.string().nullable().optional(),
    categoryIcon: z.string().nullable().optional(),
    flowData: z.unknown().nullable(),
    formId: z.number().int().nullable(),
    formName: z.string().nullable().optional(),
    formFields: z.unknown().nullable(),
    formSettings: z.unknown().nullable().optional(),
    status: z.enum(['draft', 'published', 'disabled']),
    version: z.number().int(),
    tenantId: z.number().int().nullable(),
    ...auditFields,
    createdByName: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('WorkflowDefinition');

export const WorkflowDefinitionVersionDTO = z
  .object({
    id: z.number().int(),
    definitionId: z.number().int(),
    version: z.number().int(),
    name: z.string(),
    description: z.string().nullable(),
    flowData: z.unknown().nullable(),
    formId: z.number().int().nullable(),
    formName: z.string().nullable().optional(),
    formFields: z.unknown().nullable(),
    publishedAt: z.string(),
    publishedBy: z.number().int().nullable(),
    publishedByName: z.string().nullable().optional(),
    tenantId: z.number().int().nullable(),
  })
  .openapi('WorkflowDefinitionVersion');

export const WorkflowTaskDTO = z
  .object({
    id: z.number().int(),
    instanceId: z.number().int(),
    nodeKey: z.string(),
    nodeName: z.string(),
    nodeType: z.string().nullable(),
    assigneeId: z.number().int().nullable(),
    assigneeName: z.string().nullable().optional(),
    assigneeAvatar: z.string().nullable().optional(),
    status: z.enum(['pending', 'approved', 'rejected', 'skipped', 'waiting']),
    comment: z.string().nullable(),
    signature: z.string().nullable().optional(),
    signatureRequired: z.boolean().optional(),
    actionAt: z.string().nullable(),
    originalAssigneeId: z.number().int().nullable().optional(),
    transferChain: z.array(z.number().int()).optional(),
    delegatedFromId: z.number().int().nullable().optional(),
    actionButtons: z.record(z.string(), z.object({
      enabled: z.boolean(),
      displayName: z.string().optional(),
      opinionName: z.string().optional(),
      jumpToNodeKey: z.string().optional(),
      uploadRequired: z.boolean().optional(),
    })).nullable().optional(),
    createdAt: z.string(),
  })
  .openapi('WorkflowTask');

export const WorkflowTaskUrgeDTO = z
  .object({
    id: z.number().int(),
    taskId: z.number().int(),
    instanceId: z.number().int(),
    urgerId: z.number().int().nullable(),
    urgerName: z.string().nullable(),
    message: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('WorkflowTaskUrge');

export const WorkflowCommentDTO = z
  .object({
    id: z.number().int(),
    instanceId: z.number().int(),
    taskId: z.number().int().nullable().optional(),
    userId: z.number().int(),
    userName: z.string().nullable().optional(),
    userAvatar: z.string().nullable().optional(),
    content: z.string(),
    mentions: z.array(z.number().int()),
    mentionNames: z.array(z.string()).nullable().optional(),
    attachments: z.array(z.object({
      name: z.string(),
      url: z.string(),
      size: z.number().int().optional(),
    })),
    createdAt: z.string(),
  })
  .openapi('WorkflowComment');

export const WorkflowInstanceDTO = z
  .object({
    id: z.number().int(),
    definitionId: z.number().int(),
    definitionName: z.string().nullable().optional(),
    categoryId: z.number().int().nullable().optional(),
    categoryName: z.string().nullable().optional(),
    title: z.string(),
    serialNo: z.string().nullable().optional(),
    formData: z.unknown().nullable(),
    formSnapshot: z.unknown().nullable().optional(),
    status: z.enum(['draft', 'running', 'approved', 'rejected', 'withdrawn', 'cancelled']),
    currentNodeKey: z.string().nullable(),
    currentNodeName: z.string().nullable().optional(),
    initiatorId: z.number().int(),
    initiatorName: z.string().nullable().optional(),
    initiatorAvatar: z.string().nullable().optional(),
    tenantId: z.number().int().nullable(),
    parentInstanceId: z.number().int().nullable().optional(),
    parentTaskId: z.number().int().nullable().optional(),
    childInstances: z.array(z.object({
      id: z.number().int(),
      title: z.string(),
      status: z.enum(['draft', 'running', 'approved', 'rejected', 'withdrawn', 'cancelled']),
      parentTaskNodeKey: z.string().nullable().optional(),
      createdAt: z.string(),
    })).nullable().optional(),
    tasks: z.array(WorkflowTaskDTO).nullable().optional(),
    comments: z.array(WorkflowCommentDTO).optional(),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('WorkflowInstance');

export const WorkflowInstanceListItemDTO = WorkflowInstanceDTO.omit({
  formData: true,
  formSnapshot: true,
  tasks: true,
  comments: true,
}).extend({ pendingTaskId: z.number().int().optional(), pendingSignatureRequired: z.boolean().optional() }).openapi('WorkflowInstanceListItem');

export const WorkflowInstanceAllDTO = z
  .object({
    stats: z.record(z.string(), z.number().int()),
    list: z.array(WorkflowInstanceListItemDTO),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .openapi('WorkflowInstanceAll');

export const WorkflowAutomationDTO = z
  .object({
    id: z.number().int(),
    definitionId: z.number().int(),
    definitionName: z.string().nullable().optional(),
    name: z.string(),
    trigger: z.enum(['approved', 'rejected', 'withdrawn']),
    actions: z.array(z.unknown()),
    status: z.enum(['enabled', 'disabled']),
    sort: z.number().int(),
    tenantId: z.number().int().nullable(),
    ...auditFields,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('WorkflowAutomation');

export const WorkflowQuickPhraseDTO = z
  .object({
    id: z.number().int(),
    userId: z.number().int().nullable(),
    content: z.string(),
    sort: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('WorkflowQuickPhrase');

export const WorkflowDelegationDTO = z
  .object({
    id: z.number().int(),
    principalId: z.number().int(),
    principalName: z.string().nullable().optional(),
    delegateId: z.number().int(),
    delegateName: z.string().nullable().optional(),
    definitionId: z.number().int().nullable(),
    definitionName: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
    startAt: z.string().nullable().optional(),
    endAt: z.string().nullable().optional(),
    enabled: z.boolean(),
    active: z.boolean().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('WorkflowDelegation');

export const WorkflowBatchActionResultDTO = z
  .object({
    taskId: z.number().int(),
    success: z.boolean(),
    message: z.string().optional(),
  })
  .openapi('WorkflowBatchActionResult');

export const WorkflowBatchActionResponseDTO = z
  .object({
    succeeded: z.number().int(),
    failed: z.number().int(),
    results: z.array(WorkflowBatchActionResultDTO),
  })
  .openapi('WorkflowBatchActionResponse');

export const WorkflowAnalyticsDTO = z
  .object({
    statusCounts: z.array(z.object({
      status: z.enum(['draft', 'running', 'approved', 'rejected', 'withdrawn', 'cancelled']),
      count: z.number().int(),
    })),
    total: z.number().int(),
    avgDurationSec: z.number().nullable(),
    pendingTaskCount: z.number().int(),
    overdueTaskCount: z.number().int(),
    dueSoonTaskCount: z.number().int(),
    recentCreated: z.number().int(),
    definitionStats: z.array(z.object({
      definitionId: z.number().int(),
      definitionName: z.string(),
      total: z.number().int(),
      running: z.number().int(),
      approved: z.number().int(),
      rejected: z.number().int(),
      avgDurationSec: z.number().nullable(),
    })),
    nodeBottlenecks: z.array(z.object({
      definitionId: z.number().int(),
      definitionName: z.string(),
      nodeKey: z.string(),
      nodeName: z.string(),
      avgHandleSec: z.number().nullable(),
      pendingCount: z.number().int(),
      doneCount: z.number().int(),
    })),
    approverWorkloads: z.array(z.object({
      userId: z.number().int(),
      userName: z.string(),
      pendingCount: z.number().int(),
      oldestPendingSec: z.number().nullable(),
    })),
    trend: z.array(z.object({
      date: z.string(),
      created: z.number().int(),
      completed: z.number().int(),
    })),
  })
  .openapi('WorkflowAnalytics');

export const WorkflowOverdueTaskDTO = z
  .object({
    taskId: z.number().int(),
    instanceId: z.number().int(),
    instanceTitle: z.string(),
    serialNo: z.string().nullable().optional(),
    definitionName: z.string(),
    nodeName: z.string(),
    assigneeId: z.number().int().nullable(),
    assigneeName: z.string().nullable(),
    timeoutAt: z.string(),
    overdueSec: z.number(),
  })
  .openapi('WorkflowOverdueTask');
