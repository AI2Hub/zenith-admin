import { useCallback, useMemo, useState } from 'react';

export type TreeRowKey = string | number;

/** 默认收集器可识别的节点：有 `id`，子节点挂在 `children` 上 */
export interface TreeExpansionNode {
  readonly id: TreeRowKey;
  readonly children?: readonly TreeExpansionNode[];
}

/** 深度优先收集树中全部节点 id（供「全部展开」使用） */
export function collectTreeKeys(nodes: readonly TreeExpansionNode[]): TreeRowKey[] {
  return nodes.flatMap((node) => [node.id, ...collectTreeKeys(node.children ?? [])]);
}

/**
 * 「当前是否已全部展开」判定，决定按钮显示「全部折叠」还是「全部展开」。
 *
 * 独立成纯函数是因为 Semi 的 Table 与 Tree 展开 API 并不通用
 * （`expandedRowKeys` / `onExpandedRowsChange` vs `expandedKeys` / `onExpand`，且后者只收 `string[]`），
 * 两边各自持有状态，但这条判定必须一致。
 *
 * `allKeys` 为空时一律返回 false：否则数据清空（筛选无结果 / 尚未加载）后，
 * 残留的旧展开 key 会让空树显示「全部折叠」。
 */
export function isAllKeysExpanded(
  expandedKeys: readonly unknown[],
  allKeys: readonly unknown[],
): boolean {
  return allKeys.length > 0 && expandedKeys.length >= allKeys.length;
}

function defaultRowKey(row: unknown): TreeRowKey | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const { id } = row as { id?: unknown };
  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
}

export interface UseTreeExpansionOptions<T> {
  /**
   * 覆盖「全部展开」要写入的 key 集合。
   * 只有部分行可展开（如分组表只有分组行有子行）或 key 不是 `id` 时才需要传。
   */
  readonly collectKeys?: (nodes: readonly T[]) => TreeRowKey[];
  /**
   * 从 `onExpandedRowsChange` 回传的行中取 key；返回 `undefined` 的行会被忽略。
   * 默认读 `id`，因此叶子行、分隔行等没有 `id` 的记录会被自动过滤掉。
   */
  readonly getRowKey?: (row: unknown) => TreeRowKey | undefined;
}

export interface UseTreeExpansionReturn {
  /** 绑定到表格的 `expandedRowKeys` */
  readonly expandedRowKeys: TreeRowKey[];
  /** 需要在 effect 中改写展开态时使用（首次加载全展开、筛选后展开命中项等） */
  readonly setExpandedRowKeys: React.Dispatch<React.SetStateAction<TreeRowKey[]>>;
  /** 当前数据的全部可展开 key；为空时通常隐藏展开按钮 */
  readonly allRowKeys: TreeRowKey[];
  readonly isAllExpanded: boolean;
  readonly toggleExpandAll: () => void;
  /** 直接绑定到表格的 `onExpandedRowsChange` */
  readonly onExpandedRowsChange: (rows?: readonly unknown[]) => void;
}

/**
 * 树形表格的「全部展开 / 全部折叠」状态。
 *
 * 统一维护受控 `expandedRowKeys`、递归收集全部节点 key、`isAllExpanded` 判定，
 * 以及 `onExpandedRowsChange` 的行→key 映射。
 *
 * 必须传表格实际渲染的数据；未筛选的原始树会使 `isAllExpanded` 与可见行数不符，
 * 导致「全部展开」按钮状态错误、点击无变化。
 *
 * @example
 * const { expandedRowKeys, isAllExpanded, toggleExpandAll, onExpandedRowsChange }
 *   = useTreeExpansion(filteredData);
 */
export function useTreeExpansion<T extends TreeExpansionNode>(
  data: readonly T[],
  options?: UseTreeExpansionOptions<T>,
): UseTreeExpansionReturn;
export function useTreeExpansion<T>(
  data: readonly T[],
  options: UseTreeExpansionOptions<T> & { readonly collectKeys: (nodes: readonly T[]) => TreeRowKey[] },
): UseTreeExpansionReturn;
export function useTreeExpansion<T>(
  data: readonly T[],
  options?: UseTreeExpansionOptions<T>,
): UseTreeExpansionReturn {
  const collectKeys = options?.collectKeys;
  const getRowKey = options?.getRowKey;
  const [expandedRowKeys, setExpandedRowKeys] = useState<TreeRowKey[]>([]);

  const allRowKeys = useMemo(
    () => (collectKeys
      ? collectKeys(data)
      : collectTreeKeys(data as readonly TreeExpansionNode[])),
    [data, collectKeys],
  );

  // 无可展开行时一律视为「未全部展开」：否则数据清空（筛选无结果）后，
  // 残留的旧展开 key 会让空表格显示「全部折叠」
  const isAllExpanded = isAllKeysExpanded(expandedRowKeys, allRowKeys);

  const toggleExpandAll = useCallback(() => {
    setExpandedRowKeys(isAllExpanded ? [] : allRowKeys);
  }, [isAllExpanded, allRowKeys]);

  const onExpandedRowsChange = useCallback((rows?: readonly unknown[]) => {
    const extract = getRowKey ?? defaultRowKey;
    setExpandedRowKeys(
      (rows ?? []).map(extract).filter((key): key is TreeRowKey => key !== undefined),
    );
  }, [getRowKey]);

  return {
    expandedRowKeys,
    setExpandedRowKeys,
    allRowKeys,
    isAllExpanded,
    toggleExpandAll,
    onExpandedRowsChange,
  };
}
