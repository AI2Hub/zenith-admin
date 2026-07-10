import { describe, expect, it } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import {
  chatbiSavedResourceMarker,
  isChatbiSessionAccessible,
  parseChatbiStructuredOutput,
} from './report-chatbi.service';

describe('ChatBI structured output', () => {
  it('accepts only the strict governed response contract', () => {
    const output = parseChatbiStructuredOutput(JSON.stringify({
      sql: 'SELECT id FROM orders',
      chart: { type: 'bar', title: '订单', categoryField: 'id', valueFields: ['id'], options: {} },
      title: '订单分析',
      explanation: '按订单展示',
    }));
    expect(output.sql).toBe('SELECT id FROM orders');
    expect(output.chart?.type).toBe('bar');
  });

  it('surfaces malformed or extra model output as an explicit error', () => {
    for (const value of [
      'not json',
      '{"sql":"SELECT 1"}',
      '{"sql":"SELECT 1","chart":null,"title":"x","explanation":"x","apiKey":"secret"}',
    ]) {
      expect(() => parseChatbiStructuredOutput(value)).toThrow(HTTPException);
    }
  });
});

describe('ChatBI session access', () => {
  const session = { tenantId: 8, userId: 10 };

  it('requires both the active tenant and owner by default', () => {
    expect(isChatbiSessionAccessible(session, { tenantId: 8, userId: 10 }, false)).toBe(true);
    expect(isChatbiSessionAccessible(session, { tenantId: 8, userId: 11 }, false)).toBe(false);
    expect(isChatbiSessionAccessible(session, { tenantId: 9, userId: 10 }, false)).toBe(false);
  });

  describe('ChatBI save idempotency', () => {
    it('uses a stable marker per message and resource type', () => {
      expect(chatbiSavedResourceMarker(42, 'dataset')).toBe('chatbi-dataset-message:42');
      expect(chatbiSavedResourceMarker(42, 'dataset')).toBe(chatbiSavedResourceMarker(42, 'dataset'));
      expect(chatbiSavedResourceMarker(42, 'dashboard')).not.toBe(chatbiSavedResourceMarker(42, 'dataset'));
      expect(chatbiSavedResourceMarker(43, 'dataset')).not.toBe(chatbiSavedResourceMarker(42, 'dataset'));
    });
  });

  it('allows an explicit manager only inside the active tenant', () => {
    expect(isChatbiSessionAccessible(session, { tenantId: 8, userId: 11 }, true)).toBe(true);
    expect(isChatbiSessionAccessible(session, { tenantId: 9, userId: 11 }, true)).toBe(false);
  });
});
