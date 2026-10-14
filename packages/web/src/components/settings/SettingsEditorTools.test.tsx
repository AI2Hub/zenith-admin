import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Toast } from '@douyinfe/semi-ui';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_MODULES, type SettingsEnvelope } from '@zenith/shared/settings';
import { useSettingsEditor } from '@/hooks/useSettingsEditor';
import { SettingsEditorTools } from './SettingsEditorTools';

vi.mock('@douyinfe/semi-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@douyinfe/semi-ui')>();
  return { ...actual, Toast: { ...actual.Toast, success: vi.fn(), error: vi.fn() } };
});

vi.mock('./SettingsHistoryButton', () => ({ SettingsHistoryButton: () => null }));

const filesEnvelope: SettingsEnvelope<'files'> = (() => {
  const effective = SETTINGS_MODULES.files.schema.parse({});
  return {
    module: 'files', scope: 'platform', tenantId: null, version: 1, currentRevisionId: 1,
    baseToken: 'current', definitionHash: 'definition', inheritedVersion: 0, overrides: {},
    overriddenPaths: [], updatedAt: null, effective, inherited: effective,
  };
})();

describe('设置重载期间的编辑保护', () => {
  it('请求发出后输入的新草稿不会被返回结果清掉', async () => {
    let finish!: () => void;
    const effective = SETTINGS_MODULES.files.schema.parse({});
    const initial: SettingsEnvelope<'files'> = {
      module: 'files', scope: 'platform', tenantId: null, version: 0, currentRevisionId: null,
      baseToken: 'original', definitionHash: 'definition', inheritedVersion: 0, overrides: {},
      overriddenPaths: [], updatedAt: null, effective, inherited: effective,
    };
    function Harness() {
      const [envelope, setEnvelope] = useState(initial);
      const editor = useSettingsEditor('files', envelope);
      return <>
        <SettingsEditorTools module="files" editor={editor} canWrite onReload={() => new Promise((resolve) => {
          finish = () => { setEnvelope({ ...initial, baseToken: 'refreshed' }); resolve({ isError: false }); };
        })} />
        <input aria-label="大小" value={editor.value.uploadMaxSizeMb} onChange={(event) => editor.setField('uploadMaxSizeMb', Number(event.target.value))} />
      </>;
    }
    render(<MemoryRouter><Harness /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '载入最新' }));
    fireEvent.change(screen.getByLabelText('大小'), { target: { value: '25' } });
    await act(async () => finish());
    expect(screen.getByLabelText('大小')).toHaveValue('25');
    expect(screen.getByText('有未保存的修改')).toBeInTheDocument();
    expect(screen.getByText(/当前草稿已保留/)).toBeInTheDocument();
  });
});

// 无草稿时重载拉回的数据往往与本地完全相同，本地看不到任何差异，反馈本身才是可验收的行为。
describe('载入最新的反馈', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function Harness({ onReload }: Readonly<{ onReload: () => Promise<{ isError: boolean }> }>) {
    const editor = useSettingsEditor('files', filesEnvelope);
    return <SettingsEditorTools module="files" editor={editor} canWrite onReload={onReload} />;
  }

  it('请求在途时按钮进入加载态且不重复重载，完成后给出成功提示', async () => {
    let finish!: (result: { isError: boolean }) => void;
    const onReload = vi.fn(() => new Promise<{ isError: boolean }>((resolve) => { finish = resolve; }));
    render(<MemoryRouter><Harness onReload={onReload} /></MemoryRouter>);
    const button = screen.getByRole('button', { name: '载入最新' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(Toast.success).not.toHaveBeenCalled();
    await act(async () => finish({ isError: false }));
    expect(Toast.success).toHaveBeenCalledWith('已载入最新版本');
    expect(Toast.error).not.toHaveBeenCalled();
  });

  it('重载失败时提示失败，不假装成功', async () => {
    const onReload = vi.fn(async () => ({ isError: true }));
    render(<MemoryRouter><Harness onReload={onReload} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '载入最新' }));
    await waitFor(() => expect(Toast.error).toHaveBeenCalledWith('载入最新版本失败，请检查网络后重试'));
    expect(Toast.success).not.toHaveBeenCalled();
  });
});
