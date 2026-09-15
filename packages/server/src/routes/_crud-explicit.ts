/**
 * 标准操作（list / detail / create / update / remove / removeBatch）仍以 `defineContractRoute` 显式书写的路由块登记表。
 *
 * 规则（由 `crud-coverage.test.ts` 守住）：
 * - 新增标准操作一律经 `mountCrud` 派生；确需显式书写的，在此登记「文件 → 契约 → 操作」并写明理由；
 * - 表只准缩小：某块改为派生后必须删掉对应条目，否则测试失败。
 */
export interface ExplicitCrudEntry {
  readonly contract: string;
  readonly ops: readonly ('list' | 'detail' | 'create' | 'update' | 'remove' | 'removeBatch')[];
  readonly reason: string;
}

/** 键为相对 `src/routes` 的文件路径 */
export const explicitCrudRoutes: Readonly<Record<string, readonly ExplicitCrudEntry[]>> = {
  'ai/ai-eval.ts': [
    { contract: 'aiEvalContract', ops: ['update', 'remove'], reason: '不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
  'ai/ai-http-tools.ts': [
    { contract: 'aiHttpToolContract', ops: ['update', 'remove'], reason: '不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
  'ai/ai-knowledge.ts': [
    { contract: 'aiKnowledgeBaseContract', ops: ['update', 'remove'], reason: '不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
  'ai/user-ai-config.ts': [
    { contract: 'userAiConfigContract', ops: ['update', 'remove'], reason: '不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
  'analytics/session-replays.ts': [
    { contract: 'sessionReplayContract', ops: ['detail', 'removeBatch'], reason: '服务函数需要请求上下文（当前用户 / IP）作额外入参；服务函数签名与契约入参不一致（取子字段 / 转换）' },
  ],
  'chat/chat-bots.ts': [
    { contract: 'chatBotContract', ops: ['create', 'update'], reason: '需记录审计 after 数据' },
  ],
  'cms/collect.ts': [
    { contract: 'cmsCollectContract', ops: ['update', 'remove'], reason: '不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
  'cms/contents.ts': [
    { contract: 'cmsContentContract', ops: ['update'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'cms/distributions.ts': [
    { contract: 'cmsDistributionContract', ops: ['create', 'update'], reason: '需记录审计 after 数据' },
  ],
  'cms/interactions.ts': [
    { contract: 'cmsInteractionContract', ops: ['update', 'remove'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'cms/models.ts': [
    { contract: 'cmsModelContract', ops: ['detail', 'update', 'remove'], reason: '服务函数签名与契约入参不一致（取子字段 / 转换）；handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'cms/pages.ts': [
    { contract: 'cmsPageContract', ops: ['update'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'cms/resources.ts': [
    { contract: 'cmsResourceContract', ops: ['update'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'drive/drive-access-requests.ts': [
    { contract: 'driveAccessRequestContract', ops: ['create'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'drive/drive-nodes.ts': [
    { contract: 'driveNodeContract', ops: ['removeBatch'], reason: '服务函数签名与契约入参不一致（取子字段 / 转换）' },
  ],
  'drive/drive-share-links.ts': [
    { contract: 'driveShareLinkContract', ops: ['update', 'remove'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'drive/drive-spaces.ts': [
    { contract: 'driveSpaceContract', ops: ['create', 'update', 'remove'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'drive/drive-tags.ts': [
    { contract: 'driveTagContract', ops: ['list', 'update', 'remove'], reason: '服务函数签名与契约入参不一致（取子字段 / 转换）；不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
  'files/business-files.ts': [
    { contract: 'businessFileContract', ops: ['list', 'remove'], reason: 'handler 含前置校验 / 业务分支；需记录审计 after 数据' },
  ],
  'files/files.ts': [
    { contract: 'fileContract', ops: ['removeBatch'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'identity/api-tokens.ts': [
    { contract: 'apiTokenContract', ops: ['remove'], reason: '不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
  'identity/menus.ts': [
    { contract: 'menuContract', ops: ['create', 'update', 'remove'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）；handler 含前置校验 / 业务分支' },
  ],
  'identity/oauth-config.ts': [
    { contract: 'oauthConfigContract', ops: ['list', 'update'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）；handler 含前置校验 / 业务分支' },
  ],
  'identity/positions.ts': [
    { contract: 'positionContract', ops: ['update', 'removeBatch'], reason: '需记录审计 after 数据；handler 含前置校验 / 业务分支' },
  ],
  'identity/tenant-packages.ts': [
    { contract: 'tenantPackageContract', ops: ['removeBatch'], reason: '公开 / 非登录态路由' },
  ],
  'identity/tenants.ts': [
    { contract: 'tenantContract', ops: ['create'], reason: '需记录审计 after 数据' },
  ],
  'identity/user-groups.ts': [
    { contract: 'userGroupContract', ops: ['removeBatch'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'identity/users.ts': [
    { contract: 'userContract', ops: ['removeBatch'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'iot/iot-devices.ts': [
    { contract: 'iotDeviceContract', ops: ['removeBatch', 'update', 'remove'], reason: 'handler 含前置校验 / 业务分支；handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'iot/iot-groups.ts': [
    { contract: 'iotDeviceGroupContract', ops: ['create', 'update', 'remove'], reason: '中间件组合（平台管理员限定等）仅作用于部分操作，mountCrud 的 middleware 选项按整组生效' },
  ],
  'iot/iot-register.ts': [
    { contract: 'iotWhitelistContract', ops: ['remove'], reason: '不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
  'member/checkin-settings.ts': [
    { contract: 'checkinSettingsContract', ops: ['update'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'messaging/announcements.ts': [
    { contract: 'announcementContract', ops: ['removeBatch'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'messaging/in-app-messages.ts': [
    { contract: 'inAppMessageContract', ops: ['list', 'detail', 'removeBatch', 'remove'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）；服务函数签名与契约入参不一致（取子字段 / 转换）；不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
  'mp/mp-conditional-menus.ts': [
    { contract: 'mpConditionalMenuContract', ops: ['list'], reason: '服务函数签名与契约入参不一致（取子字段 / 转换）' },
  ],
  'mp/mp-menu.ts': [
    { contract: 'mpMenuContract', ops: ['remove'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'mp/mp-qrcodes.ts': [
    { contract: 'mpQrcodeContract', ops: ['create'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'open-platform/api-scopes.ts': [
    { contract: 'apiScopeContract', ops: ['removeBatch'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'open-platform/app-webhooks-router.ts': [
    { contract: 'contract', ops: ['create'], reason: '需记录审计 after 数据' },
  ],
  'open-platform/developer-apps.ts': [
    { contract: 'developerAppContract', ops: ['create', 'update', 'remove'], reason: '需记录审计 after 数据；中间件组合（平台管理员限定等）仅作用于部分操作，mountCrud 的 middleware 选项按整组生效' },
  ],
  'open-platform/oauth2-clients.ts': [
    { contract: 'oauth2ClientContract', ops: ['create', 'update'], reason: '需记录审计 after 数据；handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'ops/host-files.ts': [
    { contract: 'hostFileContract', ops: ['list', 'create', 'remove'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'ops/log-files.ts': [
    { contract: 'logFileContract', ops: ['list', 'remove'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'ops/maintenance.ts': [
    { contract: 'maintenanceContract', ops: ['detail', 'update'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'ops/nginx-sites.ts': [
    { contract: 'nginxSiteContract', ops: ['detail', 'create', 'update', 'remove'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）；需记录审计 after 数据' },
  ],
  'ops/ports.ts': [
    { contract: 'portContract', ops: ['list'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'ops/processes.ts': [
    { contract: 'processContract', ops: ['list', 'detail'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'ops/deploy.ts': [
    { contract: 'deployRunContract', ops: ['list', 'detail', 'create'], reason: '部署记录包含目标 / 制品解析、任务提交与逐主机投影；服务函数签名与契约派生签名不一致，且同路由组包含日志、重试、取消等自定义操作' },
    { contract: 'deployReleaseContract', ops: ['list', 'remove'], reason: '发布备份列表需要关联应用、目标与主机发布状态；删除操作包含 current / previous 保护校验，不能使用通用 CRUD' },
  ],
  'ops/retention.ts': [
    { contract: 'retentionPolicyContract', ops: ['update'], reason: '需记录审计 after 数据' },
  ],
  'ops/ssh-sftp.ts': [
    { contract: 'sshSftpContract', ops: ['list', 'create', 'remove'], reason: '服务函数需要请求上下文（当前用户 / IP）作额外入参' },
  ],
  'ops/systemd.ts': [
    { contract: 'systemdContract', ops: ['list', 'detail'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'ops/terminal-files.ts': [
    { contract: 'terminalFileContract', ops: ['list', 'create', 'remove'], reason: '服务函数签名与契约入参不一致（取子字段 / 转换）；服务函数带额外入参（非契约派生签名）' },
  ],
  'ops/terminal-recordings.ts': [
    { contract: 'terminalRecordingContract', ops: ['create', 'detail', 'remove'], reason: '需记录审计 after 数据；服务函数签名与契约入参不一致（取子字段 / 转换）' },
  ],
  'ops/terminal-sessions.ts': [
    { contract: 'terminalSessionContract', ops: ['list'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'payment/payment-link-public.ts': [
    { contract: 'paymentLinkPublicContract', ops: ['detail'], reason: '公开 / 非登录态路由' },
  ],
  'payment/payment-links.ts': [
    { contract: 'paymentLinkContract', ops: ['create', 'update'], reason: '需记录审计 after 数据' },
  ],
  'payment/payment-preauths.ts': [
    { contract: 'paymentPreauthContract', ops: ['create'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'payment/payment-transfers.ts': [
    { contract: 'paymentTransferContract', ops: ['create'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'platform/cache.ts': [
    { contract: 'cacheContract', ops: ['list'], reason: '服务函数签名与契约入参不一致（取子字段 / 转换）' },
  ],
  'platform/regions.ts': [
    { contract: 'regionContract', ops: ['create', 'update', 'remove'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）；handler 含前置校验 / 业务分支' },
  ],
  'platform/rules-lists.ts': [
    { contract: 'ruleListContract', ops: ['update', 'remove'], reason: 'handler 含前置校验 / 业务分支；不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
  'platform/rules-scorecards.ts': [
    { contract: 'ruleScorecardContract', ops: ['update'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'platform/settings.ts': [
    { contract: 'settingsContract', ops: ['list'], reason: '服务函数需要请求上下文（当前用户 / IP）作额外入参' },
  ],
  'platform/user-feedbacks.ts': [
    { contract: 'userFeedbackContract', ops: ['removeBatch', 'remove'], reason: 'handler 含前置校验 / 业务分支；handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'report/report-dashboards.ts': [
    { contract: 'reportDashboardContract', ops: ['detail', 'update'], reason: '服务函数签名与契约入参不一致（取子字段 / 转换）；handler 含前置校验 / 业务分支' },
  ],
  'short-link/short-links.ts': [
    { contract: 'shortLinkContract', ops: ['removeBatch'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'tasks/async-tasks.ts': [
    { contract: 'asyncTaskContract', ops: ['list', 'detail', 'remove'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'workflow/instances/lifecycle.ts': [
    { contract: 'workflowInstanceContract', ops: ['create', 'remove'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'workflow/instances/queries.ts': [
    { contract: 'workflowInstanceContract', ops: ['list', 'detail'], reason: 'handler 含自定义逻辑（非「取参 → 服务 → 包络」）' },
  ],
  'workflow/workflow-forms.ts': [
    { contract: 'workflowFormContract', ops: ['update', 'remove'], reason: 'handler 含前置校验 / 业务分支' },
  ],
  'workflow/workflow-simulation-cases.ts': [
    { contract: 'workflowSimulationCaseContract', ops: ['list', 'remove'], reason: '服务函数签名与契约入参不一致（取子字段 / 转换）；不记审计 before 快照（契约无 detail、服务未提供 get）' },
  ],
};
