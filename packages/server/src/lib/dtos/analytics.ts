/**
 * 用户行为分析 DTO
 */
import { z } from '@hono/zod-openapi';

export const UserEventInputDTO = z
  .object({
    sessionId: z.string().max(36),
    eventType: z.enum(['page_view', 'page_leave', 'feature_use', 'area_click']),
    pagePath: z.string().max(256),
    pageTitle: z.string().max(128).optional(),
    elementKey: z.string().max(128).optional(),
    elementLabel: z.string().max(128).optional(),
    componentArea: z.string().max(64).optional(),
    clickX: z.number().min(0).max(100).optional(),
    clickY: z.number().min(0).max(100).optional(),
    durationMs: z.number().int().min(0).optional(),
  })
  .openapi('UserEventInput');

export const BatchUserEventsBodyDTO = z
  .object({
    events: z.array(UserEventInputDTO).min(1).max(100),
  })
  .openapi('BatchUserEventsBody');

export const PageStatItemDTO = z
  .object({
    pagePath: z.string(),
    pageTitle: z.string().nullable(),
    visits: z.number().int(),
    avgMs: z.number().int().nullable(),
    medianMs: z.number().int().nullable(),
    p90Ms: z.number().int().nullable(),
  })
  .openapi('PageStatItem');

export const PageStatsDTO = z
  .object({
    items: z.array(PageStatItemDTO),
    totalVisits: z.number().int(),
  })
  .openapi('PageStats');

export const FeatureStatItemDTO = z
  .object({
    pagePath: z.string(),
    elementKey: z.string(),
    elementLabel: z.string().nullable(),
    componentArea: z.string().nullable(),
    count: z.number().int(),
  })
  .openapi('FeatureStatItem');

export const FeatureStatsDTO = z
  .object({
    items: z.array(FeatureStatItemDTO),
    totalEvents: z.number().int(),
  })
  .openapi('FeatureStats');

export const HeatmapPointDTO = z
  .object({ x: z.number(), y: z.number(), value: z.number() })
  .openapi('HeatmapPoint');

export const HeatmapDataDTO = z
  .object({
    pagePath: z.string(),
    componentArea: z.string(),
    points: z.array(HeatmapPointDTO),
    total: z.number().int(),
  })
  .openapi('HeatmapData');

export const HeatmapPageListDTO = z
  .object({
    pages: z.array(
      z.object({
        pagePath: z.string(),
        pageTitle: z.string().nullable(),
        areas: z.array(z.string()),
      }),
    ),
  })
  .openapi('HeatmapPageList');
