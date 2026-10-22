import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DEFAULT_UPLOAD_ALLOWED_TYPES, filesSettingsSchema, mergeSettingsLayers, removeSettingsOverride, setSettingsOverride, settingsOverriddenPaths } from '@zenith/shared/settings';
import { SchemaForm } from '@/components/settings/SchemaForm';
import { UploadMimeTypesInput } from './UploadMimeTypesInput';
import { UPLOAD_MIME_PRESETS } from './upload-mime-presets';

function Harness({ initial = ['application/x-custom'], disabled = false }: { initial?: string[]; disabled?: boolean }) {
  const inherited = filesSettingsSchema.parse({});
  const [overrides, setOverrides] = useState<Record<string, unknown>>({ uploadAllowedTypes: initial });
  const value = mergeSettingsLayers(inherited, overrides);
  return <>
    <SchemaForm schema={filesSettingsSchema} value={value} inheritedValue={inherited} overriddenPaths={settingsOverriddenPaths(overrides)}
      onFieldChange={(path, next) => setOverrides((current) => setSettingsOverride(current, path, next))}
      onRevert={(path) => setOverrides((current) => removeSettingsOverride(current, path))} disabled={disabled}
      controls={{ uploadAllowedTypes: (props) => <UploadMimeTypesInput {...props} /> }} />
    <output data-testid="types">{JSON.stringify(value.uploadAllowedTypes)}</output>
  </>;
}

const selectedTypes = () => JSON.parse(screen.getByTestId('types').textContent ?? '[]') as string[];

describe('上传 MIME 快捷填入', () => {
  it('等于默认列表的显式覆盖仍显示恢复继承，恢复后移除覆盖标记', () => {
    render(<Harness initial={[...DEFAULT_UPLOAD_ALLOWED_TYPES]} />);
    expect(screen.getByRole('button', { name: '恢复继承' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复继承' }));
    expect(screen.queryByRole('button', { name: '恢复继承' })).not.toBeInTheDocument();
    expect(selectedTypes()).toEqual([...DEFAULT_UPLOAD_ALLOWED_TYPES]);
  });
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

  it('恢复继承会清掉之前的限额错误', () => {
    render(<Harness initial={Array.from({ length: 200 }, (_, i) => `application/x-test-${i}`)} />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复继承' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(selectedTypes()).toEqual([...DEFAULT_UPLOAD_ALLOWED_TYPES]);
  });
});
