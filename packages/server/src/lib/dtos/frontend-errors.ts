/**
 * 前端错误监控 DTO（Issue 模型）
 */
import { z } from '@hono/zod-openapi';
import {
  ANALYTICS_BREADCRUMB_DATA_MAX_BYTES,
  ANALYTICS_CONTEXT_MAX_BYTES,
  SOURCE_MAP_MAX_BYTES,
} from '@zenith/shared';

const errorTypeEnum = z.enum([
  'js_error', 'promise_rejection', 'resource_error', 'console_error', 'http_error', 'white_screen', 'crash',
]);
const levelEnum = z.enum(['fatal', 'error', 'warning', 'info']);
const statusEnum = z.enum(['unresolved', 'resolved', 'ignored', 'muted']);
const conditionEnum = z.enum(['new_error', 'threshold', 'spike']);
const deviceTypeEnum = z.enum(['desktop', 'mobile', 'tablet', 'bot', 'unknown']);
const webhookUrlDTO = z.url().max(512).refine(
  (value) => ['http:', 'https:'].includes(new URL(value).protocol),
  'Webhook URL 仅支持 HTTP/HTTPS',
);

function jsonDepth(value: unknown): number {
  if (value === null || typeof value !== 'object') return 0;
  const stack: Array<{ value: object; depth: number }> = [{ value, depth: 1 }];
  const seen = new WeakSet<object>();
  let maxDepth = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current.value)) continue;
    seen.add(current.value);
    maxDepth = Math.max(maxDepth, current.depth);
    const children = Array.isArray(current.value) ? current.value : Object.values(current.value);
    for (const child of children) {
      if (child !== null && typeof child === 'object') stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  return maxDepth;
}

function boundedRecord(label: string, maxKeys: number, maxBytes: number, maxDepth: number) {
  return z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
    if (Object.keys(value).length > maxKeys) ctx.addIssue({ code: 'custom', message: `${label}最多允许 ${maxKeys} 个字段` });
    if (jsonDepth(value) > maxDepth) ctx.addIssue({ code: 'custom', message: `${label}嵌套层级不能超过 ${maxDepth} 层` });
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxBytes) {
      ctx.addIssue({ code: 'custom', message: `${label}序列化后不能超过 ${maxBytes} 字节` });
    }
  });
}

// ─── 上报 ─────────────────────────────────────────────────────────────────────
export const ErrorBreadcrumbDTO = z
  .object({
    type: z.enum(['navigation', 'click', 'http', 'console', 'custom']),
    message: z.string().max(512),
    level: levelEnum.optional(),
    data: boundedRecord('面包屑数据', 20, ANALYTICS_BREADCRUMB_DATA_MAX_BYTES, 4).optional(),
    timestamp: z.string().max(32),
  })
  .openapi('ErrorBreadcrumb');

export const ErrorReportInputDTO = z
  .object({
    errorType: errorTypeEnum,
    level: levelEnum.optional(),
    message: z.string().min(1).max(2000),
    stack: z.string().max(16_000).optional(),
    sourceUrl: z.string().max(512).optional(),
    lineNo: z.number().int().optional(),
    colNo: z.number().int().optional(),
    pageUrl: z.string().max(512).optional(),
    release: z.string().max(64).optional(),
    sessionId: z.string().min(1).max(36).optional(),
    breadcrumbs: z.array(ErrorBreadcrumbDTO).max(50).optional(),
    context: boundedRecord('错误上下文', 50, ANALYTICS_CONTEXT_MAX_BYTES, 6).optional(),
    httpStatus: z.number().int().optional(),
    httpMethod: z.string().max(16).optional(),
    httpUrl: z.string().max(512).optional(),
  })
  .openapi('ErrorReportInput');

// ─── 分组（Issue）────────────────────────────────────────────────────────────
export const ErrorGroupDTO = z
  .object({
    id: z.number().int(),
    fingerprint: z.string(),
    errorType: errorTypeEnum,
    level: levelEnum,
    message: z.string(),
    status: statusEnum,
    assigneeId: z.number().int().nullable(),
    assigneeName: z.string().nullable(),
    release: z.string().nullable(),
    note: z.string().nullable(),
    count: z.number().int(),
    affectedUsers: z.number().int(),
    firstSeenAt: z.string(),
    lastSeenAt: z.string(),
    resolvedAt: z.string().nullable(),
    trend: z.array(z.number().int()).optional(),
  })
  .openapi('ErrorGroup');

// ─── 单次事件 ─────────────────────────────────────────────────────────────────
export const ErrorEventDTO = z
  .object({
    id: z.number().int(),
    groupId: z.number().int(),
    fingerprint: z.string(),
    errorType: errorTypeEnum,
    level: levelEnum,
    message: z.string(),
    stack: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    lineNo: z.number().int().nullable(),
    colNo: z.number().int().nullable(),
    pageUrl: z.string().nullable(),
    release: z.string().nullable(),
    userAgent: z.string().nullable(),
    browser: z.string().nullable(),
    browserVersion: z.string().nullable(),
    os: z.string().nullable(),
    deviceType: deviceTypeEnum.nullable(),
    userId: z.number().int().nullable(),
    username: z.string().nullable(),
    sessionId: z.string().nullable(),
    breadcrumbs: z.array(z.record(z.string(), z.unknown())).nullable(),
    context: z.record(z.string(), z.unknown()).nullable(),
    httpStatus: z.number().int().nullable(),
    httpMethod: z.string().nullable(),
    httpUrl: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('ErrorEvent');

export const ErrorGroupDetailDTO = z
  .object({
    group: ErrorGroupDTO,
    symbolicatedStack: z.string().nullable(),
    trend: z.array(z.object({ date: z.string(), count: z.number().int() })),
    browsers: z.array(z.object({ name: z.string(), value: z.number().int() })),
    os: z.array(z.object({ name: z.string(), value: z.number().int() })),
    recentEvents: z.array(ErrorEventDTO),
  })
  .openapi('ErrorGroupDetail');

// ─── 概览 ─────────────────────────────────────────────────────────────────────
export const ErrorOverviewDTO = z
  .object({
    totalGroups: z.number().int(),
    unresolved: z.number().int(),
    totalOccurrences: z.number().int(),
    affectedUsers: z.number().int(),
    newToday: z.number().int(),
    byType: z.array(z.object({ errorType: errorTypeEnum, groups: z.number().int(), occurrences: z.number().int() })),
    byLevel: z.array(z.object({ level: levelEnum, groups: z.number().int(), occurrences: z.number().int() })),
    trend: z.array(z.object({ date: z.string(), occurrences: z.number().int(), groups: z.number().int() })),
    topIssues: z.array(ErrorGroupDTO),
  })
  .openapi('ErrorOverview');

// ─── 处理（更新 Issue）────────────────────────────────────────────────────────
export const UpdateErrorGroupDTO = z
  .object({
    status: statusEnum.optional(),
    level: levelEnum.optional(),
    assigneeId: z.number().int().positive().nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .openapi('UpdateErrorGroup');

// ─── 告警规则 ─────────────────────────────────────────────────────────────────
export const ErrorAlertRuleDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    errorType: errorTypeEnum.nullable(),
    level: levelEnum.nullable(),
    condition: conditionEnum,
    thresholdCount: z.number().int(),
    windowMinutes: z.number().int(),
    channels: z.array(z.string()),
    webhookUrl: z.string().nullable(),
    recipients: z.array(z.string()),
    enabled: z.boolean(),
    lastTriggeredAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ErrorAlertRule');

const errorAlertRuleInputDTO = z.object({
    name: z.string().min(1).max(128),
    errorType: errorTypeEnum.nullable().optional(),
    level: levelEnum.nullable().optional(),
    condition: conditionEnum.default('threshold'),
    thresholdCount: z.number().int().min(1).max(100_000).default(10),
    windowMinutes: z.number().int().min(1).max(10_080).default(60),
    channels: z.array(z.enum(['email', 'webhook', 'inapp'])).default([]),
    webhookUrl: webhookUrlDTO.nullable().optional(),
    recipients: z.array(z.string().max(128)).default([]),
    enabled: z.boolean().default(true),
  });

function validateAlertDelivery(
  value: { enabled?: boolean; channels?: string[]; webhookUrl?: string | null; recipients?: string[] },
  ctx: { addIssue: (issue: { code: 'custom'; path?: PropertyKey[]; message: string }) => void },
) {
  if (value.enabled === false) return;
  const channels = value.channels ?? [];
  if (channels.length === 0) ctx.addIssue({ code: 'custom', path: ['channels'], message: '启用告警时至少选择一个通知渠道' });
  if (channels.includes('webhook') && !value.webhookUrl) ctx.addIssue({ code: 'custom', path: ['webhookUrl'], message: 'Webhook 渠道必须配置有效 URL' });
  if ((channels.includes('email') || channels.includes('inapp')) && !(value.recipients?.length)) {
    ctx.addIssue({ code: 'custom', path: ['recipients'], message: '邮件或站内通知渠道必须配置接收人' });
  }
}

export const CreateErrorAlertRuleDTO = errorAlertRuleInputDTO
  .superRefine(validateAlertDelivery)
  .openapi('CreateErrorAlertRule');
export const UpdateErrorAlertRuleDTO = errorAlertRuleInputDTO.partial().openapi('UpdateErrorAlertRule');

export const ErrorAlertLogDTO = z
  .object({
    id: z.number().int(),
    ruleId: z.number().int().nullable(),
    ruleName: z.string(),
    condition: conditionEnum,
    detail: z.string(),
    channels: z.array(z.string()),
    source: z.string(),
    createdAt: z.string(),
  })
  .openapi('ErrorAlertLog');

// ─── Source Map ──────────────────────────────────────────────────────────────
export const SourceMapItemDTO = z
  .object({
    id: z.number().int(),
    release: z.string(),
    fileName: z.string(),
    size: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('SourceMapItem');

export const SourceMapUploadDTO = z
  .object({
    release: z.string().min(1).max(64),
    fileName: z.string().min(1).max(256),
    content: z.string().min(1).max(SOURCE_MAP_MAX_BYTES)
      .refine((value) => new TextEncoder().encode(value).byteLength <= SOURCE_MAP_MAX_BYTES, 'Source Map 超出 20MB 大小限制'),
  })
  .openapi('SourceMapUpload');
