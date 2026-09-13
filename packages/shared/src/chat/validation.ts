import * as z from 'zod';
import { linkUrl, partialForUpdate } from '../core/validation';
import {
  CHAT_CALL_RECORD_STATUSES,
  CHAT_CARD_ACTION_THEMES,
  CHAT_CARD_ACTION_TYPES,
  CHAT_CARD_STATUSES,
  CHAT_FORWARD_MODES,
  CHAT_MEDIA_MESSAGE_TYPES,
  CHAT_SENDABLE_MESSAGE_TYPES,
  RTC_CALL_MODES,
  RTC_CALL_TYPES,
} from './constants';
import { chatMessageExtraSchema } from './contracts/chat-messages';

// ─── 消息 ─────────────────────────────────────────────────────────────────────

/** 媒体类消息的 content 是被渲染为 src / href 的资源地址：仅接受托管文件路径或 http(s) URL */
export function isChatMediaContentSafe(type: string, content: string): boolean {
  if (!(CHAT_MEDIA_MESSAGE_TYPES as readonly string[]).includes(type)) return true;
  return linkUrl().validate(content);
}

export const sendChatMessageSchema = z.object({
  content: z.string().min(1, '消息不能为空').max(4096),
  type: z.enum(CHAT_SENDABLE_MESSAGE_TYPES).default('text'),
  replyToId: z.number().int().positive().nullable().optional(),
  extra: chatMessageExtraSchema.nullable().optional(),
}).refine((value) => isChatMediaContentSafe(value.type, value.content), {
  path: ['content'],
  message: '媒体消息地址仅支持 http(s) URL 或站内路径',
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export const editChatMessageSchema = z.object({
  content: z.string().min(1, '消息不能为空').max(4096),
});

export type EditChatMessageInput = z.infer<typeof editChatMessageSchema>;

export const forwardMessagesSchema = z.object({
  messageIds: z.array(z.number().int().positive()).min(1).max(100),
  targetConversationIds: z.array(z.number().int().positive()).min(1).max(20),
  mode: z.enum(CHAT_FORWARD_MODES),
});

export type ForwardMessagesInput = z.infer<typeof forwardMessagesSchema>;

export const batchDeleteChatMessagesSchema = z.object({
  messageIds: z.array(z.number().int().positive()).min(1).max(100),
});

export type BatchDeleteChatMessagesInput = z.infer<typeof batchDeleteChatMessagesSchema>;

export const toggleChatMessageFavoriteSchema = z.object({ favorite: z.boolean() });

export const toggleChatMessagePinSchema = z.object({ pin: z.boolean() });

/** 回应取值来自 emoji 选择器的原生字符；zod 4.6 起 `z.emoji()` 拒绝纯组件串（`123` / `#`），可直接作格式约束 */
export const toggleChatReactionSchema = z.object({ emoji: z.emoji('表情回应必须是 emoji').max(10) });

export const submitChatVoteSchema = z.object({
  optionIds: z.array(z.string().min(1).max(36)).min(1).max(10),
});

export type SubmitChatVoteInput = z.infer<typeof submitChatVoteSchema>;

// ─── 会话 ─────────────────────────────────────────────────────────────────────

export const createDirectConversationSchema = z.object({
  targetUserId: z.number().int().positive(),
});

export type CreateDirectConversationInput = z.infer<typeof createDirectConversationSchema>;

export const createGroupConversationSchema = z.object({
  name: z.string().min(1, '群名不能为空').max(64),
  /** 初始群成员（可选，不含群主自己） */
  memberIds: z.array(z.number().int().positive()).max(19).optional(),
});

export type CreateGroupConversationInput = z.infer<typeof createGroupConversationSchema>;

export const pinChatConversationSchema = z.object({ pin: z.boolean() });

export const starChatConversationSchema = z.object({ star: z.boolean() });

export const muteChatConversationSchema = z.object({ mute: z.boolean() });

export const archiveChatConversationSchema = z.object({ archive: z.boolean() });

export const updateChatGroupInfoSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  announcement: z.string().max(500).nullable().optional(),
});

export type UpdateChatGroupInfoInput = z.infer<typeof updateChatGroupInfoSchema>;

export const transferChatGroupSchema = z.object({
  newOwnerId: z.number().int().positive(),
});

export const setChatMuteAllSchema = z.object({ muteAll: z.boolean() });

// ─── 群成员 ───────────────────────────────────────────────────────────────────

export const addChatGroupMemberSchema = z.object({
  userId: z.number().int().positive(),
});

export const setChatMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export type SetChatMemberRoleInput = z.infer<typeof setChatMemberRoleSchema>;

export const muteChatMemberSchema = z.object({
  mute: z.boolean(),
  /** 禁言时长（分钟），不传 = 永久禁言 */
  durationMinutes: z.number().int().positive().max(43200).optional(),
});

export type MuteChatMemberInput = z.infer<typeof muteChatMemberSchema>;

// ─── 群邀请 / 入群审批 ─────────────────────────────────────────────────────────

export const joinChatByInviteSchema = z.object({
  message: z.string().max(255).optional(),
});

export const handleChatJoinRequestSchema = z.object({ approve: z.boolean() });

export const setChatJoinApprovalSchema = z.object({ enabled: z.boolean() });

// ─── 常用语（个人快捷回复） ───────────────────────────────────────────────────

export const createChatQuickReplySchema = z.object({
  content: z.string().min(1, '内容不能为空').max(500),
  sort: z.number().int().min(0).max(9999).optional(),
});

export type CreateChatQuickReplyInput = z.infer<typeof createChatQuickReplySchema>;

export const updateChatQuickReplySchema = z.object({
  content: z.string().min(1).max(500).optional(),
  sort: z.number().int().min(0).max(9999).optional(),
});

export type UpdateChatQuickReplyInput = z.infer<typeof updateChatQuickReplySchema>;

// ─── 定时消息 ─────────────────────────────────────────────────────────────────

export const createChatScheduledMessageSchema = z.object({
  content: z.string().min(1, '内容不能为空').max(4096),
  /** 计划发送时间（YYYY-MM-DD HH:mm:ss） */
  scheduledAt: z.string().min(1, '定时时间不能为空'),
});

export type CreateChatScheduledMessageInput = z.infer<typeof createChatScheduledMessageSchema>;

// ─── 自定义表情 ───────────────────────────────────────────────────────────────

export const addChatCustomEmojiSchema = z.object({
  url: z.string().min(1).max(512),
  fileId: z.string().max(64).nullable().optional(),
  name: z.string().max(64).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

export type AddChatCustomEmojiInput = z.infer<typeof addChatCustomEmojiSchema>;

// ─── 聊天入站 Webhook 机器人 ───────────────────────────────────────────────────

export const createChatWebhookSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(64),
  avatar: z.string().max(256).nullable().optional(),
  description: z.string().max(255).nullable().optional(),
  conversationId: z.number().int().positive('请选择目标会话'),
  enabled: z.boolean().default(true),
});

export const updateChatWebhookSchema = partialForUpdate(createChatWebhookSchema).omit({ conversationId: true });

export type CreateChatWebhookInput = z.infer<typeof createChatWebhookSchema>;

export type UpdateChatWebhookInput = z.infer<typeof updateChatWebhookSchema>;

/** 入站 Webhook 可提交的卡片：字段长度受限，且不接受封面 / 富文本正文 */
export const chatWebhookCardFieldSchema = z.object({
  label: z.string().max(60),
  value: z.string().max(500),
});

export const chatWebhookCardActionSchema = z.object({
  key: z.string().max(40),
  label: z.string().max(40),
  theme: z.enum(CHAT_CARD_ACTION_THEMES).optional(),
  action: z.enum(CHAT_CARD_ACTION_TYPES),
  taskId: z.number().int().positive().nullable().optional(),
  url: linkUrl().max(1024).nullable().optional(),
  requireComment: z.boolean().optional(),
});

export const chatWebhookCardSchema = z.object({
  title: z.string().min(1).max(120),
  text: z.string().max(2000).nullable().optional(),
  fields: z.array(chatWebhookCardFieldSchema).max(20).nullable().optional(),
  actions: z.array(chatWebhookCardActionSchema).max(6).nullable().optional(),
  source: z.string().max(40).nullable().optional(),
  status: z.enum(CHAT_CARD_STATUSES).nullable().optional(),
  statusText: z.string().max(60).nullable().optional(),
  instanceId: z.number().int().positive().nullable().optional(),
});

/** 入站 Webhook 推送 body：文本或卡片 */
export const chatWebhookPayloadSchema = z.object({
  type: z.enum(['text', 'card']).default('text'),
  text: z.string().max(4096).optional(),
  card: chatWebhookCardSchema.optional(),
}).refine((v) => (v.type === 'card' ? !!v.card : !!v.text), {
  message: 'text 或 card 至少提供一个',
});

export type ChatWebhookPayloadInput = z.infer<typeof chatWebhookPayloadSchema>;

// ─── 通话记录（结束后写入会话系统消息）────────────────────────────────────────

export const chatCallRecordSchema = z.object({
  callType: z.enum(RTC_CALL_TYPES),
  mode: z.enum(RTC_CALL_MODES),
  status: z.enum(CHAT_CALL_RECORD_STATUSES),
  /** 通话时长（秒），completed 时有效 */
  durationSec: z.number().int().nonnegative().default(0),
});

export type ChatCallRecordInput = z.infer<typeof chatCallRecordSchema>;
