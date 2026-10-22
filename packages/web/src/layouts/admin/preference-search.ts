import { preferenceDefinitionMap, type PreferencePath } from '@zenith/shared/preferences';
import { textMatches } from '@/utils/pinyin';

type PreferencePaths = PreferencePath | readonly PreferencePath[];

const WHITESPACE = /\s+/g;

/**
 * 偏好设置的搜索匹配：别名关键词 + 偏好目录里的名称 / 说明 / 选项名。
 *
 * 目录字段必须参与匹配：面板里的行文字不一定和关键词表完全一致，只靠手写关键词会漏掉
 * 「多选框布局」「文件列表默认视图」这类整词查询。查询按空白拆词后要求全部命中，
 * 比较时忽略空白，因此「显示Logo图标」也能命中「显示 Logo 图标」。
 */
export function preferenceSearchMatches(
  keywords: readonly string[],
  query: string,
  paths?: PreferencePaths,
): boolean {
  const q = query.trim();
  if (!q) return true;

  const haystack: string[] = [];
  const add = (text: string | undefined) => {
    if (!text) return;
    const normalized = text.replace(WHITESPACE, '');
    if (normalized) haystack.push(normalized);
  };

  keywords.forEach(add);
  for (const path of paths === undefined ? [] : Array.isArray(paths) ? paths : [paths]) {
    const definition = preferenceDefinitionMap[path as PreferencePath];
    if (!definition) continue;
    add(definition.label);
    add(definition.description);
    definition.options?.forEach((option) => add(String(option.label)));
  }

  return q.split(WHITESPACE).every((token) => haystack.some((text) => textMatches(text, token)));
}
