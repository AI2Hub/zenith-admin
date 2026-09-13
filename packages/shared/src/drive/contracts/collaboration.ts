import * as z from 'zod';
import { dateRangeQuery, idParam, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { DRIVE_ACTIVITY_ACTIONS } from '../constants';
import { driveMetadataSchema, updateDriveNodeCommentSchema, updateDriveNodeProfileSchema } from '../validation';
import { driveActivitySchema, driveNodeCommentParams, driveNodeCommentSchema } from './nodes';

export const driveNodeProfileSchema = z.object({
  nodeId: z.int(),
  description: z.string().nullable(),
  metadata: driveMetadataSchema,
}).meta({ id: 'DriveNodeProfile' });
export type DriveNodeProfile = z.infer<typeof driveNodeProfileSchema>;

export const driveSpaceActivitiesQuery = paginationQuery.extend({
  keyword: keywordQuery(),
  action: queryEnum(DRIVE_ACTIVITY_ACTIONS),
  ...dateRangeQuery(),
});

export const driveCollaborationContract = defineContract('/api/drive/collaboration', {
  profile: op.get('/nodes/{id}/profile', { access: { permission: 'drive:node:list' }, params: idParam, response: driveNodeProfileSchema, summary: '文件说明与自定义属性' }),
  saveProfile: op.put('/nodes/{id}/profile', { access: { permission: 'drive:node:edit' }, audit: '更新文件说明与属性', params: idParam, body: updateDriveNodeProfileSchema, response: driveNodeProfileSchema, summary: '更新文件说明与属性' }),
  subscription: op.get('/nodes/{id}/subscription', { access: { permission: 'drive:node:list' }, params: idParam, response: z.boolean(), summary: '我的文件关注状态' }),
  subscribe: op.put('/nodes/{id}/subscription', { access: { permission: 'drive:node:list' }, params: idParam, body: z.object({ subscribed: z.boolean() }), response: z.boolean(), summary: '关注或取消关注文件变更' }),
  editComment: op.put('/nodes/{id}/comments/{commentId}', { access: { permission: 'drive:node:list' }, params: driveNodeCommentParams, body: updateDriveNodeCommentSchema, response: driveNodeCommentSchema, summary: '编辑文件评论' }),
  spaceActivities: op.get('/spaces/{id}/activities', { access: { permission: 'drive:node:list' }, params: idParam, query: driveSpaceActivitiesQuery, response: paginated(driveActivitySchema), summary: '空间动态（按当前文件权限过滤）' }),
}, { auditModule: '企业网盘', tags: ['企业网盘-协作'] });
