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

  it('ANSI 颜色保留，跨 SGR 的匹配仍以去色文本定位', () => {
    const { container } = render(<LogLineText raw={'\x1b[31mfail\x1b[0m next'} ranges={[{ start: 2, end: 7 }]} activeStart={null} />);
    expect(container.textContent).toBe('fail next');
    expect([...container.querySelectorAll('mark')].map((mark) => mark.textContent).join('')).toBe('il ne');
    expect(container.firstElementChild).toHaveStyle({ color: 'var(--logansi-fg-1)' });
  });

  it('只有底色的片段用色块专用文字色，未设底色时不额外指定颜色', () => {
    const { container } = render(<LogLineText raw={'\x1b[41mhot\x1b[0m plain'} activeStart={null} />);
    const [highlight, plain] = [...container.children];
    expect(highlight).toHaveStyle({ backgroundColor: 'var(--logansi-bg-1)', color: 'var(--logansi-on-bg)' });
    expect(plain.getAttribute('style')).toBeNull();
  });

  it('超长行仍可搜索，正文不因回退到纯文本改变', () => {
    const raw = 'x'.repeat(21000) + ' target';
    const { container } = render(<LogLineText raw={raw} ranges={[{ start: 21001, end: 21007 }]} activeStart={21001} />);
    expect(container.textContent).toBe(raw);
    expect(container.querySelector('mark')).toHaveTextContent('target');
  });
});
