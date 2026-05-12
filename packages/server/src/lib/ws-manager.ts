import type { WSContext } from 'hono/ws';
import type { WsMessage } from '@zenith/shared';

// tokenId → WSContext (precise single-session targeting)
const tokenConnections = new Map<string, WSContext>();
// userId → Set<tokenId> (for broadcast to all sessions of a user)
const userTokens = new Map<number, Set<string>>();

export function registerConnection(userId: number, tokenId: string, ws: WSContext) {
  tokenConnections.set(tokenId, ws);
  let set = userTokens.get(userId);
  if (!set) {
    set = new Set();
    userTokens.set(userId, set);
  }
  set.add(tokenId);
}

export function removeConnection(userId: number, tokenId: string) {
  tokenConnections.delete(tokenId);
  const set = userTokens.get(userId);
  if (set) {
    set.delete(tokenId);
    if (set.size === 0) userTokens.delete(userId);
  }
}

/** Send a message to the specific session identified by tokenId */
export function sendToToken(tokenId: string, message: WsMessage) {
  const ws = tokenConnections.get(tokenId);
  if (!ws) return;
  try {
    ws.send(JSON.stringify(message));
  } catch { /* connection may be stale */ }
}

/** Send a message to all connections of a specific user */
export function sendToUser(userId: number, message: WsMessage) {
  const set = userTokens.get(userId);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const tokenId of set) {
    const ws = tokenConnections.get(tokenId);
    if (!ws) continue;
    try {
      ws.send(data);
    } catch { /* connection may be stale */ }
  }
}

/** Broadcast a message to all connected users */
export function broadcast(message: WsMessage) {
  const data = JSON.stringify(message);
  for (const ws of tokenConnections.values()) {
    try {
      ws.send(data);
    } catch { /* ignore */ }
  }
}

/** Close the specific session's WebSocket connection */
export function closeTokenConnection(tokenId: string, reason?: string) {
  const ws = tokenConnections.get(tokenId);
  if (!ws) return;
  try {
    ws.close(1000, reason ?? 'force-logout');
  } catch { /* ignore */ }
  tokenConnections.delete(tokenId);
}

/** Close all WebSocket connections for a specific user (e.g. account disabled) */
export function closeUserConnections(userId: number, reason?: string) {
  const set = userTokens.get(userId);
  if (!set) return;
  for (const tokenId of set) {
    const ws = tokenConnections.get(tokenId);
    if (!ws) continue;
    try {
      ws.close(1000, reason ?? 'force-logout');
    } catch { /* ignore */ }
    tokenConnections.delete(tokenId);
  }
  userTokens.delete(userId);
}

/**
 * Defer WebSocket notifications to a list of users to the next I/O tick,
 * allowing the current HTTP response to flush before WS sends begin.
 */
export function scheduleSendToUsers(members: { userId: number }[], message: WsMessage): void {
  if (members.length === 0) return;
  setImmediate(() => {
    for (const { userId } of members) {
      sendToUser(userId, message);
    }
  });
}
