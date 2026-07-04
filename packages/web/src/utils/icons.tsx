import type { LucideIcon } from 'lucide-react';
import React, { useSyncExternalStore } from 'react';

/**
 * lucide-react 动态图标注册表（异步加载）。
 *
 * 菜单图标按 DB 中的名称字符串动态渲染，需要全量图标表（~600KB raw）；
 * 通过动态 import 将其移出首屏关键路径：未就绪时 renderLucideIcon 返回 null
 * 并自动触发加载，需要"加载完成后重渲染补齐"的组件用 useLucideIconsReady() 订阅
 * （如 AdminLayout 的 navItems memo）。
 *
 * 页面里 `import { X } from 'lucide-react'` 的静态按需图标不受影响。
 */

type Registry = Record<string, LucideIcon>;

let registry: Registry | null = null;
let allNames: string[] = [];
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function isReactComponent(val: unknown): boolean {
  if (typeof val === 'function') return true;
  if (typeof val === 'object' && val !== null && '$$typeof' in val) return true;
  return false;
}

/** 触发（幂等）全量图标注册表加载 */
export function ensureLucideIcons(): Promise<void> {
  // 刻意从 CJS 构建产物加载（而非裸 'lucide-react'）：应用各处的静态按需导入
  // 解析到 ESM 入口并被摇树成小子集；若此处对同一 ESM 模块做命名空间动态导入，
  // 会强制保留全量导出，使首屏静态图中的 lucide chunk 膨胀回 ~600KB。
  // CJS 路径是独立模块实例，全量表只存在于本懒加载 chunk 中。
  // @ts-expect-error CJS 深路径无类型声明，运行时形状与 ESM 入口一致
  loadPromise ??= import('lucide-react/dist/cjs/lucide-react.js').then((mod) => {
    const LucideIcons = ((mod as Record<string, unknown>).default ?? mod) as Record<string, unknown>;
    // lucide-react 图标使用 React.forwardRef 封装，typeof 为 'object' 而非 'function'
    // 过滤规则：大写字母开头、不以 Icon 结尾（避免 ActivityIcon / Activity 重复）
    registry = Object.fromEntries(
      Object.entries(LucideIcons).filter(
        ([key, val]) =>
          /^[A-Z]/.test(key) &&
          !key.endsWith('Icon') &&
          key !== 'createLucideIcon' &&
          isReactComponent(val),
      ),
    ) as Registry;
    allNames = Object.keys(registry).sort((a, b) => a.localeCompare(b));
    listeners.forEach((l) => l());
  });
  return loadPromise;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** 注册表是否就绪；自动触发加载，加载完成后触发订阅组件重渲染 */
export function useLucideIconsReady(): boolean {
  void ensureLucideIcons();
  return useSyncExternalStore(subscribe, () => registry !== null, () => false);
}

/** 全部图标名（IconPicker 用）；未就绪时为空数组，就绪后自动重渲染 */
export function useAllIconNames(): string[] {
  useLucideIconsReady();
  return allNames;
}

/** 渲染指定名称的 lucide 图标；注册表未就绪（自动触发加载）或找不到时返回 null */
export function renderLucideIcon(name: string, size = 16): React.ReactElement | null {
  if (!registry) {
    void ensureLucideIcons();
    return null;
  }
  const Icon = registry[name];
  if (!Icon) return null;
  return React.createElement(Icon as React.ComponentType<{ size: number; strokeWidth?: number }>, { size, strokeWidth: 1.5 });
}
