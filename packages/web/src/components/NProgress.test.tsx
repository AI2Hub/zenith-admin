import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import NProgress from './NProgress';

const TestComponent = () => {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate('/route1')}>Go 1</button>
      <button onClick={() => navigate('/route2')}>Go 2</button>
    </div>
  );
};

const setup = () => render(
  <MemoryRouter initialEntries={['/']}>
    <NProgress />
    <Routes>
      <Route path="*" element={<TestComponent />} />
    </Routes>
  </MemoryRouter>
);

describe('NProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears timers on unmount', () => {
    const { getByText, unmount } = setup();

    act(() => {
      getByText('Go 1').click();
    });

    unmount();
    
    // Attempting to advance timers should not error after unmount
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }).not.toThrow();
  });
});
