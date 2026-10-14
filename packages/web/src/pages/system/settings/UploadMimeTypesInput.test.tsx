import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DEFAULT_UPLOAD_ALLOWED_TYPES, filesSettingsSchema } from '@zenith/shared/settings';
import { SchemaForm } from '@/components/settings/SchemaForm';
import { UploadMimeTypesInput } from './UploadMimeTypesInput';
import { UPLOAD_MIME_PRESETS } from './upload-mime-presets';

function Harness({ initial = ['application/x-custom'], disabled = false }: { initial?: string[]; disabled?: boolean }) {
  const inherited = filesSettingsSchema.parse({});
  const [value, setValue] = useState<Record<string, unknown>>({ ...inherited, uploadAllowedTypes: initial });
  return <>
    <SchemaForm schema={filesSettingsSchema} value={value} inheritedValue={inherited} onChange={setValue} disabled={disabled}
      controls={{ uploadAllowedTypes: (props) => <UploadMimeTypesInput {...props} /> }} />
    <output data-testid="types">{JSON.stringify(value.uploadAllowedTypes)}</output>
  </>;
}

const selectedTypes = () => JSON.parse(screen.getByTestId('types').textContent ?? '[]') as string[];

describe('上传 MIME 快捷填入', () => {
  it('默认追加，保留自定义值并忽略重复和大小写差异', () => {
    render(<Harness initial={['application/x-custom', ' IMAGE/* ']} />);
    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    fireEvent.click(screen.getByRole('button', { name: '图片' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(selectedTypes()).toEqual(['application/x-custom', 'image/*', 'application/pdf']);
  });

  it('覆盖用所选预设替换整个列表，恢复继承仍返回 schema 默认值', () => {
    render(<Harness initial={['*/*', 'application/x-custom']} />);
    expect(screen.getByText(/当前列表包含通配符/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '覆盖' }));
    fireEvent.click(screen.getByRole('button', { name: 'Office' }));
    expect(selectedTypes()).toEqual(UPLOAD_MIME_PRESETS.find((preset) => preset.label === 'Office')?.types);
    expect(screen.queryByText(/当前列表包含通配符/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复继承' }));
    expect(selectedTypes()).toEqual([...DEFAULT_UPLOAD_ALLOWED_TYPES]);
  });

  it('未按回车的手动类型在失焦后保留，随后仍可追加预设', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(within(screen.getByLabelText('允许的 MIME 类型')).getByRole('textbox'), 'application/x-example');
    await user.click(screen.getByRole('button', { name: 'PDF' }));
    expect(selectedTypes()).toEqual(['application/x-custom', 'application/x-example', 'application/pdf']);
  });

  it('追加超过 schema 限额时保留当前列表并显示错误', () => {
    const initial = Array.from({ length: 200 }, (_, i) => `application/x-test-${i}`);
    render(<Harness initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(selectedTypes()).toEqual(initial);
    fireEvent.click(screen.getByRole('radio', { name: '覆盖' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(selectedTypes()).toEqual(['application/pdf']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('只读模式禁用快捷按钮、模式和手动输入', () => {
    render(<Harness disabled />);
    for (const preset of UPLOAD_MIME_PRESETS) expect(screen.getByRole('button', { name: preset.label })).toBeDisabled();
    expect(within(screen.getByLabelText('允许的 MIME 类型')).getByRole('textbox')).toBeDisabled();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.queryByRole('button', { name: '恢复继承' })).not.toBeInTheDocument();
  });

  it('恢复继承会清掉之前的限额错误', () => {
    render(<Harness initial={Array.from({ length: 200 }, (_, i) => `application/x-test-${i}`)} />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复继承' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(selectedTypes()).toEqual([...DEFAULT_UPLOAD_ALLOWED_TYPES]);
  });

  it('未配置专用控件的字符串数组继续使用通用标签输入', () => {
    const value = filesSettingsSchema.parse({});
    const { container } = render(<SchemaForm schema={filesSettingsSchema} value={value} onChange={() => {}} />);
    expect(container.querySelector('.semi-tagInput')).toBeInTheDocument();
    expect(within(container).queryByText('快捷填入')).not.toBeInTheDocument();
  });
});
