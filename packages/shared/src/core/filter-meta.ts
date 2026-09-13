import * as z from 'zod';

/**
 * 列表查询参数的**语义**元数据（`x-filter`）：由 `api-schemas.ts` 的查询积木在构造时写入 `.meta()`，
 * 前端 `useListPage` 据此派生筛选控件，OpenAPI 文档同时得到枚举标签 / 匹配字段等说明。
 *
 * 只描述「这个参数是什么」（关键字匹配哪些字段、枚举标签来自哪个字典），不描述「用什么控件」——
 * 控件选择是 web 端「kind → 控件」的映射，特例在页面里 override。
 */
export type FilterMeta =
  /** 关键字模糊匹配；`fields` 为人可读的匹配字段（「名称 / 编码」） */
  | { readonly kind: 'keyword'; readonly fields?: string }
  /** 枚举单选；标签取 `dict`（运行时字典编码）或静态 `options`，两者都缺省时以取值本身为标签 */
  | { readonly kind: 'enum'; readonly values: readonly string[]; readonly dict?: string; readonly options?: readonly FilterMetaOption[] }
  /** 是 / 否 */
  | { readonly kind: 'bool' }
  /** 关联 ID（正整数） */
  | { readonly kind: 'id' }
  /** 时间范围端点；`bound` 标明起 / 止，成对键由页面以元组 `['startTime', 'endTime']` 声明 */
  | { readonly kind: 'date-bound'; readonly bound: 'start' | 'end' };

export interface FilterMetaOption {
  readonly value: string;
  readonly label: string;
}

export type FilterKind = FilterMeta['kind'];

/** `.meta()` 里承载筛选语义的键（OpenAPI vendor extension） */
export const FILTER_META_KEY = 'x-filter';

/** 把筛选语义并入其它 OpenAPI meta：`schema.meta({ description, ...filterMeta({ kind: 'keyword' }) })` */
export function filterMeta(meta: FilterMeta): { readonly [FILTER_META_KEY]: FilterMeta } {
  return { [FILTER_META_KEY]: meta };
}

type Wrapped = { _zod?: { def?: { innerType?: z.ZodType; in?: z.ZodType } } };

/**
 * 读取字段 schema 的筛选语义：外层 meta 优先，缺省时沿 `optional / default / pipe` 等包装层向内查找
 * （`.meta()` 不跨包装层继承，而 `paginationQuery.extend({...})` 存的是最外层 schema）。
 */
export function filterMetaOf(schema: z.ZodType | undefined): FilterMeta | undefined {
  let current: z.ZodType | undefined = schema;
  for (let depth = 0; current && depth < 8; depth++) {
    const meta = current.meta() as Record<string, unknown> | undefined;
    const found = meta?.[FILTER_META_KEY];
    if (found && typeof found === 'object' && 'kind' in found) return found as FilterMeta;
    const def = (current as Wrapped)._zod?.def;
    current = def?.innerType ?? def?.in;
  }
  return undefined;
}

/** 整个查询 schema 的字段 → 筛选语义表（无 `x-filter` 的字段不出现） */
export function filterMetaMap(query: z.ZodObject<z.ZodRawShape>): Record<string, FilterMeta> {
  const out: Record<string, FilterMeta> = {};
  for (const [key, field] of Object.entries(query.shape)) {
    const meta = filterMetaOf(field as z.ZodType);
    if (meta) out[key] = meta;
  }
  return out;
}
