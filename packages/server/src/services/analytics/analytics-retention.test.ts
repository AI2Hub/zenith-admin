import { beforeEach, describe, expect, it, vi } from 'vitest';

const { select, selectDistinct, deleteFrom, deleteWhere } = vi.hoisted(() => ({
  select: vi.fn(),
  selectDistinct: vi.fn(),
  deleteFrom: vi.fn(),
  deleteWhere: vi.fn(async () => ({ rowCount: 1 })),
}));

vi.mock('../../db', () => ({
  db: {
    select,
    selectDistinct,
    delete: deleteFrom,
  },
}));

import { runAnalyticsRetention } from './analytics-rollup.service';

describe('analytics retention isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnValue({
      from: vi.fn(async () => [
        { tenantId: 11, eventDays: 30, errorDays: 7 },
        { tenantId: 22, eventDays: 365, errorDays: 180 },
      ]),
    });
    selectDistinct.mockReturnValue({
      from: vi.fn(async () => [{ tenantId: 11 }, { tenantId: 22 }]),
    });
    deleteFrom.mockReturnValue({ where: deleteWhere });
  });

  it('executes independent cleanup statements for every tenant policy', async () => {
    await expect(runAnalyticsRetention()).resolves.toEqual({
      events: 2,
      sessions: 2,
      errors: 2,
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(selectDistinct).toHaveBeenCalledTimes(4);
    expect(deleteFrom).toHaveBeenCalledTimes(8);
    expect(deleteWhere).toHaveBeenCalledTimes(8);
  });
});
