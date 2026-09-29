import { observeCmsCollectionState, readCmsCollectionState } from './cms-collection-state';
import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { cmsTelemetryConversionContextSchema, type CmsTelemetryBusinessPayload, type CmsTelemetryConversionContext, type CmsTelemetryPageContext } from '@zenith/shared/cms';
import { db } from '../../db';
import type { DbTransaction } from '../../db/types';
import { analyticsSites, cmsDeployments, cmsSites, cmsTelemetryAttributions, cmsTelemetryOutbox, cmsTelemetryReceipts, userEvents } from '../../db/schema';
import { verifyCmsTelemetryPageToken } from './cms-telemetry-context';
import { cmsGenerationContext } from './cms-generation-context';
import { createConcurrencyLimiter, mapWithConcurrency } from '../../lib/concurrency';
import logger from '../../lib/logger';
import { recomputeCmsTelemetryAttribution } from './cms-telemetry-attribution';

type BusinessType = 'form' | 'vote' | 'comment' | 'follow' | 'download';
const names = { form: 'cms.form_complete', vote: 'cms.vote_complete', comment: 'cms.comment_complete', follow: 'cms.follow_complete', download: 'cms.download_delivered' } as const;
function eventId(siteId: number, name: string, referenceId: string): string {
  const bytes=createHash('sha256').update(`cms-telemetry-v2:${siteId}:${name}:${referenceId}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function parseContext(raw: unknown): CmsTelemetryConversionContext | null {
  try { const parsed=cmsTelemetryConversionContextSchema.safeParse(typeof raw==='string'?JSON.parse(raw):raw);return parsed.success?parsed.data:null; }catch{return null;}
}

/** The outbox belongs to the successful business transaction, so delivery failure cannot lose a conversion. */
export async function enqueueCmsTelemetryConversion(tx: DbTransaction,siteId: number,type: BusinessType,referenceId: string|number,raw: unknown,memberId?: number|null,targetId?: string,targetName?: string,media?:Pick<CmsTelemetryBusinessPayload,'resourceId'|'assetVersionId'>): Promise<void> {
  if(cmsGenerationContext()?.candidate)return;
  const [site]=await tx.select({settings:cmsSites.settings,status:cmsSites.status}).from(cmsSites).where(eq(cmsSites.id,siteId)).limit(1);
  const settings=site?.settings?.telemetry as {enabled?:boolean;schemaVersion?:number}|undefined;
  if(site?.status!=='enabled'||!settings?.enabled||settings.schemaVersion!==2)return;
  if (!(await readCmsCollectionState(tx, siteId)).enabled) return;
  await observeCmsCollectionState(tx, siteId);
  let context=parseContext(raw);let page:CmsTelemetryPageContext|null=context?verifyCmsTelemetryPageToken(context.contextToken):null;
  if(!page||page.siteId!==siteId||page.environment!=='live'||page.siteKey!==site.settings?.analyticsSiteKey){context=null;page=null;}
  if(page){
    const [deployment]=page.deploymentId?await tx.select({releaseId:cmsDeployments.releaseId,activatedAt:cmsDeployments.activatedAt}).from(cmsDeployments).where(and(eq(cmsDeployments.id,page.deploymentId),eq(cmsDeployments.siteId,siteId))).limit(1):[];
    if(!deployment?.activatedAt||deployment.releaseId!==page.releaseId){context=null;page=null;}
  }
  const payload:CmsTelemetryBusinessPayload={name:names[type],referenceId:String(referenceId),targetId:targetId??`${type}:${referenceId}`,...(targetName?{targetName}:{}),...media,occurredAt:new Date().toISOString(),memberId:memberId??null,context,page};
  await tx.insert(cmsTelemetryOutbox).values({siteId,eventId:eventId(siteId,payload.name,payload.referenceId),payload}).onConflictDoNothing({target:cmsTelemetryOutbox.eventId});
}

async function deliver(tx:DbTransaction,row:typeof cmsTelemetryOutbox.$inferSelect):Promise<boolean>{
  const {payload}=row;const page=payload.page;const context=payload.context;
  const [app]=await tx.select({appId:analyticsSites.appId}).from(cmsSites).innerJoin(analyticsSites,and(sql`${cmsSites.settings}->>'analyticsSiteKey'=${analyticsSites.siteKey}`,isNull(analyticsSites.tenantId))).where(eq(cmsSites.id,row.siteId)).limit(1);
  const now=new Date();
  const targetFields=payload.targetId.startsWith('form:')?{formId:payload.targetId.slice(5),formName:payload.targetName}:payload.targetId.startsWith('interaction:')?{interactionId:Number(payload.targetId.slice(12)),interactionName:payload.targetName}:{};
  const properties:Record<string,unknown>={cmsSchemaVersion:2,cmsSiteId:row.siteId,trustedCms:true,environment:'live',receivedAt:now.toISOString(),referenceId:payload.referenceId,targetId:payload.targetId,targetName:payload.targetName,...targetFields,
    ...(payload.resourceId?{resourceId:payload.resourceId,assetVersionId:payload.assetVersionId,resourceName:payload.targetName}:{}),
    ...(page?{contentId:page.contentId,contentTitle:page.contentTitle,channelId:page.channelId,channelName:page.channelName,contentType:page.contentType,author:page.author,revisionId:page.revisionId,releaseId:page.releaseId,deploymentId:page.deploymentId,pageType:page.pageType,canonicalPath:page.canonicalPath}:{}),
    ...(context?{visitorId:context.visitorId,sessionId:context.sessionId,pageViewId:context.pageViewId,entryPath:context.entryPath,entrySource:context.entrySource,
      ...(context.utm?{utmSource:context.utm.source,utmMedium:context.utm.medium,utmCampaign:context.utm.campaign,utmTerm:context.utm.term,utmContent:context.utm.content}:{})}:{entrySource:'unattributed',entryPath:'/',attributionReason:'missing_or_invalid_context'}),
  };
  const inserted=await tx.insert(userEvents).values({eventId:row.eventId,tenantId:null,distinctId:payload.memberId?`m:${payload.memberId}`:context?.visitorId??null,anonymousId:context?.visitorId??null,sessionId:context?.sessionId??null,
    memberId:payload.memberId,source:'server',appId:app?.appId??`cms-${row.siteId}`,environment:'production',eventType:'custom',eventName:payload.name,pagePath:page?.canonicalPath.slice(0,256)??'/server/cms',pageTitle:page?.contentTitle?.slice(0,128)??null,createdAt:new Date(payload.occurredAt),properties,
  }).onConflictDoNothing({target:userEvents.eventId}).returning({id:userEvents.id});
  await tx.update(cmsTelemetryOutbox).set({deliveredAt:now,lastError:null,consecutiveFailures:0,leaseOwner:null,leaseExpiresAt:null,attempts:sql`${cmsTelemetryOutbox.attempts}+1`}).where(eq(cmsTelemetryOutbox.id,row.id));
  await tx.insert(cmsTelemetryReceipts).values({siteId:row.siteId,accepted:inserted.length,duplicates:inserted.length?0:1,rejected:0,reason:'business_outbox'});
  await tx.insert(cmsTelemetryAttributions).values({eventId:row.eventId,siteId:row.siteId,status:context?'unmatched':'missing_context',origin:{},computedAt:now,nextRecomputeAt:now}).onConflictDoNothing();
  return inserted.length>0;
}


const deliveryLimiter = createConcurrencyLimiter(4);
function deliveryFailureMessage(error: unknown): string {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  // Drizzle's error message can include SQL parameters and signed visitor context. Never expose it in diagnostics.
  return /^[0-9A-Z]{5}$/.test(code) ? `数据库投递失败（${code}），请由管理员查看服务日志` : '转化投递失败，请检查数据库连接和事件约束后重试';
}
const LEASE_MS = 120_000;
const MAX_FAILURES = 12;
export function cmsTelemetryRetryDelayMs(failures: number): number {
  return Math.min(3_600_000, 5_000 * 2 ** Math.max(0, failures - 1));
}

/** A fair claim gives each site one row before taking its next row. A crashed worker's lease expires. */
async function claimDeliveries() {
  const leaseOwner = randomUUID();
  const rows = await db.update(cmsTelemetryOutbox).set({ leaseOwner, leaseExpiresAt: new Date(Date.now() + LEASE_MS), lastAttemptAt: new Date() })
    .where(inArray(cmsTelemetryOutbox.id, sql`(
      select o.id from public.cms_telemetry_outbox o
      join (select id, row_number() over (partition by site_id order by next_attempt_at,id) as site_position
        from public.cms_telemetry_outbox where delivered_at is null and dead_letter_at is null and next_attempt_at<=clock_timestamp()
        and (lease_expires_at is null or lease_expires_at<clock_timestamp())) fair on fair.id=o.id
      where o.delivered_at is null and o.dead_letter_at is null and o.next_attempt_at<=clock_timestamp()
        and (o.lease_expires_at is null or o.lease_expires_at<clock_timestamp())
      order by fair.site_position,o.next_attempt_at,o.id limit 100 for update of o skip locked
    )`)).returning();
  return { leaseOwner, rows };
}

/** Short per-event transactions, bounded concurrency and a time budget remove the old 100/minute ceiling. */
export async function drainCmsTelemetryOutbox(options: { budgetMs?: number; concurrency?: number } = {}): Promise<{delivered:number;failed:number;duplicates:number}> {
  const deadline=Date.now()+(options.budgetMs ?? 30_000);
  const result={delivered:0,failed:0,duplicates:0};
  do {
    const {leaseOwner,rows}=await claimDeliveries();
    if(!rows.length)break;
    await mapWithConcurrency(rows,Math.min(4,Math.max(1,options.concurrency ?? 4)),row=>deliveryLimiter.run(async()=>{
      if(Date.now()>=deadline){
        await db.update(cmsTelemetryOutbox).set({leaseOwner:null,leaseExpiresAt:null}).where(and(eq(cmsTelemetryOutbox.id,row.id),eq(cmsTelemetryOutbox.leaseOwner,leaseOwner)));
        return;
      }
      try {
        const fresh=await db.transaction(async tx=>{
          await tx.execute(sql`set local statement_timeout='8s'`);
          const [claimed]=await tx.select().from(cmsTelemetryOutbox).where(and(eq(cmsTelemetryOutbox.id,row.id),eq(cmsTelemetryOutbox.leaseOwner,leaseOwner),isNull(cmsTelemetryOutbox.deliveredAt))).for('update');
          if(!claimed)return null;
          return deliver(tx,claimed);
        });
        if(fresh!==null){result.delivered++;if(!fresh)result.duplicates++;}
      } catch(error) {
        const failures=row.consecutiveFailures+1;
        await db.update(cmsTelemetryOutbox).set({ attempts:sql`${cmsTelemetryOutbox.attempts}+1`, consecutiveFailures:failures,
          nextAttemptAt:new Date(Date.now()+cmsTelemetryRetryDelayMs(failures)),deadLetterAt:failures>=MAX_FAILURES?new Date():null,
          leaseOwner:null,leaseExpiresAt:null,lastError:deliveryFailureMessage(error),
        }).where(and(eq(cmsTelemetryOutbox.id,row.id),eq(cmsTelemetryOutbox.leaseOwner,leaseOwner)));
        logger.warn({eventId:row.eventId,siteId:row.siteId,failures,error:deliveryFailureMessage(error)},'CMS 转化投递失败');
        result.failed++;
      }
    }));
  } while(Date.now()<deadline);
  return result;
}

/** Each attribution is replaceable derived data; success event IDs and facts stay immutable. */
export async function drainCmsTelemetryAttributions(options: { budgetMs?: number } = {}): Promise<number> {
  const deadline=Date.now()+(options.budgetMs ?? 15_000);let updated=0;
  do {
    const count=await db.transaction(async tx=>{
      const rows=await tx.select({eventId:cmsTelemetryAttributions.eventId}).from(cmsTelemetryAttributions)
        .where(sql`${cmsTelemetryAttributions.nextRecomputeAt}<=clock_timestamp()`).orderBy(cmsTelemetryAttributions.nextRecomputeAt,cmsTelemetryAttributions.eventId).limit(100).for('update',{skipLocked:true});
      for(const row of rows){
        try { await tx.transaction(nested=>recomputeCmsTelemetryAttribution(nested,row.eventId)); }
        catch(error) {
          logger.warn({eventId:row.eventId,error:deliveryFailureMessage(error)},'CMS 转化归因重算失败');
          await tx.update(cmsTelemetryAttributions).set({nextRecomputeAt:new Date(Date.now()+15*60_000)}).where(eq(cmsTelemetryAttributions.eventId,row.eventId));
        }
      }
      return rows.length;
    });
    updated+=count;if(!count)break;
  }while(Date.now()<deadline);
  return updated;
}
