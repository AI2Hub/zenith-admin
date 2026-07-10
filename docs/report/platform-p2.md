# 报表平台 P2：语义、治理、质量、容量、资产、问数与填报

P2 在已有数据源、数据集、仪表盘和打印报表之上增加平台化控制面。所有接口均位于 `/api/report`，需要管理员 JWT，响应统一为 `{ code, message, data }`；分页 `data` 为 `{ list, total, page, pageSize }`。资源访问同时受 RBAC 权限码、租户边界、所有权与 ACL 约束。

## 架构与基线数据

```text
目录/所有权/ACL ── 发布审批 ── dev → staging → prod
       │
数据集 ├─ 语义指标
       ├─ DQ 规则 → 运行/评分/异常
       ├─ 物化快照 → 查询配额/成本 → SLA
       └─ ChatBI（冻结元数据 + 表白名单 + 只读 SQL）

资产目录 ── 用量/弃用公告/可复用模板
WorkflowFormSchema ── 填报模板 ── 草稿/提交/审批 ── 生成数据集
```

共享种子 `packages/shared/src/seed-data.ts` 是数据库与 Demo 的唯一基线，提供：

- `SEED_REPORT_FOLDERS`：按资源类型隔离的示例目录；
- `SEED_REPORT_ENVIRONMENTS`：`dev`、`staging`、`prod`；
- `SEED_REPORT_METRICS`：绑定内置数据集的已发布指标；
- `SEED_REPORT_DQ_RULES`、`SEED_REPORT_SLA_RULES`；
- `SEED_REPORT_QUERY_QUOTAS`：日限额为 `0` 表示不限，并发仍限制为 20；
- `SEED_REPORT_ASSET_TEMPLATES`；
- `SEED_REPORT_FILL_TEMPLATES`：已发布且可人工审核的 Workflow 表单 schema。

种子不包含密码、Token、外部连接或 ACL 授权。现有内置报表资源只有在 `owner_id` 与 `folder_id` 都为空时才补齐归属，避免覆盖用户维护的数据。

## 语义指标

指标绑定一个数据集，声明简单聚合或公式、维度、口径、单位与格式。列表和引用查询只返回当前租户可见资源。

| 操作 | 接口 | 权限 |
|------|------|------|
| 列表/详情/选项/引用 | `GET /api/report/metrics`、`GET /api/report/metrics/{id}`、`GET /api/report/metrics/lookup`、`GET /api/report/metrics/{id}/refs` | `report:metric:list` |
| 新增 | `POST /api/report/metrics` | `report:metric:create` |
| 编辑 | `PUT /api/report/metrics/{id}` | `report:metric:update` |
| 删除 | `DELETE /api/report/metrics/{id}` | `report:metric:delete` |
| 评估 | `POST /api/report/metrics/{id}/evaluate` | `report:metric:evaluate` |
| 发布/弃用 | `POST /api/report/metrics/{id}/publish`、`POST /api/report/metrics/{id}/deprecate` | `report:metric:publish` |

生命周期为 `draft → published → deprecated`。编辑和生命周期请求携带 `expectedRevision`；冲突返回 409。发布时固化 `publishedSnapshot`，运行端只消费发布快照，弃用前应先检查 `/refs` 返回的仪表盘、预警和派生指标引用。

## 资源治理、ACL、审批与环境

### 目录与权限模型

目录按 `datasource | dataset | dashboard | metric | print_template | fill_template | asset_template` 分树，不能跨资源类型移动。目录非空时不能删除。

| 操作 | 接口 | 权限 |
|------|------|------|
| 目录树/详情 | `GET /api/report/folders/tree`、`GET /api/report/folders/{id}` | `report:folder:list` |
| 新增/编辑/移动/删除 | `POST /api/report/folders`、`PUT /api/report/folders/{id}`、`POST /api/report/folders/{id}/move`、`DELETE /api/report/folders/{id}` | `report:folder:create` / `report:folder:update` / `report:folder:delete` |
| ACL 列表/授权/编辑/撤销 | `GET|POST /api/report/governance/acls`、`PUT|DELETE /api/report/governance/acls/{id}` | `report:resource:acl` |
| 有效权限检查 | `POST /api/report/governance/access/check` | `report:resource:access` |
| 所有权转移 | `GET|POST /api/report/governance/transfers`、`POST /api/report/governance/transfers/{id}/decision`、`POST /api/report/governance/transfers/{id}/cancel` | `report:resource:transfer` |

ACL 主体为用户或角色，级别为 `viewer < editor < owner`，可设置失效时间和目录继承。所有者天然拥有 `owner`；授权只允许资源所有者执行。有效权限取直接 ACL、继承 ACL 与所有权的最高级别，但不会跨租户。不要给全局目录补租户 ACL，也不要用 ACL 绕过数据集行级权限。

转移状态为 `pending → accepted | rejected | cancelled`。接受后原所有者失去天然权限；确需保留访问时应显式创建 ACL。

### 发布审批与环境晋级

| 操作 | 接口 | 权限 |
|------|------|------|
| 审批列表/申请 | `GET /api/report/governance/approvals`、`POST /api/report/governance/approvals` | `report:approval:list` / `report:approval:request` |
| 审批决定/取消 | `POST /api/report/governance/approvals/{id}/decision`、`POST /api/report/governance/approvals/{id}/cancel` | `report:approval:approve` / `report:approval:request` |
| 环境列表/新增/编辑/删除 | `GET|POST /api/report/environments`、`PUT|DELETE /api/report/environments/{id}` | `report:environment:list` / `:create` / `:update` / `:delete` |
| 晋级列表/创建/流转 | `GET|POST /api/report/environments/promotions`、`POST /api/report/environments/promotions/{id}/transition` | `report:environment:list` / `report:environment:promote` |

审批状态为 `pending → approved | rejected | cancelled`。当前同步晋级操作为 `pending → approved → succeeded`，待处理记录也可进入 `cancelled`，成功发布可回退为 `rolled_back`；枚举中的 `deploying/failed` 供部署执行记录使用。晋级保存源修订与源快照，禁止直接从开发环境覆盖生产环境的未审批版本。

## 数据质量

规则类型包括 `not_null`、`uniqueness`、`range`、`pattern`、`freshness`、`row_count` 与 `custom_sql`。执行写入运行、评分和异常，并通过任务中心返回 `report-dq-rule-run`。

| 操作 | 接口 | 权限 |
|------|------|------|
| 规则 CRUD/启停 | `GET|POST /api/report/dq/rules`、`GET|PUT|DELETE /api/report/dq/rules/{id}`、`POST /api/report/dq/rules/{id}/toggle` | `report:dq:list` / `:create` / `:update` / `:delete` |
| 执行 | `POST /api/report/dq/rules/{id}/run` | `report:dq:run` |
| 运行与评分 | `GET /api/report/dq/runs`、`GET /api/report/dq/datasets/{id}/scores`、`GET /api/report/dq/datasets/{id}/score` | `report:dq:list` |
| 异常与处置 | `GET /api/report/dq/anomalies`、`POST /api/report/dq/anomalies/{id}/status` | `report:dq:list` / `report:dq:update` |

运行状态为 `pending | running | succeeded | failed | cancelled`，异常状态为 `open → acknowledged | ignored | resolved`。失败样本受行数与字节预算限制，不保存无限结果。

### `custom_sql` 受限语法

自定义 SQL 返回“失败行”，只允许：

```sql
SELECT row FROM dataset WHERE (row->>'amount')::numeric < 0
```

硬性约束：

- 必须且只能有一个 `SELECT`、一个 `FROM`，形态为 `SELECT [alias.]row FROM dataset [alias] [WHERE ...]`；
- 禁止 `WITH`、`JOIN`、`UNION`、`INTERSECT`、`EXCEPT`、`LATERAL`、`VALUES`、`TABLE`，禁止带引号标识符；
- 函数白名单仅为 `abs`、`btrim`、`cast`、`ceil`、`coalesce`、`floor`、`jsonb_array_length`、`jsonb_typeof`、`length`、`lower`、`ltrim`、`nullif`、`replace`、`round`、`rtrim`、`substring`、`trim`、`upper`；
- 服务端在只读事务中执行，超时 5 秒，最多读取/返回 10,000 行。客户端不能传真实表名或 SQL 白名单。

## 物化、配额、成本与 SLA

| 能力 | 接口 | 权限 |
|------|------|------|
| 快照列表/当前 | `GET /api/report/materializations/datasets/{id}/snapshots`、`GET /api/report/materializations/datasets/{id}/current` | `report:materialization:list` |
| 刷新/清理 | `POST /api/report/materializations/datasets/{id}/refresh`、`DELETE /api/report/materializations/snapshots/{id}`、`DELETE /api/report/materializations/datasets/{id}/snapshots` | `report:materialization:refresh` / `report:materialization:purge` |
| 配额 CRUD | `GET|POST /api/report/query-capacity/quotas`、`GET|PUT|DELETE /api/report/query-capacity/quotas/{id}` | `report:query-quota:list` / `:create` / `:update` / `:delete` |
| 配额用量/重置 | `GET /api/report/query-capacity/quotas/{id}/usage`、`POST /api/report/query-capacity/quotas/{id}/reset` | `report:query-quota:list` / `report:query-quota:update` |
| 成本 | `GET /api/report/query-capacity/cost-logs`、`GET /api/report/query-capacity/cost-stats`、`GET /api/report/query-capacity/cost-trend` | `report:query-cost:list` |
| SLA CRUD/评估 | `GET|POST /api/report/sla/rules`、`GET|PUT|DELETE /api/report/sla/rules/{id}`、`POST /api/report/sla/rules/{id}/evaluate` | `report:sla:list` / `:create` / `:update` / `:delete` / `:evaluate` |
| SLA 违约 | `GET /api/report/sla/violations`、`POST /api/report/sla/violations/{id}/status` | `report:sla:list` / `report:sla:update` |

全量或增量刷新返回 `report-dataset-materialize`；快照状态为 `pending → building → ready | failed`，就绪快照后续可进入 `expired | deleted`。配额可按租户或用户设置并发、每日查询数、行数、字节数和成本；日限额 `0` 表示不限，不代表绕过并发或数据源预算。SLA 类型为 `freshness | query_latency_p95 | availability | dq_score`，评估返回 `report-sla-rule-evaluate`；违约状态为 `open → acknowledged | resolved`。

## 资产目录与模板

| 操作 | 接口 | 权限 |
|------|------|------|
| 目录、单项用量、排行、闲置、趋势 | `GET /api/report/assets/catalog`、`GET /api/report/assets/usage/{resourceType}/{id}`、`GET /api/report/assets/usage/top`、`GET /api/report/assets/usage/inactive`、`GET /api/report/assets/usage/trend` | `report:asset:list` / `report:asset:usage` |
| 弃用 CRUD/发布 | `GET|POST /api/report/assets/deprecations`、`PUT|DELETE /api/report/assets/deprecations/{id}`、`POST /api/report/assets/deprecations/{id}/publish` | `report:deprecation:list` / `:create` / `:update` / `:delete` / `:publish` |
| 模板 CRUD/克隆/应用 | `GET|POST /api/report/assets/templates`、`GET|PUT|DELETE /api/report/assets/templates/{id}`、`POST /api/report/assets/templates/{id}/clone`、`POST /api/report/assets/templates/{id}/apply` | `report:asset-template:list` / `:create` / `:update` / `:delete` / `:apply`；克隆使用 `:create` |

弃用公告先保存草稿，发布后进入生效日提醒；消费方仍需主动迁移。资产模板只保存允许的资源快照，不包含数据源凭据、访问 Token 或冻结 SQL 白名单；应用时创建新资源并重新执行当前用户权限检查。

## ChatBI

ChatBI 会话绑定数据源或数据集，并在创建时冻结元数据上下文。服务端让模型只生成 SQL，再执行只读校验、表白名单校验和查询预算，模型不能直连数据库。

| 操作 | 接口 | 权限 |
|------|------|------|
| 会话列表/详情 | `GET /api/report/chatbi/sessions`、`GET /api/report/chatbi/sessions/{id}` | `report:chatbi:list` |
| 创建/编辑/归档/删除 | `POST /api/report/chatbi/sessions`、`PUT /api/report/chatbi/sessions/{id}`、`POST /api/report/chatbi/sessions/{id}/archive`、`DELETE /api/report/chatbi/sessions/{id}` | `report:chatbi:create` / `:update` / `:delete` |
| 提问 | `POST /api/report/chatbi/sessions/{id}/ask` | `report:chatbi:ask` |
| 保存为数据集/仪表盘 | `POST /api/report/chatbi/messages/{id}/save` | `report:chatbi:save` |
| 我的用量/审计 | `GET /api/report/chatbi/quotas/me`、`GET /api/report/chatbi/audit` | `report:chatbi:list` / `report:chatbi:audit` |

会话状态为 `active → archived`。每个用户只能访问自己的会话。表白名单必须有 1–100 项：绑定数据集时只能选该数据集 SQL 引用的表；否则只能选数据源元数据中真实存在的表。生成 SQL 再经过 `assertReportSqlTableAllowlist`，禁止写操作、多语句与越表访问。Demo 固定允许 `menus`、`departments`、`users`，不返回凭据或真实生产 SQL 白名单。审计保留模型、Token、成本、延迟、行数/字节数和失败原因；保存回答时再次校验资源编辑权限和 SQL 白名单。`report:chatbi:manage` 为后续全局配额策略预留，当前没有对应写接口。

## 填报与 Workflow 审批

模板直接复用 `WorkflowFormSchema`，发布时固化 schema 与修订；已有记录继续使用自己的 schema 快照，不受后续模板编辑影响。

| 操作 | 接口 | 权限 |
|------|------|------|
| 模板列表/详情 | `GET /api/report/fill/templates`、`GET /api/report/fill/templates/{id}` | `report:fill:template:list` |
| 已发布模板选项 | `GET /api/report/fill/templates/lookup` | `report:fill:record:create` |
| 新增/编辑/删除 | `POST /api/report/fill/templates`、`PUT /api/report/fill/templates/{id}`、`DELETE /api/report/fill/templates/{id}` | `report:fill:template:create` / `:update` / `:delete` |
| 发布/下线/克隆 | `POST /api/report/fill/templates/{id}/lifecycle`、`POST /api/report/fill/templates/{id}/clone` | `report:fill:template:publish` / `report:fill:template:clone` |
| 我的列表/管理列表 | `GET /api/report/fill/records/mine`、`GET /api/report/fill/records/admin` | `report:fill:record:list` / `report:fill:record:review` |
| 记录详情 | `GET /api/report/fill/records/{id}` | `report:fill:record:list` 或 `report:fill:record:review` |
| 草稿新增/编辑 | `POST /api/report/fill/records`、`PUT /api/report/fill/records/{id}` | `report:fill:record:create` / `:update` |
| 提交/撤回/取消 | `POST /api/report/fill/records/{id}/submit`、`POST /api/report/fill/records/{id}/withdraw`、`POST /api/report/fill/records/{id}/cancel` | `report:fill:record:submit` / `report:fill:record:cancel` |
| 人工审核 | `POST /api/report/fill/records/{id}/review` | `report:fill:record:review` |

模板状态为 `draft → published → disabled`。记录状态：

```text
draft/rejected ── submit ── submitted ── approve ── approved
                         └─ reject ── rejected
绑定 Workflow：submitted → in_review → approved | rejected
draft/rejected/submitted/in_review ── cancel/withdraw ── cancelled
```

`expectedRevision` 防止重复提交和并发覆盖。绑定 `workflowDefinitionId` 后必须由 Workflow 实例审批，不能再用人工审核接口旁路；不绑定 Workflow 且 `needReview=true` 时由报表审核人决定。批准后提交 `report-fill-sync`，原子写入生成数据集并记录 `generatedDatasetId`、`syncTaskId`、`syncStatus`；金额仍按表单定义处理，业务金额建议使用整数分。导出需要 `report:fill:record:export`。

## 异步任务与状态查看

| 任务类型 | 触发接口 | 用途 |
|----------|----------|------|
| `report-dq-rule-run` | `POST /api/report/dq/rules/{id}/run` | DQ 取数、评估、评分和异常 |
| `report-dataset-materialize` | `POST /api/report/materializations/datasets/{id}/refresh` | 全量/增量快照 |
| `report-sla-rule-evaluate` | `POST /api/report/sla/rules/{id}/evaluate` | SLA 评估与违约 |
| `report-fill-sync` | 填报批准后内部提交 | 同步批准记录到生成数据集 |

提交接口返回完整 `AsyncTask`，TaskTray 通过 `/api/async-tasks/mine` 和 `/api/async-tasks/{id}` 展示进度。取消、重试、并发与保留期全部使用任务中心，不另建轮询表或进程内定时器。

## 高级打印、移动端与嵌入

- 打印模板支持多 `datasetBindings`、Sheet 默认 `datasetKey`、多 `repeatBlocks`、父子字段关联和子报表单元格；交叉表支持多行/列维度、多指标、行列总计和动态列/单元格/字节预算。
- 渲染仍走 `POST /api/report/print/{id}/render`；导出中心支持 `xlsx`、`pdf` 与 `docx`，Word 用真实分页结果生成，不把 HTML 伪装成 docx。详见[类 Excel 打印报表](./print-reports)。
- 移动端复用同一已发布仪表盘协议，按组件移动端配置、紧凑模式、隐藏项与顺序渲染；查询权限和筛选校验不因小屏或嵌入而放宽。
- `<ReportEmbed>`、scoped embed token、命令/事件协议及 origin 规则见[分享 / 订阅 / 嵌入 / 协作](./sharing)。

## 迁移与运维

1. P2 schema 变更必须先代码评审，再运行 `npm run db:generate` 生成 Drizzle 迁移；禁止手写迁移 SQL。
2. 在维护窗口备份 PostgreSQL，先于应用发布执行 `npm run db:migrate`，再执行 `npm run db:seed`。种子可重复运行，不覆盖已有用户资源。
3. 部署前确认 Redis 与任务中心 worker 可用，核对 DQ、物化、SLA、填报四类 handler 已注册；监控失败率、队列深度、数据库只读查询超时与存储增长。
4. 环境 `baseUrl/config` 不存密钥；数据源凭据仍由既有加密字段管理。生产环境发布只使用审批快照。
5. 回滚应用前先确认数据库迁移是否向后兼容；资源晋级失败使用环境回滚状态机，不直接改生产快照。
