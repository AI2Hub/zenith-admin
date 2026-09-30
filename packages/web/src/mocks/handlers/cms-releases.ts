import { queueMockCmsDelivery } from './cms-delivery';
import { matchesFilter } from '../utils/filter';
import { cmsReleaseContract, cmsWorkbenchContract, CMS_PREVIEW_MODE_LABELS, CMS_RELEASE_CHECK_RULE_VERSION, cmsReleaseBlockingMessage, makeCmsReleaseCheck, cmsReleaseFieldDiffs, mergeCmsConfigurationSnapshots, type CmsPreviewEditTarget, type CmsPageBlock, type CmsReleaseChange, type CmsConfigurationSnapshot, type CmsRelease, type CmsDeployment, type CreateCmsReleaseInput } from '@zenith/shared/cms';
import { mock, MockHttpError } from '../utils/contract';
import { requireItem, updateItem } from '../utils/crud';
import { badRequest, conflict, nextIdFrom } from '../utils/handlers';
import { mockDateTime } from '../utils/date';
import { mockCmsContents, mockCmsSites, mockCmsPages, mockCmsWidgets, mockCmsChannels, mockCmsWidgetRefs, mockCmsFriendLinkGroups, mockCmsFriendLinks, mockCmsLinkWords, mockCmsRedirects, mockCmsSearchWords, mockCmsResources, mockCmsTags } from '../data/cms';
import { mockCmsContentCollections } from '../data/cms-content-collections';
import { mockCmsVocabularies } from '../data/cms-taxonomy';
import { inspectMockCmsReleaseReadiness } from '../utils/cms-release-readiness';
import { activateMockCmsRevision, getMockCmsPublishedContent, getMockCmsRevision, getMockCmsRevisionContent, getMockCmsWorkingContent, withdrawMockCmsContent } from '../utils/cms-revisions';
import { escapeHtml, stableStringify, type OutputOf } from '@zenith/shared/core';
import { recordMockEditorialActivation } from '../utils/cms-editorial-outcomes';

const releases: CmsRelease[] = [];
const deployments: (CmsDeployment & { siteId: number; releaseId: number; createdAt: string; revisions: Map<number, number> })[] = [];
const deploymentConfigurations = new Map<number, CmsConfigurationSnapshot>();
const active = new Map<number, number>();
const suppressed = new Set<number>();
const activations: (OutputOf<typeof cmsReleaseContract.detail>['activations'][number] & { releaseId: number })[] = [];
const configurations = new Map<number, CmsConfigurationSnapshot>();
const requireRelease = (id: number) => requireItem(releases, id, '发布单不存在', { status: 404 });

export function getMockCmsSiteActivations(siteId: number) {
  return activations.filter(row => releases.some(release => release.id === row.releaseId && release.siteId === siteId));
}
/** Raw frozen records for configuration-state comparisons; never pass URL-resolved editor DTOs here. */
export function getMockCmsConfigurationStateContext(siteId: number, kind: 'site' | 'page' | 'widget', objectId: number) {
  const table = { site: 'cms_sites', page: 'cms_pages', widget: 'cms_widgets' }[kind];
  const generationId = active.get(siteId) ?? null;
  const snapshot = generationId ? deploymentConfigurations.get(generationId) : undefined;
  const online = snapshot?.tables[table]?.find(row => Number(row.id) === objectId) ?? null;
  const inheritance = snapshot?.tables.cms_site_inheritances?.find(row => Number(row.site_id) === siteId) ?? online?.inheritance;
  return { generationId, online: kind === 'site' && online ? { ...online, inheritance: inheritance ?? {} } : online,
    releases: releases.filter(row => row.siteId === siteId && ['draft', 'building', 'ready', 'scheduled', 'failed'].includes(row.status) && row.configurationItems.some(item => item.kind === kind && item.id === objectId)).sort((a, b) => b.id - a.id).map(row => {
      const captured = configurations.get(row.id); const record = captured?.tables[table]?.find(item => Number(item.id) === objectId) ?? null;
      return { release: row, captured: kind === 'site' && record ? { ...record, inheritance: captured?.tables.cms_site_inheritances?.find(item => Number(item.site_id) === siteId) ?? record.inheritance ?? inheritance ?? {} } : record };
    }),
  };
}
/** Read the same deployment pointer and pinned revisions that Demo release activation uses. */
export function getMockCmsActivePublication(contentId: number) {
  const content = getMockCmsPublishedContent(contentId);
  if (!content || content.archivedAt || suppressed.has(contentId)) return null;
  const deployment = deployments.find(row => row.id === active.get(content.siteId));
  const revisionId = deployment?.revisions.get(contentId);
  const revision = revisionId ? getMockCmsRevision(revisionId) : undefined;
  const activation = deployment ? activations.findLast(row => row.toGenerationId === deployment.id) : undefined;
  if (!deployment || !revision || !activation) return null;
  return { revisionId: revision.id, hash: revision.hash, releaseId: activation.releaseId, deploymentId: deployment.id, activationId: activation.id, activatedAt: activation.createdAt };
}

export function getMockCmsPublishedTelemetry(siteId: number): { enabled?: boolean; timeZone?: string } | undefined {
  const id = active.get(siteId);
  if (!id) return undefined;
  const settings = deploymentConfigurations.get(id)?.tables.cms_sites?.find((row) => row.id === siteId)?.settings as { telemetry?: { enabled?: boolean; timeZone?: string } } | undefined;
  return settings?.telemetry;
}

function captureConfiguration(siteId: number, options: { pageIds?: number[]; widgetIds?: number[]; includeSiteConfiguration?: boolean }) {
  const all = options.includeSiteConfiguration === true;
  const pageIds = options.pageIds ?? [];
  const widgetIds = options.widgetIds ?? [];
  const pages = mockCmsPages.filter((row) => row.siteId === siteId && (all || pageIds.includes(row.id)));
  const widgets = mockCmsWidgets.filter((row) => row.siteId === siteId && (all || widgetIds.includes(row.id)));
  const rows = (values: readonly object[]) => values.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), structuredClone(value)])));
  const snapshot: CmsConfigurationSnapshot = { tables: {}, replaceAll: [], pageIds, widgetIds, deleteIds: {} };
  if (all || pageIds.length) {
    snapshot.tables.cms_pages = rows(pages);
    snapshot.tables.cms_widget_refs = rows(mockCmsWidgetRefs.filter((row) => row.siteId === siteId && (all || (row.ownerType === 'page' && pageIds.includes(row.ownerId)))));
  }
  if (all || widgetIds.length) snapshot.tables.cms_widgets = rows(widgets);
  if (all) {
    for (const [table, values] of Object.entries({ cms_sites: mockCmsSites, cms_channels: mockCmsChannels, cms_tags: mockCmsTags, cms_vocabularies: mockCmsVocabularies, cms_content_collections: mockCmsContentCollections, cms_friend_link_groups: mockCmsFriendLinkGroups, cms_friend_links: mockCmsFriendLinks, cms_link_words: mockCmsLinkWords, cms_redirects: mockCmsRedirects, cms_search_words: mockCmsSearchWords, cms_resources: mockCmsResources })) {
      snapshot.tables[table] = rows(values.filter((row) => 'siteId' in row ? row.siteId === siteId : row.id === siteId));
    }
    snapshot.replaceAll = Object.keys(snapshot.tables);
  }
  const items: CmsRelease['configurationItems'] = [
    ...(all ? [{ kind: 'site' as const, id: siteId, title: '整站公开配置与导航' }] : []),
    ...pages.map((page) => ({ kind: 'page' as const, id: page.id, title: page.name })),
    ...widgets.map((widget) => ({ kind: 'widget' as const, id: widget.id, title: widget.name })),
  ];
  return { snapshot, items, pages, widgets };
}

/** Saving configuration only updates the current actor's review draft. Building freezes it. */
export function stageMockCmsConfigurationDraft(siteId: number) {
  requireItem(mockCmsSites, siteId, '站点不存在', { status: 404 });
  const capture = captureConfiguration(siteId, { includeSiteConfiguration: true });
  const existing = releases.findLast((row) => row.siteId === siteId && row.source === 'configuration' && row.status === 'draft' && row.createdBy === 1);
  if (existing) {
    configurations.set(existing.id, mergeCmsConfigurationSnapshots(configurations.get(existing.id)!, capture.snapshot));
    return updateItem(releases, existing.id, { configurationItems: capture.items, baseGenerationId: active.get(siteId) ?? null, error: null }, { notFoundMessage: '发布单不存在', now: mockDateTime });
  }
  const release = create({ siteId, name: '站点配置变更', revisionIds: [], withdrawContentIds: [], pageIds: [], widgetIds: [], includeSiteConfiguration: true, timeZone: 'Asia/Shanghai', autoActivate: false });
  release.source = 'configuration';
  return release;
}

function activate(id: number, expectedGenerationId: number | null, rollback = false) {
  const release = requireRelease(id);
  const current = active.get(release.siteId) ?? null;
  if (current === release.deploymentId && release.status === 'active') return release;
  if (current !== expectedGenerationId || (!rollback && release.baseGenerationId !== current)) throw new MockHttpError(conflict('公开版本已变化，请刷新发布单', { status: 409 }));
  if (!(rollback ? ['active', 'superseded'] : ['ready', 'scheduled']).includes(release.status) || !release.deploymentId) throw new MockHttpError(conflict('候选部署尚未就绪', { status: 409 }));
  const deployment = requireItem(deployments, release.deploymentId, '部署不存在', { status: 404 });
  if (deployment.storageState !== 'available') throw new MockHttpError(conflict('部署存储正在回收或已回收，不能回滚', { status: 409 }));
  for (const row of mockCmsContents.filter((item) => item.siteId === release.siteId)) {
    const revisionId = deployment.revisions.get(row.id);
    if (revisionId && !suppressed.has(row.id)) activateMockCmsRevision(revisionId);
    else if (getMockCmsPublishedContent(row.id)) withdrawMockCmsContent(row.id);
  }
  for (const old of releases.filter((item) => item.siteId === release.siteId && item.status === 'active')) old.status = 'superseded';
  for (const old of deployments.filter((item) => item.siteId === release.siteId && item.status === 'active')) old.status = 'retired';
  active.set(release.siteId, deployment.id);
  const activation = { id: nextIdFrom(activations), releaseId: release.id, fromGenerationId: current, toGenerationId: deployment.id, action: rollback ? 'rollback' as const : 'activate' as const, operatorId: 1, operatorName: '演示管理员', createdAt: mockDateTime() };
  activations.push(activation);
  deployment.status = 'active'; deployment.activatedAt = mockDateTime();
  queueMockCmsDelivery(release.siteId, rollback ? 'rollback' : 'activate');
  recordMockEditorialActivation({ siteId: release.siteId, releaseId: release.id, deploymentId: deployment.id, activationId: activation.id, activatedAt: activation.createdAt, revisions: deployment.revisions });
  return updateItem(releases, release.id, { status: 'active' as const, error: null }, { notFoundMessage: '发布单不存在', now: mockDateTime });
}

function create(input: CreateCmsReleaseInput, captured?: { snapshot: CmsConfigurationSnapshot; items: CmsRelease['configurationItems'] }) {
  requireItem(mockCmsSites, input.siteId, '站点不存在', { status: 404 });
  mockCmsContents.filter((row) => row.siteId === input.siteId).forEach((row) => getMockCmsWorkingContent(row.id));
  const items: CmsRelease['items'] = input.revisionIds.map((id) => {
    const revision = getMockCmsRevision(id);
    if (!revision) throw new MockHttpError(badRequest('修订不存在', { status: 400 }));
    const content = getMockCmsWorkingContent(revision.contentId);
    if (content.siteId !== input.siteId || (content.approvedRevisionId !== id && content.publishedRevisionId !== id)) throw new MockHttpError(badRequest('修订未批准或不属于该站点', { status: 400 }));
    return { contentId: content.id, revisionId: revision.id, title: revision.title, action: 'publish' as const };
  });
  const capture = captured ?? captureConfiguration(input.siteId, input);
  if (!captured && !input.includeSiteConfiguration && (mockCmsPages.filter(row => row.siteId === input.siteId && input.pageIds.includes(row.id)).length !== new Set(input.pageIds).size || mockCmsWidgets.filter(row => row.siteId === input.siteId && input.widgetIds.includes(row.id)).length !== new Set(input.widgetIds).size)) throw new MockHttpError(badRequest('配置对象不属于所选站点', { status: 400 }));
  for (const id of input.withdrawContentIds) {
    const row = getMockCmsWorkingContent(id);
    if (row.siteId !== input.siteId) throw new MockHttpError(badRequest('内容不属于该站点', { status: 400 }));
    items.push({ contentId: id, revisionId: null, title: row.title, action: 'withdraw' });
  }
  if (new Set(items.map(item => item.contentId)).size !== items.length) throw new MockHttpError(badRequest('同一内容不能重复发布或同时撤下', { status: 400 }));
  const release: CmsRelease = { id: nextIdFrom(releases), siteId: input.siteId, name: input.name, source: 'manual', status: 'draft', items,
    configurationItems: structuredClone(capture.items),
    baseGenerationId: active.get(input.siteId) ?? null, deploymentId: null, activateAt: input.activateAt ?? null, timeZone: input.timeZone,
    autoActivate: input.autoActivate, error: null, createdBy: 1, updatedBy: 1, createdAt: mockDateTime(), updatedAt: mockDateTime() };
  releases.push(release);
  configurations.set(release.id, structuredClone(capture.snapshot));
  return release;
}

function candidateConfiguration(release: CmsRelease) {
  const base = deploymentConfigurations.get(release.baseGenerationId ?? 0);
  const initial = captureConfiguration(release.siteId, { includeSiteConfiguration: true }).snapshot;
  for (const table of ['cms_pages', 'cms_widgets', 'cms_widget_refs', 'cms_content_collections']) initial.tables[table] = [];
  return mergeCmsConfigurationSnapshots(base ?? initial, configurations.get(release.id)!);
}
function readiness(release: CmsRelease) {
  const base = deployments.find(deployment => deployment.id === release.baseGenerationId);
  const published = base ? [...base.revisions.values()].map(getMockCmsRevisionContent)
    : mockCmsContents.filter(row => row.siteId === release.siteId).flatMap(row => { const content = getMockCmsPublishedContent(row.id); return content ? [content] : []; });
  return inspectMockCmsReleaseReadiness(release, candidateConfiguration(release), published, suppressed);
}

function build(id: number) {
  const release = requireRelease(id);
  if (!['draft', 'failed'].includes(release.status)) throw new MockHttpError(conflict('当前状态不能构建', { status: 409 }));
  const generation = active.get(release.siteId) ?? null;
  if (generation !== release.baseGenerationId) {
    if ((release.source === 'content' && !release.configurationItems.length) || (release.source === 'configuration' && release.status === 'draft' && release.deploymentId === null)) release.baseGenerationId = generation;
    else throw new MockHttpError(conflict('发布基代已变化，请新建发布单', { status: 409 }));
  }
  const blocking = cmsReleaseBlockingMessage(readiness(release).checks);
  if (blocking) throw new MockHttpError(conflict(blocking, { status: 409 }));
  const frozenConfiguration = candidateConfiguration(release);
  release.status = 'building';
  const deployment = { storageState: 'available' as CmsDeployment['storageState'], id: nextIdFrom(deployments), siteId: release.siteId, releaseId: release.id, createdAt: mockDateTime(), status: 'building' as CmsDeployment['status'], manifestHash: null as string | null, artifactCount: 0, error: null, activatedAt: null, buildPlan: { version: 1 as const, phases: [] }, buildMetrics: {}, revisions: new Map<number, number>() };
  deployments.push(deployment); release.deploymentId = deployment.id;
  setTimeout(() => {
    if (release.status === 'cancelled') return;
    try {
      const base = release.baseGenerationId;
      const prior = base ? deployments.find((item) => item.id === base)?.revisions : undefined;
      deployment.revisions = prior ? new Map(prior) : new Map(mockCmsContents.filter((row) => row.siteId === release.siteId).flatMap((row) => {
        const published = getMockCmsPublishedContent(row.id); return published?.publishedRevisionId ? [[row.id, published.publishedRevisionId] as const] : [];
      }));
      for (const item of release.items) {
        if (item.action === 'publish' && item.revisionId) deployment.revisions.set(item.contentId, item.revisionId);
        else deployment.revisions.delete(item.contentId);
      }
      deploymentConfigurations.set(deployment.id, frozenConfiguration);
      deployment.status = 'ready'; deployment.manifestHash = `demo-generation-${deployment.id}`; deployment.artifactCount = deployment.revisions.size + 1;
      release.status = release.activateAt && release.activateAt > mockDateTime() ? 'scheduled' : 'ready';
      if (release.autoActivate && release.status === 'ready') activate(release.id, release.baseGenerationId);
    } catch (error) { release.status = 'failed'; release.error = error instanceof Error ? error.message : '构建失败'; }
  }, 250);
  return release;
}

export function submitMockCmsContentRelease(contentId: number, revisionId: number) {
  const content = getMockCmsWorkingContent(contentId);
  const release = create({ siteId: content.siteId, name: `发布：${content.title}`, revisionIds: [revisionId], withdrawContentIds: [], pageIds: [], widgetIds: [], includeSiteConfiguration: false, activateAt: content.scheduledAt, timeZone: 'Asia/Shanghai', autoActivate: true });
  release.source = 'content';
  return build(release.id);
}
export function submitMockCmsContentBatch(contentIds: number[]) {
  const groups = new Map<string, number[]>();
  for (const id of contentIds) {
    const row = getMockCmsWorkingContent(id);
    const key = JSON.stringify([row.siteId, row.scheduledAt ?? null]);
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  return [...groups.values()].map((ids) => {
    const rows = ids.map(getMockCmsWorkingContent);
    const release = create({ siteId: rows[0].siteId, name: `批量发布 ${ids.length} 条内容`, revisionIds: rows.map((row) => row.approvedRevisionId!),
      withdrawContentIds: [], pageIds: [], widgetIds: [], includeSiteConfiguration: false, activateAt: rows[0].scheduledAt, timeZone: 'Asia/Shanghai', autoActivate: true });
    release.source = 'content';
    const submitted = build(release.id);
    return { id: release.id, siteId: release.siteId, status: submitted.status, contentIds: ids };
  });
}
export function submitMockCmsWithdrawal(contentId: number) {
  const content = getMockCmsWorkingContent(contentId);
  return build(create({ siteId: content.siteId, name: `撤下：${content.title}`, revisionIds: [], withdrawContentIds: [contentId], pageIds: [], widgetIds: [], includeSiteConfiguration: false, timeZone: 'Asia/Shanghai', autoActivate: true }).id);
}

async function mockFingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(stableStringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const releaseFingerprint = (release: CmsRelease) => mockFingerprint({ items: release.items, configuration: configurations.get(release.id), base: release.baseGenerationId, activateAt: release.activateAt, timeZone: release.timeZone });

export const cmsReleaseHandlers = [
  mock(cmsWorkbenchContract.configurationDraft, ({ query, ok }) => {
    const draft = releases.findLast((row) => row.siteId === query.siteId && row.source === 'configuration' && row.status === 'draft' && row.createdBy === 1);
    return ok(draft ? { id: draft.id, name: draft.name, href: `/cms/publishing?site=${query.siteId}&release=${draft.id}` } : null);
  }),
  mock(cmsWorkbenchContract.preview, async ({ body, ok }) => {
    const site = requireItem(mockCmsSites, body.siteId, '站点不存在', { status: 404 });
    const release = body.mode === 'candidate' ? requireRelease(body.releaseId!) : undefined;
    if (release && release.siteId !== body.siteId) return badRequest('发布单不属于本站', { status: 404 });
    const generationId = release?.deploymentId ?? active.get(body.siteId) ?? null;
    const deployment = deployments.find((row) => row.id === generationId);
    if (deployment && deployment.storageState !== 'available') return conflict('部署存储正在回收或已回收，不能预览', { status: 409 });
    if (body.mode === 'online' && !deployment) return conflict('本站尚未激活线上版本，请先构建并发布站点', { status: 409 });
    if (body.mode === 'candidate' && (!deployment?.manifestHash || !release || !['ready', 'scheduled', 'active', 'superseded'].includes(release.status))) return conflict('请先完成候选构建', { status: 409 });
    const contents = mockCmsContents.filter((row) => row.siteId === body.siteId).flatMap((row) => {
      if (body.mode === 'working' && body.contentIds.includes(row.id)) return [getMockCmsWorkingContent(row.id)];
      const revisionId = deployment?.revisions.get(row.id);
      const published = revisionId ? getMockCmsRevisionContent(revisionId) : !deployment ? getMockCmsPublishedContent(row.id) : undefined;
      return published && !suppressed.has(row.id) ? [published] : [];
    });
    if (body.contentIds.some((id) => !mockCmsContents.some((row) => row.id === id && row.siteId === body.siteId))) return badRequest('内容不属于本站', { status: 404 });
    const base = deploymentConfigurations.get(generationId ?? 0) ?? captureConfiguration(body.siteId, { includeSiteConfiguration: true }).snapshot;
    const configuration = body.mode === 'working' ? mergeCmsConfigurationSnapshots(base, captureConfiguration(body.siteId, body).snapshot) : base;
    const fingerprint = await mockFingerprint({ mode: body.mode, generationId, configuration, contents });
    if (body.expectedFingerprint && body.expectedFingerprint !== fingerprint) return conflict('预览来源已变化，请刷新预览', { status: 409 });
    const target = /^\/@content\/(\d+)$/.exec(body.path);
    const picked = target ? contents.filter((row) => row.id === Number(target[1])) : contents;
    const editTargets: CmsPreviewEditTarget[] = [];
    const contentHtml = picked.map((row) => {
      const key = `content:${row.id}:root`;
      editTargets.push({ key, kind: 'content', id: row.id, siteId: body.siteId, blockId: null, label: row.title, href: `/cms/contents/edit?id=${row.id}&siteId=${body.siteId}` });
      return `<article data-cms-preview-edit="${key}"><h2>${escapeHtml(row.title)}</h2><p>${escapeHtml(row.summary ?? '')}</p><p>${escapeHtml((row.body ?? '').replace(/<[^>]+>/g, ''))}</p></article>`;
    }).join('');
    const configurationHtml = (configuration.tables.cms_pages ?? []).map((page) => {
      const blocks = (page.blocks ?? []) as CmsPageBlock[];
      return `<section><h2>${escapeHtml(String(page.name ?? ''))}</h2>${blocks.map(block => {
        const key = `page:${page.id}:${block.id}`;
        const editable = mockCmsPages.find(row => row.id === Number(page.id))?.blocks.find(row => row.id === block.id)?.canManage !== false;
        if (editable) editTargets.push({ key, kind: 'page', id: Number(page.id), siteId: body.siteId, blockId: block.id, label: `${String(page.name)} · ${block.type}`, href: `/cms/pages?siteId=${body.siteId}&page=${page.id}&block=${encodeURIComponent(block.id)}` });
        return `<section data-cms-page-block="true" data-cms-block-id="${escapeHtml(block.id)}"${editable ? ` data-cms-preview-edit="${escapeHtml(key)}"` : ''}><pre>${escapeHtml(JSON.stringify(block.props))}</pre></section>`;
      }).join('')}</section>`;
    }).join('');
    return ok({ html: `<!doctype html><html><head><meta name="robots" content="noindex,nofollow"></head><body><h1>${escapeHtml(site.name)}</h1><p>Demo 预览采用本地数据，正式站点由服务端主题渲染。</p>${target ? '' : configurationHtml}${contentHtml}</body></html>`,
      status: target && !picked.length ? 404 : 200, path: body.path, mode: body.mode, sourceLabel: CMS_PREVIEW_MODE_LABELS[body.mode], fingerprint, generationId,
      editTargets, contentVersions: body.mode === 'working' ? contents.filter((row) => body.contentIds.includes(row.id)).map((row) => ({ id: row.id, version: row.version })) : [] });
  }),
  mock(cmsReleaseContract.review, async ({ params, ok }) => {
    const release = requireRelease(params.id);
    const currentGenerationId = active.get(release.siteId) ?? null;
    const historical = ['active', 'superseded'].includes(release.status);
    const comparisonGenerationId = historical ? release.baseGenerationId : currentGenerationId;
    const previous = deployments.find((row) => row.id === comparisonGenerationId);
    const changes: CmsReleaseChange[] = [];
    for (const item of release.items) {
      const priorId = previous?.revisions.get(item.contentId);
      const before = priorId ? getMockCmsRevision(priorId)?.snapshot ?? null : null;
      const after = item.revisionId ? getMockCmsRevision(item.revisionId)?.snapshot ?? null : null;
      const fields = cmsReleaseFieldDiffs(before, after);
      if (fields.length) changes.push({ kind: 'content', id: item.contentId, title: item.title, operation: after ? before ? 'update' : 'create' : 'remove', fields, editPath: `/cms/contents/edit?id=${item.contentId}&siteId=${release.siteId}`, paths: [`/@content/${item.contentId}`] });
    }
    const oldConfig = deploymentConfigurations.get(comparisonGenerationId ?? 0);
    for (const [table, incoming] of Object.entries(configurations.get(release.id)?.tables ?? {})) {
      const kinds: Record<string, CmsReleaseChange['kind']> = { cms_sites: 'site', cms_channels: 'channel', cms_pages: 'page', cms_widgets: 'widget', cms_resources: 'resource' };
      const kind = kinds[table] ?? 'navigation';
      for (const row of incoming) {
        const before = oldConfig?.tables[table]?.find((old) => old.id === row.id) ?? null;
        const fields = cmsReleaseFieldDiffs(before, row);
        if (fields.length) changes.push({ kind, id: Number(row.id ?? release.siteId), title: String(row.name ?? row.title ?? table), operation: before ? 'update' : 'create', fields, editPath: `/cms/${kind === 'page' ? 'pages' : kind === 'widget' ? 'widgets' : kind === 'channel' ? 'channels' : 'sites'}?siteId=${release.siteId}`, paths: ['/'] });
      }
    }
    const inspected = readiness(release);
    const fingerprint = await releaseFingerprint(release);
    if (release.error) inspected.checks.push(makeCmsReleaseCheck({ siteId: release.siteId, object: { kind: 'release', id: release.id, title: release.name, revisionId: null }, code: 'release', kind: 'release', message: release.error, recommendedAction: 'rebuild' }));
    return ok({ releaseId: release.id, fingerprint, baseGenerationId: release.baseGenerationId, currentGenerationId, comparisonGenerationId,
      validation: { inputFingerprint: fingerprint, ruleVersion: CMS_RELEASE_CHECK_RULE_VERSION, checkedAt: mockDateTime() }, dependencyOptions: historical ? [] : inspected.dependencyOptions,
      stale: !historical && currentGenerationId !== release.baseGenerationId, changes, checks: inspected.checks,
      affectedPaths: [...new Set(['/', ...changes.flatMap((change) => change.paths)])], wholeSiteAffected: release.configurationItems.length > 0, tasks: [] });
  }),
  mock(cmsReleaseContract.recreate, async ({ params, body, ok }) => {
    const release = requireRelease(params.id);
    if (body.expectedFingerprint !== await releaseFingerprint(release) || body.expectedGenerationId !== (active.get(release.siteId) ?? null)) return conflict('发布草稿或线上版本已变化，请重新审阅', { status: 409 });
    return ok(create({ siteId: release.siteId, name: `${release.name.slice(0, 180)}（重新审阅）`, revisionIds: release.items.flatMap((item) => item.revisionId ? [item.revisionId] : []), withdrawContentIds: release.items.filter((item) => item.action === 'withdraw').map((item) => item.contentId),
      pageIds: release.configurationItems.filter((item) => item.kind === 'page').map((item) => item.id), widgetIds: release.configurationItems.filter((item) => item.kind === 'widget').map((item) => item.id), includeSiteConfiguration: release.configurationItems.some((item) => item.kind === 'site'), timeZone: release.timeZone, autoActivate: false }));
  }),
  mock(cmsReleaseContract.resolveDependencies, async ({ params, body, ok }) => {
    const release = requireRelease(params.id);
    if (['active', 'superseded', 'cancelled'].includes(release.status)) return conflict('仅待发布的发布单可以补充依赖', { status: 409 });
    if (body.expectedFingerprint !== await releaseFingerprint(release) || body.expectedGenerationId !== (active.get(release.siteId) ?? null) || release.baseGenerationId !== body.expectedGenerationId) return conflict('发布范围或线上版本已变化，请刷新检查', { status: 409 });
    const options = readiness(release).dependencyOptions;
    const revisionIds = [...new Set(body.revisionIds)];
    if (revisionIds.some(id => !options.some(option => option.revisionId === id))) return conflict('依赖修订未批准或不在本次检查范围', { status: 409 });
    return ok(create({ siteId: release.siteId, name: `${release.name.slice(0, 175)}（补充依赖）`, revisionIds: [...release.items.flatMap(item => item.revisionId ? [item.revisionId] : []), ...revisionIds],
      withdrawContentIds: release.items.filter(item => item.action === 'withdraw').map(item => item.contentId), pageIds: [], widgetIds: [], includeSiteConfiguration: false, timeZone: release.timeZone, autoActivate: false },
    { snapshot: structuredClone(configurations.get(release.id)!), items: structuredClone(release.configurationItems) }));
  }),
  mock(cmsReleaseContract.list, ({ query, paginate, ok }) => ok(paginate(releases.filter((row) => row.siteId === query.siteId && (!query.keyword || row.name.includes(query.keyword)) && matchesFilter(row.status, query.status)).toReversed()))),
  mock(cmsReleaseContract.detail, ({ params, ok }) => {
    const row = requireRelease(params.id);
    if (row.status === 'scheduled' && row.activateAt && row.activateAt <= mockDateTime()) activate(row.id, row.baseGenerationId);
    return ok({ ...row, deployment: deployments.find((item) => item.id === row.deploymentId) ?? null, activeGenerationId: active.get(row.siteId) ?? null, activations: activations.filter((activation) => activation.releaseId === row.id),
      blockingChecks: row.error ? [row.error] : (active.get(row.siteId) ?? null) !== row.baseGenerationId && row.status !== 'active' ? ['公开版本已变化'] : [] });
  }),
  mock(cmsReleaseContract.preview, ({ params, query, ok }) => {
    const release = requireRelease(params.id);
    const deployment = deployments.find((item) => item.id === release.deploymentId);
    if (!deployment || deployment.status === 'building') return conflict('请先完成候选构建', { status: 409 });
    if (deployment.storageState !== 'available') return conflict('部署存储正在回收或已回收，不能预览', { status: 409 });
    const contentHtml = [...deployment.revisions.values()].map((revisionId) => {
      const row = getMockCmsRevisionContent(revisionId);
      return `<article><h2>${escapeHtml(row.title)}</h2><p>${escapeHtml(row.summary ?? '')}</p><p>${escapeHtml((row.body ?? '').replace(/<[^>]+>/g, ''))}</p></article>`;
    }).join('');
    const configHtml = configurations.get(release.id)?.tables.cms_pages?.map((page) => `<section><h2>${escapeHtml(String(page.name ?? ''))}</h2></section>`).join('') ?? '';
    return ok({ html: `<!doctype html><html><body><h1>${escapeHtml(release.name)}</h1>${configHtml}${contentHtml}</body></html>`, status: 200, path: query.path, generationId: deployment.id });
  }),
  mock(cmsReleaseContract.create, ({ body, ok }) => ok(create(body))),
  mock(cmsReleaseContract.build, ({ params, ok }) => ok(build(params.id))),
  mock(cmsReleaseContract.activate, ({ params, body, ok }) => ok(activate(params.id, body.expectedGenerationId))),
  mock(cmsReleaseContract.rollback, ({ params, body, ok }) => ok(activate(params.id, body.expectedGenerationId, true))),
  mock(cmsReleaseContract.cancel, ({ params, ok }) => {
    const row = requireRelease(params.id);
    if (row.status === 'active') return conflict('已激活发布不能取消', { status: 409 });
    return ok(updateItem(releases, params.id, { status: 'cancelled' as const }, { notFoundMessage: '发布单不存在', now: mockDateTime }));
  }),
  mock(cmsReleaseContract.suppress, ({ params, ok }) => { const row = getMockCmsWorkingContent(params.id); suppressed.add(params.id); withdrawMockCmsContent(params.id); queueMockCmsDelivery(row.siteId, 'withdraw', true); return ok(null); }),
  mock(cmsReleaseContract.unsuppress, ({ params, ok }) => {
    const row = getMockCmsWorkingContent(params.id); suppressed.delete(params.id);
    const revisionId = deployments.find((item) => item.id === active.get(row.siteId))?.revisions.get(row.id);
    if (revisionId) activateMockCmsRevision(revisionId);
    queueMockCmsDelivery(row.siteId, 'restore', true);
    return ok(null);
  }),
];

export function getMockCmsDeploymentRetentionContext(siteId: number) {
  return { records: deployments.filter(deployment => deployment.siteId === siteId).map(deployment => ({ deployment, release: requireRelease(deployment.releaseId) })),
    activeId: active.get(siteId) ?? null,
    pendingBases: releases.filter(release => release.siteId === siteId && ['draft', 'building', 'ready', 'scheduled'].includes(release.status)).map(release => ({ id: release.id, base: release.baseGenerationId })),
  };
}
export function purgeMockCmsDeploymentStorage(siteId: number, id: number) {
  const deployment = requireItem(deployments, id, '部署不存在', { status: 404 });
  if (deployment.siteId !== siteId || active.get(siteId) === id) throw new MockHttpError(conflict('不能回收当前在线部署', { status: 409 }));
  deployment.storageState = 'purged'; deploymentConfigurations.delete(id);
}

export function resetMockCmsReleases() {
  releases.length = 0;
  deployments.length = 0;
  activations.length = 0;
  active.clear();
  suppressed.clear();
  configurations.clear();
  deploymentConfigurations.clear();
}
