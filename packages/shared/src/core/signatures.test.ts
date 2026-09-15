import { describe, expect, it } from 'vitest';
import { signatureInputSchema, signatureSnapshotSchema, SIGNATURE_MAX_DATA_URL_LENGTH, signatureDataUrlSchema } from './signatures';
import { authContract } from '../identity/contracts/auth';

describe('signature contracts', () => {
  it('separates a drawn input from a saved template reference', () => {
    expect(signatureInputSchema.parse({ source: 'saved', signatureId: 1, version: 2 })).toEqual({ source: 'saved', signatureId: 1, version: 2 });
    expect(signatureInputSchema.safeParse({ source: 'saved', signatureId: 1 }).success).toBe(false);
    expect(signatureInputSchema.safeParse({ source: 'drawn', dataUrl: 'https://example.com/s.png' }).success).toBe(false);
  });
  it('rejects caller-supplied signing evidence as an input', () => {
    const snapshot = { source: 'saved', dataUrl: 'data:image/png;base64,AA==', signerId: 1, signerName: '某人', signedAt: '2026-09-15 12:00:00', signatureId: 1, signatureVersion: 2 };
    expect(signatureSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(signatureInputSchema.safeParse({ ...snapshot, version: 2 }).success).toBe(false);
  });
  it('caps data URL size before server image decoding', () => {
    expect(signatureDataUrlSchema.safeParse('data:image/png;base64,' + 'A'.repeat(SIGNATURE_MAX_DATA_URL_LENGTH)).success).toBe(false);
  });
  it('excludes private image input and output from signature audit records', () => {
    expect(authContract.saveMySignature.audit).toMatchObject({ recordBody: false, recordResponseBody: false });
    expect(authContract.deleteMySignature.audit).toMatchObject({ recordBody: false, recordResponseBody: false });
  });
});
