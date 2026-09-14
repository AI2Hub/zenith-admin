import * as z from 'zod';
import { defineSettingsModule } from '../module-def';

/**
 * 服务端异常采集（异常日志）：`lib/error-tracking` 的 `captureException()` 在进程内读取，
 * 控制落库开关、兜底采集、风暴闸值与请求快照脱敏。平台作用域——采集发生在请求链路之外（worker / 后台 flush）。
 */
export const errorTrackingSettingsSchema = z.object({
  enabled: z.boolean().default(true)
    .meta({ title: '采集服务端异常', description: '关闭后异常只写进程日志，不再进入异常日志 / 告警' }),
  captureLoggedErrors: z.boolean().default(true)
    .meta({ title: '采集 error / fatal 日志写入点', description: '携带 Error 对象的 logger.error / logger.fatal 调用也记为异常事件（覆盖「已捕获但只打日志」的失败）' }),
  perIssuePerMinute: z.int().min(1).max(10_000).default(60)
    .meta({ title: '单个 Issue 每分钟保存事件上限', description: '同一指纹超出部分只累加发生次数，不再保存事件详情' }),
  globalPerMinute: z.int().min(1).max(100_000).default(600)
    .meta({ title: '全部 Issue 每分钟保存事件上限', description: '错误风暴时的总闸；超出部分只累加发生次数' }),
  request: z.object({
    captureBody: z.boolean().default(true)
      .meta({ title: '记录请求体', description: '非 GET 请求的 JSON / 表单体，写入前按脱敏字段名打码并截断' }),
    bodyMaxBytes: z.int().min(0).max(65_536).default(4096)
      .meta({ title: '请求体截断长度（字节）' }),
    redactKeys: z.array(z.string().trim().min(1).max(64)).max(100).default(() => [])
      .meta({ title: '额外脱敏字段名', description: '在内置的 password / secret / authorization / cookie 等之外追加；按字段名包含匹配，不区分大小写' }),
  }).prefault({}).meta({ title: '请求快照' }),
  ignorePatterns: z.array(z.string().trim().min(1).max(200)).max(100).default(() => [])
    .meta({ title: '忽略规则（正则）', description: '异常消息命中任一正则即不记录（压制已知无价值的噪音）' }),
}).meta({ id: 'Settings.ErrorTracking' });

export type ErrorTrackingSettings = z.output<typeof errorTrackingSettingsSchema>;

export const errorTrackingSettingsModule = defineSettingsModule({
  schema: errorTrackingSettingsSchema,
  title: '异常日志',
  description: '服务端异常采集开关、风暴闸值与请求快照脱敏',
  scope: 'platform',
  readPermission: 'system:setting:view',
  writePermission: 'system:setting:update',
  sort: 55,
});
