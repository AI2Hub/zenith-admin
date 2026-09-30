import type { CmsReleaseCheck } from './contracts/workbench';
import type { CmsConfigurationSnapshot } from './release-validation';
import type { CmsPageBlock } from './contracts/pages';
import { inspectCmsPageBlocks } from './page-block-quality';
import { parseCmsLink } from './link';
import { cmsReleaseFieldLabel } from './release-review';
import { walkCmsStructuredValues, type CmsFieldDefinition } from './model-design';
import { validateCmsVocabularySelection } from './taxonomy';

export const CMS_RELEASE_CHECK_RULE_VERSION = 'cms-release-readiness-v1';

type CmsChannelState = {
  id: number;
  parentId: number;
  status: 'enabled' | 'disabled';
};

/** Resolve effective channel status once for a site (self + every ancestor). */
export function resolveEffectivelyEnabledChannelIds(rows: readonly CmsChannelState[]): Set<number> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const memo = new Map<number, boolean>();
  const visiting = new Set<number>();

  const isEnabled = (id: number): boolean => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return false;
    const row = byId.get(id);
    if (!row || row.status !== 'enabled') {
      memo.set(id, false);
      return false;
    }
    if (row.parentId === 0) {
      memo.set(id, true);
      return true;
    }
    visiting.add(id);
    const result = isEnabled(row.parentId);
    visiting.delete(id);
    memo.set(id, result);
    return result;
  };

  return new Set(rows.filter((row) => isEnabled(row.id)).map((row) => row.id));
}



/** The same recursive field paths identify editor locations and publication constraints. */
export function collectCmsReleaseModelValues(fields: readonly CmsFieldDefinition[], values: Record<string, unknown>) {
  const references: { id: number; fieldPath: string; fieldLabel: string; modelIds?: readonly number[] }[] = [];
  const uniqueValues: { fieldPath: string; fieldLabel: string; key: string; value: unknown }[] = [];
  walkCmsStructuredValues(fields, values, (field, value, fieldPath) => {
    if (field.fieldType === 'reference' || field.fieldType === 'references') {
      for (const id of Array.isArray(value) ? value : [value]) if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) references.push({ id, fieldPath, fieldLabel: field.label, modelIds: field.configuration?.referenceModelIds });
    }
    if (field.configuration?.unique && value != null && value !== '' && !(Array.isArray(value) && !value.length)) {
      uniqueValues.push({ fieldPath, fieldLabel: field.label, key: fieldPath.replace(/^extend\./, '').replace(/\.\d+(?=\.|$)/g, '[]'), value });
    }
  });
  return { references, uniqueValues };
}

export function cmsReleaseCheckEditTarget(kind: CmsReleaseCheck['object']['kind'], siteId: number, id: number, fieldPath?: string | null, nodeId?: string | null) {
  const suffix = `${fieldPath ? `&field=${encodeURIComponent(fieldPath)}` : ''}${nodeId ? `&block=${encodeURIComponent(nodeId)}` : ''}`;
  const href = kind === 'content' ? `/cms/contents/edit?id=${id}&siteId=${siteId}${suffix}`
    : kind === 'page' ? `/cms/pages?siteId=${siteId}&page=${id}${suffix}`
      : kind === 'widget' ? `/cms/widgets/edit?id=${id}&siteId=${siteId}${suffix}`
        : kind === 'channel' ? `/cms/channels?site=${siteId}&channel=${id}${suffix}`
          : kind === 'site' ? `/cms/sites?editSite=${siteId}` : null;
  return href ? { href, label: '定位处理' } : null;
}

export function makeCmsReleaseCheck(input: Pick<CmsReleaseCheck, 'object' | 'code' | 'message'> & Partial<Omit<CmsReleaseCheck, 'object' | 'code' | 'message'>> & { siteId: number }): CmsReleaseCheck {
  return { kind: input.kind ?? 'dependency', severity: input.severity ?? 'error', code: input.code, message: input.message, object: input.object,
    reference: input.reference ?? null, fieldPath: input.fieldPath ?? null, fieldLabel: input.fieldLabel ?? (input.fieldPath ? cmsReleaseFieldLabel(input.fieldPath) : null), nodeId: input.nodeId ?? null,
    editTarget: input.editTarget === undefined ? cmsReleaseCheckEditTarget(input.object.kind, input.siteId, input.object.id, input.fieldPath, input.nodeId) : input.editTarget,
    recommendedAction: input.recommendedAction ?? 'edit' };
}

export function inspectCmsReleaseTaxonomy(siteId: number, object: CmsReleaseCheck['object'], configuration: CmsConfigurationSnapshot, modelId: number | null, tagIds: readonly number[]): CmsReleaseCheck[] {
  const terms = (configuration.tables.cms_tags ?? []).filter(row => tagIds.includes(Number(row.id))).map(row => ({ id: Number(row.id), vocabularyId: row.vocabulary_id == null ? null : Number(row.vocabulary_id) }));
  const vocabularies = (configuration.tables.cms_vocabularies ?? []).map(row => ({ id: Number(row.id), name: String(row.name), modelIds: (row.model_ids ?? []) as number[], required: row.required === true, maxSelections: Number(row.max_selections), status: String(row.status) }));
  const issues = validateCmsVocabularySelection(vocabularies, terms, modelId, true);
  if (terms.length !== new Set(tagIds).size) issues.unshift('所选标签或分类词条不在候选配置中');
  return issues.map(message => makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: 'taxonomy', fieldPath: 'tagIds', fieldLabel: '标签与分类', message }));
}

/** Candidate-only configuration; callers supply visibility from the same frozen public set. */
export function inspectCmsReleaseConfiguration(input: { siteId: number; configuration: CmsConfigurationSnapshot; enabledChannelIds: ReadonlySet<number>; visibleContentIds: ReadonlySet<number> }): CmsReleaseCheck[] {
  const { siteId, configuration, enabledChannelIds, visibleContentIds } = input;
  const checks: CmsReleaseCheck[] = [];
  const widgets = configuration.tables.cms_widgets ?? [];
  const channels = configuration.tables.cms_channels ?? [];
  const tags = configuration.tables.cms_tags ?? [];
  const requireWidget = (id: number, object: CmsReleaseCheck['object'], fieldPath: string, nodeId: string | null) => {
    const widget = widgets.find(row => Number(row.id) === id && row.status === 'published' && row.published_data);
    if (!widget) checks.push(makeCmsReleaseCheck({ siteId, object, reference: { kind: 'widget', id }, code: 'widget-target', fieldPath, nodeId, message: `部件 #${id} 未包含在候选公开集合中，请先发布部件并明确加入本次发布配置` }));
  };
  for (const placement of configuration.tables.cms_widget_refs ?? []) if (placement.owner_type === 'theme_slot') {
    requireWidget(Number(placement.widget_id), { kind: 'site', id: siteId, title: '站点主题插槽', revisionId: null }, String(placement.field), null);
  }
  for (const page of configuration.tables.cms_pages ?? []) {
    if (page.status !== 'enabled') continue;
    const object = { kind: 'page' as const, id: Number(page.id), title: String(page.name), revisionId: null };
    const blocks = (Array.isArray(page.blocks) ? page.blocks : []) as CmsPageBlock[];
    for (const issue of inspectCmsPageBlocks(blocks)) checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: issue.rule, fieldPath: issue.fieldPath, nodeId: issue.blockId || null, severity: issue.severity, message: issue.message }));
    for (const block of blocks) {
      if (block.type === 'widget-ref' && Number.isSafeInteger(block.props.widgetId)) requireWidget(Number(block.props.widgetId), object, 'widgetId', block.id);
      if (block.type === 'content-list') {
        if (block.props.collectionId) {
          const collection = configuration.tables.cms_content_collections?.find(row => Number(row.id) === Number(block.props.collectionId) && Number(row.site_id) === siteId);
          if (!collection) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'collection-target', fieldPath: 'collectionId', nodeId: block.id, message: '内容集合不存在、不属于本站或未明确加入候选配置' }));
          continue;
        }
        const channel = block.props.channelCode ? channels.find(row => row.code === block.props.channelCode) : channels.find(row => Number(row.id) === Number(block.props.channelId));
        if ((block.props.channelCode || block.props.channelId) && (!channel || !enabledChannelIds.has(Number(channel.id)))) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'channel-target', fieldPath: 'channelId', nodeId: block.id, reference: block.props.channelId ? { kind: 'channel', id: Number(block.props.channelId) } : null, message: '内容列表引用的栏目不存在或未有效启用' }));
        if (block.props.tagSlug && !tags.some(row => row.slug === block.props.tagSlug)) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'tag-target', fieldPath: 'tagSlug', nodeId: block.id, message: '内容列表引用的标签不存在' }));
      }
      for (const fieldPath of ['buttonUrl', 'linkUrl']) {
        const raw = block.props[fieldPath]; const ref = typeof raw === 'string' ? parseCmsLink(raw) : null;
        if (ref?.kind !== 'entity') continue;
        const id = ref.id ?? Number(channels.find(row => row.code === ref.code)?.id);
        const valid = ref.entityType === 'content' ? visibleContentIds.has(id) : enabledChannelIds.has(id);
        if (!valid) checks.push(makeCmsReleaseCheck({ siteId, object, code: 'link-target', fieldPath, nodeId: block.id, reference: Number.isSafeInteger(id) && id > 0 ? { kind: ref.entityType, id } : null, recommendedAction: ref.entityType === 'content' ? 'select-approved' : 'edit', message: '链接目标不在候选公开集合中' }));
      }
    }
  }
  for (const widget of widgets) {
    if (widget.status !== 'published' || !widget.published_data) continue;
    const object = { kind: 'widget' as const, id: Number(widget.id), title: String(widget.published_name ?? widget.name), revisionId: null };
    const items = (widget.published_data as { items: { id: string; sourceType: string; sourceId?: number | null }[] }).items;
    if (!items.length) checks.push(makeCmsReleaseCheck({ siteId, object, kind: 'quality', code: 'empty-widget', fieldPath: 'items', severity: 'warning', message: '已发布部件暂无展示条目' }));
    for (const item of items) {
      if (item.sourceType !== 'content' && item.sourceType !== 'channel') continue;
      const id = Number(item.sourceId);
      if (!(item.sourceType === 'content' ? visibleContentIds : enabledChannelIds).has(id)) checks.push(makeCmsReleaseCheck({ siteId, object, reference: { kind: item.sourceType, id }, code: `${item.sourceType}-target`, fieldPath: `items.${item.id}.sourceId`, nodeId: item.id, message: `部件来源${item.sourceType === 'content' ? '内容' : '栏目'} #${id} 不在候选公开集合中`, recommendedAction: item.sourceType === 'content' ? 'select-approved' : 'edit' }));
    }
  }
  return checks;
}

export function cmsReleaseBlockingMessage(checks: readonly CmsReleaseCheck[]): string | null {
  const errors = checks.filter(check => check.severity === 'error');
  return errors.length ? `发布检查发现 ${errors.length} 项阻断：${errors.map(check => `${check.object.title}${check.fieldLabel ? ` · ${check.fieldLabel}` : ''}：${check.message}`).join('；')}` : null;
}

export function uniqueCmsReleaseChecks(checks: readonly CmsReleaseCheck[]): CmsReleaseCheck[] {
  const byKey = new Map<string, CmsReleaseCheck>();
  for (const check of checks) {
    const key = JSON.stringify([check.object.kind, check.object.id, check.code, check.fieldPath, check.nodeId, check.reference, check.message]);
    if (!byKey.has(key)) byKey.set(key, check);
  }
  return [...byKey.values()];
}

