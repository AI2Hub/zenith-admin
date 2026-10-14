import { useCallback, useMemo, useRef, useState } from 'react';
import { Toast } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form/interface';
import { abortSubmit } from '@/lib/abort-submit';
import { ApiError } from '@/lib/query';
import { showRequestErrorToast } from '@/utils/request-toast';

/**
 * 新增/编辑弹窗的状态与提交编排，统一保证：
 * 1. 校验失败必须 `throw`：Semi Modal 不因 `onOk` resolve 自动关闭，且由其 Promise
 *    驱动按钮 loading；抛出可结束 loading 并保持弹窗打开。
 * 2. 成功提示默认区分新增/编辑。
 * 3. 保存后关闭并清空 editing，避免下次新增带入旧记录。
 * 4. 按记录和异步详情重挂载表单：Semi 的 `initValues` 只在挂载时读取，必须配合 `formKey`。
 *
 * 每个实例仅持有局部状态，一页多个编辑单元可分别调用。
 *
 * @example
 * ```tsx
 * const modal = useEditModal<TenantPackage, TenantPackageValues>({
 *   entityName: '套餐',
 *   save: useSaveTenantPackage(),
 *   useDetail: useTenantPackageDetail,
 *   defaults: { status: 'enabled' },
 * });
 * <CreateButton onClick={modal.openCreate} />
 * // 列操作：onClick: () => modal.openEdit(record)
 * <EditFormModal modal={modal} width={520}>…字段…</EditFormModal>
 * ```
 */

/**
 * 详情查询 hook 的最小形状，与 `createResourceQueries(contract).useDetail` 兼容。
 * 第三参为打开弹窗时的列表行：子资源详情需要父级 id（如字典项的 `(dictId, itemId)`）时，
 * 用模块级包装 hook 从行记录取父级 id 再转发，不要传内联箭头函数。
 */
export type DetailHook<TRecord> = (
  id: number | undefined,
  enabled?: boolean,
  record?: TRecord,
) => { data?: TRecord; isFetching: boolean };

/** 保存 mutation 的最小形状，与 `createResourceQueries(contract).useSave()` 兼容 */
export interface SaveMutationLike<TRecord, TValues> {
  mutateAsync: (vars: { id?: number; values: TValues }) => Promise<TRecord>;
  isPending: boolean;
}

export interface EditContext<TRecord> {
  readonly editing: TRecord | null;
  readonly isEdit: boolean;
}

export interface UseEditModalOptions<TRecord extends { id: number }, TValues, TPayload = TValues> {
  /** 实体中文名，用于自动生成标题「新增角色 / 编辑角色」；不传则需自行覆盖 title */
  readonly entityName?: string;
  readonly save: SaveMutationLike<TRecord, TPayload>;
  /**
   * 详情查询 hook。传入后弹窗打开时自动按 id 拉取，并在详情到达时重挂载表单。
   * **必须是模块级稳定函数**（如域 hooks 导出的 `useXxxDetail`），不要传内联箭头函数。
   */
  readonly useDetail?: DetailHook<TRecord>;
  /** 新增时的表单默认值；传函数则每次打开重新求值（用于依赖当前时间的默认值） */
  readonly defaults?: Partial<TValues> | (() => Partial<TValues>);
  /** 记录 → 表单值。不传则直接把记录作为 initValues */
  readonly toValues?: (record: TRecord) => Partial<TValues>;
  /**
   * 表单值 → 提交载荷。用于注入页面级上下文（如所属站点 siteId），
   * 或把表单控件类型转成接口类型（如 DatePicker 的 Date → 接口的字符串）。
   * 不提供时表单值直接作为载荷，此时 `TPayload` 必须与 `TValues` 一致。
   *
   * 需要在此做跨字段校验并中断提交时，**先给出面向用户的提示，再调用 `abortSubmit()`**。
   * 不要 `return`（弹窗会卡在 loading），也不要抛裸 `Error`
   * ——多词消息会穿透全局兜底，用户会额外收到一个「操作失败：xxx」并污染错误监控。
   */
  readonly beforeSave?: (values: TValues, ctx: EditContext<TRecord>) => TPayload | Promise<TPayload>;
  /** 保存成功后的副作用（清空选中行、跳转等）。失效已由 mutation 负责，此处无需再写 */
  readonly onSaved?: (saved: TRecord, ctx: EditContext<TRecord>) => void;
  /**
   * 覆盖成功提示，默认「更新成功 / 创建成功」。
   * 返回 `null` 表示**不弹提示**——用于保存后另有更强反馈的流程
   * （如跳转到支付页、弹出含密钥的结果框），避免两个提示叠在一起。
   */
  readonly successMessage?: (ctx: EditContext<TRecord>) => string | null;
  readonly labelPosition?: 'top' | 'left' | 'inset';
  readonly labelWidth?: number | string;
}

export interface UseEditModalReturn<TRecord extends { id: number }> {
  readonly visible: boolean;
  readonly editing: TRecord | null;
  readonly isEdit: boolean;
  /** 详情加载中——把表单包在 `<Spin spinning={detailLoading}>` 里 */
  readonly detailLoading: boolean;
  readonly openCreate: () => void;
  readonly openEdit: (record: TRecord) => void;
  readonly close: () => void;
  /** 直接展开到 AppModal */
  readonly modalProps: {
    title: string;
    visible: boolean;
    onOk: () => Promise<void>;
    onCancel: () => void;
    okButtonProps: { loading: boolean; disabled: boolean };
    closeOnEsc: boolean;
  };
  /**
   * 自定义 footer（`SideSheet` / 不用默认按钮的 `Modal`）时直接展开到 `ModalFooter`：
   * `footer={<ModalFooter {...modal.footerProps} okText="保存" />}`
   */
  readonly footerProps: {
    onOk: () => Promise<void>;
    onCancel: () => void;
    loading: boolean;
    disabled: boolean;
  };
  /**
   * 表单重挂载 key：`<Form key={modal.formKey} {...modal.formProps}>`。
   * 必须直接写在 JSX 上，不能放进 spread 对象——React 要求 key 显式传递。
   */
  readonly formKey: string;
  /** 直接展开到 Form */
  readonly formProps: {
    getFormApi: (api: FormApi) => void;
    allowEmpty: boolean;
    initValues: Record<string, unknown>;
    labelPosition: 'top' | 'left' | 'inset';
    labelWidth?: number | string;
  };
  /** 少数需要在提交外读写表单的场景（如联动填充）使用 */
  readonly formApi: React.RefObject<FormApi | null>;
}

/** 未传 useDetail 时的占位：形状一致且不调用任何 hook，保证 hook 调用顺序恒定 */
const NO_DETAIL = (): { data?: undefined; isFetching: false } => ({ data: undefined, isFetching: false });

/**
 * 表单重挂载 key。
 *
 * Semi 的 `initValues` 只在 `Form` **挂载时**读取一次。弹窗打开瞬间详情还没回来，
 * 表单先拿列表行占位；详情到达后 id **不变**，因此 `key={record.id}` 这种只含 id 的写法
 * 不会触发重挂载——详情数据永远进不了表单，且不报错、测试不变红。
 *
 * key 必须同时含「是哪条」与「详情到没到」，即 `12:row` → `12:detail`。
 *
 * `useEditModal` 内部用它；**少数正当自持表单实例的场景**（搭建器、设计器等保存后
 * 不关闭的工作区）请直接调用本函数，不要手写模板串——手写的版本会被"简化"回只含 id。
 */
export function formRemountKey(id: number | null | undefined, detail: unknown): string {
  return `${id ?? 'new'}:${detail ? 'detail' : 'row'}`;
}

export function useEditModal<TRecord extends { id: number }, TValues = Partial<TRecord>, TPayload = TValues>(
  options: UseEditModalOptions<TRecord, TValues, TPayload>,
): UseEditModalReturn<TRecord> {
  const {
    entityName = '',
    save,
    useDetail,
    toValues,
    beforeSave,
    onSaved,
    successMessage,
    labelPosition = 'left',
    labelWidth = 90,
  } = options;

  const formApi = useRef<FormApi | null>(null);
  const [visible, setVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TRecord | null>(null);
  /**
   * 新增时的默认值快照。
   *
   * 必须在「打开」这一刻求值并冻结，不能在渲染期求值：`defaults` 通常是调用方写的
   * 内联箭头函数，每次渲染引用都不同，若放进 useMemo 依赖会**每次渲染都重新执行**。
   * 对 `() => ({ startAt: Date.now() })` 这类默认值，表现为初始值在弹窗打开期间
   * 不断漂移。
   */
  const [defaultValues, setDefaultValues] = useState<Partial<TValues>>({});

  // 始终持有最新 options，使 openCreate 无需把不稳定的 defaults 放进依赖
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // 恒定调用，避免条件式 hook；未配置详情时走零成本占位
  const detailHook: DetailHook<TRecord> = useDetail ?? NO_DETAIL;
  const detail = detailHook(editingRecord?.id, visible && editingRecord != null, editingRecord ?? undefined);

  // 详情优先于列表行：列表行只是打开弹窗瞬间的占位
  const editing = editingRecord ? ((detail.data as TRecord | undefined) ?? editingRecord) : null;
  const isEdit = editingRecord != null;
  const detailLoading = isEdit && detail.isFetching;

  const openCreate = useCallback(() => {
    const d = optionsRef.current.defaults;
    setDefaultValues((typeof d === 'function' ? (d as () => Partial<TValues>)() : d) ?? {});
    setEditingRecord(null);
    setVisible(true);
  }, []);

  const openEdit = useCallback((record: TRecord) => {
    setEditingRecord(record);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setEditingRecord(null);
    formApi.current = null;
  }, []);

  const initValues = useMemo(() => {
    if (editing) return (toValues ? toValues(editing) : editing) as Record<string, unknown>;
    return defaultValues as Record<string, unknown>;
  }, [editing, toValues, defaultValues]);

  /**
   * 表单重挂载 key。
   * 详情到达会让 key 从 `12:row` 变成 `12:detail`，强制 Semi 重新读取 initValues——
   * 这正是手写版本最容易漏掉的一环。
   */
  const formKey = formRemountKey(editingRecord?.id, detail.data);

  const submit = useCallback(async () => {
    let values: TValues;
    try {
      values = (await formApi.current?.validate()) as TValues;
    } catch {
      // 抛出以阻止 Semi 把确定按钮留在 loading 态，同时保持弹窗打开
      abortSubmit();
    }
    const ctx: EditContext<TRecord> = { editing, isEdit };
    const payload = beforeSave ? await beforeSave(values, ctx) : (values as unknown as TPayload);
    let saved: TRecord;
    try {
      saved = await save.mutateAsync({ id: editingRecord?.id, values: payload });
    } catch (err) {
      // silent mutation 的业务错误兜底提示：showRequestErrorToast 自带同内容去重，
      // 非 silent 场景 http 层已弹过同文案时这里会被丢弃，不会出现双 Toast
      if (err instanceof ApiError) showRequestErrorToast(err.message);
      // 抛出以保持弹窗打开并让确定按钮退出 loading（其余真错误由全局兜底处理）
      abortSubmit('save-failed');
    }
    // successMessage 返回 null 表示调用方另有更强反馈，此处不弹提示
    const message = successMessage ? successMessage(ctx) : isEdit ? '更新成功' : '创建成功';
    if (message) Toast.success(message);
    close();
    onSaved?.(saved, ctx);
  }, [editing, isEdit, editingRecord, beforeSave, save, successMessage, close, onSaved]);

  return {
    visible,
    editing,
    isEdit,
    detailLoading,
    openCreate,
    openEdit,
    close,
    modalProps: {
      title: `${isEdit ? '编辑' : '新增'}${entityName}`,
      visible,
      onOk: submit,
      onCancel: close,
      okButtonProps: { loading: save.isPending, disabled: detailLoading },
      closeOnEsc: true,
    },
    footerProps: {
      onOk: submit,
      onCancel: close,
      loading: save.isPending,
      disabled: detailLoading,
    },
    formKey,
    formProps: {
      getFormApi: (api: FormApi) => {
        formApi.current = api;
      },
      allowEmpty: true,
      initValues,
      labelPosition,
      labelWidth,
    },
    formApi,
  };
}
