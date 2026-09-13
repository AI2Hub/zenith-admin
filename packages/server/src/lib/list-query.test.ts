import { describe, expect, it, vi } from 'vitest';
import { asc, sql } from 'drizzle-orm';
import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';
import { buildListResult, emptyListResult, listRows } from './list-query';

const dbMock = vi.hoisted(() => ({
  $count: vi.fn(),
  select: vi.fn(),
  chain: { from: vi.fn(), where: vi.fn(), orderBy: vi.fn(), $dynamic: vi.fn(), limit: vi.fn(), offset: vi.fn() },
}));
vi.mock('../db', () => ({ db: { $count: dbMock.$count, select: dbMock.select } }));

const tags = pgTable('tags', { id: integer().primaryKey(), name: varchar({ length: 32 }).notNull() });

describe('buildListResult', () => {
  it('count 与 rows 并行发出，结果套分页包络', async () => {
    const order: string[] = [];
    const count = vi.fn(async () => { order.push('count:start'); await Promise.resolve(); order.push('count:end'); return 42; });
    const rows = vi.fn(async () => { order.push('rows:start'); await Promise.resolve(); order.push('rows:end'); return [{ id: 1 }, { id: 2 }]; });
    const result = await buildListResult({ page: 2, pageSize: 20, count, rows });
    expect(result).toEqual({ list: [{ id: 1 }, { id: 2 }], total: 42, page: 2, pageSize: 20 });
    expect(order.slice(0, 2)).toEqual(['count:start', 'rows:start']);
  });

  it('map 支持同步与异步映射', async () => {
    const base = { page: 1, pageSize: 10, count: async () => 2, rows: async () => [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] };
    const sync = await buildListResult({ ...base, map: (r) => ({ key: `${r.id}-${r.name}` }) });
    expect(sync.list).toEqual([{ key: '1-a' }, { key: '2-b' }]);
    const async = await buildListResult({ ...base, map: async (r) => ({ id: r.id, upper: r.name.toUpperCase() }) });
    expect(async.list).toEqual([{ id: 1, upper: 'A' }, { id: 2, upper: 'B' }]);
  });

  it('任一查询失败整体拒绝', async () => {
    await expect(buildListResult({ page: 1, pageSize: 10, count: async () => { throw new Error('count failed'); }, rows: async () => [] })).rejects.toThrow('count failed');
  });
});

describe('emptyListResult', () => {
  it('返回带页码的空分页包络', () => {
    expect(emptyListResult(3, 20)).toEqual({ list: [], total: 0, page: 3, pageSize: 20 });
  });
});

describe('listRows', () => {
  it('count 与 rows 共用同一 where，rows 经 orderBy + withPagination 取当前页后再 map', async () => {
    const where = sql`1 = 1`;
    const rows = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
    const { chain } = dbMock;
    chain.from.mockReturnValue(chain); chain.where.mockReturnValue(chain); chain.orderBy.mockReturnValue(chain);
    chain.$dynamic.mockReturnValue(chain); chain.limit.mockReturnValue(chain); chain.offset.mockResolvedValue(rows);
    dbMock.select.mockReturnValue(chain);
    dbMock.$count.mockResolvedValue(7);

    const result = await listRows({ page: 2, pageSize: 5, table: tags, where, orderBy: [asc(tags.id)], map: (r) => `${r.id}:${r.name}` });

    expect(result).toEqual({ list: ['1:a', '2:b'], total: 7, page: 2, pageSize: 5 });
    expect(dbMock.$count).toHaveBeenCalledWith(tags, where);
    expect(chain.from).toHaveBeenCalledWith(tags);
    expect(chain.where).toHaveBeenCalledWith(where);
    expect(chain.orderBy).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(5);
    expect(chain.offset).toHaveBeenCalledWith(5);
  });

  it('不传 map 时原样返回行', async () => {
    const rows = [{ id: 9, name: 'z' }];
    const { chain } = dbMock;
    chain.offset.mockResolvedValue(rows);
    dbMock.$count.mockResolvedValue(1);
    const result = await listRows({ page: 1, pageSize: 10, table: tags, where: undefined, orderBy: [asc(tags.id)] });
    expect(result.list).toEqual(rows);
    expect(chain.where).toHaveBeenLastCalledWith(undefined);
  });
});
