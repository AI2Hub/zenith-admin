import { describe, expect, it } from 'vitest';
import { hasAnsi, parseAnsi, stripAnsi } from './ansi';

describe('ansi helpers', () => {
  it('stripAnsi removes SGR sequences and leaves plain text untouched', () => {
    expect(stripAnsi('\x1b[31mERROR\x1b[0m boom')).toBe('ERROR boom');
    const plain = 'plain line';
    expect(stripAnsi(plain)).toBe(plain);
    expect(hasAnsi(plain)).toBe(false);
  });

  it('parseAnsi splits into styled spans whose text concatenates to the stripped line', () => {
    const raw = '\x1b[1;31mERROR\x1b[0m boom \x1b[92mok\x1b[39m';
    const spans = parseAnsi(raw);
    expect(spans.map((s) => s.text).join('')).toBe(stripAnsi(raw));
    expect(spans[0]).toMatchObject({ text: 'ERROR', bold: true, color: 'var(--logansi-fg-1)' });
    expect(spans[1]).toEqual({ text: ' boom ' });
    expect(spans[2]).toMatchObject({ text: 'ok', color: 'var(--logansi-bright-2)' });
  });

  it('parseAnsi resets attributes on code 0 and handles background colors', () => {
    const spans = parseAnsi('\x1b[44mbg\x1b[0mplain');
    expect(spans[0]).toMatchObject({ text: 'bg', bg: 'var(--logansi-bg-4)' });
    expect(spans[1]).toEqual({ text: 'plain' });
  });

  it('亮色底色与 49 复位', () => {
    const spans = parseAnsi('\x1b[101mhot\x1b[49mcold');
    expect(spans[0]).toMatchObject({ text: 'hot', bg: 'var(--logansi-bg-bright-1)' });
    expect(spans[1]).toEqual({ text: 'cold' });
  });
});
