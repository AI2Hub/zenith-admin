/** 轻量 CSV 解析：支持引号包裹、转义双引号、字段内逗号/换行。第一行作为表头。 */
export function parseCsv(text: string): { headers: string[]; rows: Array<Record<string, string>> } {
  // 去除 UTF-8 BOM
  const input = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => { records.push(record); record = []; };

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { pushField(); i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { pushField(); pushRecord(); i++; continue; }
    field += ch; i++;
  }
  // 收尾最后一个字段/记录
  if (field.length > 0 || record.length > 0) { pushField(); pushRecord(); }

  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
      return obj;
    });
  return { headers, rows };
}

/** 解析 JSON：接受对象数组，或 { list: [...] } 包裹 */
export function parseJsonRows(text: string): { headers: string[]; rows: Array<Record<string, unknown>> } {
  const parsed: unknown = JSON.parse(text);
  let arr: unknown[];
  if (Array.isArray(parsed)) arr = parsed;
  else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { list?: unknown[] }).list)) {
    arr = (parsed as { list: unknown[] }).list;
  } else {
    throw new Error('JSON 必须是对象数组，或 { list: [...] } 结构');
  }
  const rows = arr.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x));
  const headerSet = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) headerSet.add(k);
  return { headers: Array.from(headerSet), rows };
}
