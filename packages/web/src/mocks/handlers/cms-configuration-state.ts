import { cmsConfigurationMatches, cmsWorkbenchContract, type CmsConfigurationState } from '@zenith/shared/cms';
import { mock } from '../utils/contract';
import { currentMockSession, mockUserPermissions } from '../utils/auth';
import { forbidden, notFound, unauthorized } from '../utils/handlers';
import { mockCmsPages, mockCmsSites, mockCmsWidgets } from '../data/cms';
import { getMockCmsConfigurationStateContext } from './cms-releases';

export const cmsConfigurationStateHandlers = [mock(cmsWorkbenchContract.configurationState, ({ query, request, ok }) => {
  const session = currentMockSession(request); if (!session) return unauthorized('请先登录', { status: 401 });
  const permissions = mockUserPermissions(session.user); const has = (permission: string) => permissions.includes('*') || permissions.includes(permission);
  const kind = query.kind ?? 'site'; const objectId = kind === 'site' ? query.siteId : query.objectId!;
  if (!has({ site: 'cms:site:list', page: 'cms:page:list', widget: 'cms:widget:list' }[kind])) return forbidden('没有查看当前配置对象的权限', { status: 403 });
  const current = kind === 'site' ? mockCmsSites.find(row => row.id === objectId) : kind === 'page' ? mockCmsPages.find(row => row.id === objectId && row.siteId === query.siteId) : mockCmsWidgets.find(row => row.id === objectId && row.siteId === query.siteId);
  if (!current) return notFound('配置对象不存在或不属于本站', { status: 404 });
  const rawCurrent: Record<string, unknown> = { ...current };
  const context = getMockCmsConfigurationStateContext(query.siteId, kind, objectId);
  const state: CmsConfigurationState = { siteId: query.siteId, kind, objectId, state: cmsConfigurationMatches(kind, rawCurrent, context.online) ? 'online' : 'saved', generationId: context.generationId, hasPublished: context.online !== null, savedAt: current.updatedAt, release: null };
  if (state.state === 'online') return ok(state);
  let linkedCurrent = false;
  for (const { release, captured } of context.releases) {
    const matchesSaved = release.baseGenerationId === context.generationId && cmsConfigurationMatches(kind, rawCurrent, captured);
    const pending = matchesSaved && release.status !== 'failed';
    if (pending) state.state = 'pending';
    if (has('cms:publish:view') && (!state.release || (!linkedCurrent && pending))) {
      state.release = { id: release.id, name: release.name, status: release.status, matchesSaved, href: `/cms/publishing?tab=releases&site=${query.siteId}&release=${release.id}` };
      linkedCurrent = pending;
    }
  }
  return ok(state);
})];
