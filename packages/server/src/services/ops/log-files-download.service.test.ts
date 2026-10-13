import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zenith-logzip-'));
const logDir = path.join(tmpRoot, 'logs');

// level 必须给：链路里会经 lib/logger 建 pino，缺 level 会直接抛
vi.mock('../../config', () => ({
  config: { log: { dir: logDir, level: 'silent' } },
}));

// lib/context 会在模块顶层拉起 db 客户端；创建者身份只用于任务分支，这里换成探针避免连库
vi.mock('../../lib/context', () => ({
  currentUser: () => ({ userId: 1, tenantId: null, username: 'tester' }),
}));

// 任务中心 / 托管文件 / 通知不在这条链路的被测范围内：各用一个探针替身
const submitAsyncTask = vi.fn(async () => ({ id: 7 }));
vi.mock('../../lib/task-center', () => ({
  registerTaskHandler: vi.fn(),
  submitAsyncTask: (input: unknown) => submitAsyncTask(input),
  TaskCancelledError: class TaskCancelledError extends Error {},
}));
vi.mock('../files/files.service', () => ({ saveGeneratedManagedFile: vi.fn() }));
vi.mock('../messaging/notification-outbox.service', () => ({ notify: vi.fn() }));

const { batchDownloadLogFiles, collectLogZipEntries } = await import('./log-files-download.service');
const { LOG_SYNC_ZIP_MAX_FILES } = await import('@zenith/shared/ops');

const write = (name: string, body = 'payload') => fs.writeFileSync(path.join(logDir, name), body);

/** 读出流里的全部字节 */
const readAll = async (stream: ReadableStream) => Buffer.from(await new Response(stream).arrayBuffer());

/** zip 结构断言：本地文件头（PK\x03\x04）出现的次数即条目数 */
const countLocalHeaders = (buf: Buffer) => {
  let count = 0;
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) count += 1;
  }
  return count;
};

beforeAll(() => { fs.mkdirSync(logDir, { recursive: true }); });
afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
beforeEach(() => submitAsyncTask.mockClear());

describe('collectLogZipEntries', () => {
  it('校验文件名、去重，并跳过已轮转 / 外部清理掉的文件', async () => {
    write('zip-a.log', '12345');
    const { entries, totalBytes } = await collectLogZipEntries(['zip-a.log', 'zip-a.log', 'gone.log']);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'zip-a.log', size: 5 });
    expect(totalBytes).toBe(5);
  });

  it('路径穿越文件名整体拒绝（与批量删除同一套防护）', async () => {
    await expect(collectLogZipEntries(['../escape.log'])).rejects.toMatchObject({ status: 400 });
  });
});

describe('batchDownloadLogFiles', () => {
  it('低于阈值时返回 zip 流：包含全部条目与附件文件名', async () => {
    write('one.log', 'hello-one');
    write('two.log.gz', 'hello-two');

    const result = await batchDownloadLogFiles(['one.log', 'two.log.gz']);

    expect(result.mode).toBe('sync');
    if (result.mode !== 'sync') throw new Error('unreachable');
    const buf = await readAll(result.stream);
    // 本地文件头 PK\x03\x04 出现两次 = 两个条目；条目名以明文存在头里（内容才是压缩的）
    expect(countLocalHeaders(buf)).toBe(2);
    const names = buf.toString('latin1');
    expect(names).toContain('one.log');
    expect(names).toContain('two.log.gz');
    expect(result.filename).toMatch(/^logs_\d+\.zip$/);
    expect(submitAsyncTask).not.toHaveBeenCalled();
  });

  it('单个文件直接用该文件名命名 zip', async () => {
    write('solo.log');
    const result = await batchDownloadLogFiles(['solo.log']);

    expect(result.mode).toBe('sync');
    if (result.mode !== 'sync') throw new Error('unreachable');
    expect(result.filename).toBe('solo.log.zip');
    await readAll(result.stream);
  });

  it('超过同步阈值时转任务中心，并带上实际存在的文件名', async () => {
    const names = Array.from({ length: LOG_SYNC_ZIP_MAX_FILES + 1 }, (_, i) => `bulk-${i}.log`);
    for (const name of names) write(name, '');

    const result = await batchDownloadLogFiles([...names, 'bulk-gone.log']);

    expect(result).toEqual({ mode: 'task', result: { mode: 'task', taskId: 7 } });
    expect(submitAsyncTask).toHaveBeenCalledTimes(1);
    expect(submitAsyncTask).toHaveBeenCalledWith(expect.objectContaining({
      taskType: 'log-files-batch-download',
      payload: { filenames: names },
    }));
  });

  it('所选文件全部不存在时 404，且不提交任务', async () => {
    await expect(batchDownloadLogFiles(['nope-1.log', 'nope-2.log'])).rejects.toMatchObject({ status: 404 });
    expect(submitAsyncTask).not.toHaveBeenCalled();
  });
});
