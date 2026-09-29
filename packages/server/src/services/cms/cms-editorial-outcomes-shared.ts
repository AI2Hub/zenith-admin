import { and, eq, sql } from 'drizzle-orm';
import type { CmsEditorialMetricSnapshot, CmsEditorialSourceEvidence, CmsStatMetrics } from '@zenith/shared/cms';
import { cmsStatContract } from '@zenith/shared/cms';
import type { DbTransaction } from '../../db/types';
import { cmsEditorialTaskHistory, cmsEditorialTaskRounds, type CmsEditorialTaskRow } from '../../db/schema';
import { currentUserOrNull } from '../../lib/context';
import { cmsStatsAggregateCte, mapCmsStatMetrics } from './cms-stats-query';
import { getCmsCollectionCoverage } from './cms-collection-state';

export async function readCmsEditorialMetricSnapshot(tx:DbTransaction,siteId:number,contentId:number|null,keyword:string|null,window:CmsEditorialMetricSnapshot['window']):Promise<CmsEditorialMetricSnapshot>{
  const query=cmsStatContract.overview.query.parse({siteId,...(!keyword&&contentId?{contentId}:{}),timeZone:window.timeZone,compare:'none'});
  const scope={...window,granularity:'day' as const,comparisonStart:null,comparisonEnd:null};
  const [row]=await tx.execute<CmsStatMetrics&{key:string;readThroughs:number;searchClickThroughs:number}>(sql`${cmsStatsAggregateCte(query,scope,keyword?'search':undefined)} select * from metrics ${keyword?sql`where key=${keyword}`:sql``}`);
  let coverage=await getCmsCollectionCoverage(tx,siteId,window.startTime,window.endTime,null);
  const [delivery]=await tx.execute<{pending:boolean}>(sql`select exists(select 1 from public.cms_telemetry_outbox o left join public.cms_telemetry_attributions a on a.event_id=o.event_id
    where o.site_id=${siteId} and (o.payload->>'occurredAt')::timestamptz>=${window.startTime}::timestamptz and (o.payload->>'occurredAt')::timestamptz<${window.endTime}::timestamptz
      and (o.delivered_at is null or a.event_id is null or (a.settled_at is null and a.next_recompute_at<=${window.watermark}::timestamptz))) as pending`);
  if(delivery.pending)coverage={available:false,reason:'unknown'};
  return {window,metrics:mapCmsStatMetrics(row),coverage};
}
export async function appendCmsEditorialTaskHistory(tx:DbTransaction,task:CmsEditorialTaskRow,action:string,note:string|null,snapshot:Record<string,unknown>={},system=false){
  const actor=system?null:currentUserOrNull();
  await tx.insert(cmsEditorialTaskHistory).values({taskId:task.id,roundNo:task.roundNo,version:task.version,action,note,actorId:actor?.userId??null,actorName:system?'系统':actor?.username??'系统',snapshot:{status:task.status,contentId:task.contentId,...snapshot}});
}
export async function createCmsEditorialRound(tx:DbTransaction,task:CmsEditorialTaskRow,sourceEvidence:CmsEditorialSourceEvidence){
  const [round]=await tx.insert(cmsEditorialTaskRounds).values({taskId:task.id,roundNo:task.roundNo,sourceEvidence}).returning();
  return round;
}
export async function lockCmsEditorialRound(tx:DbTransaction,task:CmsEditorialTaskRow){
  const [row]=await tx.select().from(cmsEditorialTaskRounds).where(and(eq(cmsEditorialTaskRounds.taskId,task.id),eq(cmsEditorialTaskRounds.roundNo,task.roundNo))).for('update').limit(1);
  return row;
}
