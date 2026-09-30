import type { CmsContentCollection } from '@zenith/shared/cms';

export const mockCmsContentCollections: CmsContentCollection[] = [];
export const mockCmsContentCollectionVersions: (Pick<CmsContentCollection, 'siteId' | 'name' | 'version' | 'definition' | 'createdAt'> & { collectionId: number })[] = [];
export function resetMockCmsContentCollections() {
  mockCmsContentCollections.length = 0;
  mockCmsContentCollectionVersions.length = 0;
}
