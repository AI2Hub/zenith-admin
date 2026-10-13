import fsp from 'node:fs/promises';
import path from 'node:path';
import { HTTPException } from 'hono/http-exception';
import { config } from '../../config';
import { formatDateTime } from '../../lib/datetime';
import { readTailLinesStream, type TailReadOptions } from './log-reader';

export const LOG_DIR = path.resolve(config.log.dir);

/**
 * 安全校验文件名：防止路径穿越。
 * 返回 null 表示非法文件名。
 */
export function safeFilename(filename: string): string | null {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.startsWith('.')) {
    return null;
  }
  return filename;
}

/** 解析文件完整路径并验证在 LOG_DIR 内（双重保护） */
export function resolveLogPath(filename: string): string | null {
  const resolved = path.resolve(LOG_DIR, filename);
  if (!resolved.startsWith(LOG_DIR + path.sep) && resolved !== LOG_DIR) {
    return null;
  }
  return resolved;
}

// ─── 业务逻辑 ─────────────────────────────────────────────────────────────────

export async function listLogFiles() {
  let entries;
  try {
    entries = await fsp.readdir(LOG_DIR, { withFileTypes: true });
  } catch {
    return []; // 日志目录尚未创建
  }
  const logEntries = entries.filter(e => e.isFile() && (e.name.endsWith('.log') || e.name.endsWith('.log.gz')));
  const files = await Promise.all(logEntries.map(async (e) => {
    const stat = await fsp.stat(path.join(LOG_DIR, e.name));
    return {
      name: e.name,
      size: stat.size,
      modifiedAt: formatDateTime(stat.mtime),
      isGzip: e.name.endsWith('.gz'),
    };
  }));
  return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export async function readLogFileLines(filename: string, lines: number, opts: TailReadOptions = {}) {
  const { filepath } = await resolveLogFile(filename);
  return readTailLinesStream(filepath, lines, opts);
}

export async function deleteLogFile(filename: string) {
  const { filepath } = await resolveLogFile(filename);
  await fsp.unlink(filepath);
}

/**
 * 批量删除：逐个校验文件名（与单删同一套穿越防护），删除已存在的文件。
 * 文件可能已被日志轮转 / 外部清理移除，跳过不存在者而不是整体失败。
 * 返回实际删除个数，供页面给出准确的成功文案。
 */
export async function batchDeleteLogFiles(filenames: string[]) {
  const targets = [...new Set(filenames)].flatMap((filename) => {
    const name = safeFilename(filename);
    if (!name) throw new HTTPException(400, { message: `无效的文件名：${filename}` });
    const filepath = resolveLogPath(name);
    if (!filepath) throw new HTTPException(404, { message: '文件不存在' });
    return [filepath];
  });
  let deleted = 0;
  for (const filepath of targets) {
    try {
      await fsp.unlink(filepath);
      deleted += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return deleted;
}

export async function getLogFileBeforeAudit(filename: string) {
  const { name, filepath } = await resolveLogFile(filename);
  const stat = await fsp.stat(filepath);
  return {
    name,
    size: stat.size,
    modifiedAt: formatDateTime(stat.mtime),
    isGzip: name.endsWith('.gz'),
  };
}

/** 批量删除的审计快照：只记录仍存在的文件，已被外部清理的不进 before */
export async function getLogFilesBeforeAudit(filenames: string[]) {
  const rows = await Promise.all([...new Set(filenames)].map(async (filename) => {
    const name = safeFilename(filename);
    if (!name) return null;
    const filepath = resolveLogPath(name);
    if (!filepath) return null;
    try {
      const stat = await fsp.stat(filepath);
      return {
        name,
        size: stat.size,
        modifiedAt: formatDateTime(stat.mtime),
        isGzip: name.endsWith('.gz'),
      };
    } catch {
      return null;
    }
  }));
  return rows.filter((row) => row !== null);
}

export async function resolveLogFile(filename: string) {
  const name = safeFilename(filename);
  if (!name) throw new HTTPException(400, { message: '无效的文件名' });
  const filepath = resolveLogPath(name);
  if (!filepath) throw new HTTPException(404, { message: '文件不存在' });
  try {
    await fsp.access(filepath);
  } catch {
    throw new HTTPException(404, { message: '文件不存在' });
  }
  return { name, filepath };
}
