import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppWebhookContract } from '@zenith/shared/open-platform';
import { authMiddleware } from '../../middleware/auth';
import { guard, setAuditAfterData, type AuditLogOptions } from '../../middleware/guard';
import { defineContractRoute } from '../../lib/contract-route';
import { validationHook, okBody } from '../../lib/openapi-schemas';
import { mountCrud } from '../_crud';
import {
  createSubscription,
  deleteSubscription,
  getDelivery,
  getSubscription,
  listDeliveries,
  listSubscriptions,
  listWebhookEvents,
  regenerateSubscriptionSecret,
  retryDelivery,
  scheduleBatchRetryDeliveries,
  testSubscription,
  updateSubscription,
  type AppWebhookDomain,
} from '../../services/open-platform/app-webhooks.service';
import type { Permission } from '@zenith/shared/core';

export interface AppWebhookRouteOptions {
  /** 订阅可见的事件域：all = 开放平台全部事件；payment = 仅支付 / 退款事件 */
  domain: AppWebhookDomain;
  viewPermission: Permission;
  managePermission: Permission;
  auditModule: string;
}

/**
 * Webhook 订阅管理路由。开放平台与支付中心各以自己的契约组（路径根 / 文档标签不同）
 * 和权限码挂一份，处理器完全一致。
 */
export function createAppWebhookRouter(contract: AppWebhookContract, options: AppWebhookRouteOptions) {
  const { domain, viewPermission, managePermission, auditModule } = options;
  const read = [authMiddleware, guard({ permission: [viewPermission, managePermission] })] as const;
  const manage = (description: string, audit: Omit<AuditLogOptions, 'description' | 'module'> = {}) => [
    authMiddleware,
    guard({ permission: managePermission, audit: { description, module: auditModule, ...audit } }),
  ] as const;
  const router = new OpenAPIHono({ defaultHook: validationHook });

  const deliveryBatchRetry = defineContractRoute(contract.batchRetryDeliveries, {
    middleware: manage('批量重试 Webhook 投递'),
    handler: async (c) => c.json(okBody(await scheduleBatchRetryDeliveries(c.req.valid('json').ids, domain), '已加入重试队列'), 200),
  });

  const events = defineContractRoute(contract.events, {
    middleware: read,
    handler: (c) => c.json(okBody(listWebhookEvents(domain)), 200),
  });

  const deliveryList = defineContractRoute(contract.deliveries, {
    middleware: read,
    handler: async (c) => c.json(okBody(await listDeliveries(c.req.valid('query'), domain)), 200),
  });

  const deliveryDetail = defineContractRoute(contract.deliveryDetail, {
    middleware: read,
    handler: async (c) => c.json(okBody(await getDelivery(c.req.valid('param').id, domain)), 200),
  });

  const deliveryRetry = defineContractRoute(contract.retryDelivery, {
    middleware: manage('重试 Webhook 投递'),
    handler: async (c) => c.json(okBody(await retryDelivery(c.req.valid('param').id, domain), '已触发重试'), 200),
  });

  const create = defineContractRoute(contract.create, {
    middleware: manage('创建 Webhook 订阅', { recordResponseBody: false }),
    handler: async (c) => {
      const created = await createSubscription(c.req.valid('json'), domain);
      setAuditAfterData(c, { ...created, secret: '[REDACTED]' });
      return c.json(okBody(created, '订阅已创建，secret 仅返回一次，请妥善保存'), 200);
    },
  });

  const regenerate = defineContractRoute(contract.regenerateSecret, {
    middleware: manage('重置 Webhook 密钥', { recordResponseBody: false }),
    handler: async (c) => {
      const result = await regenerateSubscriptionSecret(c.req.valid('param').id, domain);
      setAuditAfterData(c, { id: result.id, secret: '[REDACTED]' });
      return c.json(okBody(result, '新 secret 仅返回一次，请妥善保存'), 200);
    },
  });

  const test = defineContractRoute(contract.test, {
    middleware: manage('发送 Webhook 测试'),
    handler: async (c) => c.json(okBody(await testSubscription(c.req.valid('param').id, domain), '已发送测试投递'), 200),
  });

  mountCrud(router, contract,
    {
      list: (q) => listSubscriptions(q, domain),
      get: (id) => getSubscription(id, domain),
      update: (id, input) => updateSubscription(id, input, domain),
      remove: (id) => deleteSubscription(id, domain),
    },
    {
      permission: { read: [viewPermission, managePermission], write: managePermission },
      label: 'Webhook 订阅',
      module: auditModule,
      exclude: ['create'],
    },
    [events, deliveryList, deliveryBatchRetry, deliveryDetail, deliveryRetry, create, regenerate, test],
  );

  return router;
}
