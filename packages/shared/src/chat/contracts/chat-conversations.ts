import * as z from 'zod';
import { CHAT_CONVERSATION_TYPES, CHAT_JOIN_REQUEST_STATUSES, CHAT_MEMBER_ROLES } from '../constants';
import { chatMessageSchema } from './chat-messages';

// ─── 会话 ────────────────────────────────────────────────────────────────────

/** 单聊对方的展示信息（含名片字段） */
export const chatConversationTargetUserSchema = z.object({
  id: z.int(),
  nickname: z.string(),
  avatar: z.string().nullable(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  departmentName: z.string().nullable().optional(),
  positionNames: z.array(z.string()).optional(),
}).meta({ id: 'ChatConversationTargetUser' });

export type ChatConversationTargetUser = z.infer<typeof chatConversationTargetUserSchema>;

export const chatConversationSchema = z.object({
  id: z.int(),
  type: z.enum(CHAT_CONVERSATION_TYPES),
  name: z.string().nullable(),
  announcement: z.string().nullable().optional(),
  targetUser: chatConversationTargetUserSchema.nullable().optional(),
  lastMessage: chatMessageSchema.nullable(),
  unreadCount: z.int(),
  hasMentionUnread: z.boolean().meta({ description: '是否存在未读的 @我 消息' }),
  isPinned: z.boolean(),
  isStarred: z.boolean(),
  isMuted: z.boolean(),
  isArchived: z.boolean().optional().meta({ description: '会话归档（收进「已归档」折叠分组）' }),
  muteAll: z.boolean().optional().meta({ description: '全员禁言开关（群聊）' }),
  joinApproval: z.boolean().optional().meta({ description: '入群审批开关（群聊，开启后邀请入群需审批）' }),
  myRole: z.enum(CHAT_MEMBER_ROLES).optional().meta({ description: '我在该会话中的角色' }),
  myMutedUntil: z.string().nullable().optional().meta({ description: '我被禁言至（null = 未禁言）' }),
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'ChatConversation' });

export type ChatConversation = z.infer<typeof chatConversationSchema>;

// ─── 成员 / 已读 / 在线 ──────────────────────────────────────────────────────

export const chatGroupMemberSchema = z.object({
  id: z.int(),
  nickname: z.string(),
  username: z.string(),
  avatar: z.string().nullable().optional(),
  role: z.enum(CHAT_MEMBER_ROLES),
  mutedUntil: z.string().nullable().optional().meta({ description: '被禁言至（null = 未禁言；9999 年 = 永久）' }),
}).meta({ id: 'ChatGroupMember' });

export type ChatGroupMember = z.infer<typeof chatGroupMemberSchema>;

/** 会话成员的已读状态（用于已读回执） */
export const chatReadStateSchema = z.object({
  userId: z.int(),
  nickname: z.string(),
  avatar: z.string().nullable(),
  lastReadAt: z.string().nullable().meta({ description: '最后已读时间，null 表示从未读过' }),
}).meta({ id: 'ChatReadState' });

export type ChatReadState = z.infer<typeof chatReadStateSchema>;

/** 用户在线状态（用于在线状态指示） */
export const chatPresenceSchema = z.object({
  userId: z.int(),
  online: z.boolean(),
  lastSeen: z.string().nullable().meta({ description: '最近在线时间，online=true 时为 null' }),
}).meta({ id: 'ChatPresence' });

export type ChatPresence = z.infer<typeof chatPresenceSchema>;

// ─── 选人 ────────────────────────────────────────────────────────────────────

/** 可聊天的用户（搜索结果项） */
export const chatUserSchema = z.object({
  id: z.int(),
  nickname: z.string(),
  username: z.string(),
  avatar: z.string().nullable().optional(),
}).meta({ id: 'ChatUser' });

export type ChatUser = z.infer<typeof chatUserSchema>;

/** 组织架构选人：部门节点 */
export const chatOrgDepartmentSchema = z.object({
  id: z.int(),
  name: z.string(),
  parentId: z.int(),
}).meta({ id: 'ChatOrgDepartment' });

export type ChatOrgDepartment = z.infer<typeof chatOrgDepartmentSchema>;

/** 组织架构选人：用户节点 */
export const chatOrgUserSchema = z.object({
  id: z.int(),
  nickname: z.string(),
  username: z.string(),
  avatar: z.string().nullable(),
  departmentId: z.int().nullable(),
}).meta({ id: 'ChatOrgUser' });

export type ChatOrgUser = z.infer<typeof chatOrgUserSchema>;

/** 组织架构选人数据（部门 + 用户扁平列表，前端组树） */
export const chatOrgDataSchema = z.object({
  departments: z.array(chatOrgDepartmentSchema),
  users: z.array(chatOrgUserSchema),
}).meta({ id: 'ChatOrgData' });

export type ChatOrgData = z.infer<typeof chatOrgDataSchema>;

// ─── 群邀请 / 入群审批 ───────────────────────────────────────────────────────

/** 群邀请链接 */
export const chatGroupInviteSchema = z.object({
  id: z.int(),
  conversationId: z.int(),
  token: z.string(),
  expiresAt: z.string().nullable().meta({ description: '过期时间（null = 永久有效）' }),
  maxUses: z.int().nullable(),
  usedCount: z.int(),
  enabled: z.boolean(),
  createdAt: z.string(),
}).meta({ id: 'ChatGroupInvite' });

export type ChatGroupInvite = z.infer<typeof chatGroupInviteSchema>;

/** 邀请链接落地信息（加入前展示） */
export const chatInviteInfoSchema = z.object({
  conversationId: z.int(),
  groupName: z.string().nullable(),
  memberCount: z.int(),
  joinApproval: z.boolean().meta({ description: '是否需要群主/管理员审批' }),
  alreadyMember: z.boolean().meta({ description: '当前用户是否已在群内' }),
}).meta({ id: 'ChatInviteInfo' });

export type ChatInviteInfo = z.infer<typeof chatInviteInfoSchema>;

/** 通过邀请链接加入的结果：joined=false 表示已提交入群申请待审批 */
export const chatJoinResultSchema = z.object({
  joined: z.boolean(),
}).meta({ id: 'ChatJoinResult' });

export type ChatJoinResult = z.infer<typeof chatJoinResultSchema>;

export const chatGroupJoinRequestSchema = z.object({
  id: z.int(),
  conversationId: z.int(),
  userId: z.int(),
  nickname: z.string(),
  avatar: z.string().nullable(),
  message: z.string().nullable(),
  status: z.enum(CHAT_JOIN_REQUEST_STATUSES),
  createdAt: z.string(),
}).meta({ id: 'ChatGroupJoinRequest' });

export type ChatGroupJoinRequest = z.infer<typeof chatGroupJoinRequestSchema>;
