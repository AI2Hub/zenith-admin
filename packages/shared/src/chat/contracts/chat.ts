import * as z from 'zod';
import { dateRangeBound, idParam, idQuery, keywordQuery, paginated, paginationQuery, queryEnum } from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import { httpUrl } from '../../core/validation';
import { CHAT_SCHEDULED_STATUSES } from '../constants';
import {
  addChatCustomEmojiSchema,
  addChatGroupMemberSchema,
  archiveChatConversationSchema,
  batchDeleteChatMessagesSchema,
  chatCallRecordSchema,
  createChatQuickReplySchema,
  createChatScheduledMessageSchema,
  createDirectConversationSchema,
  createGroupConversationSchema,
  editChatMessageSchema,
  forwardMessagesSchema,
  handleChatJoinRequestSchema,
  joinChatByInviteSchema,
  muteChatConversationSchema,
  muteChatMemberSchema,
  pinChatConversationSchema,
  sendChatMessageSchema,
  setChatJoinApprovalSchema,
  setChatMemberRoleSchema,
  setChatMuteAllSchema,
  starChatConversationSchema,
  submitChatVoteSchema,
  toggleChatMessageFavoriteSchema,
  toggleChatMessagePinSchema,
  toggleChatReactionSchema,
  transferChatGroupSchema,
  updateChatGroupInfoSchema,
  updateChatQuickReplySchema,
} from '../validation';
import {
  chatConversationSchema,
  chatGroupInviteSchema,
  chatGroupJoinRequestSchema,
  chatGroupMemberSchema,
  chatInviteInfoSchema,
  chatJoinResultSchema,
  chatOrgDataSchema,
  chatPresenceSchema,
  chatReadStateSchema,
  chatUserSchema,
} from './chat-conversations';
import { chatCustomEmojiSchema } from './chat-custom-emojis';
import {
  chatGlobalSearchResultSchema,
  chatLinkPreviewSchema,
  chatMessageContextSchema,
  chatMessagePageSchema,
  chatMessageSchema,
  chatMessageSearchResultSchema,
  chatReactionGroupSchema,
} from './chat-messages';
import { chatQuickReplySchema } from './chat-quick-replies';
import { rtcConfigSchema } from './chat-rtc';
import { chatScheduledMessageSchema } from './chat-scheduled-messages';

// ─── 路径 / 查询参数 ─────────────────────────────────────────────────────────

/** `{id}` 会话 + `{messageId}` 消息 */
export const chatConversationMessageParams = idParam.extend({
  messageId: z.coerce.number().int().positive().meta({ description: '消息 ID', example: 1 }),
});

/** `{id}` 会话 + `{userId}` 成员 */
export const chatConversationMemberParams = idParam.extend({
  userId: z.coerce.number().int().positive().meta({ description: '成员用户 ID', example: 1 }),
});

export const chatInviteTokenParam = z.object({
  token: z.string().min(8).max(64).meta({ description: '邀请令牌' }),
});

export const chatUserSearchQuery = z.object({
  keyword: keywordQuery('昵称 / 用户名'),
});

export const chatPresenceQuery = z.object({
  userIds: z.string().optional().meta({ description: '逗号分隔的用户 ID 列表', example: '1,2,3' }),
});

export const chatLinkPreviewQuery = z.object({
  url: httpUrl().max(2048),
});

/** 游标分页：取 `beforeId` 之前的消息，最新在前 */
export const chatMessagesQuery = z.object({
  beforeId: idQuery(),
  limit: z.coerce.number().int().positive().max(50).default(30),
});

// 聊天检索按会话滚动加载，分页边界复用通用契约积木
export const chatMessageSearchQuery = paginationQuery.extend({
  keyword: keywordQuery(),
  types: z.string().optional().meta({ description: '逗号分隔的消息类型', example: 'text,image' }),
  senderId: idQuery(),
  startAt: dateRangeBound('起始时间'),
  endAt: dateRangeBound('结束时间', 'end'),
});

export const chatMessageContextQuery = z.object({
  before: z.coerce.number().int().min(0).max(100).default(15),
  after: z.coerce.number().int().min(0).max(100).default(15),
});

export const chatGlobalSearchQuery = paginationQuery.extend({
  keyword: z.string().min(1).max(200),
  types: z.string().optional().meta({ description: '逗号分隔的消息类型', example: 'text,image' }),
});

export const chatScheduledMessagesQuery = z.object({
  status: queryEnum(CHAT_SCHEDULED_STATUSES),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const chatContract = defineContract('/api/chat', {
  // 选人 / 在线状态 / 通话
  users: op.get('/users', { access: 'authenticated', query: chatUserSearchQuery, response: z.array(chatUserSchema), summary: '搜索可聊天的用户' }),
  presence: op.get('/presence', { access: 'authenticated', query: chatPresenceQuery, response: z.array(chatPresenceSchema), summary: '批量查询用户在线状态' }),
  rtcConfig: op.get('/rtc/config', { access: 'authenticated', response: rtcConfigSchema, summary: '获取 WebRTC ICE 服务器配置' }),
  postCallRecord: op.post('/conversations/{id}/call-record', { access: 'authenticated', params: idParam, body: chatCallRecordSchema, summary: '写入通话记录（系统消息）' }),

  // 会话
  conversations: op.get('/conversations', { access: 'authenticated', response: z.array(chatConversationSchema), summary: '我的会话列表' }),
  globalFavoriteMessages: op.get('/favorite-messages', { access: 'authenticated', query: paginationQuery, response: paginated(chatMessageSchema), summary: '我的收藏消息列表' }),
  createDirect: op.post('/conversations/direct', { access: 'authenticated', body: createDirectConversationSchema, response: chatConversationSchema, summary: '创建或获取单聊会话' }),
  messages: op.get('/conversations/{id}/messages', { access: 'authenticated', params: idParam, query: chatMessagesQuery, response: chatMessagePageSchema, summary: '获取会话消息（游标分页）' }),
  searchMessages: op.get('/conversations/{id}/messages/search', { access: 'authenticated', params: idParam, query: chatMessageSearchQuery, response: chatMessageSearchResultSchema, summary: '搜索当前会话消息' }),
  messageContext: op.get('/conversations/{id}/messages/{messageId}/context', { access: 'authenticated', params: chatConversationMessageParams, query: chatMessageContextQuery, response: chatMessageContextSchema, summary: '获取目标消息上下文' }),

  // 消息
  linkPreview: op.get('/link-preview', { access: 'authenticated', query: chatLinkPreviewQuery, response: chatLinkPreviewSchema, summary: '获取链接预览信息' }),
  sendMessage: op.post('/conversations/{id}/messages', { access: 'authenticated', params: idParam, body: sendChatMessageSchema, response: chatMessageSchema, summary: '发送消息' }),
  pinnedMessages: op.get('/conversations/{id}/pinned-messages', { access: 'authenticated', params: idParam, response: z.array(chatMessageSchema), summary: '获取会话置顶消息' }),
  favoriteMessages: op.get('/conversations/{id}/favorite-messages', { access: 'authenticated', params: idParam, query: paginationQuery, response: paginated(chatMessageSchema), summary: '获取会话收藏消息' }),
  editMessage: op.patch('/messages/{id}/edit', { access: 'authenticated', params: idParam, body: editChatMessageSchema, response: chatMessageSchema, summary: '编辑消息（24小时内，仅文本）' }),
  recallMessage: op.patch('/messages/{id}/recall', { access: 'authenticated', params: idParam, summary: '撤回消息' }),
  favoriteMessage: op.patch('/messages/{id}/favorite', { access: 'authenticated', params: idParam, body: toggleChatMessageFavoriteSchema, response: chatMessageSchema, summary: '收藏或取消收藏消息' }),
  pinMessage: op.patch('/messages/{id}/pin', { access: 'authenticated', params: idParam, body: toggleChatMessagePinSchema, response: chatMessageSchema, summary: '置顶或取消置顶消息' }),
  markRead: op.post('/conversations/{id}/read', { access: 'authenticated', params: idParam, summary: '标记会话已读' }),
  readStates: op.get('/conversations/{id}/read-states', { access: 'authenticated', params: idParam, response: z.array(chatReadStateSchema), summary: '获取会话成员已读状态' }),
  createGroup: op.post('/conversations/group', { access: 'authenticated', body: createGroupConversationSchema, response: chatConversationSchema, summary: '创建群聊' }),
  archiveConversation: op.patch('/conversations/{id}/archive', { access: 'authenticated', params: idParam, body: archiveChatConversationSchema, summary: '归档或取消归档会话' }),

  // 常用语（个人快捷回复）
  quickReplies: op.get('/quick-replies', { access: 'authenticated', response: z.array(chatQuickReplySchema), summary: '我的常用语列表' }),
  createQuickReply: op.post('/quick-replies', { access: 'authenticated', body: createChatQuickReplySchema, response: chatQuickReplySchema, summary: '新增常用语' }),
  updateQuickReply: op.put('/quick-replies/{id}', { access: 'authenticated', params: idParam, body: updateChatQuickReplySchema, response: chatQuickReplySchema, summary: '更新常用语' }),
  removeQuickReply: op.delete('/quick-replies/{id}', { access: 'authenticated', params: idParam, summary: '删除常用语' }),

  // 定时消息
  createScheduledMessage: op.post('/conversations/{id}/scheduled-messages', { access: 'authenticated', params: idParam, body: createChatScheduledMessageSchema, response: chatScheduledMessageSchema, summary: '创建定时消息' }),
  scheduledMessages: op.get('/scheduled-messages', { access: 'authenticated', query: chatScheduledMessagesQuery, response: z.array(chatScheduledMessageSchema), summary: '我的定时消息列表' }),
  cancelScheduledMessage: op.patch('/scheduled-messages/{id}/cancel', { access: 'authenticated', params: idParam, summary: '取消定时消息' }),

  // 自定义表情
  customEmojis: op.get('/custom-emojis', { access: 'authenticated', response: z.array(chatCustomEmojiSchema), summary: '我的自定义表情列表' }),
  addCustomEmoji: op.post('/custom-emojis', { access: 'authenticated', body: addChatCustomEmojiSchema, response: chatCustomEmojiSchema, summary: '添加自定义表情' }),
  removeCustomEmoji: op.delete('/custom-emojis/{id}', { access: 'authenticated', params: idParam, summary: '删除自定义表情' }),

  // 群邀请链接 / 入群审批
  createInvite: op.post('/conversations/{id}/invite', { access: 'authenticated', params: idParam, response: chatGroupInviteSchema, summary: '获取/生成群邀请链接（群主/管理员）' }),
  resetInvite: op.post('/conversations/{id}/invite/reset', { access: 'authenticated', params: idParam, response: chatGroupInviteSchema, summary: '重置群邀请链接（群主/管理员）' }),
  inviteInfo: op.get('/invites/{token}', { access: 'authenticated', params: chatInviteTokenParam, response: chatInviteInfoSchema, summary: '查看邀请链接对应的群信息' }),
  joinByInvite: op.post('/invites/{token}/join', { access: 'authenticated', params: chatInviteTokenParam, body: joinChatByInviteSchema, response: chatJoinResultSchema, summary: '通过邀请链接加入群聊' }),
  joinRequests: op.get('/conversations/{id}/join-requests', { access: 'authenticated', params: idParam, response: z.array(chatGroupJoinRequestSchema), summary: '待审批入群申请列表（群主/管理员）' }),
  handleJoinRequest: op.patch('/join-requests/{id}', { access: 'authenticated', params: idParam, body: handleChatJoinRequestSchema, summary: '审批入群申请（群主/管理员）' }),
  setJoinApproval: op.patch('/conversations/{id}/join-approval', { access: 'authenticated', params: idParam, body: setChatJoinApprovalSchema, summary: '开启/关闭入群审批（群主/管理员）' }),

  // 组织架构选人 / 群成员
  orgUsers: op.get('/org-users', { access: 'authenticated', response: chatOrgDataSchema, summary: '获取组织架构选人数据（部门+用户）' }),
  groupMembers: op.get('/conversations/{id}/members', { access: 'authenticated', params: idParam, response: z.array(chatGroupMemberSchema), summary: '获取群成员列表' }),
  addGroupMember: op.post('/conversations/{id}/members', { access: 'authenticated', params: idParam, body: addChatGroupMemberSchema, summary: '添加群成员' }),
  pinConversation: op.patch('/conversations/{id}/pin', { access: 'authenticated', params: idParam, body: pinChatConversationSchema, summary: '置顶或取消置顶会话' }),
  starConversation: op.patch('/conversations/{id}/star', { access: 'authenticated', params: idParam, body: starChatConversationSchema, summary: '标记或取消星标会话' }),
  muteConversation: op.patch('/conversations/{id}/mute', { access: 'authenticated', params: idParam, body: muteChatConversationSchema, summary: '免打扰或取消免打扰会话' }),
  disbandConversation: op.delete('/conversations/{id}/disband', { access: 'authenticated', params: idParam, summary: '解散群聊（群主专属）' }),
  removeConversation: op.delete('/conversations/{id}', { access: 'authenticated', params: idParam, summary: '删除（退出）会话' }),
  removeGroupMember: op.delete('/conversations/{id}/members/{userId}', { access: 'authenticated', params: chatConversationMemberParams, summary: '移除群成员（群主/管理员）' }),
  updateGroupInfo: op.patch('/conversations/{id}/group-info', { access: 'authenticated', params: idParam, body: updateChatGroupInfoSchema, summary: '更新群聊名称或公告（群主/管理员）' }),
  transferGroup: op.post('/conversations/{id}/transfer', { access: 'authenticated', params: idParam, body: transferChatGroupSchema, summary: '转让群主' }),
  setMemberRole: op.patch('/conversations/{id}/members/{userId}/role', { access: 'authenticated', params: chatConversationMemberParams, body: setChatMemberRoleSchema, summary: '设置/取消群管理员（群主专属）' }),
  muteMember: op.patch('/conversations/{id}/members/{userId}/mute', { access: 'authenticated', params: chatConversationMemberParams, body: muteChatMemberSchema, summary: '禁言/解除禁言群成员（群主/管理员）' }),
  setMuteAll: op.patch('/conversations/{id}/mute-all', { access: 'authenticated', params: idParam, body: setChatMuteAllSchema, summary: '开启/关闭全员禁言（群主/管理员）' }),
  announcementHistory: op.get('/conversations/{id}/announcement-history', { access: 'authenticated', params: idParam, response: z.array(chatMessageSchema), summary: '获取群公告历史' }),
  removeAnnouncementHistory: op.delete('/conversations/{id}/announcement-history/{messageId}', { access: 'authenticated', params: chatConversationMessageParams, summary: '删除群公告历史（群主/管理员）' }),

  // 转发 / 删除 / 搜索 / 表情回应 / 投票
  forwardMessages: op.post('/messages/forward', { access: 'authenticated', body: forwardMessagesSchema, summary: '转发消息（逐条或合并）' }),
  batchDeleteMessages: op.post('/messages/batch-delete', { access: 'authenticated', body: batchDeleteChatMessagesSchema, summary: '批量删除消息（仅对自己隐藏）' }),
  globalSearch: op.get('/messages/global-search', { access: 'authenticated', query: chatGlobalSearchQuery, response: chatGlobalSearchResultSchema, summary: '跨会话全局消息搜索' }),
  toggleReaction: op.post('/messages/{id}/reactions', { access: 'authenticated', params: idParam, body: toggleChatReactionSchema, response: z.array(chatReactionGroupSchema), summary: '切换消息表情回应（加/取消）' }),
  vote: op.post('/messages/{id}/vote', { access: 'authenticated', params: idParam, body: submitChatVoteSchema, response: chatMessageSchema, summary: '参与投票' }),
}, { tags: ['Chat'] });
