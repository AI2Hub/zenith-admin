import { describe, it, expect, beforeAll } from 'vitest';
import { ensureLucideIcons, renderLucideIcon } from './icons';
import { render, renderHook } from '@testing-library/react';
import { useAllIconNames, useLucideIconsReady } from './icons';

describe('icons utility (async registry)', () => {
  beforeAll(async () => {
    await ensureLucideIcons();
  });

  it('useLucideIconsReady should be true after ensure', () => {
    const { result } = renderHook(() => useLucideIconsReady());
    expect(result.current).toBe(true);
  });

  it('should have a sorted list of all icon names', () => {
    const { result } = renderHook(() => useAllIconNames());
    expect(Array.isArray(result.current)).toBe(true);
    expect(result.current.length).toBeGreaterThan(0);
    const sorted = [...result.current].sort((a, b) => a.localeCompare(b));
    expect(result.current).toEqual(sorted);
  });

  it('should filter out createLucideIcon and *Icon aliases', () => {
    const { result } = renderHook(() => useAllIconNames());
    expect(result.current).not.toContain('createLucideIcon');
    expect(result.current.some((name) => name.endsWith('Icon'))).toBe(false);
  });

  it('renderLucideIcon should return null for unknown icon', () => {
    const el = renderLucideIcon('NonExistentIconXYZ' + Date.now());
    expect(el).toBeNull();
  });

  it('renderLucideIcon should return a valid React element for known icon', () => {
    const el = renderLucideIcon('Activity');
    expect(el).not.toBeNull();
    if (el) {
      const { container } = render(el);
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });

  it('renderLucideIcon should pass custom size correctly', () => {
    const el = renderLucideIcon('Activity', 24);
    if (el) {
      const { container } = render(el);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('24');
    }
  });

  it('renderLucideIcon uses default size 16', () => {
    const el = renderLucideIcon('Activity');
    if (el) {
      const { container } = render(el);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('16');
    }
  });
});
