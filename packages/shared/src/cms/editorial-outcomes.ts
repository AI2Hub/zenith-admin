import * as z from 'zod';
import { CMS_EDITORIAL_GOAL_METRICS, CMS_EDITORIAL_OBSERVATION_OUTCOMES, CMS_EDITORIAL_TASK_SOURCES } from './constants';
import { cmsStatMetricsSchema } from './contracts/stats';
import { cmsStatRate } from './cms-statistics';

export const cmsEditorialGoalSchema=z.object({metric:z.enum(CMS_EDITORIAL_GOAL_METRICS),targetValue:z.number().min(0).max(100),minSample:z.int().min(30).max(1000000),description:z.string().trim().min(1).max(1000)});
export type CmsEditorialGoal=z.infer<typeof cmsEditorialGoalSchema>;
export const cmsEditorialSourceWindowSchema=z.object({startTime:z.iso.datetime(),endTime:z.iso.datetime(),watermark:z.iso.datetime(),timeZone:z.string().max(64)}).superRefine((value,ctx)=>{
  const start=Date.parse(value.startTime),end=Date.parse(value.endTime),watermark=Date.parse(value.watermark);
  if(start>=end||end>watermark||end-start>90*86400000)ctx.addIssue({code:'custom',message:'证据窗口必须为不超过90天且不晚于统计截点的有效区间'});
  try{new Intl.DateTimeFormat('en',{timeZone:value.timeZone});}catch{ctx.addIssue({code:'custom',path:['timeZone'],message:'统计时区无效'});}
});
export const cmsEditorialCoverageSchema=z.object({available:z.boolean(),reason:z.enum(['available','not_started','unknown','paused','retention'])});
export const cmsEditorialMetricSnapshotSchema=z.object({window:cmsEditorialSourceWindowSchema,metrics:cmsStatMetricsSchema,coverage:cmsEditorialCoverageSchema});
export type CmsEditorialMetricSnapshot=z.infer<typeof cmsEditorialMetricSnapshotSchema>;
export const cmsEditorialSourceEvidenceSchema=z.object({kind:z.enum(CMS_EDITORIAL_TASK_SOURCES),summary:z.string(),capturedAt:z.string(),snapshot:cmsEditorialMetricSnapshotSchema.nullable(),metadata:z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()]))});
export type CmsEditorialSourceEvidence=z.infer<typeof cmsEditorialSourceEvidenceSchema>;
export const cmsEditorialObservationOutcomeSchema=z.enum(CMS_EDITORIAL_OBSERVATION_OUTCOMES);
export type CmsEditorialObservationOutcome=z.infer<typeof cmsEditorialObservationOutcomeSchema>;

/** A goal can never turn unknown coverage or a small denominator into an improvement claim. */
export function assessCmsEditorialOutcome(input:{goal:CmsEditorialGoal;before:CmsEditorialMetricSnapshot;after:CmsEditorialMetricSnapshot;windowComplete:boolean;interrupted:boolean}):CmsEditorialObservationOutcome {
  if(input.interrupted)return 'interrupted';
  if(!input.windowComplete)return 'pending';
  if(input.goal.metric==='manual')return 'manual_review';
  if(!input.before.coverage.available||!input.after.coverage.available)return 'incomplete_coverage';
  const before=input.before.metrics,after=input.after.metrics;
  const sample=(metrics:typeof before)=>input.goal.metric==='no_result_rate'?metrics.searches:input.goal.metric==='read_rate'?metrics.pv:metrics.uv;
  if(sample(before)<input.goal.minSample||sample(after)<input.goal.minSample)return 'insufficient_sample';
  const value=(metrics:typeof before)=>input.goal.metric==='no_result_rate'?cmsStatRate(metrics.noResultSearches,metrics.searches):input.goal.metric==='read_rate'?metrics.readRate:metrics.conversionRate;
  const previous=value(before),current=value(after);
  return input.goal.metric==='no_result_rate'?(current<previous&&current<=input.goal.targetValue?'improved':'not_improved'):(current>previous&&current>=input.goal.targetValue?'improved':'not_improved');
}
