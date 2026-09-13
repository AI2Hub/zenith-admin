import { appWebhookContract } from '@zenith/shared/open-platform';
import { createAppWebhookRouter } from './app-webhooks-router';

export default createAppWebhookRouter(appWebhookContract, {
  domain: 'all',
});
