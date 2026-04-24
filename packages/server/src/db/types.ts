import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PostgresJsDatabase, PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';

export type DbSchema = typeof schema;
export type DbRelations = ExtractTablesWithRelations<DbSchema>;
export type Db = PostgresJsDatabase<DbSchema>;
export type DbTransaction = PostgresJsTransaction<DbSchema, DbRelations>;
export type DbExecutor = Db | DbTransaction;
