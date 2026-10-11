import { OpenAPIHono } from '@hono/zod-openapi';
import { numberingRuleContract, numberingDefaultContract, numberingAllocationContract } from '@zenith/shared/platform';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { setAuditBeforeData } from '../../middleware/guard';
import {
  numberingRuleService, listAvailableNumberingRules, listNumberingScenes, previewNumberingRule,
  publishNumberingRule, listNumberingVersions, listNumberingCounters, listNumberingRuleUsages,
  listNumberingDefaults, updateNumberingDefault, resetNumberingDefault, getNumberingDefault, listNumberingAllocations,
} from '../../services/platform/numbering.service';
import { mountCrud } from '../_crud';

export const numberingRulesRouter = new OpenAPIHono({ defaultHook: validationHook });
mountCrud(numberingRulesRouter, numberingRuleContract, numberingRuleService, {}, [
  defineContractRoute(numberingRuleContract.all, { handler: async c => c.json(okBody(await listAvailableNumberingRules(c.req.valid('query'))), 200) }),
  defineContractRoute(numberingRuleContract.scenes, { handler: c => c.json(okBody(listNumberingScenes()), 200) }),
  defineContractRoute(numberingRuleContract.preview, { handler: c => c.json(okBody(previewNumberingRule(c.req.valid('json'))), 200) }),
  defineContractRoute(numberingRuleContract.versions, { handler: async c => c.json(okBody(await listNumberingVersions(c.req.valid('param').id)), 200) }),
  defineContractRoute(numberingRuleContract.counters, { handler: async c => c.json(okBody(await listNumberingCounters(c.req.valid('param').id)), 200) }),
  defineContractRoute(numberingRuleContract.usages, { handler: async c => c.json(okBody(await listNumberingRuleUsages(c.req.valid('param').id)), 200) }),
  defineContractRoute(numberingRuleContract.publish, { handler: async c => {
    const { id } = c.req.valid('param');
    setAuditBeforeData(c, await numberingRuleService.get(id));
    return c.json(okBody(await publishNumberingRule(id, c.req.valid('json')), '发布成功'), 200);
  } }),
]);

export const numberingDefaultsRouter = new OpenAPIHono({ defaultHook: validationHook });
numberingDefaultsRouter.openapiRoutes([
  defineContractRoute(numberingDefaultContract.list, { handler: async c => c.json(okBody(await listNumberingDefaults()), 200) }),
  defineContractRoute(numberingDefaultContract.update, { handler: async c => {
    const { scene } = c.req.valid('param');
    setAuditBeforeData(c, await getNumberingDefault(scene));
    return c.json(okBody(await updateNumberingDefault(scene, c.req.valid('json')), '默认规则已保存'), 200);
  } }),
  defineContractRoute(numberingDefaultContract.reset, { handler: async c => {
    const { scene } = c.req.valid('param');
    setAuditBeforeData(c, await getNumberingDefault(scene));
    return c.json(okBody(await resetNumberingDefault(scene, c.req.valid('json')), '已恢复平台默认'), 200);
  } }),
]);

export const numberingAllocationsRouter = new OpenAPIHono({ defaultHook: validationHook });
mountCrud(numberingAllocationsRouter, numberingAllocationContract, { list: listNumberingAllocations });
