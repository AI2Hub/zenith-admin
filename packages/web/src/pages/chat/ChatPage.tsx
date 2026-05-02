import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Input, Button, Avatar, Badge, Typography, Empty, Spin, Toast, Tooltip,
} from '@douyinfe/semi-ui';
import { Search, MessageSquarePlus, Send, CornerDownLeft, RotateCcw } from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { request } from '@/utils/request';
import type { ChatConversation, ChatMessage, WsMessage } from '@zenith/shared';

const { Text, Title } = Typography;

interface ChatUser {
  id: number;
  nickname: string;
  username: string;
  avatar?: string | null;
}

function getAvatarColor(name: string): string {
  const colors = ['#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#a18cd1', '#fbc2eb', '#a1c4fd'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (name.codePointAt(i) ?? 0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function UserAvatar({ name, avatar, size = 36 }: Readonly<{ name: string; avatar?: string | null; size?: number }>) {
  if (avatar) return <Avatar src={avatar} size="small" style={{ width: size, height: size, flexShrink: 0 }} />;
  return (
    <Avatar size="small" style={{ width: size, height: size, flexShrink: 0, backgroundColor: getAvatarColor(name) }}>
      {name.slice(0, 1).toUpperCase()}
    </Avatar>
  );
}

// ─── 新建聊天面板 ──────────────────────────────────────────────────────────────

function NewChatPanel({ onSelect, onClose }: Readonly<{ onSelect: (user: ChatUser) => void; onClose: () => void }>) {
  const [keyword, setKeyword] = useState('');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (kw: string) => {
    setLoading(true);
    const qs = kw ? `?keyword=${encodeURIComponent(kw)}` : '';
    const res = await request.get<ChatUser[]>(`/api/chat/users${qs}`, { silent: true });
    setLoading(false);
    if (res.code === 0 && res.data) setUsers(res.data);
  }, []);

  useEffect(() => { void search(''); }, [search]);

  useEffect(() => {
    const t = setTimeout(() => { void search(keyword); }, 300);
    return () => clearTimeout(t);
  }, [keyword, search]);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <Title heading={6} style={{ margin: 0, flex: 1 }}>新建聊天</Title>
        <Button size="small" type="tertiary" theme="borderless" onClick={onClose}>取消</Button>
      </div>
      <Input
        prefix={<Search size={14} />}
        placeholder="搜索用户名 / 昵称"
        value={keyword}
        onChange={setKeyword}
        size="small"
      />
      <Spin spinning={loading}>
        <div style={{ marginTop: 8, maxHeight: 300, overflowY: 'auto' }}>
          {users.length === 0 && !loading && (
            <Empty description="暂无用户" style={{ padding: '24px 0' }} imageStyle={{ width: 64 }} />
          )}
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onSelect(u)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px',
                cursor: 'pointer', borderRadius: 6, border: 'none', background: 'transparent',
                width: '100%', textAlign: 'left',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--semi-color-fill-0)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <UserAvatar name={u.nickname} avatar={u.avatar} />
              <div>
                <Text strong style={{ fontSize: 13 }}>{u.nickname}</Text>
                <Text type="tertiary" style={{ fontSize: 12, display: 'block' }}>@{u.username}</Text>
              </div>
            </button>
          ))}
        </div>
      </Spin>
    </div>
  );
}

// ─── 消息气泡 ──────────────────────────────────────────────────────────────────

function MessageBubble({
  msg, isSelf, onReply, onRecall,
}: Readonly<{
  msg: ChatMessage;
  isSelf: boolean;
  onReply: (msg: ChatMessage) => void;
  onRecall: (msg: ChatMessage) => void;
}>) {
  const timeStr = msg.createdAt.slice(11, 16);

  if (msg.isRecalled) {
    return (
      <div style={{ textAlign: 'center', padding: '4px 0' }}>
        <Text type="tertiary" style={{ fontSize: 12 }}>
          {isSelf ? '你' : (msg.senderName ?? '对方')}撤回了一条消息
        </Text>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: isSelf ? 'row-reverse' : 'row', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
      {!isSelf && <UserAvatar name={msg.senderName ?? '?'} avatar={msg.senderAvatar} size={32} />}
      <div style={{ maxWidth: '65%' }}>
        {!isSelf && (
          <Text type="tertiary" style={{ fontSize: 11, display: 'block', marginBottom: 2, marginLeft: 4 }}>
            {msg.senderName}
          </Text>
        )}
        {msg.replyToId && (
          <div style={{
            background: 'var(--semi-color-fill-1)', borderLeft: '3px solid var(--semi-color-primary)',
            padding: '3px 8px', borderRadius: 4, marginBottom: 4, fontSize: 12, color: 'var(--semi-color-text-2)',
          }}>
            回复消息 #{msg.replyToId}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexDirection: isSelf ? 'row-reverse' : 'row' }}>
          <div
            style={{
              background: isSelf ? 'var(--semi-color-primary)' : 'var(--semi-color-fill-1)',
              color: isSelf ? '#fff' : 'inherit',
              padding: '8px 12px',
              borderRadius: isSelf ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              fontSize: 14,
              lineHeight: 1.5,
              wordBreak: 'break-word',
              cursor: 'default',
            }}
          >
            {msg.content}
          </div>
          <div style={{ display: 'flex', gap: 2, flexShrink: 0, paddingBottom: 2 }}>
            <Tooltip content="回复">
              <Button
                size="small" theme="borderless" type="tertiary"
                icon={<CornerDownLeft size={12} />}
                onClick={() => onReply(msg)}
                style={{ padding: '2px 4px', height: 'auto', minWidth: 'auto' }}
              />
            </Tooltip>
            {isSelf && (
              <Tooltip content="撤回">
                <Button
                  size="small" theme="borderless" type="tertiary"
                  icon={<RotateCcw size={12} />}
                  onClick={() => onRecall(msg)}
                  style={{ padding: '2px 4px', height: 'auto', minWidth: 'auto' }}
                />
              </Tooltip>
            )}
          </div>
          <Text type="tertiary" style={{ fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>{timeStr}</Text>
        </div>
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [convSearch, setConvSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 当前登录用户 ID（从 localStorage token 解码）
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  useEffect(() => {
    try {
      const token = localStorage.getItem('zenith_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUserId(payload.userId ?? null);
      }
    } catch { /* ignore */ }
  }, []);

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  // ─── 加载会话列表 ──────────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true);
    const res = await request.get<ChatConversation[]>('/api/chat/conversations', { silent: true });
    setLoadingConvs(false);
    if (res.code === 0 && res.data) setConversations(res.data);
  }, []);

  useEffect(() => { void fetchConversations(); }, [fetchConversations]);

  // ─── 加载消息 ──────────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (convId: number, p = 1) => {
    setLoadingMsgs(true);
    const res = await request.get<{ list: ChatMessage[]; total: number; page: number; pageSize: number }>(
      `/api/chat/conversations/${convId}/messages?page=${p}&pageSize=30`,
      { silent: true },
    );
    setLoadingMsgs(false);
    if (res.code === 0 && res.data) {
      const newMsgs = [...res.data.list].reverse(); // API 返回最新在前，展示时反转
      if (p === 1) {
        setMessages(newMsgs);
        setPage(1);
      } else {
        setMessages((prev) => [...newMsgs, ...prev]);
        setPage(p);
      }
      setHasMore(res.data.list.length >= 30);
    }
  }, []);

  const handleSelectConv = useCallback(async (conv: ChatConversation) => {
    setActiveConvId(conv.id);
    setReplyTo(null);
    await fetchMessages(conv.id, 1);
    // 标记已读
    await request.post(`/api/chat/conversations/${conv.id}/read`, {}, { silent: true });
    setConversations((prev) => prev.map((c) => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [fetchMessages]);

  // ─── 新建聊天 ──────────────────────────────────────────────────────────────
  const handleNewChat = useCallback(async (user: ChatUser) => {
    setShowNewChat(false);
    const res = await request.post<ChatConversation>('/api/chat/conversations/direct', { targetUserId: user.id });
    if (res.code === 0 && res.data) {
      await fetchConversations();
      await handleSelectConv(res.data);
    }
  }, [fetchConversations, handleSelectConv]);

  // ─── 发送消息 ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!activeConvId || !input.trim() || sending) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    const body: Record<string, unknown> = { content, type: 'text' };
    if (replyTo) body.replyToId = replyTo.id;
    setReplyTo(null);
    const res = await request.post<ChatMessage>(`/api/chat/conversations/${activeConvId}/messages`, body);
    setSending(false);
    if (res.code !== 0) {
      setInput(content);
      Toast.error('发送失败');
    }
    // WS 会推送回来，不需要手动 append
  }, [activeConvId, input, sending, replyTo]);

  // ─── 撤回消息 ──────────────────────────────────────────────────────────────
  const handleRecall = useCallback(async (msg: ChatMessage) => {
    const res = await request.request<null>(`/api/chat/messages/${msg.id}/recall`, { method: 'PATCH' });
    if (res.code !== 0) Toast.error(res.message ?? '撤回失败');
  }, []);

  // ─── WebSocket ─────────────────────────────────────────────────────────────
  const handleWsMessage = useCallback((wsMsg: WsMessage) => {
    if (wsMsg.type === 'chat:message') {
      const msg = wsMsg.payload;
      // 追加到当前会话的消息列表
      if (msg.conversationId === activeConvId) {
        setMessages((prev) => [...prev, msg]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
        // 自动标记已读
        request.post(`/api/chat/conversations/${msg.conversationId}/read`, {}, { silent: true }).catch(() => {});
      }
      // 更新会话列表的最新消息 + 未读数
      setConversations((prev) => {
        const isActive = msg.conversationId === activeConvId;
        const updated = prev.map((c) =>
          c.id === msg.conversationId
            ? { ...c, lastMessage: msg, unreadCount: isActive ? 0 : c.unreadCount + 1, updatedAt: msg.createdAt }
            : c,
        );
        // 把最新消息的会话置顶
        const idx = updated.findIndex((c) => c.id === msg.conversationId);
        if (idx > 0) {
          const [item] = updated.splice(idx, 1);
          updated.unshift(item);
        }
        return updated;
      });
    } else if (wsMsg.type === 'chat:recall') {
      const { messageId } = wsMsg.payload;
      setMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, isRecalled: true, content: '消息已撤回' } : m),
      );
    } else if (wsMsg.type === 'chat:read') {
      // 可在此处理已读回执 UI（暂留）
    }
  }, [activeConvId]);

  useWebSocket(handleWsMessage);

  // ─── 键盘发送 ──────────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const filteredConvs = conversations.filter((c) => {
    if (!convSearch) return true;
    const name = c.type === 'direct' ? (c.targetUser?.nickname ?? '') : (c.name ?? '');
    return name.toLowerCase().includes(convSearch.toLowerCase());
  });

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', minHeight: 500, border: '1px solid var(--semi-color-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--semi-color-bg-0)' }}>

      {/* ── 左侧会话列表 ── */}
      <div style={{ width: 280, borderRight: '1px solid var(--semi-color-border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* 头部 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--semi-color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge count={totalUnread} overflowCount={99} style={{ flex: 1 }}>
            <Title heading={6} style={{ margin: 0 }}>消息</Title>
          </Badge>
          <Tooltip content="新建聊天">
            <Button
              size="small" theme="borderless" type="primary"
              icon={<MessageSquarePlus size={16} />}
              onClick={() => setShowNewChat((v) => !v)}
            />
          </Tooltip>
        </div>

        {/* 新建聊天面板 */}
        {showNewChat && (
          <div style={{ borderBottom: '1px solid var(--semi-color-border)' }}>
            <NewChatPanel onSelect={handleNewChat} onClose={() => setShowNewChat(false)} />
          </div>
        )}

        {/* 搜索 */}
        <div style={{ padding: '8px 12px' }}>
          <Input
            prefix={<Search size={13} />}
            placeholder="搜索会话"
            size="small"
            value={convSearch}
            onChange={setConvSearch}
          />
        </div>

        {/* 会话列表 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Spin spinning={loadingConvs}>
            {filteredConvs.length === 0 && !loadingConvs && (
              <Empty description="暂无会话" style={{ padding: '40px 0' }} imageStyle={{ width: 80 }} />
            )}
            {filteredConvs.map((conv) => {
              const name = conv.type === 'direct' ? (conv.targetUser?.nickname ?? '未知用户') : (conv.name ?? '群聊');
              const avatarName = conv.type === 'direct' ? (conv.targetUser?.nickname ?? '?') : (conv.name ?? '?');
              const avatar = conv.type === 'direct' ? conv.targetUser?.avatar : null;
              const lastMsg = conv.lastMessage;
              const isActive = conv.id === activeConvId;
              let lastMsgText = '暂无消息';
              if (lastMsg) {
                lastMsgText = lastMsg.isRecalled ? '消息已撤回' : lastMsg.content;
              }

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => { void handleSelectConv(conv); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    cursor: 'pointer', width: '100%', textAlign: 'left', border: 'none',
                    background: isActive ? 'var(--semi-color-primary-light-default)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--semi-color-primary)' : '3px solid transparent',
                  }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--semi-color-fill-0)'; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <Badge count={conv.unreadCount} overflowCount={99} dot={false}>
                    <UserAvatar name={avatarName} avatar={avatar} size={38} />
                  </Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </Text>
                      {lastMsg && (
                        <Text type="tertiary" style={{ fontSize: 11, flexShrink: 0, marginLeft: 4 }}>
                          {lastMsg.createdAt.slice(5, 16)}
                        </Text>
                      )}
                    </div>
                    <Text type="tertiary" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                      {lastMsgText}
                    </Text>
                  </div>
                </button>
              );
            })}
          </Spin>
        </div>
      </div>

      {/* ── 右侧聊天区域 ── */}
      {activeConv ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* 标题栏 */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--semi-color-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeConv.type === 'direct' && activeConv.targetUser && (
              <UserAvatar name={activeConv.targetUser.nickname} avatar={activeConv.targetUser.avatar} size={32} />
            )}
            <Title heading={6} style={{ margin: 0 }}>
              {activeConv.type === 'direct' ? (activeConv.targetUser?.nickname ?? '未知用户') : (activeConv.name ?? '群聊')}
            </Title>
          </div>

          {/* 消息区域 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column' }}>
            {hasMore && (
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <Button
                  size="small" type="tertiary" theme="borderless" loading={loadingMsgs}
                  onClick={() => { if (activeConvId) void fetchMessages(activeConvId, page + 1); }}
                >
                  加载更多
                </Button>
              </div>
            )}
            <Spin spinning={loadingMsgs && messages.length === 0}>
              {messages.length === 0 && !loadingMsgs && (
                <Empty description="发送第一条消息吧" style={{ margin: 'auto' }} imageStyle={{ width: 80 }} />
              )}
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isSelf={msg.senderId === currentUserId}
                  onReply={setReplyTo}
                  onRecall={handleRecall}
                />
              ))}
              <div ref={messagesEndRef} />
            </Spin>
          </div>

          {/* 输入框 */}
          <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--semi-color-border)' }}>
            {replyTo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '4px 10px', background: 'var(--semi-color-fill-0)', borderRadius: 6, fontSize: 12, color: 'var(--semi-color-text-2)' }}>
                <CornerDownLeft size={12} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  回复 {replyTo.senderName}：{replyTo.content}
                </span>
                <Button size="small" theme="borderless" type="tertiary" onClick={() => setReplyTo(null)} style={{ padding: '0 4px', height: 'auto', minWidth: 'auto' }}>✕</Button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                rows={3}
                style={{
                  flex: 1, resize: 'none', borderRadius: 8, padding: '8px 12px',
                  border: '1px solid var(--semi-color-border)',
                  background: 'var(--semi-color-bg-0)',
                  color: 'var(--semi-color-text-0)',
                  fontSize: 14, fontFamily: 'inherit', outline: 'none',
                  lineHeight: 1.5,
                }}
              />
              <Button
                theme="solid" type="primary"
                icon={<Send size={14} />}
                loading={sending}
                disabled={!input.trim()}
                onClick={() => { void handleSend(); }}
                style={{ height: 74, paddingLeft: 12, paddingRight: 12 }}
              />
            </div>
            <Text type="tertiary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Enter 发送 · Shift+Enter 换行</Text>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--semi-color-text-2)' }}>
          <Empty
            description={<span>选择一个会话开始聊天，<br />或点击右上角「+」新建</span>}
            imageStyle={{ width: 100 }}
          />
        </div>
      )}
    </div>
  );
}
