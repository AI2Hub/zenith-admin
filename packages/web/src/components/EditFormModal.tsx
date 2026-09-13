import type { ReactNode } from 'react';
import { Form, SideSheet, Spin } from '@douyinfe/semi-ui';
import type { BaseFormProps } from '@douyinfe/semi-ui/lib/es/form/interface';
import type { SideSheetReactProps } from '@douyinfe/semi-ui/lib/es/sideSheet';
import { AppModal, type AppModalProps } from '@/components/AppModal';
import { ModalFooter, type ModalFooterProps } from '@/components/ModalFooter';
import type { UseEditModalReturn } from '@/hooks/useEditModal';

/** `useEditModal` 返回值里壳所需的部分（便于传入自定义包装的编辑控制器） */
export type EditFormController = Pick<UseEditModalReturn<{ id: number }>, 'modalProps' | 'footerProps' | 'visible' | 'close' | 'detailLoading' | 'formKey' | 'formProps'>;

interface EditFormBodyProps {
  readonly modal: EditFormController;
  /** 表单之前的说明性内容（Banner / 提示），与表单一起处于加载遮罩之下 */
  readonly header?: ReactNode;
  /** 覆盖 / 追加 Form 属性（`onValueChange`、`labelWidth`…）；`key` 与 `useEditModal` 的 `formProps` 由壳接好 */
  readonly formProps?: Omit<BaseFormProps, 'children'>;
  /** 字段；支持 Semi Form 的 render-function 形态 */
  readonly children: BaseFormProps['children'];
}

/**
 * 编辑表单主体：详情加载遮罩 + 按 `formKey` 重挂载的 Form。
 * Semi 的 Spin 带 children 时即为块级元素（`.semi-spin-block`），不需要额外 wrapper class。
 */
function EditFormBody({ modal, header, formProps, children }: Readonly<EditFormBodyProps>) {
  return (
    <Spin spinning={modal.detailLoading}>
      {header}
      {/* key 必须显式写在 JSX 上：详情到达时变化，驱动表单重挂载读取新的 initValues */}
      <Form key={modal.formKey} {...modal.formProps} {...formProps}>{children}</Form>
    </Spin>
  );
}

export interface EditFormModalProps extends EditFormBodyProps, Omit<AppModalProps, 'visible' | 'onOk' | 'children'> {}

/**
 * 新增 / 编辑弹窗壳：`AppModal({...modal.modalProps}) > Spin(detailLoading) > Form(key=formKey, formProps)`。
 * 页面只写字段；`title` / `okText` / `width` / `okButtonProps` / `onCancel`（追加收尾）等直接作为属性覆盖 `modalProps`。
 *
 * @example
 * <EditFormModal modal={modal} width={660}>
 *   <Form.Input field="name" label="名称" rules={[{ required: true, message: '名称不能为空' }]} />
 * </EditFormModal>
 */
export function EditFormModal({ modal, header, formProps, children, ...modalProps }: Readonly<EditFormModalProps>) {
  return (
    <AppModal {...modal.modalProps} {...modalProps}>
      <EditFormBody modal={modal} header={header} formProps={formProps}>{children}</EditFormBody>
    </AppModal>
  );
}

export interface EditFormSheetProps extends EditFormBodyProps, Omit<SideSheetReactProps, 'visible' | 'footer' | 'children' | 'title'> {
  /** 缺省取 `modal.modalProps.title`（由 `entityName` 生成的「新增 X / 编辑 X」） */
  readonly title?: ReactNode;
  /** 底部按钮文案，缺省「保存」 */
  readonly okText?: ModalFooterProps['okText'];
  /** 靠左的次要动作，透传 `ModalFooter` 的 `extra` */
  readonly footerExtra?: ReactNode;
  /** 完全自定义 footer 时传入；缺省为 `ModalFooter({...modal.footerProps, okText})` */
  readonly footer?: ReactNode;
}

/**
 * 新增 / 编辑侧滑抽屉壳：`SideSheet(visible / onCancel / closeOnEsc) + ModalFooter(footerProps) > Spin > Form`，
 * 用于字段多、需要更宽或分区展示的编辑表单。关闭时要附加收尾（通知父级等）可传 `onCancel` 覆盖缺省的 `modal.close`。
 *
 * @example
 * <EditFormSheet modal={modal} width={720}>…字段…</EditFormSheet>
 */
export function EditFormSheet({ modal, header, formProps, children, title, okText = '保存', footerExtra, footer, ...sheetProps }: Readonly<EditFormSheetProps>) {
  return (
    <SideSheet
      title={title ?? modal.modalProps.title}
      visible={modal.visible}
      onCancel={modal.close}
      closeOnEsc
      footer={footer ?? <ModalFooter {...modal.footerProps} okText={okText} extra={footerExtra} />}
      {...sheetProps}
    >
      <EditFormBody modal={modal} header={header} formProps={formProps}>{children}</EditFormBody>
    </SideSheet>
  );
}
