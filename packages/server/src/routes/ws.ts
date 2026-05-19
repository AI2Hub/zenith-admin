import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import { verifyToken } from '../lib/jwt';
import type { JwtPayload } from '../middleware/auth';
import { isTokenBlacklisted } from '../lib/session-manager';
import { registerConnection, removeConnection, sendToUser, incWsRecv } from '../lib/ws-manager';
import { db } from '../db';
import { chatConversationMembers } from '../db/schema';
import { eq, ne, and } from 'drizzle-orm';
import type { WsMessage } from '@zenith/shared';

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
              const { conversationId } = msg.payload;
              // 转发给会话内其他成员
              const members = await db
                .select({ userId: chatConversationMembers.userId })
                .from(chatConversationMembers)
                .where(and(
                  eq(chatConversationMembers.conversationId, conversationId),
                  ne(chatConversationMembers.userId, payload.userId),
                ));
              for (const { userId } of members) {
                sendToUser(userId, msg);
              }
            }
          } catch { /* ignore malformed */ }
        },
        onClose(evt, _ws) {
          if (payload) {
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
