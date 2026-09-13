import { OpenAPIHono } from '@hono/zod-openapi';
import { inAppTemplateContract } from '@zenith/shared/messaging';
import { validationHook } from '../../lib/openapi-schemas';
import {
  listInAppTemplates,
  getInAppTemplate,
  createInAppTemplate,
  updateInAppTemplate,
  deleteInAppTemplate,
} from '../../services/messaging/in-app-templates.service';
import { mountCrud } from '../_crud';

const inAppTemplatesRouter = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(inAppTemplatesRouter, inAppTemplateContract,
  {
    list: listInAppTemplates,
    get: getInAppTemplate,
    create: createInAppTemplate,
    update: updateInAppTemplate,
    remove: deleteInAppTemplate,
  },
  { permission: 'system:in-app-template', label: '站内信模板', module: '站内信模板' },
);

export default inAppTemplatesRouter;
