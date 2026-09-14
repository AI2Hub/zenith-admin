/** 类型声明：供 src/components/icons/iconify-assets.test.ts 以类型安全方式复用生成器逻辑 */

export const COLLECTIONS: Readonly<Record<string, string>>;
export const FILE_ICON_PREFIX: string;

export interface MonoIconEntry {
  body: string;
  width: number;
  height: number;
}

export interface ExtractResult {
  fileIcons: Map<string, string>;
  monoIcons: Map<string, MonoIconEntry>;
  sources: Record<string, string>;
  missing: string[];
}

export function scanIconLiterals(srcDir: string, excludes?: RegExp[]): { ids: Map<string, Set<string>>; unregistered: Map<string, Set<string>> };
export function loadIconSet(prefix: string, requireFrom?: string): { iconSet: unknown; version: string; pkg: string };
export function folderOpenedVariant(id: string): string | null;
export function extractIcons(ids: Iterable<string>, requireFrom?: string): ExtractResult;
export function renderMonoModule(monoIcons: Map<string, MonoIconEntry>): string;
export function renderManifest(result: Pick<ExtractResult, 'fileIcons' | 'monoIcons' | 'sources'>): string;
