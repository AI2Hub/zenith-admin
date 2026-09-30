import { HTTPException } from 'hono/http-exception';
import { normalizeCmsStructuredValues, validateCmsStructuredFields } from '@zenith/shared/cms';
import { sanitizeCmsModelValues } from './cms-document.service';
import { listCmsModelFields, resolveCmsModelFieldOptions } from './cms-models.service';

/** Every write entry point applies the pinned model's defaults and recursive validation. */
export type CmsExtendValidateMode = 'draft' | 'publish';

export async function validateCmsModelExtend(
  modelId: number | null | undefined,
  extend: Record<string, unknown> | null | undefined,
  mode: CmsExtendValidateMode,
  modelVersionId?: number | null,
): Promise<void> {
  if (!modelId) return;
  const fields = await listCmsModelFields(modelId, undefined, modelVersionId);
  const resolved = await resolveCmsModelFieldOptions(fields);
  const definitions = fields.map(field => ({ ...field, resolvedOptions: resolved.get(field.id) ?? [] }));
  const values = normalizeCmsStructuredValues(definitions, extend ?? {});
  const issues = validateCmsStructuredFields(definitions, values, mode === 'publish');
  if (issues.length) throw new HTTPException(400, { message: `模型字段校验失败：${issues.map(issue => `${issue.fieldPath}: ${issue.message}`).join('；')}` });
  if (extend) Object.assign(extend, sanitizeCmsModelValues(definitions, values));
}

/** Explicit null/empty input is retained; only an omitted value receives a default. */
export async function applyCmsModelFieldDefaults(
  modelId: number | null | undefined,
  extend: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  if (!modelId) return { ...(extend ?? {}) };
  return normalizeCmsStructuredValues(await listCmsModelFields(modelId), extend ?? {});
}
