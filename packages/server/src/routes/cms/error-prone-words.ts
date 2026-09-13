import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsErrorProneWordContract } from '@zenith/shared/cms';
import { validationHook } from '../../lib/openapi-schemas';
import {
  listCmsErrorProneWords,
  createCmsErrorProneWord,
  updateCmsErrorProneWord,
  deleteCmsErrorProneWord,
  mapCmsErrorProneWord,
  ensureCmsErrorProneWordExists,
} from '../../services/cms/cms-error-prone-words.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(router, cmsErrorProneWordContract,
  {
    list: listCmsErrorProneWords,
    get: async (id: number) => mapCmsErrorProneWord(await ensureCmsErrorProneWordExists(id)),
    create: createCmsErrorProneWord,
    update: updateCmsErrorProneWord,
    remove: deleteCmsErrorProneWord,
  },
  {
    permission: { read: 'cms:word:list', write: 'cms:word:manage' },
    label: ' CMS 易错词',
    module: 'CMS内容管理',
    audit: { create: '新增 CMS 易错词' },
  },
);

export default router;
