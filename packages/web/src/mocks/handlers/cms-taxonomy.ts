import { cmsVocabularyContract, type CmsVocabulary } from '@zenith/shared/cms';
import { mockCmsTags, mockCmsSites } from '../data/cms';
import { mockCmsVocabularies } from '../data/cms-taxonomy';
import { mock } from '../utils/contract';
import { requireItem, removeItem } from '../utils/crud';
import { mockDateTime } from '../utils/date';
import { filterByKeyword } from '../utils/filter';
import { conflict, nextIdFrom } from '../utils/handlers';
import { validateMockCmsVocabularyModels } from '../utils/cms-taxonomy';
import { stageMockCmsConfigurationDraft } from './cms-releases';

export const cmsTaxonomyHandlers = [
  mock(cmsVocabularyContract.list, ({ query, paginate, ok }) => {
    requireItem(mockCmsSites, query.siteId, '站点不存在', { status: 404 });
    const rows = filterByKeyword(mockCmsVocabularies.filter(row => row.siteId === query.siteId), query.keyword, [row => row.name, row => row.code]);
    return ok(paginate(rows.sort((a, b) => a.sort - b.sort || a.id - b.id)));
  }),
  mock(cmsVocabularyContract.all, ({ query, ok }) => {
    requireItem(mockCmsSites, query.siteId, '站点不存在', { status: 404 });
    return ok(mockCmsVocabularies.filter(row => row.siteId === query.siteId).sort((a, b) => a.sort - b.sort || a.id - b.id));
  }),
  mock(cmsVocabularyContract.detail, ({ params, ok }) => ok(requireItem(mockCmsVocabularies, params.id, '词表不存在', { status: 404 }))),
  mock(cmsVocabularyContract.create, ({ body, ok }) => {
    validateMockCmsVocabularyModels(body.siteId, body.modelIds);
    if (mockCmsVocabularies.some(row => row.siteId === body.siteId && row.code === body.code)) return conflict('词表编码已存在', { status: 409 });
    const row: CmsVocabulary = { ...body, id: nextIdFrom(mockCmsVocabularies), description: body.description ?? null, createdAt: mockDateTime(), updatedAt: mockDateTime(), createdBy: 1, updatedBy: 1 };
    mockCmsVocabularies.push(row); stageMockCmsConfigurationDraft(row.siteId); return ok(row);
  }),
  mock(cmsVocabularyContract.update, ({ params, body, ok }) => {
    const row = requireItem(mockCmsVocabularies, params.id, '词表不存在', { status: 404 });
    validateMockCmsVocabularyModels(row.siteId, body.modelIds ?? row.modelIds);
    if (body.code && mockCmsVocabularies.some(item => item.id !== row.id && item.siteId === row.siteId && item.code === body.code)) return conflict('词表编码已存在', { status: 409 });
    Object.assign(row, body, { updatedAt: mockDateTime() }); stageMockCmsConfigurationDraft(row.siteId); return ok(row);
  }),
  mock(cmsVocabularyContract.remove, ({ params, ok }) => {
    const row = requireItem(mockCmsVocabularies, params.id, '词表不存在', { status: 404 });
    if (mockCmsTags.some(term => term.vocabularyId === row.id)) return conflict('词表包含词条，请先处理词条', { status: 409 });
    removeItem(mockCmsVocabularies, row.id, '词表不存在'); stageMockCmsConfigurationDraft(row.siteId); return ok(null);
  }),
];
