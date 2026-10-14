import { DEFAULT_UPLOAD_ALLOWED_TYPES } from '@zenith/shared/settings';
import { guessMimeTypeFromName } from '@/utils/file-mime';

function mimeTypes(extensions: string[]): string[] {
  return [...new Set(extensions.map((ext) => guessMimeTypeFromName(`file.${ext}`)).filter((mime): mime is string => mime !== null))];
}

export const UPLOAD_MIME_PRESETS = [
  { label: '图片', types: ['image/*'] },
  { label: '音频', types: ['audio/*'] },
  { label: '视频', types: ['video/*'] },
  { label: 'Office', types: mimeTypes(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']) },
  { label: 'PDF', types: mimeTypes(['pdf']) },
  { label: '文本 / 数据', types: [...mimeTypes(['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'yaml']), 'text/vtt'] },
  { label: '压缩包', types: [...mimeTypes(['zip', 'zipx', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']), 'application/x-rar-compressed'] },
  { label: '常用类型', types: DEFAULT_UPLOAD_ALLOWED_TYPES },
] as const;

export type MimePresetMode = 'append' | 'replace';

/** MIME 不区分大小写；保留原顺序、自定义类型和通配符，追加不会偷偷收紧现有许可。 */
export function applyMimePreset(current: readonly string[], preset: readonly string[], mode: MimePresetMode): string[] {
  const values = mode === 'append' ? [...current, ...preset] : preset;
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}
