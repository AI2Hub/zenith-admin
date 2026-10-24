import { describe, expect, it, vi } from 'vitest';
import type { PaymentChannelConfigRow, PaymentMethodConfigRow } from '../../db/schema';
import type { PaymentProviderCapability } from '../../lib/payment';

vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return {
    ...actual,
    config: {
      ...actual.config,
      payment: { ...actual.config.payment, engineMode: 'sandbox' },
    },
  };
});
vi.mock('../../db', () => ({ db: { select: vi.fn() } }));

import { decidePaymentCapability } from './payment-capability-evaluator';

const configRow = {
  id: 1,
  channel: 'wechat',
  sandbox: true,
  status: 'enabled',
} as PaymentChannelConfigRow;

const capability = {
  operation: 'preauth.freeze',
  environments: ['sandbox'],
  paymentMethods: ['wechat_preauth'],
  currencies: ['CNY'],
  execution: 'synchronous',
  requiredConfigFields: [],
} satisfies PaymentProviderCapability;

function method(enabled: boolean): PaymentMethodConfigRow {
  return { method: 'wechat_preauth', channel: 'wechat', enabled } as PaymentMethodConfigRow;
}

describe('decidePaymentCapability', () => {
  it('停用预授权方式时返回不可用原因', () => {
    const decision = decidePaymentCapability({
      configRow,
      manifestSandboxFields: [],
      capability,
      method: 'wechat_preauth',
      currency: 'CNY',
      methodByCode: new Map([['wechat_preauth', method(false)]]),
    });
    expect(decision).toMatchObject({ supported: false, reasonCode: 'PAYMENT_METHOD_DISABLED' });
  });

  it('方式启用且配置匹配时返回可用', () => {
    const decision = decidePaymentCapability({
      configRow,
      manifestSandboxFields: [],
      capability,
      method: 'wechat_preauth',
      currency: 'CNY',
      methodByCode: new Map([['wechat_preauth', method(true)]]),
    });
    expect(decision).toMatchObject({ supported: true, reasonCode: null });
  });
});
