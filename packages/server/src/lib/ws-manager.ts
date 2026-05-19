import type { WSContext } from 'hono/ws';
import type { WsMessage } from '@zenith/shared';

// tokenId → WSContext (precise single-session targeting)
const tokenConnections = new Map<string, WSContext>();
// userId → Set<tokenId> (for broadcast to all sessions of a user)
const userTokens = new Map<number, Set<string>>();

// ─── 监控指标 ──────────────────────────────────────────────────────────
interface ConnMeta {
  userId: number;
  connectedAt: number;
  lastActivityAt: number;
  sent: number;
  recv: number;
}
const connMeta = new Map<string, ConnMeta>();
const counters = { totalConnects: 0, totalDisconnects: 0, totalSent: 0, totalRecv: 0 };

export interface RecentDisconnect {
  tokenId: string;
  userId: number;
  at: number;
  reason: string;
  duration: number;
  sent: number;
  recv: number;
}
const recentDisconnects: RecentDisconnect[] = [];
const RECENT_DISCONNECT_MAX = 50;

function trySend(ws: WSContext, data: string, tokenId: string) {
  try {
    ws.send(data);
    counters.totalSent += 1;
    const m = connMeta.get(tokenId);
    if (m) {
      m.sent += 1;
      m.lastActivityAt = Date.now();
    }
  } catch { /* connection may be stale */ }
}

export function registerConnection(userId: number, tokenId: string, ws: WSContext) {
  tokenConnections.set(tokenId, ws);
  let set = userTokens.get(userId);
  if (!set) {
    set = new Set();
    userTokens.set(userId, set);
  }
  set.add(tokenId);
  const now = Date.now();
  connMeta.set(tokenId, { userId, connectedAt: now, lastActivityAt: now, sent: 0, recv: 0 });
  counters.totalConnects += 1;
}

export function removeConnection(userId: number, tokenId: string, reason = 'close') {
  tokenConnections.delete(tokenId);
  const set = userTokens.get(userId);
  if (set) {
    set.delete(tokenId);
    if (set.size === 0) userTokens.delete(userId);
  }
  const meta = connMeta.get(tokenId);
  if (meta) {
    counters.totalDisconnects += 1;
    const now = Date.now();
    recentDisconnects.unshift({
      tokenId,
      userId,
      at: now,
      reason,
      duration: now - meta.connectedAt,
      sent: meta.sent,
      recv: meta.recv,
    });
    if (recentDisconnects.length > RECENT_DISCONNECT_MAX) {
      recentDisconnects.length = RECENT_DISCONNECT_MAX;
    }
    connMeta.delete(tokenId);
  }
}

/** Increment recv counter for a token (called from WS onMessage). */
export function incWsRecv(tokenId: string) {
  counters.totalRecv += 1;
  const m = connMeta.get(tokenId);
  if (m) {
    m.recv += 1;
    m.lastActivityAt = Date.now();
  }
}

/** Send a message to the specific session identified by tokenId */
export function sendToToken(tokenId: string, message: WsMessage) {
  const ws = tokenConnections.get(tokenId);
  if (!ws) return;
  trySend(ws, JSON.stringify(message), tokenId);
}

/** Send a message to all connections of a specific user */
export function sendToUser(userId: number, message: WsMessage) {
  const set = userTokens.get(userId);
  if (!set) return;
  const data = JSON.stringify(message);
  for (const tokenId of set) {
    const ws = tokenConnections.get(tokenId);
    if (!ws) continue;
    trySend(ws, data, tokenId);
  }
}

/** Broadcast a message to all connected users */
export function broadcast(message: WsMessage) {
  const data = JSON.stringify(message);
  for (const [tokenId, ws] of tokenConnections) {
    trySend(ws, data, tokenId);
  }
}

/** Close the specific session's WebSocket connection */
export function closeTokenConnection(tokenId: string, reason?: string) {
  const ws = tokenConnections.get(tokenId);
  if (!ws) return;
  try {
    ws.close(1000, reason ?? 'force-logout');
  } catch { /* ignore */ }
  const meta = connMeta.get(tokenId);
  if (meta) {
    removeConnection(meta.userId, tokenId, reason ?? 'force-logout');
  } else {
    tokenConnections.delete(tokenId);
  }
}

/** Close all WebSocket connections for a specific user (e.g. account disabled) */
export function closeUserConnections(userId: number, reason?: string) {
  const set = userTokens.get(userId);
  if (!set) return;
  const tokenIds = [...set];
  for (const tokenId of tokenIds) {
    const ws = tokenConnections.get(tokenId);
    if (!ws) continue;
    try {
      ws.close(1000, reason ?? 'force-logout');
    } catch { /* ignore */ }
    removeConnection(userId, tokenId, reason ?? 'force-logout');
  }
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

// ─── 监控查询 ──────────────────────────────────────────────────────────
export interface WsConnectionSnapshot {
  tokenId: string;
  userId: number;
  connectedAt: number;
  lastActivityAt: number;
  sent: number;
  recv: number;
}

export function getWsSnapshot() {
  const connections: WsConnectionSnapshot[] = [];
  for (const [tokenId, m] of connMeta) {
    connections.push({
      tokenId,
      userId: m.userId,
      connectedAt: m.connectedAt,
      lastActivityAt: m.lastActivityAt,
      sent: m.sent,
      recv: m.recv,
    });
  }
  return {
    currentConnections: tokenConnections.size,
    currentUsers: userTokens.size,
    totalConnects: counters.totalConnects,
    totalDisconnects: counters.totalDisconnects,
    totalSent: counters.totalSent,
    totalRecv: counters.totalRecv,
    connections,
    recentDisconnects: [...recentDisconnects],
  };
}
