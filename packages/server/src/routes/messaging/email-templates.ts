import { OpenAPIHono } from '@hono/zod-openapi';
import { emailTemplateContract } from '@zenith/shared/messaging';
import { validationHook } from '../../lib/openapi-schemas';
import {
  listEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} from '../../services/messaging/email-templates.service';
import { mountCrud } from '../_crud';

const emailTemplatesRouter = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(emailTemplatesRouter, emailTemplateContract,
  {
    list: listEmailTemplates,
    get: getEmailTemplate,
    create: createEmailTemplate,
    update: updateEmailTemplate,
    remove: deleteEmailTemplate,
  },
  { permission: 'system:email-template', label: '邮件模板', module: '邮件模板' },
);

export default emailTemplatesRouter;
