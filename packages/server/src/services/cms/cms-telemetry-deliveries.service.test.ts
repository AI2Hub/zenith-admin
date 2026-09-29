import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({site:vi.fn(),channels:vi.fn(),execute:vi.fn(),transaction:vi.fn()}));
vi.mock('../../db',()=>({db:{execute:mocks.execute,transaction:mocks.transaction}}));
vi.mock('./cms-sites.service',()=>({ensureCmsSiteExists:vi.fn(async()=>({id:15})),assertSiteAccess:mocks.site}));
vi.mock('./cms-channels.service',()=>({assertAllCmsSiteChannelsAccess:mocks.channels}));
import { getCmsTelemetryDeliverySummary, listCmsTelemetryDeliveries, replayCmsTelemetryDelivery } from './cms-telemetry-deliveries.service';
beforeEach(()=>vi.resetAllMocks());
describe('CMS delivery diagnostics site and channel scope',()=>{
  it.each(['list','summary','replay'] as const)('rejects partial-channel access before %s reads or writes',async action=>{
    const denied=new Error('all channel access required');mocks.channels.mockRejectedValue(denied);
    const operation=action==='list'?listCmsTelemetryDeliveries(15,{page:1,pageSize:20}):action==='summary'?getCmsTelemetryDeliverySummary(15):replayCmsTelemetryDelivery(15,42);
    await expect(operation).rejects.toBe(denied);
    expect(mocks.site).toHaveBeenCalledWith(15);expect(mocks.channels).toHaveBeenCalledWith(15);
    expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('does not read diagnostics when the site is inaccessible',async()=>{
    const denied=new Error('site inaccessible');mocks.site.mockRejectedValue(denied);
    await expect(getCmsTelemetryDeliverySummary(15)).rejects.toBe(denied);
    expect(mocks.channels).not.toHaveBeenCalled();expect(mocks.execute).not.toHaveBeenCalled();
  });
});
