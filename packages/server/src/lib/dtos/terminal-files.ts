import { z } from '@hono/zod-openapi';

/** 终端文件浏览器：单个目录项 */
export const TerminalFileEntryDTO = z
  .object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['dir', 'file']),
    size: z.number(),
    mtime: z.string(),
  })
  .openapi('TerminalFileEntry');

/** 终端文件浏览器：目录列表结果 */
export const TerminalDirListingDTO = z
  .object({
    path: z.string(),
    parent: z.string().nullable(),
    entries: z.array(TerminalFileEntryDTO),
  })
  .openapi('TerminalDirListing');

/** 终端：单个可用 shell */
export const TerminalShellInfoDTO = z
  .object({
    id: z.string(),
    label: z.string(),
    path: z.string(),
  })
  .openapi('TerminalShellInfo');

/** 终端：当前平台可用 shell 列表 */
export const TerminalShellsDTO = z
  .object({
    platform: z.string(),
    shells: z.array(TerminalShellInfoDTO),
    defaultShell: z.string(),
  })
  .openapi('TerminalShells');

/** 终端：文本文件内容 */
export const TerminalFileContentDTO = z
  .object({
    path: z.string(),
    content: z.string(),
    size: z.number(),
  })
  .openapi('TerminalFileContent');
