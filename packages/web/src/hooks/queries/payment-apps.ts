import type { QueryOf } from '@zenith/shared/core';
import { paymentAppContract } from '@zenith/shared/payment';
import { createResourceQueries } from '@/lib/contract-query';
import { paymentCapabilityKeys } from './payment-capabilities';

export type PaymentAppListParams = NonNullable<QueryOf<typeof paymentAppContract.list>>;

export const {
  keys: paymentAppKeys,
  useList: usePaymentAppList,
  useDetail: usePaymentAppDetail,
  useSave: useSavePaymentApp,
  /** 契约无批量删除操作，多选删除按单条并发执行 */
  useDelete: useDeletePaymentApp,
} = createResourceQueries(paymentAppContract, {
  onSaved: (qc, app) => {
    void qc.invalidateQueries({ queryKey: paymentCapabilityKeys.application(app.id) });
  },
  onDeleted: (qc, ids) => {
    for (const id of ids) qc.removeQueries({ queryKey: paymentCapabilityKeys.application(id) });
  },
});
