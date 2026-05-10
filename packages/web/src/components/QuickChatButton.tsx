import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FloatButton, Spin } from '@douyinfe/semi-ui';
import { MessageCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ChatConversation, WsMessage } from '@zenith/shared';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { request } from '@/utils/request';

const QuickChatPanel = lazy(() => import('@/pages/chat/ChatPage'));

export default function QuickChatButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const floatBtnRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    const res = await request.get<ChatConversation[]>('/api/chat/conversations', { silent: true });
    if (res.code === 0 && res.data) {
      setUnreadCount(res.data.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0));
    }
  }, []);

  useEffect(() => {
    void fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || floatBtnRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (location.pathname.startsWith('/chat')) setOpen(false);
  }, [location.pathname]);

  const handleWsMessage = useCallback((wsMsg: WsMessage) => {
    if (location.pathname.startsWith('/chat')) return;

    if (wsMsg.type === 'chat:message') {
      if (open || wsMsg.payload.senderId === currentUserId) return;
      setUnreadCount((count) => count + 1);
      return;
    }

    if (wsMsg.type === 'chat:read' && wsMsg.payload.userId === currentUserId) {
      void fetchUnreadCount();
    }
  }, [currentUserId, fetchUnreadCount, location.pathname, open]);

  useWebSocket(handleWsMessage);

  const handleOpenFullPage = useCallback(() => {
    setOpen(false);
    navigate('/chat');
  }, [navigate]);

  if (location.pathname.startsWith('/chat')) return null;

  return (
    <>
      <style>{`
        @keyframes qc-slide-in {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
      <div ref={floatBtnRef} style={{ position: 'fixed', insetInlineEnd: 24, bottom: 24, zIndex: 999 }}>
        <FloatButton
          icon={<MessageCircle size={20} />}
          badge={unreadCount > 0 ? { count: unreadCount, overflowCount: 99 } : undefined}
          onClick={() => setOpen((prev) => !prev)}
          shape="round"
        />
      </div>

      {open && (
        <div
          ref={panelRef}
          style={{
            animation: 'qc-slide-in 0.18s ease-out',
            position: 'fixed',
            bottom: 88,
            right: 24,
            width: 'min(420px, calc(100vw - 32px))',
            height: 'min(640px, calc(100vh - 120px))',
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
          <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>}>
            <QuickChatPanel
              variant="quick"
              onClose={() => setOpen(false)}
              onOpenFullPage={handleOpenFullPage}
              onUnreadChange={setUnreadCount}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}
