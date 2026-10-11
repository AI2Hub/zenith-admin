import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Form } from '@douyinfe/semi-ui';
import type { FormApi } from '@douyinfe/semi-ui/lib/es/form';
import { BindingFields } from './NumberingBindingsTab';

vi.mock('@/hooks/queries/numbering', () => ({
  useNumberingRuleOptions: () => ({ data: [], isFetching: false }),
  useNumberingVersions: () => ({ data: [{ id: 9, config: { template: '{FORM.地区}-{SEQ:3}-{FORM.类别}-{USER}' } }], isFetching: false }),
}));

describe('编号中心表单占位符绑定', () => {
  it('把多个带点的FORM参数保留为字面key，不写成嵌套对象路径', async () => {
    let api: FormApi | undefined;
    render(<Form initValues={{ scene: 'workflow.instance', ownerKey: '*', ruleId: 7, versionId: 9, parameterMapping: {} }} getFormApi={value => { api = value; }}>
      <BindingFields editing={false} />
    </Form>);
    fireEvent.change(screen.getByLabelText('编号参数 FORM.地区'), { target: { value: 'formData.地区-编码' } });
    fireEvent.change(screen.getByLabelText('编号参数 FORM.类别'), { target: { value: 'formData.category' } });
    await waitFor(() => expect(api?.getValue('parameterMapping')).toEqual({ 'FORM.地区': 'formData.地区-编码', 'FORM.类别': 'formData.category' }));
    expect(api?.getValue('parameterMapping')).not.toHaveProperty('FORM');
    expect(screen.queryByLabelText('编号参数 username')).not.toBeInTheDocument();
  });
});
