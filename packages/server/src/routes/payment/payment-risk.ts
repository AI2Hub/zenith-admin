import { OpenAPIHono } from '@hono/zod-openapi';
import { paymentRiskRuleContract } from '@zenith/shared/payment';
import { validationHook } from '../../lib/openapi-schemas';
import { paymentRiskRuleService } from '../../services/payment/payment-risk.service';
import { mountCrud } from '../_crud';

const router = new OpenAPIHono({ defaultHook: validationHook });

mountCrud(router, paymentRiskRuleContract,
  paymentRiskRuleService,
  {
    permission: 'payment:risk',
    label: '支付风控规则',
    module: '支付中心',
    audit: { create: '新增支付风控规则', update: '编辑支付风控规则' },
  },
);

export default router;
