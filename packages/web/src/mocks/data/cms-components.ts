import type { CmsComponent, CmsComponentVersion } from '@zenith/shared/cms';

export const mockCmsComponents: CmsComponent[] = [];
export const mockCmsComponentVersions: CmsComponentVersion[] = [];
export function resetMockCmsComponents() {
  mockCmsComponents.length = 0;
  mockCmsComponentVersions.length = 0;
}
