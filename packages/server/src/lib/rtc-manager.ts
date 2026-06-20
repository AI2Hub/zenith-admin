/**
 * WebRTC 群通话房间管理（内存）
 *
 * WebSocket 仅做信令中继，房间状态用于：
 * - 新成员加入群通话时，告知其当前已在房间内的成员（以便发起 mesh 连接）
 * - 用户断线时自动离开所有房间并通知其余成员
 *
 * 单进程内存方案；多实例部署需改造为共享存储（与 ws-manager 同等约束）。
 */
import type { RtcPeerInfo } from '@zenith/shared';

// callId → (userId → RtcPeerInfo)
const rooms = new Map<string, Map<number, RtcPeerInfo>>();
// userId → Set<callId>（断线时快速定位需清理的房间）
const userRooms = new Map<number, Set<string>>();

/** 加入房间，返回加入前已在房间内的其他成员 */
export function joinRoom(callId: string, peer: RtcPeerInfo): RtcPeerInfo[] {
  let room = rooms.get(callId);
  if (!room) {
    room = new Map();
    rooms.set(callId, room);
  }
  const existing = [...room.values()].filter((p) => p.userId !== peer.userId);
  room.set(peer.userId, peer);

  let set = userRooms.get(peer.userId);
  if (!set) {
    set = new Set();
    userRooms.set(peer.userId, set);
  }
  set.add(callId);

  return existing;
}

/** 离开房间，返回剩余成员的 userId 列表（供通知） */
export function leaveRoom(callId: string, userId: number): number[] {
  const room = rooms.get(callId);
  const set = userRooms.get(userId);
  if (set) {
    set.delete(callId);
    if (set.size === 0) userRooms.delete(userId);
  }
  if (!room) return [];
  room.delete(userId);
  if (room.size === 0) {
    rooms.delete(callId);
    return [];
  }
  return [...room.keys()];
}

/** 用户断线：离开其所有房间，返回 [{ callId, remaining: userId[] }] 供通知 */
export function leaveAllRooms(userId: number): Array<{ callId: string; remaining: number[] }> {
  const set = userRooms.get(userId);
  if (!set) return [];
  const result: Array<{ callId: string; remaining: number[] }> = [];
  for (const callId of [...set]) {
    const remaining = leaveRoom(callId, userId);
    result.push({ callId, remaining });
  }
  return result;
}

/** 房间当前成员数 */
export function getRoomSize(callId: string): number {
  return rooms.get(callId)?.size ?? 0;
}
