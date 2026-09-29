import { describe, expect, it } from 'vitest';
import { cmsStatMetricsSchema } from './contracts/stats';
import { assessCmsEditorialOutcome, cmsEditorialGoalSchema, type CmsEditorialGoal, type CmsEditorialMetricSnapshot } from './editorial-outcomes';
import { updateCmsEditorialTaskSchema } from './operations-validation';
const goal:CmsEditorialGoal={metric:'no_result_rate',targetValue:20,minSample:30,description:'无结果率降至20%以内'};
const metrics=cmsStatMetricsSchema.parse(Object.fromEntries(Object.keys(cmsStatMetricsSchema.shape).map(key=>[key,0])));
const snapshot=(searches:number,noResultSearches:number):CmsEditorialMetricSnapshot=>({window:{startTime:'2026-07-01T00:00:00Z',endTime:'2026-07-31T00:00:00Z',watermark:'2026-09-01T00:00:00Z',timeZone:'UTC'},metrics:{...metrics,searches,noResultSearches},coverage:{available:true,reason:'available'}});
describe('editorial outcome evidence gates',()=>{
  it('requires complete windows, sufficient denominators and complete collection coverage',()=>{
    const input={goal,before:snapshot(100,80),after:snapshot(100,10),windowComplete:true,interrupted:false};
    expect(assessCmsEditorialOutcome(input)).toBe('improved');
    expect(assessCmsEditorialOutcome({...input,windowComplete:false})).toBe('pending');
    expect(assessCmsEditorialOutcome({...input,after:snapshot(2,0)})).toBe('insufficient_sample');
    expect(assessCmsEditorialOutcome({...input,before:{...input.before,coverage:{available:false,reason:'paused'}}})).toBe('incomplete_coverage');
    expect(assessCmsEditorialOutcome({...input,interrupted:true})).toBe('interrupted');
    expect(assessCmsEditorialOutcome({...input,after:snapshot(100,30)})).toBe('not_improved');
  });
  it('does not claim improvement merely because an existing threshold was already met',()=>{
    expect(assessCmsEditorialOutcome({goal,before:snapshot(100,10),after:snapshot(100,10),windowComplete:true,interrupted:false})).toBe('not_improved');
  });
  it('keeps manual verification distinct from measurement and closes status/threshold bypasses',()=>{
    expect(assessCmsEditorialOutcome({goal:{...goal,metric:'manual'},before:snapshot(0,0),after:snapshot(0,0),windowComplete:true,interrupted:false})).toBe('manual_review');
    expect(cmsEditorialGoalSchema.safeParse({...goal,minSample:0}).success).toBe(false);
    expect(updateCmsEditorialTaskSchema.safeParse({expectedVersion:1,status:'verified'}).success).toBe(false);
    expect(updateCmsEditorialTaskSchema.safeParse({expectedVersion:1,status:'edit_done'}).success).toBe(false);
  });
});
