import { OpenAPIHono } from '@hono/zod-openapi';
import { paymentFeeRuleContract } from '@zenith/shared/payment';
import { validationHook } from '../../lib/openapi-schemas';
import { listFeeRules, getFeeRule, createFeeRule, updateFeeRule, deleteFeeRule } from '../../services/payment/payment-fee.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(router, paymentFeeRuleContract,
  { list: listFeeRules, get: getFeeRule, create: createFeeRule, update: updateFeeRule, remove: deleteFeeRule },
  {
    permission: 'payment:fee',
    label: '支付费率规则',
    module: '支付中心',
    audit: { create: '新增支付费率规则', update: '编辑支付费率规则' },
  },
);

export default router;
