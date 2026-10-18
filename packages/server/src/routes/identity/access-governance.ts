import { OpenAPIHono } from '@hono/zod-openapi';
import { accessGovernanceContract } from '@zenith/shared/identity';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  getAccessWorkflowOptions,
  createAccessReviewCampaign,
  decideReviewItem,
  getAccessRequest,
  getUserAccessOverview,
  listAccessGrants,
  listAccessRequests,
  listPermissionPolicies,
  listReviewCampaigns,
  listReviewItems,
  revokeAccessGrant,
  updatePermissionPolicy,
} from '../../services/identity/access-governance.service';

const accessGovernanceRouter = new OpenAPIHono({ defaultHook: validationHook });

const workflowOptionsRoute = defineContractRoute(accessGovernanceContract.workflowOptions, {
  handler: async (c) => c.json(okBody(await getAccessWorkflowOptions()), 200),
});
const requestListRoute = defineContractRoute(accessGovernanceContract.requestList, {
  handler: async (c) => c.json(okBody(await listAccessRequests(c.req.valid('query'))), 200),
});
const requestDetailRoute = defineContractRoute(accessGovernanceContract.requestDetail, {
  handler: async (c) => c.json(okBody(await getAccessRequest(c.req.valid('param').id)), 200),
});
const grantListRoute = defineContractRoute(accessGovernanceContract.grantList, {
  handler: async (c) => c.json(okBody(await listAccessGrants(c.req.valid('query'))), 200),
});
const grantRevokeRoute = defineContractRoute(accessGovernanceContract.grantRevoke, {
  handler: async (c) => c.json(okBody(await revokeAccessGrant(c.req.valid('param').id, c.req.valid('json'))), 200),
});
const reviewCampaignListRoute = defineContractRoute(accessGovernanceContract.reviewCampaignList, {
  handler: async (c) => c.json(okBody(await listReviewCampaigns(c.req.valid('query'))), 200),
});
const reviewCampaignCreateRoute = defineContractRoute(accessGovernanceContract.reviewCampaignCreate, {
  handler: async (c) => c.json(okBody(await createAccessReviewCampaign(c.req.valid('json'))), 200),
});
const reviewItemListRoute = defineContractRoute(accessGovernanceContract.reviewItemList, {
  handler: async (c) => c.json(okBody(await listReviewItems(c.req.valid('query'))), 200),
});
const reviewItemDecideRoute = defineContractRoute(accessGovernanceContract.reviewItemDecide, {
  handler: async (c) => c.json(okBody(await decideReviewItem(c.req.valid('param').id, c.req.valid('json'))), 200),
});
const policyListRoute = defineContractRoute(accessGovernanceContract.policyList, {
  handler: async (c) => c.json(okBody(await listPermissionPolicies(c.req.valid('query'))), 200),
});
const policyUpdateRoute = defineContractRoute(accessGovernanceContract.policyUpdate, {
  handler: async (c) => c.json(okBody(await updatePermissionPolicy(c.req.valid('param').permissionCode, c.req.valid('json'))), 200),
});
const userOverviewRoute = defineContractRoute(accessGovernanceContract.userOverview, {
  handler: async (c) => c.json(okBody(await getUserAccessOverview(c.req.valid('param').id)), 200),
});

accessGovernanceRouter.openapiRoutes([
  workflowOptionsRoute,
  requestListRoute,
  requestDetailRoute,
  grantListRoute,
  grantRevokeRoute,
  reviewCampaignListRoute,
  reviewCampaignCreateRoute,
  reviewItemListRoute,
  reviewItemDecideRoute,
  policyListRoute,
  policyUpdateRoute,
  userOverviewRoute,
] as const);

export default accessGovernanceRouter;
