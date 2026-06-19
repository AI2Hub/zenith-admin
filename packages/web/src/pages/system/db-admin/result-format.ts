/** 查询结果集格式化工具：用于「复制为 JSON / Markdown」等导出场景。 */

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** 将结果行序列化为格式化 JSON 字符串 */
export function rowsToJson(rows: Array<Record<string, unknown>>): string {
  const clean = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (!k.startsWith('__')) out[k] = v;
    }
    return out;
  });
  return JSON.stringify(clean, null, 2);
}

/** 将结果集转为 Markdown 表格 */
export function rowsToMarkdown(
  columns: Array<{ name: string }>,
  rows: Array<Record<string, unknown>>,
): string {
  const names = columns.map((c) => c.name);
  if (names.length === 0) return '';
  const escapeCell = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ');
  const header = `| ${names.join(' | ')} |`;
  const divider = `| ${names.map(() => '---').join(' | ')} |`;
  const body = rows
    .map((r) => `| ${names.map((n) => escapeCell(cellToString(r[n]))).join(' | ')} |`)
    .join('\n');
  return [header, divider, body].filter(Boolean).join('\n');
}

/** 将结果集转为 CSV（含 BOM，可被 Excel 正确识别） */
export function rowsToCsv(
  columns: Array<{ name: string }>,
  rows: Array<Record<string, unknown>>,
): string {
  const names = columns.map((c) => c.name);
  const escape = (v: unknown): string => {
    const s = cellToString(v);
    return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const header = names.map(escape).join(',');
  const body = rows.map((r) => names.map((n) => escape(r[n])).join(',')).join('\n');
  return `\uFEFF${header}\n${body}`;
}
