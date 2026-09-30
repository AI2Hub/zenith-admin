import * as z from 'zod';
import { partialForUpdate } from '../core/validation';
import { entityStatusSchema } from '../core/api-schemas';

export const createCmsVocabularySchema = z.object({
  siteId: z.int().positive(), name: z.string().trim().min(1).max(100),
  code: z.string().regex(/^[a-z][a-z0-9-]*$/).max(80),
  description: z.string().max(1000).nullable().optional(),
  modelIds: z.array(z.int().positive()).max(100).default([]),
  required: z.boolean().default(false), maxSelections: z.int().min(1).max(100).default(10),
  status: entityStatusSchema.default('enabled'), sort: z.int().default(0),
});
export const updateCmsVocabularySchema = partialForUpdate(createCmsVocabularySchema).omit({ siteId: true });
export type CreateCmsVocabularyInput = z.input<typeof createCmsVocabularySchema>;

export const CMS_TAXONOMY_MAX_DEPTH = 12;
export type CmsTermHierarchyEntry = { id: number; siteId: number; vocabularyId?: number | null; parentId?: number | null };
/** Count the moving node itself; descendants retain their relative depth during a move. */
export function cmsTermSubtreeHeight(rootId: number, terms: readonly Pick<CmsTermHierarchyEntry, 'id' | 'parentId'>[]): number {
  const children = new Map<number, number[]>();
  for (const term of terms) {
    if (term.parentId == null) continue;
    const siblings = children.get(term.parentId) ?? []; siblings.push(term.id); children.set(term.parentId, siblings);
  }
  const queue = [{ id: rootId, depth: 1 }]; const seen = new Set([rootId]); let height = 1;
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    for (const childId of children.get(node.id) ?? []) {
      if (seen.has(childId)) return Infinity;
      seen.add(childId); height = Math.max(height, node.depth + 1);
      if (height > CMS_TAXONOMY_MAX_DEPTH) return height;
      queue.push({ id: childId, depth: node.depth + 1 });
    }
  }
  return height;
}
/** Resolve ancestors through the owning store; the same cycle, site and depth policy applies to API and Demo. */
export async function inspectCmsTermHierarchy(
  siteId: number, input: { vocabularyId?: number | null; parentId?: number | null }, currentId: number | undefined,
  resolve: (id: number) => Promise<CmsTermHierarchyEntry | null | undefined>,
  subtreeHeight = 1,
): Promise<string | null> {
  if (!Number.isFinite(subtreeHeight)) return '分类层级存在循环';
  if (subtreeHeight > CMS_TAXONOMY_MAX_DEPTH) return `分类层级不能超过 ${CMS_TAXONOMY_MAX_DEPTH} 层`;
  const seen = new Set(currentId == null ? [] : [currentId]);
  let parentId = input.parentId; let depth = subtreeHeight;
  while (parentId) {
    if (seen.has(parentId)) return '分类层级存在循环';
    if (depth >= CMS_TAXONOMY_MAX_DEPTH) return `分类层级不能超过 ${CMS_TAXONOMY_MAX_DEPTH} 层`;
    const parent = await resolve(parentId);
    if (!parent || parent.siteId !== siteId) return '父词条不存在或不属于本站';
    if (!input.vocabularyId || parent.vocabularyId !== input.vocabularyId) return '父词条必须属于同一受控词表';
    seen.add(parentId); depth += 1; parentId = parent.parentId;
  }
  return null;
}

export function cmsVocabularyApplies(vocabulary: { modelIds: readonly number[] }, modelId: number | null): boolean {
  return vocabulary.modelIds.length === 0 || (modelId != null && vocabulary.modelIds.includes(modelId));
}

export function validateCmsVocabularySelection(
  vocabularies: readonly { id: number; name: string; modelIds: number[]; required: boolean; maxSelections: number; status: string }[],
  terms: readonly { id: number; vocabularyId?: number | null; status?: string }[],
  modelId: number | null, strict: boolean,
): string[] {
  const issues: string[] = [];
  for (const term of terms) {
    if (term.status === 'disabled') issues.push(`分类词条 #${term.id} 已停用`);
    if (term.vocabularyId && !vocabularies.some(v => v.id === term.vocabularyId && v.status === 'enabled' && cmsVocabularyApplies(v, modelId))) issues.push(`分类词条 #${term.id} 不适用于当前内容模型`);
  }
  for (const vocabulary of vocabularies.filter(v => v.status === 'enabled' && cmsVocabularyApplies(v, modelId))) {
    const count = terms.filter(term => term.vocabularyId === vocabulary.id).length;
    if (strict && vocabulary.required && count === 0) issues.push(`请选择「${vocabulary.name}」分类`);
    if (count > vocabulary.maxSelections) issues.push(`「${vocabulary.name}」最多选择 ${vocabulary.maxSelections} 项`);
  }
  return issues;
}
