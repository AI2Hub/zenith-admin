import { z } from '@hono/zod-openapi';

/** 业务接入示例：请假实体 DTO */
export const BizLeaveDTO = z
  .object({
    id: z.number().int(),
    leaveType: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    days: z.number(),
    reason: z.string().nullable(),
    status: z.enum(['draft', 'pending', 'approved', 'rejected', 'cancelled']),
    workflowInstanceId: z.number().int().nullable(),
    workflowStatus: z.string().nullable(),
    applicantId: z.number().int().nullable(),
    applicantName: z.string().nullable().optional(),
    tenantId: z.number().int().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('BizLeave');
