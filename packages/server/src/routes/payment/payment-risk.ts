import { OpenAPIHono } from '@hono/zod-openapi';
import { paymentRiskRuleContract } from '@zenith/shared/payment';
import { validationHook } from '../../lib/openapi-schemas';
import { listRiskRules, getRiskRule, createRiskRule, updateRiskRule, deleteRiskRule } from '../../services/payment/payment-risk.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(router, paymentRiskRuleContract,
  {
    list: listRiskRules,
    get: getRiskRule,
    create: createRiskRule,
    update: updateRiskRule,
    remove: deleteRiskRule,
  },
  {
    permission: 'payment:risk',
    label: '支付风控规则',
    module: '支付中心',
    audit: { create: '新增支付风控规则', update: '编辑支付风控规则' },
  },
);

export default router;
