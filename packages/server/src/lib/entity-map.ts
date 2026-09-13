import type * as z from 'zod';
import { formatDateTime } from './datetime';

/**
 * 契约实体投影：按契约实体 schema 的键从数据库行取值，替代逐资源手写的 `mapXxx(row)`。
 *
 * 规则（只做「行 → JSON 实体」的机械归一，不含业务换算）：
 * - 键集合以**实体 schema** 为准：行上多出的列（`headersEncrypted` / 内部标记）不会泄漏进响应；
 * - `Date` → `YYYY-MM-DD HH:mm:ss`（应用时区，同 `formatTimestamps`）；日期型（`YYYY-MM-DD`）字段请在 `overrides` 里自行 `formatDate`；
 * - 行值 `undefined` 且实体字段可为 `null` → `null`（对应此前的 `row.x ?? null`）；
 * - 行值 `null` 而实体字段只允许缺省（`.optional()` 不带 `.nullable()`）→ `undefined`；
 * - `overrides` 里给出的键原样采用（解密 / 脱敏 / 关联字段 / 计算字段都写在这里）。
 *
 * 类型层要求：实体的每个键要么由 `overrides` 提供，要么行上存在同名且可归一的值——
 * 契约加了字段而行 / 覆盖都没给时在编译期报错，而不是响应里静默缺键。
 *
 * @example
 * export const mapTag = entityMapper(tagSchema);
 * export const mapDataSource = entityMapper(workflowDataSourceSchema, (row: WorkflowDataSourceRow) => ({
 *   headers: maskHeaders(decryptHeaders(row.headersEncrypted)),
 * }));
 */

type Loosen<T> = T extends string ? T | Date : T;

/** 行上允许的取值：可空 / 可缺省字段接受 `null | undefined`；字符串字段接受 `Date`（自动格式化） */
type RowValue<T> = [Extract<T, null | undefined>] extends [never]
  ? Loosen<T>
  : Loosen<Exclude<T, null | undefined>> | null | undefined;

/** 实体 schema 对行的结构要求（`overrides` 已覆盖的键除外）：可缺省的实体键（`.optional()`）行上也可以没有 */
type OptionalEntityKeys<S extends z.ZodObject> = { [K in keyof z.output<S>]-?: undefined extends z.output<S>[K] ? K : never }[keyof z.output<S>];
export type EntityRow<S extends z.ZodObject, O = Record<never, never>> = {
  readonly [K in Exclude<keyof z.output<S>, keyof O | OptionalEntityKeys<S>>]: RowValue<z.output<S>[K]>;
} & {
  readonly [K in Exclude<Extract<keyof z.output<S>, OptionalEntityKeys<S>>, keyof O>]?: RowValue<z.output<S>[K]>;
};

/** 覆盖值：实体字段的子集，类型即实体字段类型 */
export type EntityOverrides<S extends z.ZodObject> = { readonly [K in keyof z.output<S>]?: z.output<S>[K] };

interface FieldPlan {
  readonly key: string;
  readonly acceptsNull: boolean;
  readonly acceptsUndefined: boolean;
}

const plans = new WeakMap<z.ZodObject, readonly FieldPlan[]>();

function planOf(schema: z.ZodObject): readonly FieldPlan[] {
  let plan = plans.get(schema);
  if (!plan) {
    plan = Object.entries(schema.shape).map(([key, field]) => ({
      key,
      acceptsNull: (field as z.ZodType).safeParse(null).success,
      acceptsUndefined: (field as z.ZodType).safeParse(undefined).success,
    }));
    plans.set(schema, plan);
  }
  return plan;
}

export function pickEntity<S extends z.ZodObject, const O extends EntityOverrides<S> = Record<never, never>>(
  schema: S,
  row: EntityRow<S, O>,
  overrides?: O,
): z.output<S> {
  const source = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const { key, acceptsNull, acceptsUndefined } of planOf(schema)) {
    let value: unknown = overrides && key in overrides ? (overrides as Record<string, unknown>)[key] : source[key];
    if (value instanceof Date) value = formatDateTime(value);
    else if (value === undefined && acceptsNull) value = null;
    else if (value === null && !acceptsNull && acceptsUndefined) value = undefined;
    out[key] = value;
  }
  return out as z.output<S>;
}

/**
 * 预绑定 schema 的行映射函数：`export const mapTag = entityMapper(tagSchema)`。
 * 带覆盖时用参数标注行类型，映射函数的入参即「行类型 ∩ 实体对行的要求」：
 * `entityMapper(schema, (row: XxxRow) => ({ secret: mask(row.secretEncrypted) }))`。
 */
export function entityMapper<S extends z.ZodObject>(schema: S): (row: EntityRow<S>) => z.output<S>;
export function entityMapper<S extends z.ZodObject, R, const O extends EntityOverrides<S>>(
  schema: S,
  overrides: (row: R) => O,
): (row: R & EntityRow<S, O>) => z.output<S>;
export function entityMapper<S extends z.ZodObject, R, const O extends EntityOverrides<S>>(
  schema: S,
  overrides?: (row: R) => O,
) {
  if (!overrides) return (row: EntityRow<S>) => pickEntity(schema, row);
  return (row: R & EntityRow<S, O>) => pickEntity(schema, row, overrides(row));
}
