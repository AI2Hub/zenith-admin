import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import {
  ANALYTICS_PROPERTIES_MAX_BYTES,
  SEED_MENUS,
  SEED_RATE_LIMIT_RULES,
  createErrorAlertRuleSchema,
  funnelStepSchema,
  trackEventInputSchema,
} from '@zenith/shared';
import type { TrackEventInput } from '@zenith/shared';
import { userEvents, analyticsSettings } from '../../db/schema';
import { getLegacyEventsWithoutIdCount, resolveDistinctId } from './analytics.service';

const baseEvent = {
  sessionId: 'a6cb293e-13d1-4d64-8e58-3f2c9935e9c8',
  pagePath: '/dashboard',
};

describe('analytics P0 contracts', () => {
  it('keeps the legacy eventId omission compatible while validating new IDs', () => {
    expect(trackEventInputSchema.safeParse({ ...baseEvent, eventType: 'page_view' }).success).toBe(true);
    expect(trackEventInputSchema.safeParse({
      ...baseEvent,
      eventId: 'not-a-uuid',
      eventType: 'page_view',
    }).success).toBe(false);
    expect(getLegacyEventsWithoutIdCount()).toBeGreaterThanOrEqual(0);
  });

  it('enforces event-type-specific required fields', () => {
    expect(trackEventInputSchema.safeParse({ ...baseEvent, eventType: 'custom' }).success).toBe(false);
    expect(trackEventInputSchema.safeParse({ ...baseEvent, eventType: 'custom', eventName: 'order_submit' }).success).toBe(true);
    expect(trackEventInputSchema.safeParse({ ...baseEvent, eventType: 'perf', metricName: 'LCP' }).success).toBe(false);
    expect(trackEventInputSchema.safeParse({ ...baseEvent, eventType: 'perf', metricName: 'LCP', metricValue: 1200 }).success).toBe(true);
    expect(trackEventInputSchema.safeParse({ ...baseEvent, eventType: 'identify' }).success).toBe(false);
  });

  it('rejects oversized or overly broad event property bags', () => {
    const tooMany = Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`k${index}`, index]));
    expect(trackEventInputSchema.safeParse({
      ...baseEvent,
      eventType: 'custom',
      eventName: 'wide_event',
      properties: tooMany,
    }).success).toBe(false);
    expect(trackEventInputSchema.safeParse({
      ...baseEvent,
      eventType: 'custom',
      eventName: 'large_event',
      properties: { payload: 'x'.repeat(ANALYTICS_PROPERTIES_MAX_BYTES) },
    }).success).toBe(false);
  });

  it('requires an actual funnel condition and a deliverable enabled alert', () => {
    expect(funnelStepSchema.safeParse({ label: '任意事件' }).success).toBe(false);
    expect(funnelStepSchema.safeParse({ label: '支付成功', eventName: 'payment_success' }).success).toBe(true);
    expect(createErrorAlertRuleSchema.safeParse({ name: '无渠道规则' }).success).toBe(false);
    expect(createErrorAlertRuleSchema.safeParse({
      name: 'Webhook 规则',
      channels: ['webhook'],
      webhookUrl: 'https://example.com/alerts',
    }).success).toBe(true);
  });

  it('forces authenticated distinct IDs to the verified user identity', () => {
    const event: TrackEventInput = {
      ...baseEvent,
      eventType: 'page_view',
      distinctId: 'u:forged',
    };
    expect(resolveDistinctId(event, 42)).toBe('u:42');
    expect(resolveDistinctId(event, null)).toBe(baseEvent.sessionId);
  });

  it('declares the P0 persistence and seed controls', () => {
    expect(userEvents.eventId).toBeDefined();
    expect(analyticsSettings.tenantId).toBeDefined();
    expect(getTableConfig(userEvents).indexes.map((index) => index.config.name)).toContain('user_events_event_id_uq');
    expect(getTableConfig(analyticsSettings).indexes.map((index) => index.config.name)).toContain('analytics_settings_tenant_uq');
    expect(SEED_RATE_LIMIT_RULES.map((rule) => rule.name)).toEqual(expect.arrayContaining([
      'analytics-ingest',
      'error-report',
    ]));
    expect(SEED_MENUS.find((menu) => menu.id === 603)?.permission).toBe('analytics:clean');
  });

  it('deduplicates legacy settings rows before adding the unique index', () => {
    const migration = readFileSync('drizzle/0042_secret_revanche.sql', 'utf8');
    expect(migration).toContain('DELETE FROM "analytics_settings" AS duplicate');
    expect(migration.indexOf('DELETE FROM "analytics_settings" AS duplicate'))
      .toBeLessThan(migration.indexOf('CREATE UNIQUE INDEX "analytics_settings_tenant_uq"'));
  });
});
