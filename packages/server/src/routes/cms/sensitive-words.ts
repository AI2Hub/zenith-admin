import { OpenAPIHono } from '@hono/zod-openapi';
import { cmsSensitiveWordContract } from '@zenith/shared/cms';
import { validationHook } from '../../lib/openapi-schemas';
import { cmsSensitiveWordService } from '../../services/cms/cms-sensitive-words.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(router, cmsSensitiveWordContract,
  cmsSensitiveWordService,
  {
    permission: { read: 'cms:sensitive:list', write: 'cms:sensitive:manage' },
    label: ' CMS 敏感词',
    module: 'CMS内容管理',
  },
);

export default router;
