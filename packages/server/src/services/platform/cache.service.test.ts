/**
 * 缓存分类：首段映射与按分类删除（含精确键）回归。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  scanKeys: vi.fn(),
  exists: vi.fn(),
  del: vi.fn(),
}));

vi.mock('../../config', () => ({ config: { redis: { keyPrefix: 'test:' } } }));
vi.mock('../../lib/redis', () => ({ default: { exists: mocks.exists, del: mocks.del } }));
vi.mock('../../lib/redis-scan', () => ({ scanKeys: mocks.scanKeys }));
vi.mock('./monitor.service', () => ({ getRedisInfo: vi.fn() }));

import { deleteCacheByCategory, getCategory, getSegment } from './cache.service';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scanKeys.mockResolvedValue([]);
  mocks.exists.mockResolvedValue(0);
  mocks.del.mockResolvedValue(1);
});

describe('缓存分类', () => {
  it('按首段映射分类，未知前缀归入「其他」', () => {
    expect(getSegment('test:refresh:abc')).toBe('refresh');
    expect(getCategory('test:refresh:abc')).toBe('刷新令牌');
    expect(getCategory('test:unknown:x')).toBe('其他');
  });

  it('按分类删除同时包含前缀键与精确键', async () => {
    mocks.scanKeys.mockResolvedValue(['test:perm-generation:user:1']);
    mocks.exists.mockResolvedValue(1);

    await expect(deleteCacheByCategory('perm-generation')).resolves.toBe(2);
    expect(mocks.scanKeys).toHaveBeenCalledWith('test:perm-generation:*');
    expect(mocks.exists).toHaveBeenCalledWith('test:perm-generation');
    expect(mocks.del).toHaveBeenCalledWith('test:perm-generation', 'test:perm-generation:user:1');
  });
});
