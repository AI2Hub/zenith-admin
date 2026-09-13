import { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { MP_MATERIAL_TYPES, mpMaterialContract, type MpMaterialType } from '@zenith/shared/mp';
import { authMiddleware } from '../../middleware/auth';
import { guard } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { okBody, validationHook } from '../../lib/openapi-schemas';
import {
  listMpMaterials,
  createMpMaterial,
  updateMpMaterial,
  deleteMpMaterial,
  getMpMaterialBeforeAudit,
  syncMpMaterials,
  uploadMpMaterial,
} from '../../services/mp/mp-material.service';
import { mountCrud } from '../_crud';

const mpMaterialsRouter = new OpenAPIHono({ defaultHook: validationHook });
const syncRoute = defineContractRoute(mpMaterialContract.sync, {
  middleware: [authMiddleware, guard({ permission: 'mp:material:sync', audit: { description: '同步公众号素材', module: '公众号素材' } })],
  handler: async (c) => c.json(okBody(await syncMpMaterials(c.req.valid('json').accountId), '同步完成'), 200),
});
const uploadRoute = defineContractRoute(mpMaterialContract.upload, {
  middleware: [authMiddleware, guard({ permission: 'mp:material:create', audit: { description: '上传公众号素材', module: '公众号素材', recordBody: false } })],
  handler: async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) throw new HTTPException(400, { message: '请选择要上传的文件' });
    const accountId = Number(body.accountId);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new HTTPException(400, { message: '公众号参数无效' });
    const type = String(body.type ?? '');
    if (!(MP_MATERIAL_TYPES as readonly string[]).includes(type)) throw new HTTPException(400, { message: '素材类型无效' });
    const name = body.name ? String(body.name) : '';
    const videoMeta = type === 'video'
      ? { title: body.title ? String(body.title) : (name || file.name), introduction: body.introduction ? String(body.introduction) : '' }
      : undefined;
    const result = await uploadMpMaterial(accountId, type as MpMaterialType, file, file.name, name, videoMeta);
    return c.json(okBody(result, '上传成功'), 200);
  },
});

mountCrud(mpMaterialsRouter, mpMaterialContract,
  {
    list: listMpMaterials,
    get: getMpMaterialBeforeAudit,
    create: createMpMaterial,
    update: updateMpMaterial,
    remove: deleteMpMaterial,
  },
  { permission: 'mp:material', label: '公众号素材', module: '公众号素材', audit: { create: '新增公众号素材' } },
  [syncRoute, uploadRoute],
);

export default mpMaterialsRouter;
