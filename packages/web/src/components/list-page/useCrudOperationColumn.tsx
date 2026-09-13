import type { ReactNode } from 'react';
import { createOperationColumn, type ResponsiveTableAction } from '@/components/ResponsiveTableActions';
import { usePermission } from '@/hooks/usePermission';
import { deleteAction } from './deleteAction';

type IdLike = number | string;

export interface CrudOperationColumnOptions<R extends { id: IdLike }> {
  /** 权限前缀（`workflow:datasource`）：编辑要求 `:update`，删除要求 `:delete`；不按约定时用 `permissions` 逐项指定 */
  readonly permission?: string;
  readonly permissions?: { readonly edit?: string; readonly remove?: string };
  /** 编辑：`useEditModal` 的返回（取其 `openEdit`）或回调；`false` = 无编辑动作 */
  readonly edit?: { readonly openEdit: (record: R) => void } | ((record: R) => void) | false;
  /** 删除：`useDelete()` 的 mutation（按 `[record.id]` 调用）或自定义执行函数；`false` = 无删除动作 */
  readonly remove?: { readonly mutateAsync: (ids: R['id'][]) => Promise<unknown> } | ((record: R) => Promise<unknown>) | false;
  /** 删除确认标题里的对象名：`(r) => r.name` → 「确定要删除「xxx」吗？」；缺省「确定要删除吗？」 */
  readonly label?: (record: R) => string;
  /** 删除确认的补充说明（级联影响等） */
  readonly content?: ReactNode | ((record: R) => ReactNode);
  /** 追加动作（测试 / 启停 / 复制…），排在编辑之前；已含 `hidden` 门控 */
  readonly extra?: (record: R) => ResponsiveTableAction[];
  /** 列宽；缺省按动作数估算（编辑 + 删除 150，每多一个内联动作 +60） */
  readonly width?: number;
  /** 桌面端内联的动作 key（≤ 3 个），其余进「更多」菜单；缺省全部内联 */
  readonly desktopInlineKeys?: string[];
  readonly editLabel?: ReactNode;
  readonly removeLabel?: ReactNode;
  readonly title?: ReactNode;
}

/**
 * 标准资源操作列：`[...extra, 编辑, 删除]`，权限门控、删除确认 + 执行 + 提示都按约定接好——
 * 页面只声明「用哪个弹窗编辑、用哪个 mutation 删、拿什么当对象名」。
 *
 * @example
 * const operationColumn = useCrudOperationColumn<Tag>({
 *   permission: 'system:tag',
 *   edit: tagModal,
 *   remove: deleteMutation,
 *   label: (r) => r.name,
 * });
 * const columns = [..., operationColumn];
 */
export function useCrudOperationColumn<R extends { id: IdLike }>(options: CrudOperationColumnOptions<R>) {
  const { hasPermission } = usePermission();
  const { permission, permissions, edit, remove, label, content, extra, width, desktopInlineKeys, editLabel, removeLabel, title } = options;
  const editPermission = permissions?.edit ?? (permission ? `${permission}:update` : undefined);
  const removePermission = permissions?.remove ?? (permission ? `${permission}:delete` : undefined);
  const canEdit = edit !== false && edit !== undefined && (!editPermission || hasPermission(editPermission));
  const canRemove = remove !== false && remove !== undefined && (!removePermission || hasPermission(removePermission));

  const openEdit = typeof edit === 'function' ? edit : edit ? edit.openEdit : undefined;
  const runRemove = typeof remove === 'function'
    ? remove
    : remove
      ? (record: R) => remove.mutateAsync([record.id])
      : undefined;

  const extraCount = extra ? 1 : 0;
  return createOperationColumn<R>({
    title,
    width: width ?? 150 + extraCount * 60,
    desktopInlineKeys,
    actions: (record) => [
      ...(extra ? extra(record) : []),
      ...(openEdit ? [{ key: 'edit', label: editLabel ?? '编辑', hidden: !canEdit, onClick: () => openEdit(record) }] : []),
      ...(runRemove
        ? [deleteAction({
          hidden: !canRemove,
          label: removeLabel,
          title: label ? `确定要删除「${label(record)}」吗？` : '确定要删除吗？',
          content: typeof content === 'function' ? content(record) : content,
          run: () => runRemove(record),
        })]
        : []),
    ],
  });
}
