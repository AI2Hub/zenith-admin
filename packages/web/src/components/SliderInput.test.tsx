import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SliderInput } from './SliderInput';

describe('SliderInput', () => {
  it('clamps values entered outside the configured range', () => {
    const onChange = vi.fn();
    render(<SliderInput value={50} onChange={onChange} min={0} max={100} aria-label="参与流量" />);

    fireEvent.change(screen.getByRole('spinbutton', { name: '参与流量精确值' }), {
      target: { value: '120' },
    });
    expect(onChange).toHaveBeenCalledWith(100);
  });
});
