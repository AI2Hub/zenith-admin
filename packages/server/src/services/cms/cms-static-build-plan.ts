/**
 * 全量重建的断点键：`{scope}|{phase}|{id}`。比较器按站点主产物、元数据顺序恢复，
 * scope 固定两种：`~site` 与 `~meta`（sitemap/rss/robots），同一范围内按 phase/id 排序。
 */
export function cmsStaticTargetKey(scope: string, phase: number, id: number): string {
  return `${scope}|${phase}|${String(id).padStart(12, '0')}`;
}

export function isCmsStaticTargetCompleted(targetKey: string, resumeAfterKey: string | null | undefined): boolean {
  if (!resumeAfterKey) return false;
  const order = (key: string) => key.replace(/^~site\|/, '0|').replace(/^~meta\|/, '1|');
  return order(targetKey) <= order(resumeAfterKey);
}
