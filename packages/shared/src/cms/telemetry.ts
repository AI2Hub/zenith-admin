import * as z from 'zod';
import { CMS_TELEMETRY_CLIENT_EVENTS, CMS_TELEMETRY_ENVIRONMENTS, CMS_TELEMETRY_SERVER_EVENTS } from './constants';

export const cmsTelemetrySettingsSchema = z.object({
  enabled: z.boolean(),
  timeZone: z.string().max(64).refine((value) => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, '请选择有效的 IANA 时区'),
});
export const cmsTelemetryUtmSchema = z.object({ source: z.string().max(128).optional(), medium: z.string().max(128).optional(), campaign: z.string().max(128).optional(), term: z.string().max(128).optional(), content: z.string().max(128).optional() });
export const cmsTelemetryPropertiesSchema = z.object({
  entryPath: z.string().startsWith('/').max(500).optional(), entrySource: z.string().max(128).optional(), isNewVisitor: z.boolean().optional(),
  entryUtm: cmsTelemetryUtmSchema.optional(),
  lastContentId: z.int().positive().optional(), lastContentAt: z.iso.datetime().optional(),
  activeMs: z.int().min(0).max(86_400_000).optional(), scrollDepth: z.number().min(0).max(100).optional(),
  keyword: z.string().max(64).optional(), resultCount: z.int().nonnegative().optional(), searchId: z.uuid().optional(),
  targetContentId: z.int().positive().optional(), position: z.int().min(1).max(10000).optional(),
  componentId: z.string().max(128).optional(), componentSlot: z.string().max(64).optional(), targetPath: z.string().max(500).optional(),
  componentName: z.string().max(255).optional(), targetName: z.string().max(255).optional(), resourceName: z.string().max(255).optional(),
  resourceId: z.int().positive().optional(), assetVersionId: z.int().positive().optional(), mediaProgress: z.number().min(0).max(100).optional(),
  mediaDuration: z.number().min(0).max(86_400).optional(), playedMs: z.int().min(0).max(86_400_000).optional(),
  formId: z.string().max(128).optional(), targetId: z.string().max(128).optional(), failureCode: z.string().max(128).optional(),
  formName: z.string().max(255).optional(), interactionId: z.int().positive().optional(), interactionName: z.string().max(255).optional(),
}).strict();
export const cmsTelemetryEventSchema = z.object({
  eventId: z.uuid(), name: z.enum(CMS_TELEMETRY_CLIENT_EVENTS), occurredAt: z.iso.datetime(),
  visitorId: z.uuid(), sessionId: z.uuid(), pageViewId: z.uuid(),
  properties: cmsTelemetryPropertiesSchema.default({}), referrer: z.string().max(1000).optional(), utm: cmsTelemetryUtmSchema.optional(),
  screenW: z.int().min(0).max(20000).optional(), screenH: z.int().min(0).max(20000).optional(), language: z.string().max(16).optional(),
});
export type CmsTelemetryEvent = z.infer<typeof cmsTelemetryEventSchema>;
export const cmsTelemetryBatchSchema = z.object({ contextToken: z.string().min(1).max(12000), events: z.array(cmsTelemetryEventSchema).min(1).max(30) });
export const cmsTelemetryResultSchema = z.object({ acceptedEventIds: z.array(z.string()), rejectedEventIds: z.array(z.string()), duplicates: z.int(), reason: z.string().optional() });
export type CmsTelemetryResult = z.infer<typeof cmsTelemetryResultSchema>;

/** Immutable page facts, signed by the renderer; never inferred from a slug at ingest. */
export const cmsTelemetryPageContextSchema = z.object({
  version: z.literal(2), siteId: z.int().positive(), siteKey: z.string().min(1), environment: z.enum(CMS_TELEMETRY_ENVIRONMENTS),
  canonicalPath: z.string().startsWith('/').max(500), pageType: z.string().max(32),
  contentId: z.int().positive().nullable(), channelId: z.int().positive().nullable(), revisionId: z.int().positive().nullable(),
  contentType: z.string().max(32).nullable(), contentTitle: z.string().max(255).nullable(), channelName: z.string().max(255).nullable(), author: z.string().max(128).nullable(),
  deploymentId: z.int().positive().nullable(), releaseId: z.int().positive().nullable(),
  search: z.object({ keyword: z.string().max(64), resultCount: z.int().nonnegative(), page: z.int().positive(), searchId: z.uuid().optional() }).optional(),
});
export type CmsTelemetryPageContext = z.infer<typeof cmsTelemetryPageContextSchema>;
export type CmsTelemetryConfig = Pick<CmsTelemetryPageContext, 'siteId' | 'environment' | 'canonicalPath' | 'pageType' | 'search'> & { contentId?: number };

export const cmsTelemetryConversionContextSchema = z.object({
  contextToken: z.string().min(1).max(12000), visitorId: z.uuid(), sessionId: z.uuid(), pageViewId: z.uuid(),
  entryPath: z.string().startsWith('/').max(500), entrySource: z.string().max(128),
  lastContentId: z.int().positive().optional(), lastContentAt: z.iso.datetime().optional(), utm: cmsTelemetryUtmSchema.optional(),
});
export type CmsTelemetryConversionContext = z.infer<typeof cmsTelemetryConversionContextSchema>;
export const cmsTelemetryBusinessPayloadSchema = z.object({
  name: z.enum(CMS_TELEMETRY_SERVER_EVENTS), referenceId: z.string().max(128), targetId: z.string().max(128), targetName: z.string().max(255).optional(),
  occurredAt: z.iso.datetime(), memberId: z.int().positive().nullable(), context: cmsTelemetryConversionContextSchema.nullable(), page: cmsTelemetryPageContextSchema.nullable(),
  resourceId: z.int().positive().optional(), assetVersionId: z.int().positive().optional(),
});
export type CmsTelemetryBusinessPayload = z.infer<typeof cmsTelemetryBusinessPayloadSchema>;

