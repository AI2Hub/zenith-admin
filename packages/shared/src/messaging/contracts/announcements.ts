import * as z from 'zod';
import { auditFieldsSchema, batchIdsBody, dateRangeQuery, idParam, paginated, paginationQuery, queryBool, queryEnum, keywordQuery, dictQuery } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { ANNOUNCEMENT_RECIPIENT_TYPES, ANNOUNCEMENT_TARGET_TYPES } from '../constants';
import { createAnnouncementSchema, updateAnnouncementSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

/** 公告收件人（详情附带，标签为用户昵称 / 角色名 / 部门名） */
export const announcementRecipientSchema = z.object({
  recipientType: z.enum(ANNOUNCEMENT_RECIPIENT_TYPES),
  recipientId: z.int(),
  recipientLabel: z.string(),
}).meta({ id: 'AnnouncementRecipient' });

export type AnnouncementRecipient = z.infer<typeof announcementRecipientSchema>;

/** 公告附件（业务文件关联 + 托管文件元信息） */
export const announcementAttachmentSchema = z.object({
  id: z.int(),
  fileId: z.uuid(),
  file: z.object({
    id: z.uuid(),
    originalName: z.string(),
    size: z.int(),
    mimeType: z.string().nullable(),
    extension: z.string().nullable(),
    url: z.string().meta({ description: '服务端代理下载地址' }),
    directUrl: z.string().nullable().optional().meta({ description: '存储直链（公开存储时有值）' }),
  }),
  sortOrder: z.int(),
  createdAt: z.string(),
}).meta({ id: 'AnnouncementAttachment' });

export type AnnouncementAttachment = z.infer<typeof announcementAttachmentSchema>;

export const announcementSchema = z.object({
  id: z.int(),
  title: z.string().meta({ example: '系统维护公告' }),
  content: z.string(),
  type: z.string().meta({ example: 'notice' }),
  publishStatus: z.string().meta({ example: 'published' }),
  priority: z.string().meta({ example: 'medium' }),
  targetType: z.enum(ANNOUNCEMENT_TARGET_TYPES),
  publishTime: z.string().nullable(),
  createById: z.int().nullable(),
  createByName: z.string().nullable(),
  tenantId: z.int().nullable(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  recipients: z.array(announcementRecipientSchema).optional().meta({ description: '收件人（详情返回）' }),
  attachments: z.array(announcementAttachmentSchema).optional().meta({ description: '附件（详情返回）' }),
  readCount: z.int().optional().meta({ description: '已读人数（管理列表返回）' }),
}).meta({ id: 'Announcement' });

export type Announcement = z.infer<typeof announcementSchema>;

/** 公告详情：收件人与附件必带 */
export const announcementDetailSchema = announcementSchema.extend({
  recipients: z.array(announcementRecipientSchema),
  attachments: z.array(announcementAttachmentSchema),
}).meta({ id: 'AnnouncementDetail' });

export type AnnouncementDetail = z.infer<typeof announcementDetailSchema>;

/** 收件视角的公告：附带本人已读标记 */
export const myAnnouncementSchema = announcementSchema.extend({
  isRead: z.boolean(),
}).meta({ id: 'MyAnnouncement' });

export type MyAnnouncement = z.infer<typeof myAnnouncementSchema>;

export const announcementReadStatsUserSchema = z.object({
  id: z.int(),
  username: z.string(),
  nickname: z.string(),
  avatar: z.string().nullable(),
  readAt: z.string().optional().meta({ description: '已读时间，仅 tab=read 时有值' }),
}).meta({ id: 'AnnouncementReadStatsUser' });

export type AnnouncementReadStatsUser = z.infer<typeof announcementReadStatsUserSchema>;

export const announcementReadStatsSchema = z.object({
  readCount: z.int(),
  totalCount: z.int(),
  list: z.array(announcementReadStatsUserSchema),
  total: z.int(),
  page: z.int(),
  pageSize: z.int(),
}).meta({ id: 'AnnouncementReadStats' });

export type AnnouncementReadStats = z.infer<typeof announcementReadStatsSchema>;

export const announcementUnreadCountSchema = z.object({
  count: z.int(),
}).meta({ id: 'AnnouncementUnreadCount' });

export type AnnouncementUnreadCount = z.infer<typeof announcementUnreadCountSchema>;

// ─── 查询参数 ────────────────────────────────────────────────────────────────

export const announcementListQuery = paginationQuery.extend({
  title: keywordQuery('标题'),
  type: dictQuery('announcement_type', '公告类型'),
  publishStatus: dictQuery('announcement_publish_status', '发布状态'),
  ...dateRangeQuery(),
});

export const announcementInboxQuery = paginationQuery.extend({
  isRead: queryBool("'true' 仅已读 / 'false' 仅未读，其余不过滤"),
});

export const announcementReadStatsQuery = paginationQuery.extend({
  tab: queryEnum(['read', 'unread'], "'read'（默认）/ 'unread'"),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const announcementContract = defineContract('/api/announcements', {
  published: op.get('/published', { access: 'authenticated', response: z.array(myAnnouncementSchema), summary: '最近 20 条已发布公告' }),
  unreadCount: op.get('/unread-count', { access: 'authenticated', response: announcementUnreadCountSchema, summary: '未读公告数' }),
  markRead: op.post('/{id}/read', { access: 'authenticated', params: idParam, summary: '标记已读' }),
  markAllRead: op.post('/read-all', { access: 'authenticated', summary: '全部标记已读' }),
  inbox: op.get('/inbox', { access: 'authenticated', query: announcementInboxQuery, response: paginated(myAnnouncementSchema), summary: '收件箱' }),
  list: op.get('/', { access: { permission: 'system:announcement:list' }, query: announcementListQuery, response: paginated(announcementSchema), summary: '公告列表（管理）' }),
  removeBatch: op.delete('/batch', { access: { permission: 'system:announcement:delete' }, audit: '批量删除公告', body: batchIdsBody, summary: '批量删除' }),
  readStats: op.get('/{id}/read-stats', { access: { permission: 'system:announcement:list' }, params: idParam, query: announcementReadStatsQuery, response: announcementReadStatsSchema, summary: '阅读统计' }),
  detail: op.get('/{id}', { access: { permission: 'system:announcement:list' }, params: idParam, response: announcementDetailSchema, summary: '详情' }),
  create: op.post('/', { access: { permission: 'system:announcement:create' }, audit: '创建公告', body: createAnnouncementSchema, response: announcementSchema, summary: '创建公告' }),
  update: op.put('/{id}', { access: { permission: 'system:announcement:update' }, audit: '更新公告', params: idParam, body: updateAnnouncementSchema, response: announcementSchema, summary: '更新公告' }),
  remove: op.delete('/{id}', { access: { permission: 'system:announcement:delete' }, audit: '删除公告', params: idParam, summary: '删除公告' }),
}, { auditModule: '公告', tags: ['Announcements'] });
