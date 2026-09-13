import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Form } from '@douyinfe/semi-ui';
import { EditFormModal, EditFormSheet, type EditFormController } from './EditFormModal';

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

describe('EditFormModal', () => {
  it('渲染 modalProps 标题与按 initValues 回填的表单字段，属性可覆盖 title / okText', () => {
    const modal = controller();
    render(
      <EditFormModal modal={modal} title="自定义标题" okText="保存" width={520}>
        <Form.Input field="name" label="名称" />
      </EditFormModal>,
    );
    expect(screen.getByText('自定义标题')).toBeInTheDocument();
    expect(screen.queryByText('编辑角色')).not.toBeInTheDocument();
    expect(screen.getByText('保存')).toBeInTheDocument();
    expect(screen.getByDisplayValue('admin')).toBeInTheDocument();
  });

  it('detailLoading 时显示加载遮罩；header 渲染在表单之前', () => {
    const modal = controller({ detailLoading: true });
    render(
      <EditFormModal modal={modal} header={<div data-testid="hint">先读说明</div>}>
        <Form.Input field="name" label="名称" />
      </EditFormModal>,
    );
    expect(document.body.querySelector('.semi-spin-wrapper')).not.toBeNull();
    const hint = screen.getByTestId('hint');
    const form = document.body.querySelector('form');
    expect(hint.compareDocumentPosition(form!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('支持 render-function 形态的表单 children', () => {
    render(
      <EditFormModal modal={controller()}>
        {({ formState }) => <span data-testid="echo">{String((formState.values as { name?: string }).name)}</span>}
      </EditFormModal>,
    );
    expect(screen.getByTestId('echo')).toHaveTextContent('admin');
  });
});

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

  it('footer 可完全自定义，okText 可覆盖', () => {
    render(
      <EditFormSheet modal={controller()} footer={<div data-testid="custom-footer">自定义</div>}>
        <Form.Input field="name" label="名称" />
      </EditFormSheet>,
    );
    expect(screen.getByTestId('custom-footer')).toBeInTheDocument();
    expect(screen.queryByText('保存')).not.toBeInTheDocument();
  });
});
