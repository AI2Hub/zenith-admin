import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Form } from '@douyinfe/semi-ui';
import { EditFormSheet, type EditFormController } from './EditFormModal';

function controller(overrides: Partial<EditFormController> = {}): EditFormController {
  const onOk = vi.fn(async () => {}); const onCancel = vi.fn();
  return {
    visible: true,
    close: onCancel,
    detailLoading: false,
    formKey: '1:row',
    modalProps: { title: '编辑角色', visible: true, onOk, onCancel, okButtonProps: { loading: false, disabled: false }, closeOnEsc: true },
    footerProps: { onOk, onCancel, loading: false, disabled: false },
    formProps: { getFormApi: vi.fn(), allowEmpty: true, initValues: { name: 'admin' }, labelPosition: 'left', labelWidth: 90 },
    ...overrides,
  };
}

describe('EditFormSheet', () => {
  it('缺省标题取 modalProps.title，footer 为 ModalFooter（保存 / 取消），点取消调用 close', () => {
    const modal = controller();
    render(
      <EditFormSheet modal={modal} width={640}>
        <Form.Input field="name" label="名称" />
      </EditFormSheet>,
    );
    expect(screen.getByText('编辑角色')).toBeInTheDocument();
    expect(screen.getByText('保存')).toBeInTheDocument();
    screen.getByText('取消').click();
    expect(modal.close).toHaveBeenCalledTimes(1);
  });
});
