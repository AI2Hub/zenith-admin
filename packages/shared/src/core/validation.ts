import * as z from 'zod';
import { DATE_TIME_PATTERN } from './constants';
import { jsonByteLength, jsonDepth } from './json-shape';
import { isHttpUrl, isSafeLinkUrl } from './url';

// ─── URL 字段 ─────────────────────────────────────────────────────────────────
/**
 * 绝对 http(s) URL。`z.url()` 会放过 `javascript:` / `file:` / `data:`，
 * 所有会被渲染为链接、图片、iframe 或交给系统打开 / 服务端外呼的 URL 字段统一用这个。
 */
export function httpUrl(message = 'URL 格式不正确，仅支持 http(s) 地址') {
  return z.url({ protocol: /^https?$/, error: message });
}

/** 绝对 http(s) URL 或站内根相对路径（如托管文件内容地址）；用于 href / src 类字段 */
export function linkUrl(message = '地址仅支持 http(s) URL 或站内路径') {
  return z.string().refine(isSafeLinkUrl, message);
}

/** 允许为空字符串的 linkUrl（表单可清空的可选地址） */
export function optionalLinkUrl(message = '地址仅支持 http(s) URL 或站内路径') {
  return z.string().refine((value) => value === '' || isSafeLinkUrl(value), message);
}

/** 允许为空字符串的 httpUrl */
export function optionalHttpUrl(message = 'URL 格式不正确，仅支持 http(s) 地址') {
  return z.string().refine((value) => value === '' || isHttpUrl(value), message);
}

/** 缓存递归 schema 实例，让 OpenAPI 生成器识别自引用并输出 `$ref`，避免无限展开。 */
export function lazyRecursive<T extends z.ZodType>(build: () => T) {
  let cached: T | undefined;
  return z.lazy(() => (cached ??= build()));
}


/**
 * 剥离 `.default()` / `.prefault()` 后的字段类型。
 * 穿透 optional / nullable / readonly / pipe 包装并原样保留，只移除默认值层。
 */
type StripDefault<T> =
  T extends z.ZodDefault<infer Inner> ? StripDefault<Inner>
    : T extends z.ZodPrefault<infer Inner> ? StripDefault<Inner>
      : T extends z.ZodOptional<infer Inner> ? z.ZodOptional<StripDefault<Inner>>
        : T extends z.ZodNullable<infer Inner> ? z.ZodNullable<StripDefault<Inner>>
          : T extends z.ZodReadonly<infer Inner> ? z.ZodReadonly<StripDefault<Inner>>
            : T extends z.ZodPipe<infer In, infer Out> ? z.ZodPipe<StripDefault<In>, Out>
              : T;

/** 递归移除字段上任意层级的默认值包装，其余包装（optional / nullable / readonly / pipe）原样重建 */
function stripDefaults(field: z.ZodType): z.ZodType {
  // def 上的内层 schema 以 zod/core 的 $ZodType 声明，运行时即 classic ZodType 实例
  const inner = (schema: z.ZodType) => (schema.def as unknown as { innerType: z.ZodType }).innerType;
  if (field instanceof z.ZodDefault || field instanceof z.ZodPrefault) return stripDefaults(inner(field));
  if (field instanceof z.ZodOptional) return z.optional(stripDefaults(inner(field)));
  if (field instanceof z.ZodNullable) return z.nullable(stripDefaults(inner(field)));
  if (field instanceof z.ZodReadonly) return z.readonly(stripDefaults(inner(field)));
  if (field instanceof z.ZodPipe) {
    const { in: input, out } = field.def as unknown as { in: z.ZodType; out: z.ZodType };
    return z.pipe(stripDefaults(input), out);
  }
  return field;
}

/**
 * 递归移除对象、数组及包装层的 `.default()` / `.prefault()`，用于派生整体替换请求体，
 * 防止未提交字段被静默补值；其余包装与对象 / 数组校验保留，输入、输出类型一致。
 * `strictObjects` 使各层对象拒绝未知键。元数据保留但不复制 `id`，避免 Zod 注册冲突；
 * 调用方可为派生结果另设 `id`。契约约束见 `app.contract.test.ts`。
 */
export function stripDefaultsDeep<T extends z.ZodType>(
  schema: T,
  options: { strictObjects?: boolean } = {},
): z.ZodType<z.output<T>, z.output<T>> {
  const inner = (field: z.ZodType) => (field.def as unknown as { innerType: z.ZodType }).innerType;
  const checksOf = (field: z.ZodType) => ((field.def as { checks?: unknown[] }).checks ?? []) as never[];
  const withMeta = (field: z.ZodType, next: z.ZodType): z.ZodType => {
    const { id: _id, ...rest } = field.meta() ?? {};
    return Object.keys(rest).length > 0 ? next.meta(rest) : next;
  };
  const walk = (field: z.ZodType): z.ZodType => {
    if (field instanceof z.ZodDefault || field instanceof z.ZodPrefault) return withMeta(field, walk(inner(field)));
    if (field instanceof z.ZodOptional) return withMeta(field, z.optional(walk(inner(field))));
    if (field instanceof z.ZodNullable) return withMeta(field, z.nullable(walk(inner(field))));
    if (field instanceof z.ZodReadonly) return withMeta(field, z.readonly(walk(inner(field))));
    if (field instanceof z.ZodPipe) {
      const { in: input, out } = field.def as unknown as { in: z.ZodType; out: z.ZodType };
      return withMeta(field, z.pipe(walk(input), out));
    }
    if (field instanceof z.ZodArray) {
      const element = (field.def as unknown as { element: z.ZodType }).element;
      return withMeta(field, z.array(walk(element)).check(...checksOf(field)));
    }
    if (field instanceof z.ZodObject) {
      const shape = field.shape as Record<string, z.ZodType>;
      const next: Record<string, z.ZodType> = {};
      for (const key of Object.keys(shape)) next[key] = walk(shape[key]);
      const rebuilt = options.strictObjects ? z.strictObject(next) : z.object(next);
      return withMeta(field, rebuilt.check(...checksOf(field)));
    }
    return field;
  };
  return walk(schema) as z.ZodType<z.output<T>, z.output<T>>;
}

/**
 * 由 create schema 派生「部分更新」schema：先剥离全部 `.default()`，再 `.partial()`。
 *
 * 部分更新的契约是「未提交的字段保持不变」。Zod 的 `.partial()` 会保留 `.default()`
 * （`ZodOptional` 遇到能接受 undefined 的内层会直接委托），字段省略时仍会填入默认值，
 * 服务层 `.set({ ...data })` 随即把这些从未提交的字段写回库。因此所有 update schema
 * 一律经本函数派生，禁止直接调用 `.partial()`（ESLint 已封禁）。
 *
 * 默认值只属于创建语义；嵌套在 optional / nullable / pipe 内的默认值同样会被剥离。
 * 契约层校验见 `app.contract.test.ts`：PUT / PATCH 请求体属性不得携带 `default`。
 */
export function partialForUpdate<T extends z.ZodObject<z.ZodRawShape>>(
  schema: T,
): z.ZodObject<{ [K in keyof T['shape']]: z.ZodOptional<StripDefault<T['shape'][K]>> }> {
  const shape = schema.shape as Record<string, z.ZodType>;
  const stripped: Record<string, z.ZodType> = {};
  for (const key of Object.keys(shape)) {
    stripped[key] = stripDefaults(shape[key]);
  }
  // eslint-disable-next-line no-restricted-syntax -- 唯一合法的 .partial() 调用点：输入已剥离全部默认值
  return z.object(stripped).partial() as unknown as z.ZodObject<{
    [K in keyof T['shape']]: z.ZodOptional<StripDefault<T['shape'][K]>>
  }>;
}


export const dateTimeStringSchema = z.string().regex(DATE_TIME_PATTERN, '日期时间格式必须为 YYYY-MM-DD HH:mm:ss');


// ─── 埋点事件上报 ─────────────────────────────────────────────────────────────
export function boundedJsonRecord(label: string, maxKeys: number, maxBytes: number, maxDepth = 6) {
  return z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
    if (Object.keys(value).length > maxKeys) {
      ctx.addIssue({ code: 'custom', message: `${label}最多允许 ${maxKeys} 个字段` });
    }
    if (jsonDepth(value) > maxDepth) {
      ctx.addIssue({ code: 'custom', message: `${label}嵌套层级不能超过 ${maxDepth} 层` });
    }
    if (jsonByteLength(value) > maxBytes) {
      ctx.addIssue({ code: 'custom', message: `${label}序列化后不能超过 ${maxBytes} 字节` });
    }
  });
}


// ─── 告警规则 ─────────────────────────────────────────────────────────────────
export const webhookUrlSchema = httpUrl('Webhook URL 仅支持 HTTP/HTTPS').max(512);

interface AlertChannelsValue {
  enabled?: boolean;
  channels?: string[];
  webhookUrl?: string | null;
}

/**
 * 告警投递的渠道公共校验（启用时至少一个渠道；含 webhook 必须有 URL）。
 * 返回生效渠道列表；规则未启用时返回 null，调用方跳过收件人校验。
 */
function validateAlertChannels(value: AlertChannelsValue, ctx: z.RefinementCtx): string[] | null {
  if (value.enabled === false) return null;
  const channels = value.channels ?? [];
  if (channels.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['channels'], message: '启用告警时至少选择一个通知渠道' });
  }
  if (channels.includes('webhook') && !value.webhookUrl) {
    ctx.addIssue({ code: 'custom', path: ['webhookUrl'], message: 'Webhook 渠道必须配置有效 URL' });
  }
  return channels;
}

/** 告警投递校验：收件人为单一 `recipients` 列表（邮箱 / 用户标识混排，前端错误监控告警规则） */
export function validateAlertDelivery(
  value: AlertChannelsValue & { recipients?: string[] },
  ctx: z.RefinementCtx,
) {
  const channels = validateAlertChannels(value, ctx);
  if (!channels) return;
  if ((channels.includes('email') || channels.includes('inapp')) && !(value.recipients?.length)) {
    ctx.addIssue({ code: 'custom', path: ['recipients'], message: '邮件或站内通知渠道必须配置接收人' });
  }
}

/** 告警投递校验：收件人分为接收用户 `recipientUserIds` 与额外邮箱 `recipientEmails`（系统监控告警规则） */
export function validateTypedAlertDelivery(
  value: AlertChannelsValue & { recipientUserIds?: number[]; recipientEmails?: string[] },
  ctx: z.RefinementCtx,
) {
  const channels = validateAlertChannels(value, ctx);
  if (!channels) return;
  if (channels.includes('inapp') && !(value.recipientUserIds?.length)) {
    ctx.addIssue({ code: 'custom', path: ['recipientUserIds'], message: '站内信渠道必须选择接收用户' });
  }
  if (
    channels.includes('email')
    && !(value.recipientUserIds?.length)
    && !(value.recipientEmails?.length)
  ) {
    ctx.addIssue({ code: 'custom', path: ['recipientEmails'], message: '邮件渠道必须选择接收用户或填写额外邮箱' });
  }
}

/**
 * 自报浏览器 / OS 的长度上限：与登录日志 / 操作日志的 varchar(64) 列宽一致。
 * 契约层（reportedClientSchema）与服务端解析入口（resolveReportedClient）共用此值，
 * 防止「契约放宽、落库截断」两边各自漂移。
 */
export const REPORTED_CLIENT_LABEL_MAX_LENGTH = 64;

/**
 * 客户端自报的展示用浏览器 / OS（登录、模拟登录等入口复用）。
 * 仅用于日志与会话展示，不参与鉴权——客户端可伪造，审计口径（操作日志）
 * 仍以服务端 UA + Client Hints 解析为准。长度与落库截断（varchar 64）对齐。
 * 注意：这里只约束 JSON 请求体；同样来源不可信的 `X-Zenith-Os` 请求头无 schema，
 * 由服务端 resolveReportedClient 统一截断兜底。
 */
export const reportedClientSchema = z.object({
  browser: z.string().trim().max(REPORTED_CLIENT_LABEL_MAX_LENGTH).optional(),
  os: z.string().trim().max(REPORTED_CLIENT_LABEL_MAX_LENGTH).optional(),
});
