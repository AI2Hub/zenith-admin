import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { RegionSelectProps } from './RegionSelect';
import RegionSelect from './RegionSelect';
import { request } from '@/utils/request';
import { createTestQueryClient, createWrapper } from '@/test-utils/query-harness';

vi.mock('@/utils/request', () => ({
  request: {
    get: vi.fn(),
  },
}));

function renderRegionSelect(props: RegionSelectProps = {}) {
  return render(<RegionSelect {...props} />, { wrapper: createWrapper(createTestQueryClient()) });
}

async function waitForRegionsLoaded(container: HTMLElement) {
  await waitFor(() => {
    expect(request.get).toHaveBeenCalledWith('/api/regions', { silent: true });
  });
  await waitFor(() => {
    expect(container.textContent).not.toContain('加载中...');
  });
}

describe('RegionSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load regions from API', async () => {
    // Mock response data
    const mockData = {
      code: 0,
      message: 'ok',
      data: [
        { code: '110000', name: '北京', status: 'enabled', children: [] },
        { code: '120000', name: '天津', status: 'disabled', children: [] } // should be filtered out
      ]
    };
    vi.mocked(request.get).mockResolvedValueOnce(mockData);

    const { container } = renderRegionSelect();

    // We expect request.get to be called with correct URL
    await waitForRegionsLoaded(container);
  });
});
