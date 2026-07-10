import { describe, expect, it } from 'vitest';
import {
  assertReportSqlTableAllowlist,
  extractReportSqlTableReferences,
  isReadonlyReportSql,
  normalizeReadonlyReportSql,
} from './report-sql-safety';

describe('report SQL safety', () => {
  it('allows one SELECT or read-only CTE', () => {
    expect(normalizeReadonlyReportSql('SELECT * FROM orders;')).toBe('SELECT * FROM orders');
    expect(isReadonlyReportSql('WITH x AS (SELECT 1 AS n) SELECT * FROM x')).toBe(true);
  });

  it('allows keywords and semicolons inside literals/comments', () => {
    expect(isReadonlyReportSql("SELECT 'delete; update' AS text")).toBe(true);
    expect(isReadonlyReportSql('SELECT 1 /* delete from users */')).toBe(true);
    expect(isReadonlyReportSql('SELECT 1 AS "load"')).toBe(true);
    expect(isReadonlyReportSql('SELECT "comment" FROM posts')).toBe(true);
  });

  it('rejects multi statements and writes hidden in a CTE', () => {
    expect(isReadonlyReportSql('SELECT 1; SELECT 2')).toBe(false);
    expect(isReadonlyReportSql('WITH x AS (DELETE FROM users RETURNING id) SELECT * FROM x')).toBe(false);
  });

  it('rejects side-effect functions and SELECT INTO', () => {
    expect(isReadonlyReportSql("SELECT pg_read_file('/etc/passwd')")).toBe(false);
    expect(isReadonlyReportSql('SELECT "pg_read_file"(\'/etc/passwd\')')).toBe(false);
    expect(isReadonlyReportSql('SELECT * INTO backup_users FROM users')).toBe(false);
    expect(isReadonlyReportSql("SELECT load_file('/etc/passwd')")).toBe(false);
    expect(isReadonlyReportSql('SELECT 1 /*!50000 INTO OUTFILE \'/tmp/x\' */')).toBe(false);
  });

  it('extracts joins, comma joins, nested queries and quoted identifiers', () => {
    expect(extractReportSqlTableReferences(
      'WITH recent AS (SELECT * FROM "sales"."orders") SELECT * FROM recent r JOIN customers c ON c.id = r.customer_id',
    )).toEqual(['sales.orders', 'customers']);
    expect(extractReportSqlTableReferences(
      'SELECT * FROM allowed a, (SELECT * FROM nested_table) n, [audit].[entries] e',
    )).toEqual(['allowed', 'nested_table', 'audit.entries']);
    expect(extractReportSqlTableReferences(
      'SELECT * FROM allowed a JOIN (secret1 s JOIN secret2 t ON true) ON true',
    )).toEqual(['allowed', 'secret1', 'secret2']);
    expect(extractReportSqlTableReferences(
      'SELECT * FROM ((secret_root r JOIN allowed a ON true) JOIN third_table t ON true)',
    )).toEqual(['secret_root', 'allowed', 'third_table']);
    expect(extractReportSqlTableReferences(
      'SELECT * FROM allowed a, (secret_comma x JOIN allowed y ON true) z',
    )).toEqual(['allowed', 'secret_comma']);
  });

  it('rejects allowlist bypasses and sensitive schemas even when prompt text mimics a CTE', () => {
    expect(() => assertReportSqlTableAllowlist(
      "SELECT 'with shadow_orders as (' AS prompt FROM allowed a, shadow_orders s",
      ['allowed'],
    )).toThrow('未授权');
    expect(() => assertReportSqlTableAllowlist(
      'SELECT * FROM allowed a JOIN pg_catalog.pg_user p ON true',
      ['allowed', 'pg_catalog.pg_user'],
    )).toThrow('敏感表');
    expect(() => assertReportSqlTableAllowlist(
      'SELECT access_token FROM allowed',
      ['allowed'],
    )).toThrow('敏感字段');
    expect(() => assertReportSqlTableAllowlist(
      'SELECT * FROM (users u JOIN allowed a ON true)',
      ['allowed'],
    )).toThrow('敏感表');
    expect(() => assertReportSqlTableAllowlist(
      'SELECT * FROM allowed a JOIN (report_datasources d JOIN allowed b ON true) ON true',
      ['allowed'],
    )).toThrow('敏感表');
    expect(assertReportSqlTableAllowlist(
      'WITH base AS (SELECT * FROM allowed) SELECT * FROM base',
      ['allowed'],
    )).toContain('allowed');
  });
});
