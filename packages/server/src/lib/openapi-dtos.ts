/**
 * 统一的 OpenAPI 实体 DTO 定义，供所有路由模块复用。
 * 每个 DTO 通过 `.openapi('Name')` 注册为 OpenAPI 组件，生成的
 * spec 中会以 `#/components/schemas/Name` 引用，既减少重复也
 * 让 Swagger UI / Apifox 能正确展示字段。
 *
 * 字段以 `@zenith/shared/types.ts` 为准；如有调整，请同步此处。
 */
import { z } from '@hono/zod-openapi';

// ─── 用户 / 角色 / 菜单 / 组织 ────────────────────────────────────────────
export const RoleDTO = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    name: z.string().openapi({ example: '超级管理员' }),
    code: z.string().openapi({ example: 'super_admin' }),
    description: z.string().nullable().optional(),
    dataScope: z.enum(['all', 'dept', 'self']).optional().openapi({ example: 'all' }),
    tenantId: z.number().int().nullable().optional(),
    status: z.enum(['active', 'disabled']).openapi({ example: 'active' }),
    createdAt: z.string().openapi({ example: '2026-01-01T00:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-01-01T00:00:00.000Z' }),
    menuIds: z.array(z.number().int()).optional(),
  })
  .openapi('Role');

export const PositionDTO = z
  .object({
    id: z.number().int(),
    name: z.string().openapi({ example: '前端工程师' }),
    code: z.string().openapi({ example: 'frontend_dev' }),
    sort: z.number().int().openapi({ example: 1 }),
    status: z.enum(['active', 'disabled']),
    remark: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Position');

export const UserDTO = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    username: z.string().openapi({ example: 'admin' }),
    nickname: z.string().openapi({ example: '系统管理员' }),
    email: z.string().openapi({ example: 'admin@example.com' }),
    phone: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    departmentId: z.number().int().nullable().optional(),
    departmentName: z.string().nullable().optional(),
    tenantId: z.number().int().nullable().optional(),
    tenantName: z.string().nullable().optional(),
    positionIds: z.array(z.number().int()).optional(),
    positions: z.array(PositionDTO).optional(),
    roles: z.array(RoleDTO).optional(),
    status: z.enum(['active', 'disabled']).openapi({ example: 'active' }),
    passwordUpdatedAt: z.string().optional(),
    requirePasswordChange: z.boolean().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('User');

export const MenuDTO: z.ZodType = z
  .object({
    id: z.number().int(),
    parentId: z.number().int().openapi({ example: 0 }),
    title: z.string().openapi({ example: '系统管理' }),
    name: z.string().optional(),
    path: z.string().optional(),
    component: z.string().optional(),
    icon: z.string().optional(),
    type: z.enum(['directory', 'menu', 'button']).openapi({ example: 'menu' }),
    permission: z.string().optional(),
    sort: z.number().int().openapi({ example: 1 }),
    status: z.enum(['active', 'disabled']),
    visible: z.boolean().openapi({ example: true }),
    createdAt: z.string(),
    updatedAt: z.string(),
    get children() {
      return z.array(MenuDTO).optional();
    },
  })
  .openapi('Menu');

export const DepartmentDTO: z.ZodType = z
  .object({
    id: z.number().int(),
    parentId: z.number().int().openapi({ example: 0 }),
    name: z.string().openapi({ example: '技术部' }),
    code: z.string(),
    leader: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    sort: z.number().int(),
    status: z.enum(['active', 'disabled']),
    createdAt: z.string(),
    updatedAt: z.string(),
    get children() {
      return z.array(DepartmentDTO).optional();
    },
  })
  .openapi('Department');

// ─── 租户 ─────────────────────────────────────────────────────────────────
export const TenantDTO = z
  .object({
    id: z.number().int(),
    name: z.string().openapi({ example: '示例租户' }),
    code: z.string().openapi({ example: 'demo' }),
    logo: z.string().nullable().optional(),
    contactName: z.string().nullable().optional(),
    contactPhone: z.string().nullable().optional(),
    status: z.enum(['active', 'disabled']),
    expireAt: z.string().nullable().optional(),
    maxUsers: z.number().int().nullable().optional(),
    remark: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .openapi('Tenant');

// ─── 字典 ─────────────────────────────────────────────────────────────────
export const DictDTO = z
  .object({
    id: z.number().int(),
    name: z.string().openapi({ example: '用户状态' }),
    code: z.string().openapi({ example: 'user_status' }),
    description: z.string().nullable().optional(),
    status: z.enum(['active', 'disabled']),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Dict');

export const DictItemDTO = z
  .object({
    id: z.number().int(),
    dictId: z.number().int(),
    label: z.string().openapi({ example: '启用' }),
    value: z.string().openapi({ example: 'active' }),
    color: z.string().nullable().optional(),
    sort: z.number().int(),
    status: z.enum(['active', 'disabled']),
    remark: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('DictItem');

// ─── 文件管理 ─────────────────────────────────────────────────────────────
export const FileStorageConfigDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    provider: z.enum(['local', 'oss', 's3', 'cos']),
    status: z.enum(['active', 'disabled']),
    isDefault: z.boolean(),
    basePath: z.string().nullable().optional(),
    localRootPath: z.string().nullable().optional(),
    ossRegion: z.string().nullable().optional(),
    ossEndpoint: z.string().nullable().optional(),
    ossBucket: z.string().nullable().optional(),
    ossAccessKeyId: z.string().nullable().optional(),
    ossAccessKeySecret: z.string().nullable().optional(),
    s3Region: z.string().nullable().optional(),
    s3Endpoint: z.string().nullable().optional(),
    s3Bucket: z.string().nullable().optional(),
    s3AccessKeyId: z.string().nullable().optional(),
    s3SecretAccessKey: z.string().nullable().optional(),
    s3ForcePathStyle: z.boolean().nullable().optional(),
    cosRegion: z.string().nullable().optional(),
    cosBucket: z.string().nullable().optional(),
    cosSecretId: z.string().nullable().optional(),
    cosSecretKey: z.string().nullable().optional(),
    remark: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('FileStorageConfig');

export const ManagedFileDTO = z
  .object({
    id: z.number().int(),
    storageConfigId: z.number().int(),
    storageName: z.string(),
    provider: z.enum(['local', 'oss', 's3', 'cos']),
    originalName: z.string().openapi({ example: 'avatar.png' }),
    objectKey: z.string(),
    size: z.number().int().openapi({ example: 10240 }),
    mimeType: z.string().nullable().optional(),
    extension: z.string().nullable().optional(),
    url: z.string().openapi({ example: 'https://example.com/files/avatar.png' }),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('ManagedFile');

// ─── 日志 ─────────────────────────────────────────────────────────────────
export const LoginLogDTO = z
  .object({
    id: z.number().int(),
    userId: z.number().int().nullable(),
    username: z.string(),
    ip: z.string().nullable(),
    browser: z.string().nullable(),
    os: z.string().nullable(),
    status: z.enum(['success', 'fail']),
    message: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('LoginLog');

export const OperationLogDTO = z
  .object({
    id: z.number().int(),
    userId: z.number().int().nullable(),
    username: z.string().nullable(),
    module: z.string().nullable(),
    description: z.string(),
    method: z.string(),
    path: z.string(),
    requestBody: z.string().nullable(),
    beforeData: z.string().nullable(),
    afterData: z.string().nullable(),
    responseCode: z.number().int().nullable(),
    durationMs: z.number().int().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    os: z.string().nullable(),
    browser: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('OperationLog');

// ─── 通知公告 ─────────────────────────────────────────────────────────────
export const NoticeDTO = z
  .object({
    id: z.number().int(),
    title: z.string().openapi({ example: '系统维护通知' }),
    content: z.string(),
    type: z.string().openapi({ example: 'notice' }),
    publishStatus: z.string().openapi({ example: 'published' }),
    priority: z.string().openapi({ example: 'medium' }),
    targetType: z.enum(['all', 'specific']),
    publishTime: z.string().nullable(),
    createById: z.number().int().nullable(),
    createByName: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    readCount: z.number().int().optional(),
  })
  .openapi('Notice');

// ─── 系统配置 ─────────────────────────────────────────────────────────────
export const SystemConfigDTO = z
  .object({
    id: z.number().int(),
    configKey: z.string().openapi({ example: 'site_title' }),
    configValue: z.string().openapi({ example: 'Zenith Admin' }),
    configType: z.enum(['string', 'number', 'boolean', 'json']),
    description: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('SystemConfig');

// ─── 定时任务 ─────────────────────────────────────────────────────────────
export const CronJobDTO = z
  .object({
    id: z.number().int(),
    name: z.string().openapi({ example: '数据库备份' }),
    cronExpression: z.string().openapi({ example: '0 0 2 * * *' }),
    handler: z.string().openapi({ example: 'backupDatabase' }),
    params: z.string().nullable(),
    status: z.enum(['active', 'disabled']),
    description: z.string(),
    retryCount: z.number().int(),
    retryInterval: z.number().int(),
    monitorTimeout: z.number().int().nullable(),
    lastRunAt: z.string().nullable(),
    nextRunAt: z.string().nullable(),
    lastRunStatus: z.enum(['success', 'fail', 'running']).nullable(),
    lastRunMessage: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('CronJob');

export const CronJobLogDTO = z
  .object({
    id: z.number().int(),
    jobId: z.number().int(),
    jobName: z.string(),
    executionCount: z.number().int(),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    durationMs: z.number().int().nullable(),
    status: z.enum(['success', 'fail', 'running']),
    output: z.string().nullable(),
  })
  .openapi('CronJobLog');

// ─── 地区 ─────────────────────────────────────────────────────────────────
export const RegionDTO: z.ZodType = z
  .object({
    id: z.number().int(),
    code: z.string().openapi({ example: '110000' }),
    name: z.string().openapi({ example: '北京市' }),
    level: z.enum(['province', 'city', 'county']),
    parentCode: z.string().nullable(),
    sort: z.number().int(),
    status: z.enum(['active', 'disabled']),
    createdAt: z.string(),
    updatedAt: z.string(),
    get children() {
      return z.array(RegionDTO).optional();
    },
  })
  .openapi('Region');

// ─── 会话 ─────────────────────────────────────────────────────────────────
export const SessionDTO = z
  .object({
    tokenId: z.string().openapi({ example: 'abcdef123456' }),
    ip: z.string().openapi({ example: '127.0.0.1' }),
    browser: z.string().openapi({ example: 'Chrome 120.0' }),
    os: z.string().openapi({ example: 'macOS 14.0' }),
    loginAt: z.string(),
    lastActiveAt: z.string(),
    isCurrent: z.boolean(),
  })
  .openapi('UserSession');

// ─── Auth 相关 ────────────────────────────────────────────────────────────
export const CaptchaDTO = z
  .object({
    enabled: z.boolean().openapi({ example: true }),
    captchaId: z.string().openapi({ example: 'uuid-xxx' }),
    svg: z.string().openapi({ example: '<svg>...</svg>' }),
  })
  .openapi('Captcha');

export const LoginResultDTO = z
  .object({
    user: UserDTO,
    token: z.object({
      accessToken: z.string().openapi({ example: 'eyJhbGciOi...' }),
      refreshToken: z.string().openapi({ example: 'eyJhbGciOi...' }),
    }),
    requirePasswordChange: z.boolean().optional(),
  })
  .openapi('LoginResult');

export const RefreshTokenResultDTO = z
  .object({
    accessToken: z.string(),
  })
  .openapi('RefreshTokenResult');

export const UserProfileDTO = UserDTO.extend({
  permissions: z.array(z.string()).optional(),
}).openapi('UserProfile');

export const TenantItemDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    code: z.string(),
  })
  .openapi('TenantItem');

export const SwitchTenantResultDTO = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    viewingTenantId: z.number().int().nullable().optional(),
    tenantId: z.number().int().nullable().optional(),
  })
  .openapi('SwitchTenantResult');

// ─── 导入结果 ─────────────────────────────────────────────────────────────
export const ImportResultDTO = z
  .object({
    total: z.number().int().openapi({ example: 100 }),
    success: z.number().int().openapi({ example: 95 }),
    failed: z.number().int().openapi({ example: 5 }),
    errors: z
      .array(
        z.object({
          row: z.number().int(),
          message: z.string(),
        }),
      )
      .optional(),
  })
  .openapi('UserImportResult');

// ─── 监控 ─────────────────────────────────────────────────────────────────
export const MonitorDTO = z
  .object({
    os: z.object({
      platform: z.string(),
      release: z.string(),
      arch: z.string(),
      hostname: z.string(),
      uptimeSeconds: z.number().int(),
    }),
    cpu: z.object({
      model: z.string(),
      cores: z.number().int(),
      speed: z.number(),
      loadAvg: z.array(z.number()),
      usage: z.number(),
    }),
    memory: z.object({
      total: z.number(),
      used: z.number(),
      free: z.number(),
      usagePercent: z.number(),
    }),
    disk: z
      .object({
        total: z.number(),
        used: z.number(),
        free: z.number(),
        usagePercent: z.number(),
      })
      .nullable(),
    node: z.object({
      version: z.string(),
      uptime: z.number().int(),
      pid: z.number().int(),
      memoryUsage: z.record(z.string(), z.number()),
    }),
    database: z.unknown().nullable(),
    redis: z.unknown().nullable(),
  })
  .openapi('MonitorInfo');

// ─── 工作流 ───────────────────────────────────────────────────────────────
export const WorkflowDefinitionDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    description: z.string().nullable(),
    flowData: z.unknown().nullable(),
    formFields: z.unknown().nullable(),
    status: z.enum(['draft', 'published', 'disabled']),
    version: z.number().int(),
    tenantId: z.number().int().nullable(),
    createdBy: z.number().int().nullable(),
    createdByName: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('WorkflowDefinition');

export const WorkflowTaskDTO = z
  .object({
    id: z.number().int(),
    instanceId: z.number().int(),
    nodeKey: z.string(),
    nodeName: z.string(),
    nodeType: z.string().nullable(),
    assigneeId: z.number().int().nullable(),
    assigneeName: z.string().nullable().optional(),
    assigneeAvatar: z.string().nullable().optional(),
    status: z.enum(['pending', 'approved', 'rejected', 'skipped']),
    comment: z.string().nullable(),
    actionAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('WorkflowTask');

export const WorkflowInstanceDTO = z
  .object({
    id: z.number().int(),
    definitionId: z.number().int(),
    definitionName: z.string().nullable().optional(),
    title: z.string(),
    formData: z.unknown().nullable(),
    status: z.enum(['draft', 'running', 'approved', 'rejected', 'withdrawn']),
    currentNodeKey: z.string().nullable(),
    initiatorId: z.number().int(),
    initiatorName: z.string().nullable().optional(),
    initiatorAvatar: z.string().nullable().optional(),
    tenantId: z.number().int().nullable(),
    tasks: z.array(WorkflowTaskDTO).nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('WorkflowInstance');

export const WorkflowInstanceListItemDTO = WorkflowInstanceDTO.omit({
  formData: true,
  tasks: true,
}).extend({ pendingTaskId: z.number().int().optional() }).openapi('WorkflowInstanceListItem');

export const WorkflowInstanceAllDTO = z
  .object({
    stats: z.record(z.string(), z.number().int()),
    list: z.array(WorkflowInstanceListItemDTO),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .openapi('WorkflowInstanceAll');

// ─── 日志行（operationLogs 导出等通用行结构） ─────────────────────────────
export const LogRowDTO = z
  .object({
    id: z.number().int(),
    userId: z.number().int().nullable().optional(),
    username: z.string().nullable().optional(),
    ip: z.string().nullable().optional(),
    status: z.string().optional(),
    message: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .openapi('LogRow');

// ─── 通知阅读统计 ─────────────────────────────────────────────────────────
export const NoticeReadStatsDTO = z
  .object({
    readCount: z.number().int(),
    totalCount: z.number().int(),
    list: z.array(
      z.object({
        id: z.number().int(),
        username: z.string(),
        nickname: z.string(),
        avatar: z.string().nullable(),
        readAt: z.string().optional(),
      }),
    ),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .openapi('NoticeReadStats');

// ─── 操作日志统计 ─────────────────────────────────────────────────────────
export const OperationLogStatsDTO = z
  .object({
    moduleStats: z.array(z.object({ module: z.string(), count: z.number() })),
    dailyStats: z.array(z.object({ date: z.string(), count: z.number() })),
    userStats: z.array(z.object({ username: z.string(), count: z.number() })),
  })
  .openapi('OperationLogStats');

// ─── 消息模板 ─────────────────────────────────────────────────────────────
export const MessageTemplateDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    code: z.string(),
    channel: z.enum(['email', 'sms', 'in_app']),
    subject: z.string().nullable().optional(),
    content: z.string(),
    variables: z.string().nullable().optional(),
    status: z.enum(['active', 'disabled']),
    remark: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('MessageTemplate');

export const MessageTemplatePreviewDTO = z
  .object({ subject: z.string().nullable(), content: z.string() })
  .openapi('MessageTemplatePreview');

// ─── OAuth ─────────────────────────────────────────────────────────────────
export const OAuthAccountDTO = z
  .object({
    id: z.number().int(),
    provider: z.string(),
    openId: z.string(),
    nickname: z.string().nullable(),
    avatar: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('OAuthAccount');

export const OAuthAuthUrlDTO = z
  .object({ authUrl: z.string(), state: z.string() })
  .openapi('OAuthAuthUrl');

export const OAuthConfigItemDTO = z
  .object({
    id: z.number().int(),
    provider: z.string(),
    clientId: z.string().nullable(),
    clientSecret: z.string(),
    enabled: z.boolean(),
    agentId: z.string().nullable().optional(),
    corpId: z.string().nullable().optional(),
    createdAt: z.union([z.string(), z.date()]).nullable().optional(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
  })
  .openapi('OAuthConfigItem');

// ─── 密码策略 / 公开配置 ──────────────────────────────────────────────────
export const PasswordPolicyDTO = z
  .object({
    minLength: z.number().int(),
    requireUppercase: z.boolean(),
    requireSpecialChar: z.boolean(),
  })
  .openapi('PasswordPolicy');

export const PublicConfigDTO = z
  .object({
    configKey: z.string(),
    configValue: z.string().nullable(),
    configType: z.enum(['string', 'number', 'boolean', 'json']),
  })
  .openapi('PublicConfig');

// ─── 仪表盘 ───────────────────────────────────────────────────────────────
export const DashboardStatsDTO = z
  .object({
    totalUsers: z.number().int(),
    activeUsers: z.number().int(),
    onlineUsers: z.number().int(),
    todayLogins: z.number().int(),
    todayOperations: z.number().int(),
  })
  .openapi('DashboardStats');

export const DashboardChartsDTO = z
  .object({
    loginTrend: z.array(
      z.object({ date: z.string(), successCount: z.number(), failCount: z.number() }),
    ),
    operationTypes: z.array(z.object({ module: z.string(), count: z.number() })),
    userActivity: z.array(z.object({ date: z.string(), activeUsers: z.number() })),
  })
  .openapi('DashboardCharts');

// ─── API Token ────────────────────────────────────────────────────────────
export const ApiTokenListItemDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    tokenPrefix: z.string(),
    lastUsedAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi('ApiTokenListItem');

export const ApiTokenCreatedDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    token: z.string(),
    createdAt: z.string(),
  })
  .openapi('ApiTokenCreated');

// ─── 缓存项 ───────────────────────────────────────────────────────────────
export const CacheItemDTO = z
  .object({
    key: z.string(),
    displayKey: z.string(),
    segment: z.string(),
    category: z.string(),
    type: z.string(),
    ttl: z.number(),
    size: z.number(),
    value: z.string().nullable(),
  })
  .openapi('CacheItem');

// ─── 数据库备份 ───────────────────────────────────────────────────────────
export const DbBackupItemDTO = z
  .object({
    id: z.number().int(),
    name: z.string(),
    type: z.enum(['pg_dump', 'drizzle_export']),
    fileId: z.number().int().nullable().optional(),
    fileSize: z.number().nullable().optional(),
    status: z.enum(['pending', 'running', 'success', 'failed']),
    tables: z.unknown().nullable().optional(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    durationMs: z.number().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    createdBy: z.number().int().nullable().optional(),
    createdByName: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .openapi('DbBackupItem');

// ─── 邮件配置 ─────────────────────────────────────────────────────────────
export const EmailConfigDTO = z
  .object({
    id: z.number().int(),
    smtpHost: z.string().nullable().optional(),
    smtpPort: z.number().nullable().optional(),
    smtpUser: z.string().nullable().optional(),
    fromName: z.string().nullable().optional(),
    fromEmail: z.string().nullable().optional(),
    encryption: z.string().nullable().optional(),
    updatedAt: z.union([z.string(), z.date()]).nullable().optional(),
    createdAt: z.union([z.string(), z.date()]).nullable().optional(),
  })
  .openapi('EmailConfig');

// ─── 在线会话（管理员视角） ─────────────────────────────────────────────
export const OnlineSessionDTO = z
  .object({
    tokenId: z.string(),
    userId: z.number().int(),
    username: z.string(),
    nickname: z.string(),
    ip: z.string(),
    browser: z.string(),
    os: z.string(),
    loginAt: z.string(),
  })
  .openapi('OnlineSession');
