/**
 * 文本文件在线编辑的共享原语。
 *
 * 本机文件系统（terminal-files.service）与远程 SFTP（ssh-sftp.service）共用
 * 编辑约束、版本标识与原子写。
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HTTPException } from 'hono/http-exception';

/** 在线编辑的文件大小上限；超过则拒绝读取，避免把大文件整份读进内存 */
export const MAX_EDIT_SIZE = 5 * 1024 * 1024;

/**
 * 粗略判断二进制内容：前 8 KB 内出现 NUL 字节即认为不可文本编辑。
 * 目的是防止用户在编辑器里打开可执行文件后「保存」把它写坏。
 */
export function isBinaryBuffer(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8000);
  for (let i = 0; i < len; i += 1) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * 文件版本标识，用于并发编辑冲突检测。
 *
 * 取 mtime + 大小而非内容哈希：读写两侧都能从 stat 直接得到，
 * 不需要为了比对再把文件（或远程文件）完整读一遍。
 */
export function fileEtag(stat: { mtimeMs: number; size: number }): string {
  return `${Math.trunc(stat.mtimeMs)}-${stat.size}`;
}

/**
 * 校验保存请求携带的版本是否仍是最新。
 *
 * 不带 baseEtag 视为强制覆盖（调用方已明确选择）；带了但不匹配则拒绝，
 * 否则后保存者会静默抹掉前一个人的修改。
 */
export function assertNotStale(currentEtag: string, baseEtag?: string | null): void {
  if (!baseEtag) return;
  if (baseEtag === currentEtag) return;
  throw new HTTPException(409, {
    message: '该文件已被其他人修改，请重新加载后再保存',
  });
}

/**
 * 原子写入文本文件：先写同目录临时文件，再 rename 覆盖。
 *
 * 直接覆盖写在写入中途崩溃或磁盘写满时会留下被截断的文件——对正在被编辑的
 * 线上配置（nginx.conf、systemd unit）足以直接造成故障。rename 在同一文件系统内
 * 是原子的，因此临时文件必须与目标同目录。
 */
export async function atomicWriteFile(dest: string, content: string): Promise<void> {
  const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.tmp-${randomUUID().slice(0, 8)}`);
  // 保留原文件权限：临时文件按 umask 创建，直接 rename 会悄悄改变目标权限位
  let mode: number | undefined;
  try {
    mode = (await fs.stat(dest)).mode & 0o777;
  } catch { /* 新建文件，用默认权限 */ }

  try {
    await fs.writeFile(tmp, content, 'utf-8');
    if (mode !== undefined) await fs.chmod(tmp, mode);
    await fs.rename(tmp, dest);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}
