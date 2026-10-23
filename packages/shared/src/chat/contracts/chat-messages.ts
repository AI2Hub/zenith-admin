import * as z from 'zod';
import { SEMANTIC_STATUSES } from '../../core/semantic-status';
import { httpUrl, linkUrl } from '../../core/validation';
import {
  CHAT_CARD_ACTION_THEMES,
  CHAT_CARD_ACTION_TYPES,
  CHAT_CARD_STATUSES,
  CHAT_MEDIA_MESSAGE_TYPES,
  CHAT_MESSAGE_TYPES,
} from '../constants';

/**
 * 聊天消息实体与其嵌套值对象。
 *
 * `chatMessageExtraSchema` 同时作为发送消息 / 定时消息的请求体校验：linkPreview / asset / card 中的 URL
 * 会被前端渲染为 href / src，必须限定为 http(s) 或站内路径（`httpUrl` / `linkUrl`）。
 */

export const chatLinkPreviewSchema = z.strictObject({
  url: httpUrl(),
  title: z.string(),
  description: z.string().nullable(),
  siteName: z.string().nullable(),
  image: httpUrl().nullable(),
  favicon: httpUrl().nullable(),
}).meta({ id: 'ChatLinkPreview' });

export type ChatLinkPreview = z.infer<typeof chatLinkPreviewSchema>;

export const chatAssetMetaSchema = z.strictObject({
  kind: z.enum(CHAT_MEDIA_MESSAGE_TYPES),
  name: z.string(),
  size: z.int(),
  mimeType: z.string().nullable(),
  extension: z.string().nullable(),
  fileId: z.uuid().nullable().optional().meta({ description: '托管文件 ID，用于服务端预览接口认证（虚拟消息不填）' }),
  width: z.int().nullable().optional(),
  height: z.int().nullable().optional(),
  thumbnailUrl: linkUrl().max(2048).nullable().optional(),
  duration: z.number().nullable().optional().meta({ description: '语音消息时长（秒），仅 kind=voice 有效' }),
}).meta({ id: 'ChatAssetMeta' });

export type ChatAssetMeta = z.infer<typeof chatAssetMetaSchema>;

export const chatMentionSchema = z.strictObject({
  userId: z.int(),
  nickname: z.string(),
}).meta({ id: 'ChatMention' });

export type ChatMention = z.infer<typeof chatMentionSchema>;

export const chatAnnouncementHistoryMetaSchema = z.strictObject({
  announcement: z.string().nullable(),
  operatorName: z.string().nullable(),
}).meta({ id: 'ChatAnnouncementHistory' });

export type ChatAnnouncementHistoryMeta = z.infer<typeof chatAnnouncementHistoryMetaSchema>;

export const chatForwardedItemSchema = z.object({
  senderName: z.string().nullable(),
  type: z.enum(CHAT_MESSAGE_TYPES),
  content: z.string(),
  createdAt: z.string(),
  asset: chatAssetMetaSchema.nullable().optional(),
}).meta({ id: 'ChatForwardedItem' });

export type ChatForwardedItem = z.infer<typeof chatForwardedItemSchema>;

/** 卡片消息字段（键值对展示） */
export const chatCardFieldSchema = z.object({
  label: z.string(),
  value: z.string(),
}).meta({ id: 'ChatCardField' });

export type ChatCardField = z.infer<typeof chatCardFieldSchema>;

/** 卡片消息动作按钮 */
export const chatCardActionSchema = z.object({
  key: z.string().meta({ description: '动作唯一标识' }),
  label: z.string(),
  theme: z.enum(CHAT_CARD_ACTION_THEMES).optional(),
  action: z.enum(CHAT_CARD_ACTION_TYPES).meta({ description: '动作类型：调用工作流审批接口 / 打开链接 / 仅展示' }),
  taskId: z.int().nullable().optional().meta({ description: 'workflow:* 动作关联的任务 ID' }),
  url: linkUrl().max(1024).nullable().optional().meta({ description: 'link 动作的跳转地址（站内 path 或外链）' }),
  requireComment: z.boolean().optional().meta({ description: '是否要求填写评论（如驳回）' }),
}).meta({ id: 'ChatCardAction' });

export type ChatCardAction = z.infer<typeof chatCardActionSchema>;

/** 卡片消息内容（工作流审批 / 系统告警 / Webhook 推送） */
export const chatCardSchema = z.object({
  title: z.string(),
  text: z.string().nullable().optional(),
  cover: linkUrl().nullable().optional().meta({ description: '图文消息封面图 URL（频道图文群发使用，工作流卡片不设）' }),
  bodyHtml: z.string().nullable().optional().meta({ description: '图文正文富文本 HTML（服务端已白名单净化）' }),
  fields: z.array(chatCardFieldSchema).nullable().optional(),
  actions: z.array(chatCardActionSchema).nullable().optional(),
  source: z.string().nullable().optional().meta({ description: '来源标识（如「工作流」「系统告警」「监控」）' }),
  status: z.enum(CHAT_CARD_STATUSES).nullable().optional().meta({ description: 'pending 可操作，done 已处理（按钮置灰）' }),
  semanticStatus: z.enum(SEMANTIC_STATUSES).nullable().optional().meta({ description: '公共语义标签；流程结果与个人处理结果使用不同标识' }),
  instanceId: z.int().nullable().optional().meta({ description: '关联的工作流实例 ID' }),
}).meta({ id: 'ChatCard' });

export type ChatCard = z.infer<typeof chatCardSchema>;

/** 机器人/系统发送者身份（senderId 为 null 的消息携带） */
export const chatBotMetaSchema = z.object({
  name: z.string(),
  avatar: z.string().nullable().optional(),
}).meta({ id: 'ChatBotMeta' });

export type ChatBotMeta = z.infer<typeof chatBotMetaSchema>;

export const chatVoteOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
}).meta({ id: 'ChatVoteOption' });

export type ChatVoteOption = z.infer<typeof chatVoteOptionSchema>;

export const chatVoteRecordSchema = z.object({
  userId: z.int(),
  optionIds: z.array(z.string()),
  nickname: z.string(),
}).meta({ id: 'ChatVoteRecord' });

export type ChatVoteRecord = z.infer<typeof chatVoteRecordSchema>;

export const chatVoteDataSchema = z.object({
  question: z.string(),
  options: z.array(chatVoteOptionSchema),
  isMultiple: z.boolean(),
  isAnonymous: z.boolean(),
  expireAt: z.string().nullable(),
  votes: z.array(chatVoteRecordSchema),
  isClosed: z.boolean(),
}).meta({ id: 'ChatVoteData' });

export type ChatVoteData = z.infer<typeof chatVoteDataSchema>;

export const chatMessageExtraSchema = z.strictObject({
  asset: chatAssetMetaSchema.nullable().optional(),
  linkPreview: chatLinkPreviewSchema.nullable().optional(),
  mentions: z.array(chatMentionSchema).nullable().optional(),
  isFavorited: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  announcementHistory: chatAnnouncementHistoryMetaSchema.nullable().optional(),
  forwardedMessages: z.array(chatForwardedItemSchema).nullable().optional(),
  forwardSourceConvName: z.string().nullable().optional(),
  hiddenFor: z.array(z.int()).nullable().optional(),
  voteData: chatVoteDataSchema.nullable().optional(),
  card: chatCardSchema.nullable().optional(),
  bot: chatBotMetaSchema.nullable().optional(),
}).meta({ id: 'ChatMessageExtra' });

export type ChatMessageExtra = z.infer<typeof chatMessageExtraSchema>;

export const chatReactionGroupSchema = z.object({
  emoji: z.string(),
  count: z.int(),
  userIds: z.array(z.int()),
}).meta({ id: 'ChatReactionGroup' });

export type ChatReactionGroup = z.infer<typeof chatReactionGroupSchema>;

/** 被回复消息的快照（随消息一并返回，供气泡内引用展示） */
export const chatReplySnapshotSchema = z.object({
  id: z.int(),
  senderId: z.int().nullable(),
  senderName: z.string().nullable(),
  type: z.enum(CHAT_MESSAGE_TYPES),
  content: z.string(),
  isRecalled: z.boolean(),
  extra: chatMessageExtraSchema.nullable(),
}).meta({ id: 'ChatReplySnapshot' });

export type ChatReplySnapshot = z.infer<typeof chatReplySnapshotSchema>;

export const chatMessageSchema = z.object({
  id: z.int().meta({ example: 1 }),
  conversationId: z.int(),
  senderId: z.int().nullable(),
  senderName: z.string().nullable(),
  senderAvatar: z.string().nullable(),
  type: z.enum(CHAT_MESSAGE_TYPES),
  content: z.string(),
  replyToId: z.int().nullable(),
  replyToMessage: chatReplySnapshotSchema.nullable(),
  isRecalled: z.boolean(),
  isEdited: z.boolean(),
  extra: chatMessageExtraSchema.nullable(),
  reactions: z.array(chatReactionGroupSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'ChatMessage' });

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatMessageSearchItemSchema = z.object({
  message: chatMessageSchema,
  snippet: z.string(),
}).meta({ id: 'ChatMessageSearchItem' });

export type ChatMessageSearchItem = z.infer<typeof chatMessageSearchItemSchema>;

export const chatMessageSearchResultSchema = z.object({
  list: z.array(chatMessageSearchItemSchema),
  total: z.int(),
  page: z.int(),
  pageSize: z.int(),
}).meta({ id: 'ChatMessageSearchResult' });

export type ChatMessageSearchResult = z.infer<typeof chatMessageSearchResultSchema>;

/** 跨会话全局搜索结果：附带命中消息所属会话的展示名 */
export const chatGlobalSearchResultSchema = chatMessageSearchResultSchema.extend({
  conversationNames: z.record(z.string(), z.string()).meta({ description: '会话 ID → 展示名（direct 取对方昵称，group 取群名）' }),
}).meta({ id: 'ChatGlobalSearchResult' });

export type ChatGlobalSearchResult = z.infer<typeof chatGlobalSearchResultSchema>;

export const chatMessageContextSchema = z.object({
  list: z.array(chatMessageSchema),
  anchorMessageId: z.int(),
  hasBefore: z.boolean(),
  hasAfter: z.boolean(),
}).meta({ id: 'ChatMessageContext' });

export type ChatMessageContext = z.infer<typeof chatMessageContextSchema>;

/** 游标分页的会话消息页 */
export const chatMessagePageSchema = z.object({
  list: z.array(chatMessageSchema),
  hasMore: z.boolean(),
}).meta({ id: 'ChatMessagePage' });

export type ChatMessagePage = z.infer<typeof chatMessagePageSchema>;
