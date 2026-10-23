import * as z from 'zod';
import { defineContract, op, queryEnum } from '../../core';
import { CONSOLE_LOG_ROLES, CONSOLE_LOG_ROLE_OPTIONS } from '../constants';
import { logFileContentQuery } from './log-files';
import { logLinesSchema } from './log-lines';

export const consoleLogSourceSchema = z.object({
  role: z.enum(CONSOLE_LOG_ROLES),
  label: z.string(),
  available: z.boolean(),
}).meta({ id: 'ConsoleLogSource' });

export const consoleLogSourcesSchema = z.object({
  currentRole: z.enum(CONSOLE_LOG_ROLES),
  hostname: z.string(),
  pid: z.number().int(),
  sources: z.array(consoleLogSourceSchema),
}).meta({ id: 'ConsoleLogSources' });

export type ConsoleLogSource = z.infer<typeof consoleLogSourceSchema>;

export const consoleLogSourceQuery = z.object({
  role: queryEnum(CONSOLE_LOG_ROLES, { description: '后端进程角色，省略时使用当前进程角色', options: CONSOLE_LOG_ROLE_OPTIONS }),
});

export const consoleLogContract = defineContract('/api/console-logs', {
  sources: op.get('/', { access: { permission: 'system:log:console', platformOnly: 'multi-tenant' }, response: consoleLogSourcesSchema, summary: '后端应用日志来源' }),
  content: op.get('/content', { access: { permission: 'system:log:console', platformOnly: 'multi-tenant' }, query: logFileContentQuery.extend(consoleLogSourceQuery.shape), response: logLinesSchema, summary: '读取后端应用近期日志或链路定位窗口' }),
  tail: op.get('/tail', {
    access: { permission: 'system:log:console', platformOnly: 'multi-tenant' }, query: consoleLogSourceQuery,
    headers: z.object({ 'last-event-id': z.string().max(2048).optional() }),
    kind: 'sse', response: z.string(), summary: '持续追踪后端应用日志，自动跟随轮转，支持 Last-Event-ID 续传',
  }),
}, { auditModule: '控制台日志', tags: ['ConsoleLogs'] });
