import { useSyncExternalStore } from 'react';
import { isPinyinReady, subscribePinyinReady } from '@/utils/pinyin';

const serverSnapshot = () => false;

/**
 * 拼音词典是否就绪。挂载即触发加载；就绪瞬间组件重渲染，
 * 让已输入关键字的搜索结果从「仅子串匹配」补齐为「子串 + 拼音匹配」。
 * 把返回值放进过滤 useMemo 的依赖里即可。
 */
export function usePinyinReady(): boolean {
  return useSyncExternalStore(subscribePinyinReady, isPinyinReady, serverSnapshot);
}
