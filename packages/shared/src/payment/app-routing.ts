export interface PaymentAppChannelBindings {
  wechatConfigId?: number | null;
  alipayConfigId?: number | null;
  unionpayConfigId?: number | null;
}

export function paymentAppBoundConfigIds(app: PaymentAppChannelBindings | null | undefined): Set<number> {
  return new Set([app?.wechatConfigId, app?.alipayConfigId, app?.unionpayConfigId]
    .filter((id): id is number => id != null));
}
