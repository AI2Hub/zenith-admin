import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureErrorReporting, reportError } from './error-reporter';

vi.mock('./breadcrumbs', () => ({
  getBreadcrumbs: () => [],
}));

describe('error reporting policy', () => {
  const fetchMock = vi.fn(async () => ({ ok: true }));

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
    configureErrorReporting({ enabled: true, trackErrors: true, respectDnt: false });
  });

  it('stops error telemetry when collection is disabled', () => {
    configureErrorReporting({ enabled: false, trackErrors: true, respectDnt: false });
    reportError('js_error', 'disabled telemetry');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports errors when the policy permits it', () => {
    reportError('js_error', 'enabled telemetry');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
