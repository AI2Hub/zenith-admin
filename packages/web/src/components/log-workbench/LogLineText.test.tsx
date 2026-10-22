import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogLineText } from './LogLineText';

describe('LogLineText', () => {
  it('跨 key / 标点 / string 的搜索命中不丢字符且所有片段激活', () => {
    const raw = '{"msg":"hello"}';
    const { container } = render(<LogLineText raw={raw} ranges={[{ start: 2, end: 10 }]} activeStart={2} />);
    expect(container.textContent).toBe(raw);
    const marks = [...container.querySelectorAll('mark')];
    expect(marks.map((mark) => mark.textContent).join('')).toBe(raw.slice(2, 10));
    expect(marks.every((mark) => mark.dataset.active === 'true')).toBe(true);
  });
});
