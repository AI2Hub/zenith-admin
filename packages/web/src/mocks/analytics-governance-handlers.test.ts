/**
 * 行为中心阶段 1 治理闭环 Demo MSW handler 冒烟测试。
 * 直接驱动 handler.run() 找到首个匹配并解析响应，校验租户覆盖 CRUD、质量看板查询、
 * 事件调试流、聚合重建（异步任务化）的关键行为与返回形状。
 */
import { describe, it, expect } from 'vitest';
import { analyticsHandlers } from '@/mocks/handlers/analytics';

const ORIGIN = window.location.origin;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 测试中按需访问任意 data 形状
interface ApiEnvelope { code: number; message: string; data: any }

/** 遍历 handlers，返回首个匹配该请求的响应体（解析 JSON 包裹）。 */
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

describe('analytics 治理闭环 handlers smoke', () => {
  it('租户覆盖：列表返回预置的 disabled 覆盖项', async () => {
    const j = await call('GET', '/api/analytics/event-overrides?page=1&pageSize=20');
    expect(j.code).toBe(0);
    expect(j.data.total).toBeGreaterThan(0);
    expect(j.data.list.some((o: { eventName: string; status: string }) => o.eventName === 'order_submit' && o.status === 'disabled')).toBe(true);
  });

  it('租户覆盖：创建 / 更新 / 删除', async () => {
    const created = await call('POST', '/api/analytics/event-overrides', { eventName: 'custom_test_event', status: 'disabled', reason: '测试' });
    expect(created.code).toBe(0);
    const id = created.data.id;
    expect(created.data.eventName).toBe('custom_test_event');

    const updated = await call('PUT', `/api/analytics/event-overrides/${id}`, { status: 'enabled', reason: null });
    expect(updated.data.status).toBe('enabled');

    const deleted = await call('DELETE', `/api/analytics/event-overrides/${id}`);
    expect(deleted.code).toBe(0);
    const listAfter = await call('GET', '/api/analytics/event-overrides?page=1&pageSize=100');
    expect(listAfter.data.list.some((o: { id: number }) => o.id === id)).toBe(false);
  });

  it('租户覆盖：重复 eventName 创建返回 400', async () => {
    await call('POST', '/api/analytics/event-overrides', { eventName: 'dup_event', status: 'disabled' });
    const dup = await call('POST', '/api/analytics/event-overrides', { eventName: 'dup_event', status: 'enabled' });
    expect(dup.code).toBe(400);
  });

  it('质量看板：按天数过滤并返回 totals 汇总', async () => {
    const j = await call('GET', '/api/analytics/quality?days=7');
    expect(j.code).toBe(0);
    expect(Array.isArray(j.data.items)).toBe(true);
    expect(Array.isArray(j.data.totals)).toBe(true);
    expect(typeof j.data.totalCount).toBe('number');
  });

  it('质量看板：按 issueType 过滤只返回匹配问题类型', async () => {
    const j = await call('GET', '/api/analytics/quality?days=7&issueType=event_disabled');
    expect(j.code).toBe(0);
    expect(j.data.items.every((row: { issueType: string }) => row.issueType === 'event_disabled')).toBe(true);
  });

  it('事件调试流：限制最大 50 条，附带 issueTypes', async () => {
    const j = await call('GET', '/api/analytics/debug/events?limit=200');
    expect(j.code).toBe(0);
    expect(j.data.length).toBeLessThanOrEqual(50);
    expect(j.data[0]).toHaveProperty('issueTypes');
    expect(j.data[0]).toHaveProperty('eventId');
  });

  it('事件调试流：eventName 过滤', async () => {
    const j = await call('GET', '/api/analytics/debug/events?limit=50&eventName=order_submit');
    expect(j.code).toBe(0);
    expect(j.data.every((e: { eventName: string | null }) => (e.eventName ?? '').includes('order_submit'))).toBe(true);
  });

  it('聚合重建：提交后返回 AsyncTask（异步任务化，非同步完成）', async () => {
    const j = await call('POST', '/api/analytics/rollup/rebuild?days=15');
    expect(j.code).toBe(0);
    expect(j.data.taskType).toBe('analytics-rollup-rebuild');
    expect(['pending', 'running']).toContain(j.data.status);
    expect(j.data.payload.days).toBe(15);
  });
});
