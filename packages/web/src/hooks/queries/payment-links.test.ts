import { describe, expect, it } from 'vitest';
import type { PaymentCashierSession } from '@zenith/shared/payment';
import { ApiError } from '@/lib/query';
import {
  isPermanentPublicCashierSessionError,
  publicCashierSessionPollInterval,
  publicCashierSessionRetryDelay,
  shouldRetryPublicCashierSession,
} from './payment-links';

function session(status: PaymentCashierSession['status'], createdAt: string): PaymentCashierSession {
  return { status, createdAt } as PaymentCashierSession;
}

describe('公开收银台会话轮询', () => {
  it('按会话时长退避，并在终态停止', () => {
    const now = Date.parse('2026-10-24T04:00:00.000Z');
    expect(publicCashierSessionPollInterval(undefined, now)).toBe(3_000);
    expect(publicCashierSessionPollInterval(session('processing', '2026-10-24T03:59:40.000Z'), now)).toBe(3_000);
    expect(publicCashierSessionPollInterval(session('processing', '2026-10-24T03:59:00.000Z'), now)).toBe(5_000);
    expect(publicCashierSessionPollInterval(session('processing', '2026-10-24T03:55:00.000Z'), now)).toBe(10_000);
    expect(publicCashierSessionPollInterval(session('succeeded', '2026-10-24T03:55:00.000Z'), now)).toBe(false);
  });

  it('仅把明确不存在或已失效视为永久错误', () => {
    expect(isPermanentPublicCashierSessionError(new ApiError(404, '不存在'))).toBe(true);
    expect(isPermanentPublicCashierSessionError(new ApiError(410, '已失效'))).toBe(true);
    expect(isPermanentPublicCashierSessionError(new ApiError(429, '限流'))).toBe(false);
    expect(isPermanentPublicCashierSessionError(new ApiError(500, '服务异常'))).toBe(false);
  });

  it('瞬时错误有限重试，并遵循 Retry-After', () => {
    const rateLimited = new ApiError(429, '限流', 12);
    expect(shouldRetryPublicCashierSession(0, rateLimited)).toBe(true);
    expect(shouldRetryPublicCashierSession(3, rateLimited)).toBe(false);
    expect(shouldRetryPublicCashierSession(0, new ApiError(404, '不存在'))).toBe(false);
    expect(publicCashierSessionRetryDelay(0, rateLimited)).toBe(12_000);
    expect(publicCashierSessionRetryDelay(3, new ApiError(500, '服务异常'))).toBe(8_000);
  });
});
