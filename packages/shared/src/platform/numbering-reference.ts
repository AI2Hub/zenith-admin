import { z } from 'zod';

/** Lightweight reference for published business definitions; no template/runtime dependencies. */
export const numberingBindingRefSchema = z.strictObject({
  ruleId: z.number().int().positive(),
  versionId: z.number().int().positive(),
  parameterMapping: z.record(z.string().max(64), z.string().max(256)),
});

export type NumberingBindingRef = z.infer<typeof numberingBindingRefSchema>;

const RESERVED_FIELD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** The suffix is one exact own-property key, never a JavaScript expression or traversed path. */
export function parseNumberingFormFieldSource(source: unknown): string | undefined {
  if (typeof source !== 'string' || source.length > 256 || !source.startsWith('formData.')) return undefined;
  const key = source.slice('formData.'.length);
  if (!key.trim() || /\p{Cc}/u.test(key) || RESERVED_FIELD_KEYS.has(key)) return undefined;
  return key;
}
