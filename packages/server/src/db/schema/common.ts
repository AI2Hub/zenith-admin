import { integer, pgEnum, timestamp, varchar } from 'drizzle-orm/pg-core';

export const statusEnum = pgEnum('status', ['enabled', 'disabled']);

/** App 推送聚合供应商（定义在 common 破除 messaging ↔ app-releases 模块环） */
export const pushProviderEnum = pgEnum('push_provider', ['jpush']);

// ─── 列积木：同一列在全库只声明一次，表文件只写业务字段 ────────────────────────

/** 自增整数主键：`id: idColumn()`（业务主键为 bigint / uuid / 业务编码的表仍逐个声明） */
export const idColumn = () => integer().primaryKey().generatedAlwaysAsIdentity();

/** 启用 / 禁用状态列，默认 `enabled`：`status: statusColumn()` / `statusColumn('disabled')` */
export const statusColumn = (defaultValue: 'enabled' | 'disabled' = 'enabled') => statusEnum().notNull().default(defaultValue);

/** 排序值，默认 0：`sort: sortColumn()` */
export const sortColumn = () => integer().notNull().default(0);

/** 备注列，默认 256 字符：`remark: remarkColumn()` / `remarkColumn(500)`；长文本备注用 `text()` */
export const remarkColumn = (length = 256) => varchar({ length });

export interface TimestampColumnsOptions {
  /** `timestamptz`；缺省为不带时区的 `timestamp`（与历史多数表一致） */
  withTimezone?: boolean;
}

/**
 * 创建 / 更新时间列：`created_at` 默认 now()，`updated_at` 默认 now() 且由 `$onUpdate` 在更新时自动刷新
 * （业务代码禁止手动传 `updatedAt`）。
 * 用法：在 pgTable 列定义末尾展开 `...timestampColumns()` / `...timestampColumns({ withTimezone: true })`；
 * 只有 `created_at` 的追加型表（日志 / 事件）继续单独声明。
 */
export const timestampColumns = (options: TimestampColumnsOptions = {}) => ({
  createdAt: timestamp(options).defaultNow().notNull(),
  updatedAt: timestamp(options).defaultNow().$onUpdate(() => new Date()).notNull(),
});
