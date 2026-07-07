import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { verifyToken } from '../../lib/jwt';
import type { JwtPayload } from '../../middleware/auth';
import { isTokenBlacklisted } from '../../lib/session-manager';
import { registerConnection, removeConnection, sendToUser, incWsRecv } from '../../lib/ws-manager';
import { joinRoom, leaveAllRooms } from '../../lib/rtc-manager';
import { getConversationMemberIds } from '../../lib/chat-member-cache';
import type { WsMessage } from '@zenith/shared';

/** 转发给会话内其他成员（成员列表走短 TTL 缓存，避免 typing 等高频事件反复查库） */
async function relayToConversation(conversationId: number, senderId: number, msg: WsMessage): Promise<void> {
  const memberIds = await getConversationMemberIds(conversationId);
  for (const userId of memberIds) {
    if (userId !== senderId) sendToUser(userId, msg);
  }
}

const RTC_TYPES = new Set([
  'rtc:invite', 'rtc:accept', 'rtc:reject', 'rtc:busy', 'rtc:cancel',
  'rtc:leave', 'rtc:offer', 'rtc:answer', 'rtc:ice',
]);

/** 处理 WebRTC 信令中继：定向(payload.to) 优先，否则按会话广播 */
async function handleRtcSignal(senderId: number, msg: WsMessage): Promise<void> {
  // 群通话加入：登记房间并把现有成员回送给加入者
  if (msg.type === 'rtc:join') {
    const existing = joinRoom(msg.payload.callId, msg.payload.from);
    sendToUser(senderId, { type: 'rtc:room-participants', payload: { callId: msg.payload.callId, participants: existing } });
    return;
  }
  if (!RTC_TYPES.has(msg.type)) return;
  const payload = msg.payload as { to?: number; conversationId?: number };
  if (typeof payload.to === 'number') {
    sendToUser(payload.to, msg);
  } else if (typeof payload.conversationId === 'number') {
    await relayToConversation(payload.conversationId, senderId, msg);
  }
}

/**
 * Create the WebSocket route.
 * Requires `upgradeWebSocket` from `createNodeWebSocket`.
 */
export function createWsRoute(upgradeWebSocket: UpgradeWebSocket) {
  const wsApp = new Hono();

  wsApp.get(
    '/',
    upgradeWebSocket(async (c) => {
      const token = c.req.query('token');
      let payload: JwtPayload | null = null;

      if (token) {
        try {
          payload = await verifyToken<JwtPayload>(token);
        } catch {
          payload = null;
        }
      }

      return {
        onOpen(_evt, ws) {
          if (!payload) {
            ws.close(4001, 'Unauthorized');
            return;
          }
          const currentPayload = payload;
          // Check blacklist asynchronously, then register or close
          isTokenBlacklisted(currentPayload.jti ?? '').then((blacklisted) => {
            if (blacklisted) {
              ws.close(4001, 'Session revoked');
              return;
            }
            registerConnection(currentPayload.userId, currentPayload.jti ?? '', ws);
          }).catch(() => {
            // On Redis error, allow connection (fail-open for WebSocket)
            registerConnection(currentPayload.userId, currentPayload.jti ?? '', ws);
          });
        },
        async onMessage(evt, ws) {
          if (!payload) return;
          incWsRecv(payload.jti ?? '');
          try {
            const data: unknown = typeof evt.data === 'string' ? JSON.parse(evt.data) : null;
            const msg = data as WsMessage | { type: 'ping' };
            // 心跳：收到 ping 立即回 pong，维持 WebSocket 连接活性
            if (msg?.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
              return;
            }
            if (msg?.type === 'chat:typing') {
              await relayToConversation(msg.payload.conversationId, payload.userId, msg);
              return;
            }
            if (typeof msg?.type === 'string' && msg.type.startsWith('rtc:')) {
              await handleRtcSignal(payload.userId, msg as WsMessage);
            }
          } catch { /* ignore malformed */ }
        },
        onClose(evt, _ws) {
          if (payload) {
            // 断线：离开所有群通话房间并通知其余成员
            const left = leaveAllRooms(payload.userId);
            for (const { callId, remaining } of left) {
              for (const userId of remaining) {
                sendToUser(userId, { type: 'rtc:leave', payload: { callId, conversationId: 0, from: payload.userId, to: userId } });
              }
            }
            const reason = evt && typeof evt === 'object' && 'reason' in evt && typeof (evt as { reason: unknown }).reason === 'string'
              ? ((evt as { reason: string }).reason || 'close')
              : 'close';
            removeConnection(payload.userId, payload.jti ?? '', reason);
          }
        },
        onError() {
          // handled by node-ws internally
        },
      };
    }),
  );

  return wsApp;
}
