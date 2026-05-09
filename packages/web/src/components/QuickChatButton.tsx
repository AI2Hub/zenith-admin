import { useState, useEffect, useCallback, useRef } from 'react';
import { FloatButton, Typography, Spin, Empty, Input, Button, Badge, Toast } from '@douyinfe/semi-ui';
import { MessageCircle, ArrowLeft, ExternalLink, Send, X, ImagePlus, Paperclip } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';
import { request } from '@/utils/request';
import { formatConvTime } from '@/utils/date';
import { getMessageSummary, getFileExtension, getImageDimensions } from '@/pages/chat/utils';
import type { ChatConversation, ChatMessage, WsMessage, ChatAssetMeta } from '@zenith/shared';
import { UserAvatar, GroupGridAvatar } from '@/pages/chat/components/UserAvatar';

const { Text } = Typography;

export default function QuickChatButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0);

  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true);
    const res = await request.get<ChatConversation[]>('/api/chat/conversations', { silent: true });
    setLoadingConvs(false);
    if (res.code === 0 && res.data) setConversations(res.data);
  }, []);

  const fetchMessages = useCallback(async (convId: number) => {
    setLoadingMsgs(true);
    const res = await request.get<{ list: ChatMessage[]; total: number }>(
      `/api/chat/conversations/${convId}/messages?page=1&pageSize=30`,
      { silent: true },
    );
    setLoadingMsgs(false);
    if (res.code === 0 && res.data) setMessages([...res.data.list].reverse());
  }, []);

  const markRead = useCallback((convId: number) => {
    request.post(`/api/chat/conversations/${convId}/read`, {}, { silent: true }).catch(() => {});
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)));
  }, []);

  // 打开时加载会话列表
  useEffect(() => {
    if (open) void fetchConversations();
  }, [open, fetchConversations]);

  // 选中会话时加载消息
  useEffect(() => {
    if (activeConvId) {
      void fetchMessages(activeConvId);
      markRead(activeConvId);
    } else {
      setMessages([]);
      setInput('');
    }
  }, [activeConvId, fetchMessages, markRead]);

  // 消息变化时滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [messages]);

  const activeConvIdRef = useRef(activeConvId);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  const handleWsMessage = useCallback((wsMsg: WsMessage) => {
    if (wsMsg.type === 'chat:message') {
      const msg = wsMsg.payload;
      const curConvId = activeConvIdRef.current;
      const isCurrentConv = msg.conversationId === curConvId;
      const isOwnMsg = msg.senderId === currentUserId;

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === msg.conversationId);
        if (idx < 0) return prev;
        const updated = [...prev];
        const prevUnread = updated[idx].unreadCount ?? 0;
        const addUnread = isOwnMsg ? 0 : 1;
        updated[idx] = {
          ...updated[idx],
          lastMessage: msg,
          unreadCount: isCurrentConv ? 0 : prevUnread + addUnread,
        };
        // 置顶会话保持在前，非置顶按时间排序
        return updated.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          const ta = a.lastMessage?.createdAt ?? a.createdAt;
          const tb = b.lastMessage?.createdAt ?? b.createdAt;
          return tb.localeCompare(ta);
        });
      });

      if (isCurrentConv) {
        setMessages((prev) => [...prev, msg]);
        if (!isOwnMsg) markRead(msg.conversationId);
      }
    } else if (wsMsg.type === 'chat:recall') {
      const { messageId, conversationId } = wsMsg.payload;
      if (conversationId === activeConvIdRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, isRecalled: true, content: '消息已撤回' } : m)),
        );
      }
    } else if (wsMsg.type === 'chat:edit') {
      const edited = wsMsg.payload;
      if (edited.conversationId === activeConvIdRef.current) {
        setMessages((prev) => prev.map((m) => (m.id === edited.id ? edited : m)));
      }
    }
  }, [currentUserId, markRead]);

  useWebSocket(handleWsMessage);

  const handleSend = useCallback(async () => {
    if (!activeConvId || !input.trim() || sending) return;
    const content = input.trim();
    setInput('');
    setSending(true);
    const res = await request.post<ChatMessage>(
      `/api/chat/conversations/${activeConvId}/messages`,
      { content, type: 'text' },
    );
    setSending(false);
    if (res.code === 0 && res.data) {
      setMessages((prev) => [...prev, res.data!]);
    }
  }, [activeConvId, input, sending]);

  const sendImageMessage = useCallback(async (file: File) => {
    if (!activeConvId) return;
    setUploading(true);
    try {
      const dimensions = await getImageDimensions(file);
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await request.postForm<{ url: string; originalName: string; size: number }>('/api/files/upload-one', fd);
      if (uploadRes.code !== 0 || !uploadRes.data) { Toast.error('图片上传失败'); return; }
      const { url, originalName, size } = uploadRes.data;
      const asset: ChatAssetMeta = {
        kind: 'image', name: originalName, size,
        mimeType: file.type || null, extension: getFileExtension(originalName),
        width: dimensions?.width ?? null, height: dimensions?.height ?? null, thumbnailUrl: url,
      };
      const res = await request.post<ChatMessage>(
        `/api/chat/conversations/${activeConvId}/messages`,
        { content: url, type: 'image', extra: { asset } },
      );
      if (res.code === 0 && res.data) setMessages((prev) => [...prev, res.data!]);
    } finally {
      setUploading(false);
    }
  }, [activeConvId]);

  const sendFileMessage = useCallback(async (file: File) => {
    if (!activeConvId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await request.postForm<{ url: string; originalName: string; size: number }>('/api/files/upload-one', fd);
      if (uploadRes.code !== 0 || !uploadRes.data) { Toast.error('文件上传失败'); return; }
      const { url, originalName, size } = uploadRes.data;
      const asset: ChatAssetMeta = {
        kind: 'file', name: originalName, size,
        mimeType: file.type || null, extension: getFileExtension(originalName),
      };
      const res = await request.post<ChatMessage>(
        `/api/chat/conversations/${activeConvId}/messages`,
        { content: url, type: 'file', extra: { asset } },
      );
      if (res.code === 0 && res.data) setMessages((prev) => [...prev, res.data!]);
    } finally {
      setUploading(false);
    }
  }, [activeConvId]);

  // 在聊天页隐藏
  if (location.pathname.startsWith('/chat')) return null;

  const activeConv = conversations.find((c) => c.id === activeConvId);
  let convTitle = '消息';
  if (activeConv) {
    convTitle = activeConv.type === 'direct'
      ? (activeConv.targetUser?.nickname ?? '对话')
      : (activeConv.name ?? '群聊');
  }

  return (
    <>
      <FloatButton
        icon={<MessageCircle size={20} />}
        badge={totalUnread > 0 ? { count: totalUnread, overflowCount: 99 } : undefined}
        onClick={() => setOpen((prev) => !prev)}
        style={{ insetInlineEnd: 24, bottom: 24, position: 'fixed', zIndex: 999 }}
        shape="circle"
      />

      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 88,
            right: 24,
            width: 360,
            height: 520,
            background: 'var(--semi-color-bg-0)',
            border: '1px solid var(--semi-color-border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1001,
            overflow: 'hidden',
          }}
        >
          {/* ─── Header ─── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 14px',
              borderBottom: '1px solid var(--semi-color-border)',
              gap: 8,
              flexShrink: 0,
            }}
          >
            {Boolean(activeConvId) && (
              <button
                type="button"
                title="返回"
                onClick={() => setActiveConvId(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 4, display: 'flex', alignItems: 'center',
                  borderRadius: 6, color: 'var(--semi-color-text-1)',
                }}
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <Text strong style={{ flex: 1, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {convTitle}
            </Text>
            <button
              type="button"
              title="前往聊天页"
              onClick={() => { navigate('/chat'); setOpen(false); setActiveConvId(null); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 4, display: 'flex', alignItems: 'center',
                borderRadius: 6, color: 'var(--semi-color-text-2)',
              }}
            >
              <ExternalLink size={15} />
            </button>
            <button
              type="button"
              title="关闭"
              onClick={() => { setOpen(false); setActiveConvId(null); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 4, display: 'flex', alignItems: 'center',
                borderRadius: 6, color: 'var(--semi-color-text-2)',
              }}
            >
              <X size={15} />
            </button>
          </div>

          {activeConvId ? (
            /* ─── 聊天视图 ─── */
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Spin spinning={loadingMsgs}>
                  {messages.length === 0 && !loadingMsgs && (
                    <Empty description="暂无消息" style={{ padding: '40px 0' }} imageStyle={{ width: 64 }} />
                  )}
                  {messages.map((msg) => {
                    const isSelf = msg.senderId === currentUserId;
                    const content = getMessageSummary(msg);
                    const isSystem = msg.type === 'system';

                    if (isSystem) {
                      return (
                        <div key={msg.id} style={{ textAlign: 'center', margin: '4px 0' }}>
                          <Text type="tertiary" style={{ fontSize: 11 }}>{content}</Text>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        style={{ display: 'flex', justifyContent: isSelf ? 'flex-end' : 'flex-start', gap: 6, alignItems: 'flex-end' }}
                      >
                        {!isSelf && (
                          <div style={{ flexShrink: 0 }}>
                            <UserAvatar name={msg.senderName ?? '?'} avatar={msg.senderAvatar ?? null} size={28} />
                          </div>
                        )}
                        <div
                          style={{
                            maxWidth: '72%',
                            padding: '7px 11px',
                            borderRadius: isSelf ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                            background: isSelf ? 'var(--semi-color-primary)' : 'var(--semi-color-fill-1)',
                            color: isSelf ? '#fff' : 'var(--semi-color-text-0)',
                            fontSize: 13,
                            lineHeight: 1.5,
                            wordBreak: 'break-word',
                          }}
                        >
                          {content}
                        </div>
                        {isSelf && (
                          <div style={{ flexShrink: 0 }}>
                            <UserAvatar name={user?.nickname ?? '?'} avatar={user?.avatar ?? null} size={28} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </Spin>
              </div>

              {/* ─── 输入框 ─── */}
              <div
                style={{
                  padding: '8px 12px',
                  borderTop: '1px solid var(--semi-color-border)',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                {/* 隐藏文件输入 */}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void sendImageMessage(file);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void sendFileMessage(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  title="发送图片"
                  disabled={uploading}
                  onClick={() => imageInputRef.current?.click()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: 'var(--semi-color-text-2)', borderRadius: 6 }}
                >
                  <ImagePlus size={16} />
                </button>
                <button
                  type="button"
                  title="发送文件"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: 'var(--semi-color-text-2)', borderRadius: 6 }}
                >
                  <Paperclip size={16} />
                </button>
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(v) => setInput(v)}
                  placeholder="发送消息... (Enter 发送)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  style={{ flex: 1 }}
                  size="small"
                />
                <Button
                  type="primary"
                  size="small"
                  icon={<Send size={14} />}
                  loading={sending || uploading}
                  onClick={() => void handleSend()}
                  disabled={!input.trim()}
                />
              </div>
            </>
          ) : (
            /* ─── 会话列表 ─── */
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <Spin spinning={loadingConvs}>
                {conversations.length === 0 && !loadingConvs && (
                  <Empty description="暂无会话" style={{ padding: '40px 0' }} imageStyle={{ width: 64 }} />
                )}
                {conversations.map((conv) => {
                  const name = conv.type === 'direct' ? (conv.targetUser?.nickname ?? '未知用户') : (conv.name ?? '群聊');
                  const avatarName = conv.type === 'direct' ? (conv.targetUser?.nickname ?? '?') : (conv.name ?? '?');
                  const avatar = conv.type === 'direct' ? conv.targetUser?.avatar : null;
                  const lastMsg = conv.lastMessage;
                  let lastMsgText = '暂无消息';
                  if (lastMsg) {
                    const summary = getMessageSummary(lastMsg);
                    if (conv.type === 'group' && lastMsg.senderName && lastMsg.type !== 'system' && !lastMsg.isRecalled) {
                      lastMsgText = `${lastMsg.senderName}：${summary}`;
                    } else {
                      lastMsgText = summary;
                    }
                  }
                  const avatarNode = conv.type === 'group'
                    ? <GroupGridAvatar name={avatarName} size={38} />
                    : <UserAvatar name={avatarName} avatar={avatar} size={38} />;

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setActiveConvId(conv.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 16px', cursor: 'pointer',
                        width: '100%', textAlign: 'left', border: 'none',
                        background: 'transparent', transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget).style.background = 'var(--semi-color-fill-0)'; }}
                      onMouseLeave={(e) => { (e.currentTarget).style.background = 'transparent'; }}
                    >
                      {conv.unreadCount > 0 ? (
                        <Badge count={conv.unreadCount} overflowCount={99}>{avatarNode}</Badge>
                      ) : avatarNode}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text
                            strong
                            style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
                          >
                            {name}
                          </Text>
                          {lastMsg && (
                            <Text type="tertiary" style={{ fontSize: 11, flexShrink: 0, marginLeft: 4 }}>
                              {formatConvTime(lastMsg.createdAt)}
                            </Text>
                          )}
                        </div>
                        <Text
                          type="tertiary"
                          style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                        >
                          {lastMsgText}
                        </Text>
                      </div>
                    </button>
                  );
                })}
              </Spin>
            </div>
          )}
        </div>
      )}
    </>
  );
}
