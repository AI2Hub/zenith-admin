import { OpenAPIHono } from '@hono/zod-openapi';
import { bizLeaveContract } from '@zenith/shared/biz';
import { idempotencyGuard } from '../../middleware/idempotency';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import {
  listBizLeaves,
  getBizLeave,
  getBizLeaveDetail,
  createBizLeave,
  updateBizLeave,
  deleteBizLeave,
  submitBizLeave,
  reopenBizLeave,
} from '../../services/biz-demo/biz-leave.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

const detailRoute = defineContractRoute(bizLeaveContract.approvalDetail, {
  handler: async (c) => c.json(okBody(await getBizLeaveDetail(c.req.valid('param').id)), 200),
});
const submitRoute = defineContractRoute(bizLeaveContract.submit, {
  middleware: [idempotencyGuard({ ttlSeconds: 10 })],
  handler: async (c) => c.json(okBody(await submitBizLeave(c.req.valid('param').id), '已提交审批'), 200),
});

const reopenRoute = defineContractRoute(bizLeaveContract.reopen, {
  handler: async (c) => c.json(okBody(await reopenBizLeave(c.req.valid('param').id), '已转为草稿'), 200),
});

mountCrud(router, bizLeaveContract,
  {
    list: listBizLeaves,
    get: getBizLeave,
    create: createBizLeave,
    update: updateBizLeave,
    remove: deleteBizLeave,
  },
  { messages: { remove: '已删除' } },
  [detailRoute, submitRoute, reopenRoute],
);

export default router;
