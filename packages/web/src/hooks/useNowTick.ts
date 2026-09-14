import { useSyncExternalStore } from 'react';

/**
 * 共享的「当前时刻」节拍：所有相对时间文本订阅同一个 30 秒定时器，而不是每个单元格各起一个。
 * 快照是按 30 秒对齐的时间戳——同一窗口内多次读取值相同（满足 useSyncExternalStore 的缓存要求），
 * 跨窗口才触发订阅组件重渲染；无订阅者时定时器停止。
 */
const TICK_MS = 30_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = setInterval(() => listeners.forEach((notify) => notify()), TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot() {
  return Math.floor(Date.now() / TICK_MS) * TICK_MS;
}

/** 按 30 秒对齐的当前时间戳；仅相对时间文本使用，绝对时间不订阅 */
export function useNowTick(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
