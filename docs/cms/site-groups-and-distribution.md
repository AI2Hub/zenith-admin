# 站群层级、继承与内容分发

CMS 站群是平台级全局能力，不带 `tenant_id`，涵盖**站点层级、显式配置继承、受治理内容分发**三块；多语言关联、专题和插件不属于本模块的数据模型。

## 站点层级

`cms_sites.parent_id` 形成父子树，根站点为 `null`，站点 `code` 继续全局唯一。

- 根深度为 1，最大 8 层。
- 移动以整棵子树为单位，在事务和全局层级 advisory lock 内检查目标父级、环、子树高度和状态。
- 启用子站点要求全部祖先启用；停用父站点前必须先停用全部子站点。站点仍被启用中的分发规则引用时也禁止停用。
- 有子站点、栏目或分发规则引用的站点不能删除，不做隐式级联。
- 非平台超管仍必须在 `cms_site_users` 显式绑定。树、继承链、移动和整组发布不会静默裁剪越权站点；开放应用使用独立的 site/channel grant，不继承后台用户权限。

接口：

- `GET /api/cms/sites/tree`
- `GET /api/cms/sites/{id}/inheritance-chain`
- `PUT /api/cms/sites/{id}/parent`
- `POST /api/cms/publishing/group-submit`

整组发布先校验全部目标站点和栏目 ACL，再为每个启用站点提交独立 `cms-publish-build`。每个任务携带提交时的 `themeRevision`、`templateRefsRevision` 与 `publicRevision` 栅栏；worker 在站点发布锁内、每次写产物前复验，任一修订不一致即把旧任务标记为过期并停止写入。任务可取消、恢复和重试，但不能绕过修订栅栏。

## 显式逐项继承

继承开关存于 `cms_site_inheritances`（`PUT /api/cms/sites/{id}/inheritance` 维护），值仍保存在各站点自身。resolver 不做不可见的 JSON 魔法合并，而是对每一项沿父链选择唯一来源（`CMS_SITE_INHERITABLE_FIELDS`，共 10 项）：

| 继承项 | 覆盖的值 |
|---|---|
| `seoTitle` / `seoKeywords` / `seoDescription` | SEO 标题 / 关键词 / 描述，三项分别选择来源 |
| `staticMode` | 静态化模式 |
| `reviewMode` | `auditMode` 与 `auditWorkflowDefinitionId` 作为一组（审核模式 + 工作流定义） |
| `webhook` | `webhookUrl` 与 `webhookSecret` 作为一组 |
| `cdn` | `cdnPurgeUrl` 与 `cdnPurgeToken` 作为一组 |
| `theme` | 主题 code |
| `themeConfig` | `themeConfig` 与主题色/暗色配置 |
| `templates` | `defaultTemplates`（站点级默认模板） |

开关关闭表示 `own`，开启表示 `inherited`。恢复本站覆盖时，站点自身保存的值重新生效。根站点不能开启继承。

`GET /api/cms/sites/{id}/effective-config` 返回 `resolved + sources`。Webhook secret、CDN token 等敏感值只返回 `********` 或 `null`；即使来源是无权查看的父站点，也不返回父级名称/id 或明文 secret。

运行时、静态化、审核、Webhook、CDN、主题健康检查和模板选择器共用有效配置 resolver。继承策略或父级有效配置变化按影响类型递增 `themeRevision` 或 `templateRefsRevision`，并以事务 outbox 提交站点重建；整站/主题公开快照另使用 `publicRevision` 作为部署屏障。失效任务不会覆盖更新后的配置或静态产物。

### 主题与模板解析顺序

主题来源由 `theme` 继承项决定：主题 code 取该来源站点，主题参数与站点默认模板分别由 `themeConfig`、`templates` 继承项独立选择来源，三者可以指向不同祖先。

主题本体为仓库内置可信 React TSX 主题（无 DB 模板表），页面渲染的模板解析链（内容/栏目级覆盖 → 站点有效 `defaultTemplates` → 主题默认模板）见 [主题与模板开发](./themes#变体模板与解析链)；解析所用的站点配置一律取继承 resolver 的有效值，因此子站点开启 `templates` 继承后自动沿用父站点的默认模板配置，恢复本站覆盖时本站原值重新生效。

## 受治理内容分发

规则存于 `cms_distribution_rules`，执行记录与行级结果复用任务中心 `async_tasks` / `async_task_items`，不创建第二套任务状态表。

规则包含：

- 来源站点及可选来源栏目；
- 目标站点和目标栏目；
- `copy`（独立草稿）、`mapping`（目标站本地快照 + 来源关系）、`scheduled`（Cron 物化同步）；
- `skip`、`overwrite`、`create-new` 冲突策略；
- 内容形态、关键词和发布时间过滤；
- 启停状态、Cron、下一次/最近执行时间和 revision。

安全约束：

- 来源和目标站点/栏目均执行 fail-closed ACL；来源与目标不能同站，站点必须启用。
- 固定只读取 `published`、未回收、未归档、未过期且主栏目自身及全部祖先栏目有效启用的来源内容，草稿不会跨站泄露；目标栏目必须是有效启用的列表栏目。
- 新内容始终是 `draft`，必须走目标站点审核/发布管道。
- HTML 每次物化均经过 `sanitizeCmsHtml`；素材句柄按目标站点重映射，跨站句柄不会直接写入目标内容。
- 目标持久锁存在时，所有冲突策略都拒绝覆盖。
- 已发布目标更新复用 `updateCmsContent`，保留版本、操作日志、发布 outbox 和静态产物清理语义。
- `rule + source content` 唯一物化索引、来源 version 和任务幂等键共同提供有限幂等。
- 规则 revision 变化会协作取消旧任务；任务按来源 id 排序保存 checkpoint，支持断点、取消、重试和行级结果。
- 删除规则保留物化内容；映射内容先在同一事务内复制最后正文并解除映射。映射目标被锁定时拒绝删除规则。

`mapping` 在目标站保存完整正文、扩展字段和媒体的本地快照，`mappingSourceId` 只用于治理和同步关系，公开请求不会跨站读取来源正文。来源更新后由系统身份提交异步跟随任务；目标若已发布，会重新进入增量发布 outbox，任务完成后正文与静态产物一起更新。来源不再满足规则时，未锁定且已发布的目标会下线，其他状态的目标保持原状态，均保留并物化最后快照后解除映射；已锁定目标则保留映射并记录冲突。删除规则时解除映射。跨站媒体先登记到目标站并改写素材句柄。

### 三方差异合并

同步按「上次同步快照（base）+ 目标当前值（target）+ 来源新值（incoming）」做三方合并，而不是简单覆盖：

- 字段只有来源改过（或目标与来源相同）时自动采用来源值
- 来源与目标都改过的字段是**冲突**，自动同步不写入，改由人工处置
- 目标站自有的字段（`targetOwnedFields`）永不被来源改写

冲突处置：`GET /api/cms/editorial/{id}/distribution-conflict` 返回 base / target / incoming 三方取值与 `targetOwnedFields`；`POST` 同一路径携带 `expectedVersion` 与逐字段 `source` / `target` 选择，生成一条新的工作稿（仍需按目标站审核发布），不直接改变线上内容。

接口：

- `GET/POST /api/cms/distributions`
- `GET/PUT/DELETE /api/cms/distributions/{id}`
- `POST /api/cms/distributions/{id}/run`
- `GET /api/cms/distributions/runs`、`GET /api/cms/distributions/runs/{id}`
- `GET/POST /api/cms/editorial/{id}/distribution-conflict`（映射目标的三方差异与合并）

定时扫描由系统调度任务 `cms-distribution-schedule` 每分钟执行，到期后仅提交任务中心任务。同步明细通过导出中心实体 `cms.distribution-runs` 导出。

## 站点导入导出

站点操作的导出包版本为 `2`，包含站点配置、平台共享/站点专属模型及字段、栏目树（含模型、静态化模式与详情归档规则）、标签、素材文件夹与登记、内容及标签/副栏目/相关文章关联、友链分组与友链、重定向、内链词、广告位与广告、表单、互动问卷定义与题目、搭建页面、页面部件和主题插槽引用。访问/搜索日志、搜索推送日志、采集执行记录、广告事件、评论、表单提交、互动答卷、会员订阅、版本历史、操作日志和用户绑定不在包内；映射型内容导出为独立快照，不跨环境保留来源关系。

导入时按模型 `code`、素材句柄和各实体 id 建立映射，站点 `code` 冲突自动追加序号；站点专属模型发生目标环境 code 冲突时安全重命名并返回 warning。内容统一落为草稿并清除发布时间、计划发布时间和归档状态，页面部件与互动问卷也统一落为草稿，需重新审核/发布。栏目模型与静态规则、友链分组、页面 `path`/首页标记、页面区块和部件来源均恢复并重映射。

包内不含编辑与治理历史：工作稿、修订与审批轮次、批注、反馈办理记录、素材文件版本与媒体处理结果、素材授权（来源/许可/到期/撤权）与语言变体关系均不迁移。导入内容按目标环境当前已发布模型版本重新固化，素材按新站点重新登记（需重新处理与维护授权）。

站点域名、默认站点标记、父站继承关系、源站点/栏目用户绑定和主题插槽绑定不迁移；非平台管理员导入时仅按当前操作者权限为目标站点/栏目创建必要的初始访问绑定。分析标识、Webhook/CDN/搜索推送配置、验证码密钥等环境绑定值也不导入。主题插槽数量写入 `skipped.widgetSlots`，其余需处理事项写入 `warnings`，前端必须展示。导入过程对数组规模、唯一 id、模型定义、HTML、模板、链接、路径、素材句柄和所有实体引用执行严格校验，任一映射或校验失败整体回滚。

## 权限

- 站群：`cms:site:hierarchy`
- 整组发布：`cms:publish:group`
- 分发：`cms:distribution:list|create|update|delete|run|export`
