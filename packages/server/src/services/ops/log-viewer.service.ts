import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as nodePath from 'node:path';

const execFileAsync = promisify(execFile);

/** 验证路径安全性（防止路径穿越） */
export function validateLogPath(filePath: string): void {
  const normalized = nodePath.normalize(filePath);
  if (normalized.includes('..') || normalized !== filePath.replaceAll('\\', '/').replace(/\/$/, '')) {
    // Allow absolute paths only
    if (!nodePath.isAbsolute(normalized)) throw new Error('路径必须为绝对路径');
  }
}

/** 读取文件末尾 N 行 */
export async function readLastLines(filePath: string, lines: number): Promise<string> {
  validateLogPath(filePath);
  try {
    const { stdout } = await execFileAsync('tail', ['-n', String(lines), '--', filePath], {
      timeout: 10000,
      maxBuffer: 1024 * 1024 * 20, // 20 MB
    });
    return stdout;
  } catch {
    // Windows/无 tail 回退：直接读取文件
    const content = await fs.promises.readFile(filePath, 'utf8');
    const allLines = content.split('\n');
    return allLines.slice(Math.max(0, allLines.length - lines)).join('\n');
  }
}

/** 流式 tail -f（实时追踪） */
export function spawnTailFollow(filePath: string): { kill: () => void; lines: NodeJS.ReadableStream } {
  validateLogPath(filePath);
  const proc = spawn('tail', ['-f', '-n', '0', '--', filePath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    kill: () => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } },
    lines: proc.stdout as NodeJS.ReadableStream,
  };
}

/** 为下载读取日志文件（容量上限保护），返回文件名与可读流 */
export function openLogForDownload(filePath: string, maxBytes = 100 * 1024 * 1024): { filename: string; size: number; stream: fs.ReadStream } {
  validateLogPath(filePath);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('目标不是文件');
  if (stat.size > maxBytes) throw new Error(`文件过大（${(stat.size / 1024 / 1024).toFixed(1)}MB），超出下载上限 ${maxBytes / 1024 / 1024}MB`);
  return { filename: nodePath.basename(filePath), size: stat.size, stream: fs.createReadStream(filePath) };
}
