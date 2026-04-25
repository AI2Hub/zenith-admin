import { and } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/** 合并两个可选的 WHERE 条件，等价于 `base && extra ? and(base, extra) : (extra ?? base)` */
export function mergeWhere(base?: SQL, extra?: SQL): SQL | undefined {
  if (base && extra) return and(base, extra);
  return extra ?? base;
}
