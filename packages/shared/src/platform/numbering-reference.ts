import { z } from 'zod';

/** Lightweight reference for published business definitions; no template/runtime dependencies. */
export const numberingBindingRefSchema = z.strictObject({
  ruleId: z.number().int().positive(),
  versionId: z.number().int().positive(),
  parameterMapping: z.record(z.string().max(256), z.string().max(256)),
});

export type NumberingBindingRef = z.infer<typeof numberingBindingRefSchema>;

const RESERVED_FIELD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export const NUMBERING_PARAMETER_ALIASES: Readonly<Record<string, string>> = {
  DEPT: 'departmentName', DEPT_CODE: 'departmentCode', USER: 'username',
  NICKNAME: 'nickname', TENANT: 'tenantId',
};

/** Preserve literal form keys while using the same trusted context for old and new system tokens. */
export function normalizeNumberingParameter(parameter: string): string {
  if (/^FORM\./i.test(parameter)) return `FORM.${parameter.slice('FORM.'.length)}`;
  return Object.hasOwn(NUMBERING_PARAMETER_ALIASES, parameter.toUpperCase())
    ? NUMBERING_PARAMETER_ALIASES[parameter.toUpperCase()]! : parameter;
}

/** FORM uses one exact key or label, including dots; it never denotes a traversed path. */
export function parseNumberingFormParameter(parameter: unknown): string | undefined {
  if (typeof parameter !== 'string' || parameter.length > 256 || !/^FORM\./i.test(parameter)) return undefined;
  const field = parameter.slice('FORM.'.length);
  if (!field.trim() || /\p{Cc}/u.test(field) || /[{}]/.test(field) || RESERVED_FIELD_KEYS.has(field)) return undefined;
  return field;
}

/** The suffix is one exact own-property key, never a JavaScript expression or traversed path. */
export function parseNumberingFormFieldSource(source: unknown): string | undefined {
  if (typeof source !== 'string' || source.length > 256 || !source.startsWith('formData.')) return undefined;
  const key = source.slice('formData.'.length);
  if (!key.trim() || /\p{Cc}/u.test(key) || RESERVED_FIELD_KEYS.has(key)) return undefined;
  return key;
}
