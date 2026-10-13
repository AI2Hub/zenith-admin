import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zenith-logfiles-'));
const logDir = path.join(tmpRoot, 'logs');

vi.mock('../../config', () => ({
  config: { log: { dir: logDir } },
}));

const {
  batchDeleteLogFiles, getLogFilesBeforeAudit, safeFilename,
} = await import('./log-files.service');

const write = (name: string, body = 'x') => fs.writeFileSync(path.join(logDir, name), body);

beforeAll(() => { fs.mkdirSync(logDir, { recursive: true }); });
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

describe('safeFilename', () => {
  it('拒绝路径穿越与隐藏文件名，放行普通日志文件名', () => {
    expect(safeFilename('app.2026-10-13.1.log')).toBe('app.2026-10-13.1.log');
    expect(safeFilename('../secret')).toBeNull();
    expect(safeFilename('a/b.log')).toBeNull();
    expect(safeFilename('a\\b.log')).toBeNull();
    expect(safeFilename('.hidden.log')).toBeNull();
    expect(safeFilename('')).toBeNull();
  });
});

describe('batchDeleteLogFiles', () => {
  it('删除存在的文件并返回实际个数，重复文件名只删一次', async () => {
    write('a.log');
    write('b.log');
    await expect(batchDeleteLogFiles(['a.log', 'b.log', 'a.log'])).resolves.toBe(2);
    expect(fs.existsSync(path.join(logDir, 'a.log'))).toBe(false);
    expect(fs.existsSync(path.join(logDir, 'b.log'))).toBe(false);
  });

  it('文件已被轮转 / 外部清理时跳过而不是整体失败', async () => {
    write('keep.log');
    await expect(batchDeleteLogFiles(['gone.log', 'keep.log'])).resolves.toBe(1);
    expect(fs.existsSync(path.join(logDir, 'keep.log'))).toBe(false);
  });

  it('任一文件名非法即整体拒绝（校验先于删除，不留半删状态）', async () => {
    write('safe.log');
    await expect(batchDeleteLogFiles(['safe.log', '../escape.log'])).rejects.toMatchObject({ status: 400 });
    expect(fs.existsSync(path.join(logDir, 'safe.log'))).toBe(true);
  });
});

describe('getLogFilesBeforeAudit', () => {
  it('只快照仍存在的文件，并去重', async () => {
    write('audit.log', 'hello');
    const rows = await getLogFilesBeforeAudit(['audit.log', 'audit-gone.log', 'audit.log', '../escape.log']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'audit.log', size: 5, isGzip: false });
  });

  it('.gz 文件标记 isGzip', async () => {
    write('app.1.log.gz');
    const rows = await getLogFilesBeforeAudit(['app.1.log.gz']);
    expect(rows[0]?.isGzip).toBe(true);
  });
});