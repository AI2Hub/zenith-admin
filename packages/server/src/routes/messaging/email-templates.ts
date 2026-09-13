import { OpenAPIHono } from '@hono/zod-openapi';
import { emailTemplateContract } from '@zenith/shared/messaging';
import { validationHook } from '../../lib/openapi-schemas';
import { emailTemplateService } from '../../services/messaging/email-templates.service';
import { mountCrud } from '../_crud';

const emailTemplatesRouter = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(emailTemplatesRouter, emailTemplateContract,
  emailTemplateService,
  { permission: 'system:email-template', label: '邮件模板', module: '邮件模板' },
);

export default emailTemplatesRouter;
