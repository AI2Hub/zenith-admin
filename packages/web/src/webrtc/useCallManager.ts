import { useSyncExternalStore } from 'react';
import { callManager, type CallSnapshot } from './callManager';

/** 订阅通话状态快照 */
export function useCallManager(): CallSnapshot {
  return useSyncExternalStore(callManager.subscribe, callManager.getSnapshot, callManager.getSnapshot);
}

export { callManager };
