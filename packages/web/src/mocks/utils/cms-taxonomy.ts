import { cmsTermSubtreeHeight, inspectCmsTermHierarchy, validateCmsVocabularySelection } from '@zenith/shared/cms';
import { mockCmsModels, mockCmsSites, mockCmsTags } from '../data/cms';
import { mockCmsVocabularies } from '../data/cms-taxonomy';
import { MockHttpError } from './contract';
import { requireItem } from './crud';
import { badRequest, conflict } from './handlers';

export function validateMockCmsVocabularyModels(siteId: number, modelIds: readonly number[]) {
  requireItem(mockCmsSites, siteId, '站点不存在', { status: 404 });
  if (modelIds.some(id => !mockCmsModels.some(model => model.id === id && (model.ownerSiteId === null || model.ownerSiteId === siteId)))) throw new MockHttpError(badRequest('词表内容模型不存在或不属于本站', { status: 400 }));
}
export function validateMockCmsTaxonomySelection(content: { siteId: number; modelId: number | null; tagIds?: readonly number[] }, strict: boolean) {
  const ids = [...new Set(content.tagIds ?? [])];
  const terms = mockCmsTags.filter(term => term.siteId === content.siteId && ids.includes(term.id));
  if (terms.length !== ids.length) throw new MockHttpError(badRequest('标签或分类词条不存在或不属于本站', { status: 400 }));
  const issues = validateCmsVocabularySelection(mockCmsVocabularies.filter(row => row.siteId === content.siteId), terms, content.modelId, strict);
  if (issues.length) throw new MockHttpError(badRequest(issues.join('；'), { status: 400 }));
}
export async function validateMockCmsTermPlacement(siteId: number, input: { vocabularyId?: number | null; parentId?: number | null }, currentId?: number) {
  requireItem(mockCmsSites, siteId, '站点不存在', { status: 404 });
  if (input.vocabularyId && !mockCmsVocabularies.some(row => row.id === input.vocabularyId && row.siteId === siteId)) throw new MockHttpError(badRequest('词表不存在或不属于本站', { status: 400 }));
  const subtreeHeight = currentId == null ? 1 : cmsTermSubtreeHeight(currentId, mockCmsTags.filter(term => term.siteId === siteId));
  const issue = await inspectCmsTermHierarchy(siteId, input, currentId, async id => mockCmsTags.find(term => term.id === id) ?? null, subtreeHeight);
  if (issue) throw new MockHttpError(badRequest(issue, { status: 400 }));
  const current = currentId ? mockCmsTags.find(term => term.id === currentId) : null;
  if (current && input.vocabularyId !== current.vocabularyId && mockCmsTags.some(term => term.parentId === currentId)) throw new MockHttpError(conflict('包含子词条，不能直接切换词表', { status: 409 }));
}
