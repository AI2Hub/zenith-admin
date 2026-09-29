import type { CmsDeliverySnapshot } from './cms-generation-context';

export type CmsDeliveryMarkers = Pick<CmsDeliverySnapshot, 'generationId' | 'releaseId' | 'visibilityEpoch'>;
const MARKER_NAMES = ['cms-generation-id', 'cms-release-id', 'cms-visibility-epoch'] as const;

function markerValues(snapshot: CmsDeliveryMarkers): string[] {
  if (!Number.isSafeInteger(snapshot.visibilityEpoch) || snapshot.visibilityEpoch < 0) throw new Error('Invalid CMS visibility epoch');
  for (const id of [snapshot.generationId, snapshot.releaseId]) if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid CMS delivery identity');
  return [String(snapshot.generationId), String(snapshot.releaseId), String(snapshot.visibilityEpoch)];
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag)?.[2];
}

/** Mark the HTML that was actually rendered; independent of analytics configuration. */
export function stampCmsDeliveryMarkers(html: string, snapshot: CmsDeliveryMarkers): string {
  const values = markerValues(snapshot);
  const markers = MARKER_NAMES.map((name, index) => `<meta name="${name}" content="${values[index]}"/>`).join('');
  const replace = (head: string) => head.replace(/<meta\b[^>]*>/gi, tag => MARKER_NAMES.includes(attribute(tag, 'name') as typeof MARKER_NAMES[number]) ? '' : tag);
  const head = /<head\b[^>]*>[\s\S]*?<\/head\s*>/i;
  if (head.test(html)) return html.replace(head, text => replace(text).replace(/<\/head\s*>/i, `${markers}</head>`));
  return markers + replace(html);
}

/** Parse actual head children; script text, comments and body markup are never delivery evidence. */
export async function readCmsDeliveryMarkerValues(html: string): Promise<Partial<CmsDeliveryMarkers>> {
  const { load } = await import('cheerio');
  const $ = load(html, { sourceCodeLocationInfo: true });
  const head = $('html > head').get(0);
  // HTML parsers synthesize a head for fragments. Such input did not supply a delivery marker block.
  const location = (head as unknown as { sourceCodeLocation?: { startTag?: unknown } } | undefined)?.sourceCodeLocation;
  if (!location?.startTag) return {};
  const values: Partial<CmsDeliveryMarkers> = {};
  const keys = ['generationId', 'releaseId', 'visibilityEpoch'] as const;
  for (const node of $('html > head > meta[name]').toArray()) {
    const index = MARKER_NAMES.indexOf($(node).attr('name') as typeof MARKER_NAMES[number]);
    if (index < 0) continue;
    const key = keys[index];
    const raw = $(node).attr('content');
    if (Object.hasOwn(values, key)) throw new Error('CMS 交付标记重复');
    if (key !== 'visibilityEpoch' && raw === 'null') { values[key] = null; continue; }
    if (raw === undefined || !(key === 'visibilityEpoch' ? /^(0|[1-9]\d*)$/ : /^[1-9]\d*$/).test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('CMS 交付标记格式无效');
    values[key] = Number(raw);
  }
  return values;
}

/** Missing, duplicated or malformed markers never certify cached bytes. */
export async function readCmsDeliveryMarkers(html: string): Promise<CmsDeliveryMarkers | null> {
  try {
    const values = await readCmsDeliveryMarkerValues(html);
    return values.generationId !== undefined && values.releaseId !== undefined && values.visibilityEpoch !== undefined
      ? { generationId: values.generationId, releaseId: values.releaseId, visibilityEpoch: values.visibilityEpoch } : null;
  } catch { return null; }
}

export async function cmsHtmlMatchesDelivery(html: string, snapshot: CmsDeliveryMarkers): Promise<boolean> {
  const markers = await readCmsDeliveryMarkers(html);
  return markers !== null && markers.generationId === snapshot.generationId && markers.releaseId === snapshot.releaseId && markers.visibilityEpoch === snapshot.visibilityEpoch;
}

export function cmsDeliveryHeaders(snapshot: CmsDeliveryMarkers): Record<string, string> {
  const [generation, release, epoch] = markerValues(snapshot);
  return { 'X-Cms-Generation': generation, 'X-Cms-Release': release, 'X-Cms-Visibility-Epoch': epoch };
}

export function cmsDeliveryEpochRequiresDynamic(snapshot: CmsDeliverySnapshot): boolean {
  return snapshot.generationId !== null && snapshot.visibilityEpoch !== snapshot.capturedVisibilityEpoch;
}
