import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type * as z from 'zod';
import { assessCmsEditorialOutcome, type completeCmsEditorialTaskSchema, type verifyCmsEditorialTaskSchema, type reopenCmsEditorialTaskSchema, type refreshCmsEditorialObservationsSchema, type CmsEditorialSourceEvidence } from '@zenith/shared/cms';
import { db } from '../../db';
import type { DbTransaction } from '../../db/types';
import { cmsContents, cmsContentSuppressions, cmsContentRevisions, cmsDeployments, cmsEditorialTasks, cmsEditorialTaskRounds, cmsEditorialTaskObservations, cmsReleaseActivations, cmsSiteGenerations, type CmsEditorialTaskRow } from '../../db/schema';
import { requireRow } from '../../lib/db-assert';
import logger from '../../lib/logger';
import { acquireCmsSitePublishLock } from './cms-site-publish-lock.service';
import { isCmsRevisionAssetVisible } from './cms-asset-rights.service';
import { loadCmsPublishableRevision } from './cms-content-revisions.service';
import { assertCmsEditorialMetricsAccess, getCmsEditorialTask, getCmsEditorialTaskDetail } from './cms-editorial-tasks.service';
import { appendCmsEditorialTaskHistory, createCmsEditorialRound, lockCmsEditorialRound, readCmsEditorialMetricSnapshot } from './cms-editorial-outcomes-shared';

const DAY_MS=86400000;
const SETTLEMENT_MS=(24*60+15)*60000;
function assertVersion(task:CmsEditorialTaskRow,expected:number){if(task.version!==expected)throw new HTTPException(409,{message:'事项已更新，请刷新后重试'});}
async function lockTask(tx:DbTransaction,id:number){return requireRow((await tx.select().from(cmsEditorialTasks).where(eq(cmsEditorialTasks.id,id)).for('update').limit(1))[0],'编辑事项不存在');}
async function bumpTask(tx:DbTransaction,task:CmsEditorialTaskRow,status:typeof task.status){return (await tx.update(cmsEditorialTasks).set({status,version:task.version+1}).where(eq(cmsEditorialTasks.id,task.id)).returning())[0];}

async function solutionIsOnline(tx:DbTransaction,task:CmsEditorialTaskRow,round:typeof cmsEditorialTaskRounds.$inferSelect):Promise<boolean>{
  if(!task.contentId||!round.solutionRevisionId)return false;
  const [identity]=await tx.select({status:cmsContents.status,deletedAt:cmsContents.deletedAt,suppressed:cmsContentSuppressions.contentId}).from(cmsContents).leftJoin(cmsContentSuppressions,eq(cmsContentSuppressions.contentId,cmsContents.id)).where(eq(cmsContents.id,task.contentId)).limit(1);
  if(identity?.status!=='published'||identity.deletedAt||identity.suppressed)return false;
  const [active]=await tx.select({snapshot:cmsDeployments.snapshot}).from(cmsSiteGenerations).innerJoin(cmsDeployments,eq(cmsDeployments.id,cmsSiteGenerations.activeGenerationId)).where(eq(cmsSiteGenerations.siteId,task.siteId)).limit(1);
  if(!active?.snapshot?.revisions.some(entry=>entry.contentId===task.contentId&&entry.revisionId===round.solutionRevisionId&&entry.hash===round.solutionHash))return false;
  const [revision]=await tx.select({snapshot:cmsContentRevisions.snapshot}).from(cmsContentRevisions).where(eq(cmsContentRevisions.id,round.solutionRevisionId)).limit(1);
  return !!revision&&await isCmsRevisionAssetVisible(revision.snapshot,tx);
}

type ActivationInput={siteId:number;releaseId:number;deploymentId:number;activationId:number;activatedAt:Date;revisions:Array<{contentId:number;revisionId:number;hash:string}>};
async function bindActivation(tx:DbTransaction,task:CmsEditorialTaskRow,round:typeof cmsEditorialTaskRounds.$inferSelect,input:ActivationInput){
  await tx.update(cmsEditorialTaskRounds).set({releaseId:input.releaseId,deploymentId:input.deploymentId,activationId:input.activationId,activatedAt:input.activatedAt}).where(eq(cmsEditorialTaskRounds.id,round.id));
  for(const windowDays of [7,30] as const){const dueAt=new Date(input.activatedAt.getTime()+windowDays*DAY_MS);
    await tx.insert(cmsEditorialTaskObservations).values({taskId:task.id,roundId:round.id,windowDays,dueAt,settlesAt:new Date(dueAt.getTime()+SETTLEMENT_MS)}).onConflictDoNothing();
  }
  const updated=await bumpTask(tx,task,'online');
  await appendCmsEditorialTaskHistory(tx,updated,'activated',null,{revisionId:round.solutionRevisionId,releaseId:input.releaseId,deploymentId:input.deploymentId,activationId:input.activationId,activatedAt:input.activatedAt.toISOString()},true);
}

/** Called inside the actual activation transaction, after publication identity and activation fact have committed logically. */
export async function recordCmsEditorialActivation(tx:DbTransaction,input:ActivationInput){
  const tasks=await tx.select().from(cmsEditorialTasks).where(and(eq(cmsEditorialTasks.siteId,input.siteId),inArray(cmsEditorialTasks.status,['edit_done','online','observing','verified']))).orderBy(asc(cmsEditorialTasks.id)).for('update');
  const revisions=new Map(input.revisions.map(entry=>[entry.contentId,entry]));
  for(const task of tasks){
    const round=await lockCmsEditorialRound(tx,task);if(!round?.solutionRevisionId||round.closedAt)continue;
    const active=task.contentId?revisions.get(task.contentId):undefined;
    const matches=active?.revisionId===round.solutionRevisionId&&active?.hash===round.solutionHash;
    if(!round.activatedAt&&task.status==='edit_done'&&matches){await bindActivation(tx,task,round,input);continue;}
    if(round.activatedAt&&!matches&&!round.interruptedAt){
      await tx.update(cmsEditorialTaskRounds).set({interruptedAt:input.activatedAt,interruptionReason:'实际在线修订已被替换、撤下或回滚'}).where(eq(cmsEditorialTaskRounds.id,round.id));
      await tx.update(cmsEditorialTaskObservations).set({outcome:'interrupted',computedAt:new Date()}).where(and(eq(cmsEditorialTaskObservations.roundId,round.id),eq(cmsEditorialTaskObservations.outcome,'pending')));
      const updated=await bumpTask(tx,task,task.status==='verified'?'verified':'observing');
      await appendCmsEditorialTaskHistory(tx,updated,'interrupted','解决修订已不再在线；本轮证据保留，继续处理请重开事项',{activationId:input.activationId,revisionId:active?.revisionId??null},true);
    }
  }
}

export async function completeCmsEditorialTask(id:number,input:z.output<typeof completeCmsEditorialTaskSchema>){
  const visible=await getCmsEditorialTask(id);
  if(input.goal.metric!=='manual')await assertCmsEditorialMetricsAccess(visible.siteId);
  if(visible.source==='search'&&input.goal.metric!=='no_result_rate')throw new HTTPException(400,{message:'无结果搜索事项必须以降低无结果率验证，不能改为人工核验'});
  if(input.goal.metric==='no_result_rate'&&visible.source!=='search')throw new HTTPException(400,{message:'无结果率目标需要无结果搜索词来源'});
  await db.transaction(async tx=>{
    await acquireCmsSitePublishLock(tx,visible.siteId);
    const task=await lockTask(tx,id);assertVersion(task,input.expectedVersion);
    if(!['open','in_progress'].includes(task.status)||!task.contentId)throw new HTTPException(409,{message:'请先关联稿件；只有处理中事项可以完成编辑'});
    const round=requireRow(await lockCmsEditorialRound(tx,task),'本轮处理记录不存在');
    const revision=await loadCmsPublishableRevision(tx,input.revisionId);
    if(revision.siteId!==task.siteId||revision.contentId!==task.contentId)throw new HTTPException(400,{message:'解决修订必须是本站关联稿件的已审核修订'});
    const [generation]=await tx.select().from(cmsSiteGenerations).where(eq(cmsSiteGenerations.siteId,task.siteId)).limit(1);
    const [deployment]=generation?.activeGenerationId?await tx.select().from(cmsDeployments).where(eq(cmsDeployments.id,generation.activeGenerationId)).limit(1):[];
    const isActive=deployment?.snapshot?.revisions.some(entry=>entry.contentId===task.contentId&&entry.revisionId===revision.id&&entry.hash===revision.hash);
    const [activation]=isActive?await tx.select().from(cmsReleaseActivations).where(and(eq(cmsReleaseActivations.siteId,task.siteId),eq(cmsReleaseActivations.toGenerationId,deployment!.id))).orderBy(desc(cmsReleaseActivations.id)).limit(1):[];
    if(activation&&activation.createdAt<round.createdAt&&input.goal.metric!=='manual')throw new HTTPException(409,{message:'该修订在本轮开始前已上线，请绑定本轮解决问题的新修订'});
    const [bound]=await tx.update(cmsEditorialTaskRounds).set({solutionRevisionId:revision.id,solutionHash:revision.hash,goal:input.goal}).where(eq(cmsEditorialTaskRounds.id,round.id)).returning();
    const updated=await bumpTask(tx,task,'edit_done');
    await appendCmsEditorialTaskHistory(tx,updated,'edit_completed',input.note,{revisionId:revision.id,revisionHash:revision.hash,goal:input.goal});
    if(activation&&deployment)await bindActivation(tx,updated,bound,{siteId:task.siteId,releaseId:deployment.releaseId,deploymentId:deployment.id,activationId:activation.id,activatedAt:activation.createdAt,revisions:deployment.snapshot!.revisions});
  });
  return getCmsEditorialTaskDetail(id);
}

async function recomputeObservation(tx:DbTransaction,task:CmsEditorialTaskRow,round:typeof cmsEditorialTaskRounds.$inferSelect,observation:typeof cmsEditorialTaskObservations.$inferSelect,now:Date){
  if(!round.activatedAt||!round.goal||now<=round.activatedAt)return;
  const start=round.activatedAt,end=new Date(Math.min(observation.dueAt.getTime(),now.getTime()));
  const timeZone=round.sourceEvidence.snapshot?.window.timeZone??(typeof round.sourceEvidence.metadata.timeZone==='string'?round.sourceEvidence.metadata.timeZone:'Asia/Shanghai');
  const keyword=task.source==='search'?task.sourceKeyword?.trim().toLowerCase()??null:null;
  const before=await readCmsEditorialMetricSnapshot(tx,task.siteId,task.contentId,keyword,{startTime:new Date(start.getTime()-(end.getTime()-start.getTime())).toISOString(),endTime:start.toISOString(),watermark:now.toISOString(),timeZone});
  const after=await readCmsEditorialMetricSnapshot(tx,task.siteId,task.contentId,keyword,{startTime:start.toISOString(),endTime:end.toISOString(),watermark:now.toISOString(),timeZone});
  const changes=await tx.select({id:cmsReleaseActivations.id}).from(cmsReleaseActivations).where(and(eq(cmsReleaseActivations.siteId,task.siteId),sql`${cmsReleaseActivations.createdAt}>${start.toISOString()}::timestamptz`,sql`${cmsReleaseActivations.createdAt}<${end.toISOString()}::timestamptz`)).orderBy(asc(cmsReleaseActivations.id));
  const outcome=assessCmsEditorialOutcome({goal:round.goal,before,after,windowComplete:now>=observation.settlesAt,interrupted:!!round.interruptedAt||!await solutionIsOnline(tx,task,round)});
  await tx.update(cmsEditorialTaskObservations).set({before,after,outcome,otherActivationIds:changes.map(row=>row.id),computedAt:now}).where(eq(cmsEditorialTaskObservations.id,observation.id));
  const evidenceChanged = observation.outcome !== outcome || JSON.stringify(observation.before?.metrics) !== JSON.stringify(before.metrics) || JSON.stringify(observation.after?.metrics) !== JSON.stringify(after.metrics) || JSON.stringify(observation.before?.coverage) !== JSON.stringify(before.coverage) || JSON.stringify(observation.after?.coverage) !== JSON.stringify(after.coverage);
  if (evidenceChanged) await appendCmsEditorialTaskHistory(tx,task,'observation',null,{observationId:observation.id,windowDays:observation.windowDays,outcome,before,after,otherActivationIds:changes.map(row=>row.id)},true);
}

export async function refreshCmsEditorialObservations(id:number,input:z.output<typeof refreshCmsEditorialObservationsSchema>){
  const visible=await getCmsEditorialTask(id);await assertCmsEditorialMetricsAccess(visible.siteId);
  await db.transaction(async tx=>{
    await acquireCmsSitePublishLock(tx,visible.siteId);
    const task=await lockTask(tx,id);assertVersion(task,input.expectedVersion);
    const round=requireRow(await lockCmsEditorialRound(tx,task),'本轮处理记录不存在');
    if(!round.activatedAt||round.closedAt)throw new HTTPException(409,{message:'本轮尚未上线或已结束，不能刷新观察结果'});
    const observations=await tx.select().from(cmsEditorialTaskObservations).where(eq(cmsEditorialTaskObservations.roundId,round.id)).orderBy(asc(cmsEditorialTaskObservations.windowDays)).for('update');
    const updated=await bumpTask(tx,task,task.status==='online'?'observing':task.status);
    for(const observation of observations)await recomputeObservation(tx,updated,round,observation,new Date());
  },{isolationLevel:'repeatable read'});
  return getCmsEditorialTaskDetail(id);
}

export async function verifyCmsEditorialTask(id:number,input:z.output<typeof verifyCmsEditorialTaskSchema>){
  const visible=await getCmsEditorialTask(id);
  const [visibleRound]=await db.select().from(cmsEditorialTaskRounds).where(and(eq(cmsEditorialTaskRounds.taskId,id),eq(cmsEditorialTaskRounds.roundNo,visible.roundNo))).limit(1);
  if(visibleRound?.goal?.metric!=='manual')await assertCmsEditorialMetricsAccess(visible.siteId);
  await db.transaction(async tx=>{
    await acquireCmsSitePublishLock(tx,visible.siteId);
    const task=await lockTask(tx,id);assertVersion(task,input.expectedVersion);
    const round=requireRow(await lockCmsEditorialRound(tx,task),'本轮处理记录不存在');
    if(!['online','observing'].includes(task.status)||!round.activatedAt||round.interruptedAt||!round.goal)throw new HTTPException(409,{message:'只有解决修订持续在线且观察有效的事项可以验证'});
    if(!await solutionIsOnline(tx,task,round))throw new HTTPException(409,{message:'解决修订已撤下、替换或素材不可访问，不能验证'});
    if(round.goal.metric!=='manual'){
      const observation=requireRow((await tx.select().from(cmsEditorialTaskObservations).where(and(eq(cmsEditorialTaskObservations.id,input.observationId??0),eq(cmsEditorialTaskObservations.roundId,round.id))).for('update').limit(1))[0],'请选择本轮30天观察结果');
      if(observation.windowDays!==30||new Date()<observation.settlesAt)throw new HTTPException(409,{message:'须等待30天观察及迟到结算窗口完整结束'});
      await recomputeObservation(tx,task,round,observation,new Date());
      const [latest]=await tx.select().from(cmsEditorialTaskObservations).where(eq(cmsEditorialTaskObservations.id,observation.id)).limit(1);
      if(latest.outcome!=='improved')throw new HTTPException(409,{message:'样本、采集覆盖或改善目标不满足，不能标记有效改善'});
    }
    await tx.update(cmsEditorialTaskRounds).set({verifiedAt:new Date()}).where(eq(cmsEditorialTaskRounds.id,round.id));
    const updated=await bumpTask(tx,task,'verified');
    await appendCmsEditorialTaskHistory(tx,updated,'verified',input.note,{observationId:input.observationId,verification:round.goal.metric==='manual'?'人工核验通过，不推断指标改善':'指标达到预设目标，不作单一因果结论'});
  },{isolationLevel:'repeatable read'});
  return getCmsEditorialTaskDetail(id);
}

export async function reopenCmsEditorialTask(id:number,input:z.output<typeof reopenCmsEditorialTaskSchema>){
  const visible=await getCmsEditorialTask(id);
  await db.transaction(async tx=>{
    await acquireCmsSitePublishLock(tx,visible.siteId);
    const task=await lockTask(tx,id);assertVersion(task,input.expectedVersion);
    const round=requireRow(await lockCmsEditorialRound(tx,task),'本轮处理记录不存在');
    await tx.update(cmsEditorialTaskRounds).set({closedAt:new Date()}).where(eq(cmsEditorialTaskRounds.id,round.id));
    const [updated]=await tx.update(cmsEditorialTasks).set({roundNo:task.roundNo+1,status:'open',version:task.version+1}).where(eq(cmsEditorialTasks.id,id)).returning();
    const evidence:CmsEditorialSourceEvidence={...round.sourceEvidence,capturedAt:new Date().toISOString(),summary:input.reason,snapshot:null,metadata:{...round.sourceEvidence.metadata,previousRound:round.roundNo,reopenReason:input.reason}};
    await createCmsEditorialRound(tx,updated,evidence);await appendCmsEditorialTaskHistory(tx,updated,'reopened',input.reason,{previousRound:round.roundNo,sourceEvidence:evidence});
  });
  return getCmsEditorialTaskDetail(id);
}

/** Scheduled bounded scanner; user-triggered refresh shares the same evidence and verdict code. */
export async function observeCmsEditorialTaskOutcomes():Promise<string>{
  const deadline=Date.now()+45000;let observed=0,failed=0;
  const online=await db.select({id:cmsEditorialTasks.id,siteId:cmsEditorialTasks.siteId}).from(cmsEditorialTasks).where(eq(cmsEditorialTasks.status,'online')).limit(100);
  for(const row of online) {
    if(Date.now()>=deadline)break;
    try { await db.transaction(async tx=>{
      await tx.execute(sql`set local lock_timeout='2s'`);
      await acquireCmsSitePublishLock(tx,row.siteId);const task=await lockTask(tx,row.id);
      if(task.status==='online'){const updated=await bumpTask(tx,task,'observing');await appendCmsEditorialTaskHistory(tx,updated,'observing','开始7天/30天效果观察',{},true);}
    }); } catch(error) { failed++; logger.warn({taskId:row.id,error},'CMS 事项进入观察失败'); }
  }
  // Coverage made unknown by undelivered conversions can recover after the observation deadline.
  const retryable = sql`(${cmsEditorialTaskObservations.outcome}='pending' or
    (${cmsEditorialTaskObservations.outcome}='incomplete_coverage' and ${cmsEditorialTaskObservations.computedAt}<clock_timestamp()-interval '1 hour'
      and (${cmsEditorialTaskObservations.before}->'coverage'->>'reason'='unknown' or ${cmsEditorialTaskObservations.after}->'coverage'->>'reason'='unknown')))`;
  const due=await db.select({id:cmsEditorialTaskObservations.id,taskId:cmsEditorialTasks.id,siteId:cmsEditorialTasks.siteId}).from(cmsEditorialTaskObservations)
    .innerJoin(cmsEditorialTaskRounds,eq(cmsEditorialTaskRounds.id,cmsEditorialTaskObservations.roundId))
    .innerJoin(cmsEditorialTasks,and(eq(cmsEditorialTasks.id,cmsEditorialTaskRounds.taskId),eq(cmsEditorialTasks.roundNo,cmsEditorialTaskRounds.roundNo)))
    .where(and(retryable,sql`${cmsEditorialTaskObservations.settlesAt}<=clock_timestamp()`,isNull(cmsEditorialTaskRounds.closedAt),inArray(cmsEditorialTasks.status,['online','observing'])))
    .orderBy(sql`${cmsEditorialTaskObservations.computedAt} asc nulls first`,asc(cmsEditorialTaskObservations.settlesAt)).limit(100);
  for(const row of due){
    if(Date.now()>=deadline)break;
    try{await db.transaction(async tx=>{
      await tx.execute(sql`set local lock_timeout='2s'`);
      await tx.execute(sql`set local statement_timeout='10s'`);
      await acquireCmsSitePublishLock(tx,row.siteId);const task=await lockTask(tx,row.taskId);const round=requireRow(await lockCmsEditorialRound(tx,task),'本轮处理记录不存在');
      const [observation]=await tx.select().from(cmsEditorialTaskObservations).where(and(eq(cmsEditorialTaskObservations.id,row.id),eq(cmsEditorialTaskObservations.roundId,round.id),retryable)).for('update').limit(1);
      if(!observation||round.closedAt)return;
      await recomputeObservation(tx,task,round,observation,new Date());observed++;
    },{isolationLevel:'repeatable read'});}catch(error){failed++;logger.warn({taskId:row.taskId,error},'CMS 事项效果复盘失败');}
  }
  return `完成 ${observed} 条观察，失败 ${failed} 条`;
}
