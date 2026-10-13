import { PassThrough, Readable } from 'node:stream';

/**
 * ZIP 打包的共享内核：只负责「把若干条目流式写进一个 zip」，不关心条目从哪来
 * （远端存储 / 本地磁盘 / 生成物），因此文件管理、企业网盘、日志文件共用一份实现。
 *
 * 调用方各自负责：条目的选取与命名去重、权限校验、阈值判断（同步流式 vs 任务中心）。
 */

/** zip 条目：写入 zip 的名称 + 打开字节流的回调 */
export interface ZipEntrySource {
  /** zip 内的相对路径（可含子目录） */
  name: string;
  /**
   * 打开该条目的字节流。返回 `null` 表示该条目没有可写内容；
   * 读取失败直接抛错，是否跳过由 `skipEntryErrors` 决定。
   */
  open: () => Promise<Readable | null>;
}

export interface BuildZipStreamOptions {
  /** 每写完一个条目回调一次（1-based 已写入数）；回调抛错即中断打包（用于透出取消） */
  onEntry?: (written: number) => Promise<void>;
  /** 单个条目读取失败时跳过并继续，而不是中断整体打包（默认 false：失败即中断） */
  skipEntryErrors?: boolean;
  /** deflate 级别，默认 5（体积与 CPU 的折中） */
  zlibLevel?: number;
}

/**
 * 依次把条目流式写入 ZIP，返回 Node 可读流（调用方按需 `Readable.toWeb`）。
 *
 * 逐条 append 并等上一条处理完再打开下一个源：同一时刻只持有一个源流，
 * 既不把整文件读进内存，也不并发打开全部连接（远端存储场景尤其重要）。
 */
export async function buildZipStream(
  entries: readonly ZipEntrySource[],
  options: BuildZipStreamOptions = {},
): Promise<Readable> {
  const { onEntry, skipEntryErrors = false, zlibLevel = 5 } = options;
  const { ZipArchive } = await import('archiver');
  const archive = new ZipArchive({ zlib: { level: zlibLevel } });
  const passThrough = new PassThrough();
  archive.on('error', (err: Error) => passThrough.destroy(err));
  archive.pipe(passThrough);

  /** 等待 archive 处理完当前条目（'entry' 事件）或报错 */
  const waitForEntry = () => new Promise<void>((resolve, reject) => {
    const cleanup = () => { archive.off('entry', onEntryDone); archive.off('error', onEntryFail); };
    const onEntryDone = () => { cleanup(); resolve(); };
    const onEntryFail = (err: Error) => { cleanup(); reject(err); };
    archive.once('entry', onEntryDone);
    archive.once('error', onEntryFail);
  });

  void (async () => {
    let written = 0;
    for (const entry of entries) {
      let appended = false;
      try {
        const source = await entry.open();
        if (source) {
          archive.append(source, { name: entry.name });
          await waitForEntry();
          appended = true;
        }
      } catch (err) {
        // 跳过单个坏条目，整体打包继续；不跳过时由下方统一抛给 passThrough
        if (!skipEntryErrors) throw err;
      }
      if (!appended) {
        if (!skipEntryErrors) throw new Error(`Archive source is missing: ${entry.name}`);
        continue;
      }
      written += 1;
      // onEntry 在 try 之外：取消（TaskCancelledError）等信号必须能中断打包
      if (onEntry) await onEntry(written);
    }
    await archive.finalize();
  })().catch((err) => passThrough.destroy(err instanceof Error ? err : new Error(String(err))));

  return passThrough;
}

/** web 流 → Node 可读流（`readStoredFile` 等返回的是 ReadableStream） */
export function toNodeReadable(stream: ReadableStream): Readable {
  return Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]);
}
