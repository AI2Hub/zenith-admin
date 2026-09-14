import { OpenAPIHono } from '@hono/zod-openapi';
import { apiCatalogContract } from '@zenith/shared/identity';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { getApiCatalog } from '../../services/identity/api-catalog.service';

const apiCatalogRouter = new OpenAPIHono({ defaultHook: validationHook });

const getRoute = defineContractRoute(apiCatalogContract.get, {
  handler: (c) => c.json(okBody(getApiCatalog()), 200),
});

apiCatalogRouter.openapiRoutes([getRoute] as const);

export default apiCatalogRouter;
