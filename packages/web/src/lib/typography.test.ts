import { afterEach, describe, expect, it } from 'vitest';
import { applyFontFamily, applyUiScale } from './typography';

afterEach(() => {
  document.body.style.removeProperty('zoom');
  document.body.style.removeProperty('font-family');
});

describe('applyUiScale', () => {
  it('leaves body untouched at 100% and removes a previous override', () => {
    applyUiScale(110);
    expect(document.body.style.getPropertyValue('zoom')).toBe('1.1');
    applyUiScale(100);
    expect(document.body.style.getPropertyValue('zoom')).toBe('');
  });

  it('falls back to 100% for unknown values', () => {
    applyUiScale(110);
    applyUiScale(95);
    expect(document.body.style.getPropertyValue('zoom')).toBe('');
  });
});

describe('applyFontFamily', () => {
  it('overrides body font-family for presets and clears it for system', () => {
    applyFontFamily('mono');
    expect(document.body.style.getPropertyValue('font-family')).toContain('monospace');
    applyFontFamily('system');
    expect(document.body.style.getPropertyValue('font-family')).toBe('');
  });

  it('treats unknown presets as system', () => {
    applyFontFamily('inter');
    applyFontFamily('comic-sans');
    expect(document.body.style.getPropertyValue('font-family')).toBe('');
  });
});
