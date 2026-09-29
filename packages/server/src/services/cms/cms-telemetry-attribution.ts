import { and, eq, isNull, sql } from 'drizzle-orm';
import type { CmsTelemetryAttributionStatus } from '@zenith/shared/cms';
import type { DbTransaction } from '../../db/types';
import { cmsTelemetryAttributions, userEvents } from '../../db/schema';

/** The client accepts events up to 24h old. Allow a further 15m for commit and worker scheduling. */
const SETTLEMENT_DELAY_MS = (24 * 60 + 15) * 60_000;
export async function recomputeCmsTelemetryAttribution(tx: DbTransaction, eventId: string): Promise<void> {
  const [event] = await tx.select({ properties: userEvents.properties, occurredAt: userEvents.createdAt }).from(userEvents)
    .where(and(eq(userEvents.eventId, eventId), isNull(userEvents.tenantId), sql`${userEvents.properties}->>'trustedCms'='true'`)).limit(1);
  if (!event) return;
  const properties = event.properties ?? {};
  const now = new Date(); const siteId = Number(properties.cmsSiteId);
  const hasContext = !!properties.visitorId && !!properties.sessionId;
  const settled = !hasContext || now.getTime() >= event.occurredAt.getTime() + SETTLEMENT_DELAY_MS;
  let status: CmsTelemetryAttributionStatus = hasContext ? 'unmatched' : 'missing_context';
  const origin: Record<string, unknown> = {};
  if (hasContext) {
    const trusted = JSON.stringify({ cmsSchemaVersion: 2, cmsSiteId: siteId, trustedCms: true, environment: 'live', visitorId: properties.visitorId, sessionId: properties.sessionId });
    const [content] = await tx.execute<{ event_id: string; created_at: Date; properties: Record<string, unknown> }>(sql`
      select event_id,created_at,properties from public.user_events where tenant_id is null and properties @> ${trusted}::jsonb
      and event_name='cms.page_view' and nullif(properties->>'contentId','') is not null
      and created_at<=${event.occurredAt.toISOString()}::timestamptz and created_at>${event.occurredAt.toISOString()}::timestamptz-interval '30 minutes'
      order by created_at desc,event_id desc limit 1`);
    if (content) {
      status = 'matched'; origin.originEventId = content.event_id;
      for (const key of ['contentId', 'contentTitle', 'channelId', 'channelName', 'author', 'contentType', 'revisionId', 'releaseId', 'deploymentId']) {
        if (content.properties[key] != null) origin[`origin${key[0].toUpperCase()}${key.slice(1)}`] = content.properties[key];
      }
      const [search] = await tx.execute<{ event_id: string; properties: Record<string, unknown> }>(sql`
        select event_id,properties from public.user_events where tenant_id is null and properties @> ${trusted}::jsonb
        and event_name='cms.search_click' and properties->>'targetContentId'=${String(content.properties.contentId)}
        and created_at<=${new Date(content.created_at).toISOString()}::timestamptz and created_at>${event.occurredAt.toISOString()}::timestamptz-interval '30 minutes'
        order by created_at desc,event_id desc limit 1`);
      if (search) {
        origin.originSearchEventId = search.event_id;
        for (const key of ['searchId', 'keyword', 'resultCount']) if (search.properties[key] != null) origin[key] = search.properties[key];
      }
    }
  }
  await tx.update(cmsTelemetryAttributions).set({ status, origin, computedAt: now, settledAt: settled ? now : null,
    nextRecomputeAt: settled ? null : new Date(Math.min(now.getTime() + 5 * 60_000, event.occurredAt.getTime() + SETTLEMENT_DELAY_MS)),
  }).where(eq(cmsTelemetryAttributions.eventId, eventId));
}
