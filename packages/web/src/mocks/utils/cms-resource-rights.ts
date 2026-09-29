import { mockCmsResources } from '../data/cms';
import { getMockCmsAssetRights } from '../handlers/cms-editorial';
import { mockCmsResourceVersions } from '../handlers/cms-media';

/** Resolve references against the same resource/version records used by the Demo asset picker. */
export function mockCmsReferencedResourceRights(snapshot: Record<string, unknown>) {
  const encoded = JSON.stringify(snapshot);
  const ids = new Set([...encoded.matchAll(/cms-res:\/\/(\d+)/g)].map(match => Number(match[1])));
  if (snapshot.assetVersions && typeof snapshot.assetVersions === 'object') for (const id of Object.keys(snapshot.assetVersions)) ids.add(Number(id));
  for (const resource of mockCmsResources) {
    if (mockCmsResourceVersions(resource).some(version => !!version.url && encoded.includes(version.url))) ids.add(resource.id);
  }
  return [...ids].map(getMockCmsAssetRights);
}
export function mockCmsRevisionResourcesVisible(snapshot: Record<string, unknown>) {
  return mockCmsReferencedResourceRights(snapshot).every(rights => !rights.revoked && (!rights.expiresAt || new Date(rights.expiresAt).getTime() > Date.now()));
}
