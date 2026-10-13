import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { managedFileDeepLink } from './managed-file-deep-link';

/**
 * 站内信的 link 契约是「深链地址（站内路由，点击消息跳转）」，消费方直接 `navigate(link)`。
 * 把 `/api/files/:id/content` 当 link 发会被当成前端路由落到 404，新窗口打开又带不上
 * bearer 令牌只会 401 —— 日志打包与网盘打包先后都踩了这一处。
 */
describe('managedFileDeepLink', () => {
  it('指向托管文件库并按文件名过滤，文件名做 URL 编码', () => {
    expect(managedFileDeepLink('logs_1791904682788.zip')).toBe('/system/files?keyword=logs_1791904682788.zip');
    expect(managedFileDeepLink('日志 归档.zip')).toBe(`/system/files?keyword=${encodeURIComponent('日志 归档.zip')}`);
  });

  /**
   * 两处产物通知都发站内路由。任务跑在 worker 进程里、依赖 db 与远端存储，跑不起单测，
   * 这里按代码库既有的源码断言守形态（同 cms-resource-governance.test.ts）：谁把通知改回
   * 直发 downloadUrl（API 路径），这一条就红。
   */
  it.each([
    ['../services/drive/drive-tasks.service.ts', 'managedFileDeepLink(zipName)'],
    ['../services/ops/log-files-download.service.ts', 'managedFileDeepLink(zipName)'],
  ])('%s 的打包完成通知发站内路由', async (relativePath, snippet) => {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    expect(source).toContain(snippet);
  });
});
