import type { CmsContentType, CmsModelField } from '@zenith/shared/cms';

type SideTab = 'basic' | 'attribution' | 'seo' | 'schedule' | 'advanced';
export interface CmsEditorFieldLocation {
  label: string;
  field: string;
  sideTab?: SideTab;
}

/** 编辑表单的位置和业务名称；模型字段继续使用当前稿件冻结的定义。 */
const EDITOR_FIELDS: Record<string, { label: string; sideTab?: SideTab }> = {
  channelId: { label: '所属栏目', sideTab: 'basic' },
  modelId: { label: '内容模型', sideTab: 'basic' },
  title: { label: '标题', sideTab: 'basic' },
  subTitle: { label: '副标题', sideTab: 'basic' },
  shortTitle: { label: '短标题', sideTab: 'basic' },
  summary: { label: '摘要', sideTab: 'basic' },
  tagIds: { label: '标签', sideTab: 'basic' },
  coverImage: { label: '内容封面', sideTab: 'basic' },
  isTop: { label: '置顶', sideTab: 'basic' },
  isOriginal: { label: '原创', sideTab: 'basic' },
  isRecommend: { label: '推荐', sideTab: 'basic' },
  isHot: { label: '热门', sideTab: 'basic' },
  titleBold: { label: '标题加粗', sideTab: 'basic' },
  titleColor: { label: '标题颜色', sideTab: 'basic' },
  extraChannelIds: { label: '副栏目', sideTab: 'attribution' },
  relatedIds: { label: '相关文章', sideTab: 'attribution' },
  ownerId: { label: '内容负责人', sideTab: 'attribution' },
  locale: { label: '内容语言', sideTab: 'attribution' },
  dueAt: { label: '审稿截止时间', sideTab: 'attribution' },
  author: { label: '作者', sideTab: 'attribution' },
  editor: { label: '责任编辑', sideTab: 'attribution' },
  source: { label: '来源', sideTab: 'attribution' },
  sourceUrl: { label: '来源链接', sideTab: 'attribution' },
  seoTitle: { label: 'SEO 标题', sideTab: 'seo' },
  seoKeywords: { label: 'SEO 关键词', sideTab: 'seo' },
  seoDescription: { label: 'SEO 描述', sideTab: 'seo' },
  socialImageAlt: { label: '社交图片说明', sideTab: 'seo' },
  twitterCreator: { label: 'Twitter/X 作者', sideTab: 'seo' },
  topWeight: { label: '置顶权重', sideTab: 'schedule' },
  topExpireAt: { label: '置顶到期时间', sideTab: 'schedule' },
  sort: { label: '排序', sideTab: 'schedule' },
  scheduledAt: { label: '计划发布时间', sideTab: 'schedule' },
  expireAt: { label: '过期下线', sideTab: 'schedule' },
  slug: { label: '自定义 URL 标识', sideTab: 'advanced' },
  staticPath: { label: '自定义静态路径', sideTab: 'advanced' },
  detailTemplate: { label: '详情模板', sideTab: 'advanced' },
  mediaUrl: { label: '媒体地址' },
  mediaPoster: { label: '媒体海报' },
  mediaDuration: { label: '媒体时长' },
  mediaType: { label: '媒体类型' },
};

export function normalizeCmsEditorFieldPath(path: string): string {
  return path.replace(/\[(\d+)\]/g, '.$1');
}

export function getCmsEditorFieldLocation(
  path: string,
  fields: readonly CmsModelField[] = [],
  contentType: CmsContentType = 'article',
  extend: Record<string, unknown> = {},
): CmsEditorFieldLocation | null {
  const normalized = normalizeCmsEditorFieldPath(path);
  const [root, name, ...tail] = normalized.split('.');
  if (root === 'extend') {
    if (!name) return { label: '模型字段与依赖', field: fields.length ? 'extend' : 'modelId', sideTab: fields.length ? undefined : 'basic' };
    const definition = fields.find((field) => field.name === name);
    if (!definition) return null;
    const labels = [definition.label];
    const index = tail[0] && /^\d+$/.test(tail[0]) ? Number(tail[0]) : undefined;
    const childName = index === undefined ? tail[0] : tail[1];
    if (index !== undefined) labels.push(`第 ${index + 1} 项`);
    if (childName) {
      const items = extend[name];
      const item = Array.isArray(items) && index !== undefined ? items[index] : undefined;
      const blockType = item && typeof item === 'object' ? (item as Record<string, unknown>).blockType : undefined;
      const children = definition.configuration?.blockTypes?.find((block) => block.code === blockType)?.fields
        ?? definition.configuration?.fields;
      const child = children?.find((field) => field.name === childName);
      labels.push(childName === 'blockType' ? '区块类型' : child?.label ?? '子字段');
    }
    return { label: labels.join(' / '), field: normalized };
  }
  if (root === 'body' || root === 'bodyDocument') return contentType === 'link' ? null : { label: name ? '正文图片' : '正文', field: 'body' };
  if (root === 'attachments') return contentType === 'link' ? null : { label: '附件', field: 'attachments' };
  if (root === 'mediaData') {
    if (contentType === 'album') return { label: '图集图片', field: 'mediaData.images' };
    if (contentType !== 'media') return null;
    const field = name === 'poster' ? 'mediaPoster' : name === 'duration' ? 'mediaDuration' : name === 'mediaType' ? 'mediaType' : 'mediaUrl';
    return { ...EDITOR_FIELDS[field], field };
  }
  if (root === 'externalLink') return { label: contentType === 'link' ? '链接地址' : '跳转链接', field: root, sideTab: contentType === 'link' ? undefined : 'advanced' };
  const definition = EDITOR_FIELDS[root];
  return definition ? { ...definition, field: root } : null;
}

export function cmsEditorFieldLabel(path: string | null | undefined, fields: readonly CmsModelField[] = [], extend: Record<string, unknown> = {}): string {
  if (!path) return '整篇稿件';
  return getCmsEditorFieldLocation(path, fields, 'article', extend)?.label
    ?? (path.startsWith('extend.') ? '模型字段' : path.startsWith('mediaData') ? '媒体内容' : '稿件设置');
}
