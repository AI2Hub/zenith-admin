import type { MpBroadcast } from '@zenith/shared';
import { SEED_MP_BROADCASTS } from '@zenith/shared';

export const mockMpBroadcasts: MpBroadcast[] = SEED_MP_BROADCASTS.map((b) => ({ ...b }));

let nextId = Math.max(0, ...mockMpBroadcasts.map((b) => b.id)) + 1;
export function getNextMpBroadcastId() {
  return nextId++;
}
