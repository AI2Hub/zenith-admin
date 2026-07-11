import { describe, expect, it } from 'vitest';
import { filterCurrentActivation } from './materialize';

type Row = { id: number; activationId: string | null; status?: string };

describe('filterCurrentActivation 节点重入轮次过滤', () => {
  it('只保留最新 activationId 的任务（历史轮 rejected 不参与判定）', () => {
    const rows: Row[] = [
      { id: 1, activationId: 'round-1', status: 'rejected' },
      { id: 2, activationId: 'round-1', status: 'skipped' },
      { id: 3, activationId: 'round-2', status: 'pending' },
      { id: 4, activationId: 'round-2', status: 'approved' },
    ];
    const filtered = filterCurrentActivation(rows);
    expect(filtered.map((r) => r.id)).toEqual([3, 4]);
  });

  it('最新行无 activationId（历史数据）时回退全量，保持旧行为', () => {
    const rows: Row[] = [
      { id: 1, activationId: 'round-1' },
      { id: 2, activationId: null },
    ];
    expect(filterCurrentActivation(rows)).toHaveLength(2);
  });

  it('全部无 activationId 的存量数据回退全量', () => {
    const rows: Row[] = [
      { id: 1, activationId: null },
      { id: 2, activationId: null },
    ];
    expect(filterCurrentActivation(rows)).toHaveLength(2);
  });

  it('空数组直接返回', () => {
    expect(filterCurrentActivation([])).toEqual([]);
  });

  it('同轮加签任务（继承 activationId）与原任务同轮统计', () => {
    const rows: Row[] = [
      { id: 1, activationId: 'round-2', status: 'pending' },
      { id: 5, activationId: 'round-2', status: 'pending' }, // 加签继承
      { id: 3, activationId: 'round-1', status: 'rejected' },
    ];
    const filtered = filterCurrentActivation(rows);
    expect(filtered.map((r) => r.id).sort()).toEqual([1, 5]);
  });
});
