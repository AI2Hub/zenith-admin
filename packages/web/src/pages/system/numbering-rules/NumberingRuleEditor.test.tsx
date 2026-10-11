import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form } from '@douyinfe/semi-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NumberingConfig } from '@zenith/shared/platform';
import { NumberingRuleEditor } from './NumberingRuleEditor';

function editor(template: string) {
  const draft: NumberingConfig = { template, start: '1', step: '1', width: 4, resetPeriod: 'never', timezone: 'Asia/Shanghai', scope: 'owner' };
  const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  render(<QueryClientProvider client={queryClient}><Form initValues={{ name: '测试编号', code: 'workflow.test', scene: 'workflow.instance', status: 'enabled', draft }} labelPosition="left" labelWidth={90}>
    <NumberingRuleEditor editing={false} sequenceLocked={false} />
  </Form></QueryClientProvider>);
}

describe('numbering rule template editing', () => {
  it('inserts date and system tokens at the current selection and previews their actual parameter values', async () => {
    editor('WF-{YYYYMMDD}-{SEQ}');
    fireEvent.click(screen.getByText('高级模板'));
    const input = screen.getByRole('textbox', { name: '编号模板' }) as HTMLInputElement;
    input.focus(); input.setSelectionRange(3, 13); fireEvent.select(input);
    const dateToken = screen.getByRole('button', { name: /插入.*\{YYMMDD\}/ });
    dateToken.focus(); fireEvent.click(dateToken);
    await waitFor(() => { expect(input).toHaveValue('WF-{YYMMDD}-{SEQ}'); });
    await waitFor(() => { expect(input).toHaveFocus(); });
    expect(input.selectionStart).toBe(11);
    expect(input.selectionEnd).toBe(11);
    input.setSelectionRange(11, 11); fireEvent.select(input);
    fireEvent.click(screen.getByRole('button', { name: '插入部门编码 {DEPT_CODE}' }));
    await waitFor(() => { expect(input).toHaveValue('WF-{YYMMDD}{DEPT_CODE}-{SEQ}'); });
    fireEvent.change(screen.getByRole('textbox', { name: '预览部门编码' }), { target: { value: 'OPS' } });
    await waitFor(() => { expect(screen.getByText(/^WF-\d{6}OPS-0001$/)).toBeInTheDocument(); });
  });

  it('previews multiple FORM fields and preserves explicit sequence widths when the default changes', async () => {
    editor('{FORM.采购类型}-{SEQ:3}-{FORM.项目}-{SEQ:5}');
    fireEvent.click(screen.getByText('高级模板'));
    fireEvent.change(screen.getByRole('textbox', { name: '预览表单字段 采购类型' }), { target: { value: '采购' } });
    fireEvent.change(screen.getByRole('textbox', { name: '预览表单字段 项目' }), { target: { value: '运营' } });
    fireEvent.change(screen.getByDisplayValue('4'), { target: { value: '6' } });
    await waitFor(() => { expect(screen.getByRole('textbox', { name: '编号模板' })).toHaveValue('{FORM.采购类型}-{SEQ:3}-{FORM.项目}-{SEQ:5}'); });
    expect(screen.getByText('采购-001-运营-00001')).toBeInTheDocument();
  });

  it('keeps an unfinished FORM segment editable while the template is temporarily invalid', async () => {
    editor('WF-{FORM.purchaseType}-{SEQ}');
    const field = screen.getByRole('textbox', { name: '第 2 段表单字段' });
    fireEvent.change(field, { target: { value: '' } });
    await waitFor(() => { expect(screen.getByRole('textbox', { name: '第 2 段表单字段' })).toHaveValue(''); });
    fireEvent.change(field, { target: { value: 'category' } });
    fireEvent.click(screen.getByText('高级模板'));
    await waitFor(() => { expect(screen.getByRole('textbox', { name: '编号模板' })).toHaveValue('WF-{FORM.category}-{SEQ}'); });
    expect(screen.getByRole('textbox', { name: '预览表单字段 category' })).toBeInTheDocument();
  });
});
