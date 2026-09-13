import { OpenAPIHono } from '@hono/zod-openapi';
import { businessFileContract } from '@zenith/shared/platform';
import { setAuditAfterData, setAuditBeforeData } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import { listBusinessFiles, removeBusinessFile, type BusinessFileType } from '../../services/files/business-files.service';

const businessFilesRouter = new OpenAPIHono({ defaultHook: validationHook });

function assertBusinessType(value: string): BusinessFileType {
  return value as BusinessFileType;
}

const listRoute = defineContractRoute(businessFileContract.list, {
  handler: async (c) => {
    const { businessType, businessId } = c.req.valid('param');
    return c.json(okBody(await listBusinessFiles(assertBusinessType(businessType), businessId)), 200);
  },
});

const removeRoute = defineContractRoute(businessFileContract.remove, {
  handler: async (c) => {
    const { businessType, businessId, fileId } = c.req.valid('param');
    const type = assertBusinessType(businessType);
    const beforeFiles = await listBusinessFiles(type, businessId);
    setAuditBeforeData(c, beforeFiles.find((item) => item.fileId === fileId) ?? { businessType, businessId, fileId });
    await removeBusinessFile(type, businessId, fileId);
    setAuditAfterData(c, { businessType, businessId, fileId, removed: true });
    return c.json(okBody(null, '移除成功'), 200);
  },
});

businessFilesRouter.openapiRoutes([listRoute, removeRoute] as const);

export default businessFilesRouter;
