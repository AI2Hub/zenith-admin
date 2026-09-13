/**
 * 支付应用（App 维度）管理路由。
 * 外部身份由开放平台客户端管理，本模块只维护支付渠道路由。
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { paymentAppContract } from '@zenith/shared/payment';
import { validationHook } from '../../lib/openapi-schemas';
import { listApps, getApp, createApp, updateApp, deleteApp } from '../../services/payment/payment-apps.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(router, paymentAppContract,
  { list: listApps, get: getApp, create: createApp, update: updateApp, remove: deleteApp },
  {
    permission: { read: 'payment:app:list', write: 'payment:app:manage' },
    label: '支付应用',
    module: '支付中心',
    audit: { create: '新增支付应用', update: '编辑支付应用' },
  },
);

export default router;
