/** 与后端 pino-pretty 的本地时间、单行元数据和 ignore: pid,hostname 保持一致。 */
const LEVEL_NAMES: Record<string, string> = {
  10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL',
  trace: 'TRACE', debug: 'DEBUG', info: 'INFO', warn: 'WARN', warning: 'WARN', error: 'ERROR', fatal: 'FATAL',
};

function localTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 一条 NDJSON 记录对应一条展示记录；错误栈保留真实换行，原始记录和续传游标不变。 */
export function formatConsoleLogLine(raw: string): string {
  let entry: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return raw;
    entry = parsed as Record<string, unknown>;
  } catch { return raw; }
  const levelKey = String(entry.level).toLowerCase();
  const level = Object.hasOwn(LEVEL_NAMES, levelKey) ? LEVEL_NAMES[levelKey] : undefined;
  // 非应用日志的 JSON / 文本原样保留，避免把 console 的任意输出误当 pino 记录。
  if (!level) return raw;
  const time = localTimestamp(entry.time);
  const message = typeof entry.msg === 'string' ? entry.msg : entry.msg === undefined ? '' : JSON.stringify(entry.msg);
  const fields: Array<[string, unknown]> = [];
  const stacks: string[] = [];
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'level' || key === 'msg' || key === 'pid' || key === 'hostname' || (key === 'time' && time)) continue;
    if ((key === 'err' || key === 'error') && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const { stack, ...details } = value as Record<string, unknown>;
      if (typeof stack === 'string') {
        if (Object.keys(details).length > 0) fields.push([key, details]);
        if (stack) stacks.push(stack.replace(/\r\n/g, '\n'));
      } else fields.push([key, value]);
    } else fields.push([key, value]);
  }
  const metadata = fields.length > 0 ? ` ${JSON.stringify(Object.fromEntries(fields))}` : '';
  const stackText = stacks.length > 0 ? `\n${stacks.map((stack) => stack.split('\n').map((line) => `    ${line}`).join('\n')).join('\n')}` : '';
  return `${time ? `[${time}] ` : ''}${level}:${message ? ` ${message}` : ''}${metadata}${stackText}`;
}
