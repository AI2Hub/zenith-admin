import * as z from 'zod';
import {
  auditFieldsSchema,
  dateRangeQuery,
  idParam,
  idQuery,
  keywordQuery,
  paginated,
  paginationQuery,
  queryBool,
  queryEnum,
} from '../../core/api-schemas';
import { defineContract, op } from '../../core/contract';
import {
  DEPLOY_HEALTH_CHECK_TYPES,
  DEPLOY_HOST_STATUSES,
  DEPLOY_LOG_LEVELS,
  DEPLOY_RESTART_MODES,
  DEPLOY_RUN_KIND_OPTIONS,
  DEPLOY_RUN_KINDS,
  DEPLOY_RUN_STATUS_OPTIONS,
  DEPLOY_RUN_STATUSES,
  DEPLOY_STEPS,
  DEPLOY_STRATEGIES,
} from '../constants';
import { createDeployRunSchema, createDeployTargetSchema, updateDeployTargetSchema } from '../validation';

// ─── 实体 ────────────────────────────────────────────────────────────────────

export const deployHealthCheckEntitySchema = z.object({
  type: z.enum(DEPLOY_HEALTH_CHECK_TYPES),
  url: z.string().nullable(),
  port: z.int().nullable(),
  command: z.string().nullable(),
  timeoutSeconds: z.int(),
  retries: z.int(),
  intervalSeconds: z.int(),
}).meta({ id: 'DeployHealthCheck' });

export type DeployHealthCheck = z.infer<typeof deployHealthCheckEntitySchema>;

export const deployScriptsEntitySchema = z.object({
  beforeSwitch: z.string().nullable(),
  restart: z.string().nullable(),
}).meta({ id: 'DeployScripts' });

export type DeployScripts = z.infer<typeof deployScriptsEntitySchema>;

/** 目标里的一台主机及其当前运行版本（来自 deploy_releases.isCurrent） */
export const deployTargetHostSchema = z.object({
  hostId: z.int(),
  hostName: z.string(),
  host: z.string().meta({ description: '主机地址（展示用）' }),
  order: z.int(),
  hostEnabled: z.boolean().meta({ description: '主机管理里是否启用；禁用主机不参与部署' }),
  currentVersion: z.string().nullable(),
  currentReleaseName: z.string().nullable(),
  currentSince: z.string().nullable().meta({ description: '当前版本切换时间' }),
}).meta({ id: 'DeployTargetHost' });

export type DeployTargetHost = z.infer<typeof deployTargetHostSchema>;

/** 最近一次 run 的摘要（目标列表直接展示） */
export const deployRunBriefSchema = z.object({
  id: z.int(),
  kind: z.enum(DEPLOY_RUN_KINDS),
  status: z.enum(DEPLOY_RUN_STATUSES),
  version: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
}).meta({ id: 'DeployRunBrief' });

export type DeployRunBrief = z.infer<typeof deployRunBriefSchema>;

/**
 * 部署目标 = 应用 × 环境：主机组、部署根目录、重启方式、健康检查、保留策略。
 * 同一应用先部到「预发」再部到「生产」，两者主机 / 路径 / 保留数各自独立。
 */
export const deployTargetSchema = z.object({
  id: z.int(),
  appId: z.int(),
  appKey: z.string().optional().meta({ description: 'JOIN 冗余' }),
  appName: z.string().optional(),
  name: z.string().meta({ example: '生产' }),
  description: z.string().nullable(),
  deployPath: z.string().meta({ description: '部署根目录；其下 releases/ shared/ current tmp/', example: '/opt/apps/order-svc' }),
  sharedPaths: z.array(z.string()).meta({ description: 'shared/ 下跨版本持久化并软链进每个 release 的相对路径', example: ['logs', 'config/application.yml'] }),
  keepReleases: z.int().meta({ description: '部署成功后保留的历史 release 数（不含 current）' }),
  restartMode: z.enum(DEPLOY_RESTART_MODES),
  serviceName: z.string().nullable().meta({ description: 'systemd 单元名（restartMode = systemd）' }),
  scripts: deployScriptsEntitySchema,
  healthCheck: deployHealthCheckEntitySchema,
  env: z.record(z.string(), z.string()).meta({ description: '传给钩子 / 重启脚本 / 健康检查命令的环境变量' }),
  autoRollback: z.boolean().meta({ description: '健康检查失败时自动切回上一版并重启' }),
  strategy: z.enum(DEPLOY_STRATEGIES),
  maxParallel: z.int(),
  stopOnFailure: z.boolean().meta({ description: '滚动推进时首台失败即停止后续主机' }),
  enabled: z.boolean(),
  remark: z.string().nullable(),
  hosts: z.array(deployTargetHostSchema),
  lastRun: deployRunBriefSchema.nullable().optional(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'DeployTarget' });

export type DeployTarget = z.infer<typeof deployTargetSchema>;

export const deployRunHostSchema = z.object({
  id: z.int(),
  runId: z.int(),
  hostId: z.int(),
  hostName: z.string(),
  status: z.enum(DEPLOY_HOST_STATUSES),
  step: z.enum(DEPLOY_STEPS).nullable().meta({ description: '当前 / 失败时所在步骤' }),
  releaseName: z.string().nullable().meta({ description: '本次在该主机上生效的 release 目录名' }),
  previousReleaseName: z.string().nullable().meta({ description: '切换前的 current；自动回滚即切回它' }),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.int().nullable(),
  error: z.string().nullable(),
}).meta({ id: 'DeployRunHost' });

export type DeployRunHost = z.infer<typeof deployRunHostSchema>;

/** 部署配置在 run 发起时的快照：历史记录可复现，之后改目标配置不影响旧记录解读 */
export const deployRunSnapshotSchema = z.object({
  deployPath: z.string(),
  sharedPaths: z.array(z.string()),
  keepReleases: z.int(),
  restartMode: z.enum(DEPLOY_RESTART_MODES),
  serviceName: z.string().nullable(),
  scripts: deployScriptsEntitySchema,
  healthCheck: deployHealthCheckEntitySchema,
  env: z.record(z.string(), z.string()),
  autoRollback: z.boolean(),
  strategy: z.enum(DEPLOY_STRATEGIES),
  maxParallel: z.int(),
  stopOnFailure: z.boolean(),
}).meta({ id: 'DeployRunSnapshot' });

export type DeployRunSnapshot = z.infer<typeof deployRunSnapshotSchema>;

export const deployRunSchema = z.object({
  id: z.int(),
  appId: z.int(),
  appKey: z.string().optional(),
  appName: z.string().optional(),
  targetId: z.int(),
  targetName: z.string().optional(),
  kind: z.enum(DEPLOY_RUN_KINDS),
  status: z.enum(DEPLOY_RUN_STATUSES),
  appReleaseId: z.int().nullable().meta({ description: '部署的应用版本 ID（deploy）' }),
  version: z.string().nullable(),
  artifactId: z.int().nullable(),
  artifactFileName: z.string().nullable().optional(),
  releaseName: z.string().nullable().meta({ description: '本次 run 在各主机上的 release 目录名；rollback 为目标 release 名' }),
  asyncTaskId: z.int().nullable().meta({ description: '任务中心任务 ID；取消经 /api/async-tasks/{id}/cancel' }),
  hostTotal: z.int(),
  hostSucceeded: z.int(),
  hostFailed: z.int(),
  error: z.string().nullable().meta({ description: '整体失败原因（预检 / 制品读取等主机之外的错误）' }),
  remark: z.string().nullable(),
  snapshot: deployRunSnapshotSchema.optional().meta({ description: '详情返回' }),
  hosts: z.array(deployRunHostSchema).optional().meta({ description: '详情返回' }),
  createdByName: z.string().nullable().optional().meta({ description: '发起人' }),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  ...auditFieldsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
}).meta({ id: 'DeployRun' });

export type DeployRun = z.infer<typeof deployRunSchema>;

export const deployRunLogSchema = z.object({
  id: z.int(),
  runId: z.int(),
  hostId: z.int().nullable().meta({ description: 'null = run 级日志（预检 / 汇总）' }),
  seq: z.int().meta({ description: 'run 内单调递增，客户端按它增量拉取 / 去重' }),
  level: z.enum(DEPLOY_LOG_LEVELS),
  step: z.enum(DEPLOY_STEPS).nullable(),
  line: z.string(),
  createdAt: z.string(),
}).meta({ id: 'DeployRunLog' });

export type DeployRunLog = z.infer<typeof deployRunLogSchema>;

/** 主机上的一个 release 目录 = 还原点；isCurrent 为该主机当前运行版本 */
export const deployReleaseSchema = z.object({
  id: z.int(),
  appId: z.int(),
  appKey: z.string().optional(),
  appName: z.string().optional(),
  targetId: z.int(),
  targetName: z.string().optional(),
  hostId: z.int(),
  hostName: z.string().optional(),
  releaseName: z.string(),
  version: z.string(),
  appReleaseId: z.int().nullable(),
  artifactId: z.int().nullable(),
  runId: z.int().nullable().meta({ description: '创建它的部署 run' }),
  isCurrent: z.boolean(),
  sizeBytes: z.number().nullable(),
  removedAt: z.string().nullable().meta({ description: '已从主机清理（保留策略 / 手动删除）；列表默认只看未清理的' }),
  createdAt: z.string(),
}).meta({ id: 'DeployRelease' });

export type DeployRelease = z.infer<typeof deployReleaseSchema>;

/** 与主机对账的结果：主机上 current 指向 / releases 目录与登记表的差异 */
export const deployTargetSyncResultSchema = z.object({
  target: deployTargetSchema,
  hosts: z.array(z.object({
    hostId: z.int(),
    hostName: z.string(),
    ok: z.boolean(),
    message: z.string().nullable(),
    currentReleaseName: z.string().nullable(),
    discovered: z.int().meta({ description: '主机上存在但登记表没有、本次补登的 release 数' }),
    missing: z.int().meta({ description: '登记表有但主机上已不存在、本次标记清理的 release 数' }),
  })),
}).meta({ id: 'DeployTargetSyncResult' });

export type DeployTargetSyncResult = z.infer<typeof deployTargetSyncResultSchema>;

// ─── 入参 ────────────────────────────────────────────────────────────────────

export const deployTargetListQuery = z.object({
  appId: idQuery('应用 ID'),
  keyword: keywordQuery('目标名称 / 应用', { max: 128 }),
  enabled: queryBool('是否启用'),
});

export const deployRunListQuery = paginationQuery.extend({
  appId: idQuery('应用 ID'),
  targetId: idQuery('目标 ID'),
  kind: queryEnum(DEPLOY_RUN_KINDS, { description: '类型；空 = 全部', options: DEPLOY_RUN_KIND_OPTIONS }),
  status: queryEnum(DEPLOY_RUN_STATUSES, { description: '状态；空 = 全部', options: DEPLOY_RUN_STATUS_OPTIONS }),
  keyword: keywordQuery('版本号 / 备注', { max: 128 }),
  ...dateRangeQuery('发起时间'),
});

export const deployRunLogQuery = z.object({
  afterSeq: z.coerce.number().int().min(0).default(0).meta({ description: '只取 seq 大于该值的日志（增量拉取）' }),
  hostId: idQuery('只看某台主机（含 run 级日志）'),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

export const deployReleaseListQuery = paginationQuery.extend({
  appId: idQuery('应用 ID'),
  targetId: idQuery('目标 ID'),
  hostId: idQuery('主机 ID'),
  keyword: keywordQuery('版本号 / release 名', { max: 128 }),
  includeRemoved: queryBool('包含已清理的 release'),
});

// ─── 契约 ────────────────────────────────────────────────────────────────────

export const deployTargetContract = defineContract('/api/deploy/targets', {
  list: op.get('/', { access: { permission: 'system:deploy:list' }, query: deployTargetListQuery, response: z.array(deployTargetSchema), summary: '部署目标列表（含各主机当前版本）' }),
  detail: op.get('/{id}', { access: { permission: 'system:deploy:list' }, params: idParam, response: deployTargetSchema, summary: '部署目标详情' }),
  create: op.post('/', { access: { permission: 'system:deploy:manage' }, audit: '新增部署目标', body: createDeployTargetSchema, response: deployTargetSchema, summary: '新增部署目标' }),
  update: op.put('/{id}', { access: { permission: 'system:deploy:manage' }, audit: '更新部署目标', params: idParam, body: updateDeployTargetSchema, response: deployTargetSchema, summary: '更新部署目标' }),
  remove: op.delete('/{id}', { access: { permission: 'system:deploy:manage' }, audit: '删除部署目标', params: idParam, summary: '删除部署目标（不触碰主机上的文件）' }),
  sync: op.post('/{id}/sync', { access: { permission: 'system:deploy:execute' }, audit: '对账部署目标', params: idParam, response: deployTargetSyncResultSchema, summary: '与主机对账：读取 current 指向与 releases 目录，修正登记表' }),
}, { auditModule: '应用部署', tags: ['Deploy'] });

export const deployRunContract = defineContract('/api/deploy/runs', {
  list: op.get('/', { access: { permission: 'system:deploy:list' }, query: deployRunListQuery, response: paginated(deployRunSchema), summary: '部署记录列表' }),
  detail: op.get('/{id}', { access: { permission: 'system:deploy:list' }, params: idParam, response: deployRunSchema, summary: '部署记录详情（含各主机状态与配置快照）' }),
  logs: op.get('/{id}/logs', { access: { permission: 'system:deploy:list' }, params: idParam, query: deployRunLogQuery, response: z.array(deployRunLogSchema), summary: '部署日志（按 seq 增量）' }),
  create: op.post('/', { access: { permission: 'system:deploy:execute' }, audit: '发起部署', body: createDeployRunSchema, response: deployRunSchema, summary: '发起部署 / 回滚 / 重启（异步，任务中心执行）' }),
  retry: op.post('/{id}/retry', { access: { permission: 'system:deploy:execute' }, audit: '重试失败主机', params: idParam, response: deployRunSchema, summary: '对该 run 中失败 / 回滚 / 跳过的主机再发起一次同参数 run' }),
  cancel: op.post('/{id}/cancel', { access: { permission: 'system:deploy:execute' }, audit: '取消部署', params: idParam, response: deployRunSchema, summary: '请求取消（当前主机的步骤完成后停止，已切换的主机不回退）' }),
}, { auditModule: '应用部署', tags: ['Deploy'] });

export const deployReleaseContract = defineContract('/api/deploy/releases', {
  list: op.get('/', { access: { permission: 'system:deploy:list' }, query: deployReleaseListQuery, response: paginated(deployReleaseSchema), summary: '主机上的 release 目录（还原点）' }),
  remove: op.delete('/{id}', { access: { permission: 'system:deploy:manage' }, audit: '删除主机上的 release', params: idParam, summary: '删除主机上的 release 目录（current 不可删）' }),
}, { auditModule: '应用部署', tags: ['Deploy'] });
