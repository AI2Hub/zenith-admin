import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ensurePinyin } from '@/utils/pinyin';
import FieldPalette from './FieldPalette';

function paletteInput() {
  return screen.getByPlaceholderText('搜索控件') as HTMLInputElement;
}

describe('FieldPalette search', () => {
  it('filters controls by label, type key or description substring', () => {
    render(<FieldPalette onAddField={vi.fn()} />);
    fireEvent.change(paletteInput(), { target: { value: '文本' } });
    expect(screen.getByText('单行文本')).toBeTruthy();
    expect(screen.getByText('多行文本')).toBeTruthy();
    expect(screen.queryByText('数字')).toBeNull();

    fireEvent.change(paletteInput(), { target: { value: 'textarea' } });
    expect(screen.getByText('多行文本')).toBeTruthy();
    expect(screen.queryByText('单行文本')).toBeNull();
  });

  it('matches pinyin initials once the dictionary is ready, refreshing results typed before it loaded', async () => {
    render(<FieldPalette onAddField={vi.fn()} />);
    fireEvent.change(paletteInput(), { target: { value: 'dhwb' } });
    // 词典就绪前只有子串匹配 → 可能为空；就绪后同一关键字命中「单行文本」
    await ensurePinyin();
    await waitFor(() => expect(screen.getByText('单行文本')).toBeTruthy());
    // 多行文本 的首字母同为 dhwb，一并命中；数字 不命中
    expect(screen.getByText('多行文本')).toBeTruthy();
    expect(screen.queryByText('数字')).toBeNull();

    fireEvent.change(paletteInput(), { target: { value: 'xiala' } });
    expect(screen.getByText('下拉单选')).toBeTruthy();
    expect(screen.getByText('下拉多选')).toBeTruthy();
    expect(screen.queryByText('单行文本')).toBeNull();
  });
});
