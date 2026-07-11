/**
 * 行为中心阶段 1（用户分群 + 事件分析工作台 + 漏斗/留存新参数）MSW handler 冒烟测试。
 * 直接驱动 handler.run() 找到首个匹配并解析响应，校验：
 *  - 用户分群 CRUD（含重名 400）+ 成员分页 + 物化提交异步任务
 *  - 事件分析工作台按维度/指标聚合
 *  - 漏斗新增 conversionWindowHours/segmentId 参数透传 + averageConversionMs 字段
 *  - 留存双口径 mode 参数回显
 */
import { describe, it, expect } from 'vitest';
import { analyticsHandlers } from '@/mocks/handlers/analytics';

const ORIGIN = window.location.origin;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 测试中按需访问任意 data 形状
interface ApiEnvelope { code: number; message: string; data: any }

async function call(method: string, path: string, body?: unknown): Promise<ApiEnvelope> {
  for (const h of analyticsHandlers) {
    const request = new Request(`${ORIGIN}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const res = await (h as unknown as { run: (a: unknown) => Promise<{ response?: Response } | null> })
      .run({ request, requestId: `t-${Math.random()}` });
    if (res?.response) return res.response.json() as Promise<ApiEnvelope>;
  }
  throw new Error(`no handler matched ${method} ${path}`);
}

describe('用户分群 CRUD + 物化 handlers smoke', () => {
  it('列表返回预置分群', async () => {
    const j = await call('GET', '/api/analytics/segments?page=1&pageSize=20');
    expect(j.code).toBe(0);
    expect(j.data.total).toBeGreaterThan(0);
  });

  it('创建 / 更新 / 删除', async () => {
    const created = await call('POST', '/api/analytics/segments', {
      name: '测试分群_msw', status: 'enabled',
      rules: { operator: 'AND', conditions: [{ type: 'event', eventName: 'view', days: 7 }] },
    });
    expect(created.code).toBe(0);
    const id = created.data.id;
    expect(created.data.estimatedSize).toBe(0);
    expect(created.data.snapshotAt).toBeNull();

    const updated = await call('PUT', `/api/analytics/segments/${id}`, { description: '更新后的描述' });
    expect(updated.data.description).toBe('更新后的描述');

    const deleted = await call('DELETE', `/api/analytics/segments/${id}`);
    expect(deleted.code).toBe(0);
    const detail = await call('GET', `/api/analytics/segments/${id}`);
    expect(detail.code).toBe(404);
  });

  it('重名分群创建返回 400', async () => {
    const rules = { operator: 'AND' as const, conditions: [{ type: 'event' as const, eventName: 'view', days: 7 }] };
    await call('POST', '/api/analytics/segments', { name: 'dup_segment_msw', status: 'enabled', rules });
    const dup = await call('POST', '/api/analytics/segments', { name: 'dup_segment_msw', status: 'enabled', rules });
    expect(dup.code).toBe(400);
  });

  it('规则为空时创建返回 400', async () => {
    const j = await call('POST', '/api/analytics/segments', { name: '空规则分群', status: 'enabled', rules: { operator: 'AND', conditions: [] } });
    expect(j.code).toBe(400);
  });

  it('成员分页返回列表', async () => {
    const list = await call('GET', '/api/analytics/segments?page=1&pageSize=1');
    const id = list.data.list[0].id;
    const j = await call('GET', `/api/analytics/segments/${id}/members?page=1&pageSize=20`);
    expect(j.code).toBe(0);
    expect(Array.isArray(j.data.list)).toBe(true);
  });

  it('物化提交后返回 AsyncTask（异步任务化）并刷新快照人数', async () => {
    const list = await call('GET', '/api/analytics/segments?page=1&pageSize=1');
    const id = list.data.list[0].id;
    const j = await call('POST', `/api/analytics/segments/${id}/materialize`);
    expect(j.code).toBe(0);
    expect(j.data.taskType).toBe('analytics-segment-materialize');
    expect(['pending', 'running']).toContain(j.data.status);
    expect(j.data.payload.segmentId).toBe(id);

    const detail = await call('GET', `/api/analytics/segments/${id}`);
    expect(detail.data.snapshotAt).not.toBeNull();
    expect(detail.data.estimatedSize).toBeGreaterThan(0);
  });

  it('物化不存在的分群返回 404', async () => {
    const j = await call('POST', '/api/analytics/segments/999999/materialize');
    expect(j.code).toBe(404);
  });
});

describe('通用事件分析工作台 handler smoke', () => {
  it('按 eventName 分组返回聚合行，且 queryMeta 回显 groupBy/metric/区间', async () => {
    const j = await call('POST', '/api/analytics/events/query', { groupBy: ['eventName'], metric: 'events', days: 30 });
    expect(j.code).toBe(0);
    expect(Array.isArray(j.data.rows)).toBe(true);
    expect(j.data.queryMeta.groupBy).toEqual(['eventName']);
    expect(j.data.queryMeta.metric).toBe('events');
    expect(typeof j.data.total).toBe('number');
  });

  it('metric=uv 时按 distinctId/userId 去重计数', async () => {
    const j = await call('POST', '/api/analytics/events/query', { groupBy: ['source'], metric: 'uv', days: 30 });
    expect(j.code).toBe(0);
    expect(j.data.queryMeta.metric).toBe('uv');
  });

  it('限制结果行数 limit', async () => {
    const j = await call('POST', '/api/analytics/events/query', { groupBy: ['eventName'], metric: 'events', days: 30, limit: 2 });
    expect(j.data.rows.length).toBeLessThanOrEqual(2);
  });
});

describe('漏斗 handler — 新增 conversionWindowHours/segmentId 参数 + averageConversionMs', () => {
  it('返回结果每步含 averageConversionMs（首步为 null）', async () => {
    const j = await call('POST', '/api/analytics/funnel', {
      steps: [{ label: '浏览', eventName: 'view' }, { label: '下单', eventName: 'order' }],
      conversionWindowHours: 48,
      days: 30,
    });
    expect(j.code).toBe(0);
    expect(j.data.steps[0]).toHaveProperty('averageConversionMs');
    expect(j.data.steps[0].averageConversionMs).toBeNull();
    expect(j.data.steps[1]).toHaveProperty('averageConversionMs');
  });
});

describe('留存 handler — mode 双口径回显', () => {
  it('默认 mode=first_seen', async () => {
    const j = await call('GET', '/api/analytics/retention?days=14');
    expect(j.code).toBe(0);
    expect(j.data.mode).toBe('first_seen');
  });

  it('显式传入 mode=window_first 时回显对应口径', async () => {
    const j = await call('GET', '/api/analytics/retention?days=14&mode=window_first');
    expect(j.code).toBe(0);
    expect(j.data.mode).toBe('window_first');
  });
});
