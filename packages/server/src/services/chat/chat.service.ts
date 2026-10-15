// chat 域 facade：实现位于同级 chat-*.service.ts / chat-shared.ts，
// 此处仅统一 re-export，对外导入路径与导出符号集保持不变。
export { mapChatMessage } from './chat-shared';
export {
  listConversations, getOrCreateDirectConversation, pinConversation, starConversation,
  muteConversation, archiveConversation, removeConversation, disbandConversation, markConversationRead,
  getConversationReadStates,
} from './chat-conversations.service';
export {
  createGroupConversation, addGroupMember, listGroupMembers, removeGroupMember,
  updateGroupInfo, transferGroupOwnership, setMemberRole, muteMember, setMuteAll,
} from './chat-groups.service';
export {
  appendSystemMessage, listMessages, listPinnedMessages, listFavoriteMessages,
  listGlobalFavoriteMessages, toggleMessageFavorite, toggleMessagePin,
  listAnnouncementHistory, deleteAnnouncementHistory, searchConversationMessages,
  getMessageContext, sendMessage, forwardMessages, deleteMessagesForUser,
  recallMessage, editMessage, searchGlobalMessages,
} from './chat-messages.service';
export { aggregateReactions, toggleReaction, submitVote } from './chat-reactions.service';
export { getLinkPreview, postBotMessage, markCardMessageDone, markTaskCardsDone } from './chat-bot.service';
export { getPresenceForUsers, getRtcConfig, postCallRecord } from './chat-rtc.service';
export { listChatUsers, getChatOrgData } from './chat-directory.service';
