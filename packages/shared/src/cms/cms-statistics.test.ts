import { describe, expect, it } from 'vitest';
import { cmsStatRate, isCmsStatTimeZone } from './cms-statistics';
import { cmsStatReportQuery } from './contracts/stats';
describe('CMS statistics contract',()=>{
  it('validates IANA zones and denominator-free rates',()=>{
    expect(isCmsStatTimeZone('Asia/Shanghai')).toBe(true);
    expect(isCmsStatTimeZone('Invalid/Zone')).toBe(false);
    expect(cmsStatRate(2,3)).toBe(66.67);
    expect(cmsStatRate(1,0)).toBe(0);
  });
  it('bounds reporting pages and closes dynamic SQL sort/dimension inputs',()=>{
    expect(cmsStatReportQuery.parse({siteId:1,dimension:'utmCampaign'})).toMatchObject({page:1,pageSize:10,sortBy:'pv',sortOrder:'desc'});
    expect(cmsStatReportQuery.safeParse({siteId:1,dimension:';drop table user_events'}).success).toBe(false);
    expect(cmsStatReportQuery.safeParse({siteId:1,pageSize:201}).success).toBe(false);
  });
});
