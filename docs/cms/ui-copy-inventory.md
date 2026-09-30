# CMS 内容管理提示文案盘点

首次盘点日期：2026-10-01。下方保留清理前的 260 条基准清单，来源行号为首次盘点时的坐标。

后续处理：2026-10-01 已按授权移除 **26 处冗余 Banner 提示**（25 个 Banner 节点及 1 个条件文案分支）。完整处理明细见文末“Banner 清理结果”。

本次记录 **260 条文案或动态呈现点**：常驻说明 68 条、字段帮助 108 条、条件提醒 84 条。范围覆盖菜单 seed 中 CMS 目录的 **26 个可见一级菜单**、29 个路由页面及其内部组件，共扫描 102 个非测试 TSX 文件；另展开 4 个内置主题定义中的 9 条字段帮助。

计数按源码呈现点及显示分支记录：同一字段的不同分支分条记录；共享组件只登记一次，同时注明复用入口。动态 API 检查消息按呈现点记录，不把每条可能返回的消息计算为独立文案。

## 与截图最接近的实现说明

截图文案位于内容分发的“分发规则” Tab，来源为 `DistributionPage.tsx:354`。下表集中列出含明显实现术语的 14 条，便于优先审阅。术语本身不表示文案应移除，表单语法与权限规则也可能属于操作所需帮助。

| 编号 | 页面 / 位置 | 完整文案 | 来源 |
| --- | --- | --- | --- |
| CMS-H021 | 站点管理 · 审核与 Webhook Form.Section 说明标题 | Webhook（内容发布/下线/回收时向外部系统推送事件） | `sites/SiteEditSheet.tsx:503` |
| CMS-H023 | 站点管理 · 审核与 Webhook Form.Section 说明标题 | CDN 刷新（静态页更新后向 purge webhook 推送变更路径） | `sites/SiteEditSheet.tsx:511` |
| CMS-H025 | 站点管理 · 扩展模型 → 绑定模型字段 extraText | 绑定后可为站点维护自定义字段，主题通过 site.extend.{字段标识} 读取 | `sites/SiteEditSheet.tsx:532` |
| CMS-H029 | 站点管理 · 内容策略 → 允许开放 API 直接发布字段 extraText | 开启后仍需应用具备 cms:publish scope 且授权行允许直接发布 | `sites/SiteEditSheet.tsx:580` |
| CMS-H037 | 站点管理 · 失效模板引用 Banner | 主题「{selectedTheme}」下存在 {externalInvalidRefs.length} 处失效模板引用；内置主题会回退默认模板，签名 DSL 主题将明确渲染失败：<br>{最多前 8 处引用：可选“栏目「{channelName}」”前缀 + {location}「{template}」+ 内容来源时可选“（{count} 条内容）”}<br>{超过 8 处时：等共 {externalInvalidRefs.length} 处…}<br>请到栏目管理 / 内容编辑中调整对应模板配置。 | `sites/SiteEditSheet.tsx:685` |
| CMS-H042 | 站点管理 · 抽屉顶部 Banner | 开关开启表示该项沿父级链解析；关闭表示使用本站覆盖值。Webhook/CDN 密钥仅显示掩码，继承不会回显父级明文。 | `sites/SiteInheritanceSheet.tsx:77` |
| CMS-H043 | 站点管理 · 弹窗顶部 Banner | 移动会保留整棵子树；系统会阻止环与超过 8 层的移动，并为受影响站点提交 fenced 重建任务。 | `sites/SiteMoveModal.tsx:51` |
| CMS-H049 | 栏目管理 · 静态化模式字段 extraText | 选择「动态渲染」后本栏目不产出静态文件，始终走 SSR | `ChannelsPage.tsx:490` |
| CMS-H095 | 内容管理 · SEO → 社交图片说明 placeholder | 用于 og:image:alt / twitter:image:alt | `ContentEditPage.tsx:1164` |
| CMS-H155 | 检索管理 · 搜索热词 Tab 顶部 Banner | 统计前台搜索框的关键词频次（Redis 累计），可用于运营选题与内链词建设。 | `SearchAdminPage.tsx:351` |
| CMS-H160 | 表单管理 · 编辑表单→字段定义→自定义校验 | 自定义规则由服务端 RE2JS 线性时间引擎编译执行（最长 200 字符）；不支持反向引用等非 RE2 语法。 | `FormsPage.tsx:269` |
| CMS-H185 | 页面搭建 · 权限抽屉顶部 Typography.Paragraph | 未配置授权时继承页面编辑权限；配置任一授权后采用 fail-closed，仅获授权用户/角色及平台超管可管理。 | `PagesPage.tsx:686` |
| CMS-H213 | 访问统计 · 采集质量 Tab→投递明细侧栏顶部 Banner | 重新投递使用原事件 ID 幂等入库；已入库记录仅重新计算归因。自动重试采用指数退避，连续失败 12 次后等待人工处理。 | `stats/CmsTelemetryDeliveries.tsx:47` |
| CMS-H250 | 内容分发 · 分发规则 Tab 顶部 Banner | 仅同步已发布内容；所有写入都先校验来源与目标 ACL。copy 生成独立草稿，mapping 生成正文跟随的映射草稿，scheduled 按 Cron 提交任务。 | `DistributionPage.tsx:354` |

## 分布与重复主题

| 类型 | 数量 | 记录口径 |
| --- | ---: | --- |
| 常驻说明 | 68 | 打开对应页面、Tab、侧栏或弹窗后正常展示的 Banner、说明段和指标口径 |
| 字段帮助 | 108 | extraText、说明性分组标题、规则型 placeholder、长 tooltip/title、主题参数 description |
| 条件提醒 | 84 | 权限、版本、锁定、配置状态、依赖、校验、指标覆盖等条件触发的提醒 |

1. **保存、审核、构建、激活的生效阶段**在内容编辑状态栏、模型编辑、主题插槽、页面预设、发布单、交付验证及共享配置状态组件中反复解释。它们涉及内容修订与配置两种对象，需要结合具体入口阅读。
2. **统计口径**分布在访问统计总览、来源、搜索、转化、采集质量、投递明细和编辑事项复盘；成功转化、归因、预览排除、覆盖区间有多处重复。
3. **访问与编辑权限**同时出现在站点用户授权、栏目授权、开放应用授权和页面区块权限中，分别对应不同授权边界。
4. **版本不自动替换既有内容**在模型、复用组件、页面预设与媒体处理中重复出现。
5. **生效时机表述待核实**：检索管理自定义词典 Banner 写“新增/修改即时对新内容生效”，同义词字段帮助写“随站点发布版本生效”。这里仅记录两处表述差异，尚未核查对应服务端行为，不能据此判定业务实现矛盾。

## 菜单覆盖

下表数量是归入该入口的主记录数；共享预览、字段和配置状态另列，不重复累加。来信办理组件在内容工作台及表单管理复用，主记录归入内容工作台。

| 菜单 | 路径 | 主记录数 | 覆盖说明 |
| --- | --- | ---: | --- |
| 数据看板 | `/cms/dashboard` | 1 | 包含主页面及其相关编辑/配置界面 |
| 站点管理 | `/cms/sites` | 46 | 包含主页面及其相关编辑/配置界面 |
| 栏目管理 | `/cms/channels` | 10 | 包含主页面及其相关编辑/配置界面 |
| 内容管理 | `/cms/contents` | 53 | 包含主页面及其相关编辑/配置界面；包含隐藏内容编辑路由 |
| 素材中心 | `/cms/resources` | 9 | 包含主页面及其相关编辑/配置界面 |
| 内容模型 | `/cms/models` | 10 | 包含主页面及其相关编辑/配置界面 |
| 标签管理 | `/cms/tags` | 0 | 已检查，本次口径未发现独立的说明型文案 |
| 受控分类 | `/cms/taxonomy` | 2 | 包含主页面及其相关编辑/配置界面 |
| 内容集合 | `/cms/content-collections` | 4 | 包含主页面及其相关编辑/配置界面 |
| 内容工作台 | `/cms/workspace` | 15 | 包含主页面及其相关编辑/配置界面 |
| 友情链接 | `/cms/friend-links` | 1 | 包含主页面及其相关编辑/配置界面 |
| 检索管理 | `/cms/search` | 4 | 包含主页面及其相关编辑/配置界面 |
| SEO 管理 | `/cms/seo` | 4 | 包含主页面及其相关编辑/配置界面 |
| 评论管理 | `/cms/comments` | 0 | 已检查，本次口径未发现独立的说明型文案 |
| 广告管理 | `/cms/ads` | 0 | 已检查，本次口径未发现独立的说明型文案 |
| 表单管理 | `/cms/forms` | 1 | 包含主页面及其相关编辑/配置界面；来信办理说明另见内容工作台 |
| 敏感词库 | `/cms/sensitive-words` | 1 | 包含主页面及其相关编辑/配置界面 |
| 采集中心 | `/cms/collect` | 2 | 包含主页面及其相关编辑/配置界面 |
| 页面部件 | `/cms/widgets` | 2 | 包含主页面及其相关编辑/配置界面；包含隐藏部件编辑路由 |
| 页面搭建 | `/cms/pages` | 20 | 包含主页面及其相关编辑/配置界面 |
| 易错词库 | `/cms/error-prone-words` | 0 | 已检查，本次口径未发现独立的说明型文案 |
| 互动问卷 | `/cms/interactions` | 9 | 包含主页面及其相关编辑/配置界面；包含隐藏互动设计路由 |
| 访问统计 | `/cms/stats` | 30 | 包含主页面及其相关编辑/配置界面 |
| 发布中心 | `/cms/publishing` | 25 | 包含主页面及其相关编辑/配置界面 |
| 会员订阅 | `/cms/subscriptions` | 0 | 已检查，本次口径未发现独立的说明型文案 |
| 内容分发 | `/cms/distribution` | 1 | 包含主页面及其相关编辑/配置界面 |
| 共享配置状态 | 多入口复用 | 5 | 记录一次，调用面见下文 |
| 共享预览与字段 | 多入口复用 | 5 | 记录一次，调用面见下文 |

## 共享提示的实际调用面

- `CmsConfigurationNotice`：栏目管理 `ChannelsPage.tsx:765`；站点编辑 `sites/SiteEditSheet.tsx:400`；建站工作区 `sites/CmsSiteWorkspace.tsx:38`；页面搭建 `PagesPage.tsx:621`；部件编辑 `WidgetEditPage.tsx:533`。不传 kind 时为聚合配置提示，传 kind 时按具体对象展示 online/pending/saved 等状态。
- `CmsWorkbenchPreview`：栏目、内容编辑、页面搭建、站点编辑、建站工作区、部件编辑和发布单使用同一预览侧栏。
- `CmsFeedbackList` / `CmsFeedbackSheet`：内容工作台与表单管理复用来信办理策略和办理流程提示。
- `CmsStatsReport`：多个统计维度复用导出和 UV 口径说明；`CMS_COLLECTION_STATUS` 在统计页面与采集质量面板复用状态文案。
- `CmsAssetField` / `CmsLinkInput`：在内容、页面等表单复用素材或内部链接状态提示；不会把每次复用算成新增一条。

## 完整清单

除完整写出的 server 主题路径外，来源坐标均相对于 `packages/web/src/pages/cms/`。`{…}` 表示运行时变量或动态消息；方括号表示按条件出现的片段。原文仅合并 JSX 排版空白，未替换业务措辞。类别表示呈现方式，不是删除建议。

### 数据看板（1 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H001 | 条件提醒 | 无权限时页面 Banner<br>条件：缺少 cms:dashboard:view 或 cms:site:list | 使用数据看板需要 CMS 看板查询和站点查询权限。 | `CmsDashboardPage.tsx:144` | 权限门槛说明 |

### 站点管理（46 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H002 | 字段帮助 | 编辑站点 → 主题参数 → 默认主题 / 页头联系电话<br>条件：编辑站点选择默认主题，显示主题参数字段 | 显示在页头搜索框左侧，留空不显示 | `packages/server/src/cms/themes/default/index.ts:33` | 主题字段 description，展示位置及留空行为 |
| CMS-H003 | 字段帮助 | 编辑站点 → 主题参数 → 默认主题 / 首页横幅图<br>条件：编辑站点选择默认主题，显示主题参数字段 | 显示在首页顶部，留空不显示 | `packages/server/src/cms/themes/default/index.ts:34` | 主题字段 description，展示位置及留空行为 |
| CMS-H004 | 字段帮助 | 编辑站点 → 主题参数 → 政府门户 / 页头副标题<br>条件：编辑站点选择政府门户主题，显示主题参数字段 | 站名下方的小字，留空不显示 | `packages/server/src/cms/themes/gov-portal/index.tsx:306` | 主题字段 description，展示位置及留空行为 |
| CMS-H005 | 字段帮助 | 编辑站点 → 主题参数 → 政府门户 / 首页栏目区块<br>条件：编辑站点选择政府门户主题，显示主题参数字段 | 逗号分隔栏目标识（最多 6 个）：第 1 个为主栏要闻区块，其余进右侧栏；留空回落全站最新发布 | `packages/server/src/cms/themes/gov-portal/index.tsx:307` | 主题字段 description，格式、上限、布局与缺省规则合并说明 |
| CMS-H006 | 字段帮助 | 编辑站点 → 主题参数 → 政府门户 / 办事入口<br>条件：编辑站点选择政府门户主题，显示主题参数字段 | 首页顶部图标导航（最多 8 个），留空不显示 | `packages/server/src/cms/themes/gov-portal/index.tsx:308` | 主题字段 description，展示位置、上限及留空行为 |
| CMS-H007 | 字段帮助 | 编辑站点 → 主题参数 → 资讯杂志 / 首页栏目区块<br>条件：编辑站点选择资讯杂志主题，显示主题参数字段 | 逗号分隔栏目标识（最多 6 个），每个渲染一行 4 张卡片；留空回落全站最新发布 | `packages/server/src/cms/themes/magazine/index.tsx:315` | 主题字段 description，格式、上限、布局与缺省规则合并说明 |
| CMS-H008 | 字段帮助 | 编辑站点 → 主题参数 → 资讯杂志 / 评分字段标识<br>条件：编辑站点选择资讯杂志主题，显示主题参数字段 | 内容模型中作为评分的字段标识：详情页渲染大评分徽章、卡片渲染角标；留空默认 score | `packages/server/src/cms/themes/magazine/index.tsx:316` | 主题字段 description，包含字段标识、渲染、score 实现术语 |
| CMS-H009 | 字段帮助 | 编辑站点 → 主题参数 → 新闻门户 / 报头口号<br>条件：编辑站点选择新闻门户主题，显示主题参数字段 | 报头下方的口号文字，留空不显示 | `packages/server/src/cms/themes/news-portal/index.tsx:391` | 主题字段 description，展示位置及留空行为 |
| CMS-H010 | 字段帮助 | 编辑站点 → 主题参数 → 新闻门户 / 首页栏目区块<br>条件：编辑站点选择新闻门户主题，显示主题参数字段 | 逗号分隔栏目标识（最多 6 个）：第 1 个为头条+主栏区块，其余按两列区块排布；留空回落全站最新发布 | `packages/server/src/cms/themes/news-portal/index.tsx:392` | 主题字段 description，格式、上限、布局与缺省规则合并说明 |
| CMS-H011 | 条件提醒 | 工作区首页接管说明段<br>条件：查询到 isHome 且 status=enabled 的搭建页面 | 首页由搭建页「{takeover.name}」接管，可进入页面与首页调整区块。主题首页编排在取消接管后生效。 | `sites/CmsSiteWorkspace.tsx:37` | 业务配置优先级说明。 |
| CMS-H012 | 常驻说明 | 首页内容区域编排顶部 Typography.Text<br>条件：主题配置字段类型为 home-sections 时 | 拖动把手或使用上下移调整顺序。宽屏双列、手机单列，每区最多 24 条。 | `sites/HomeSectionsEditor.tsx:33` | 操作方法、响应式表现与限制混写。 |
| CMS-H013 | 常驻说明 | 模型展示方案编排顶部 Typography.Text<br>条件：主题配置字段类型为 model-displays 时 | 绑定已发布模型字段。卡片使用每篇内容固定的模型版本；必填映射和字段类型在保存时检查。 | `sites/ModelDisplaysEditor.tsx:13` | 固定模型版本与校验实现说明。 |
| CMS-H014 | 条件提醒 | 模型展示方案行尾警告文字<br>条件：validateCmsModelDisplay(row, model) 返回 issues.length &gt; 0 | {模型展示规则 issues，以“；”连接} | `sites/ModelDisplaysEditor.tsx:26` | 动态校验原文由 shared validateCmsModelDisplay 定义，组件内没有固定文字。 |
| CMS-H015 | 常驻说明 | 抽屉顶部 Banner<br>条件：打开蓝图建站抽屉 | 蓝图准备默认主题、栏目、模型、页面、常用部件和反馈表单。完成内容编辑后，通过发布单审阅并上线。 | `sites/SiteBlueprintSheet.tsx:20` | 业务流程说明，提示创建与上线分离。 |
| CMS-H016 | 字段帮助 | 站点标识字段 extraText<br>条件：打开蓝图建站抽屉 | 小写字母、数字和中划线，用于站点访问路径。 | `sites/SiteBlueprintSheet.tsx:24` | 输入规则与用途说明。 |
| CMS-H017 | 条件提醒 | 抽屉顶部 Banner<br>条件：新增模式且 preparedImages.images.length &gt; 0 | 已准备 {preparedImages.images.length} 张图片，将在保存站点后上传；关闭窗口会放弃尚未上传的本地文件。 | `sites/SiteEditSheet.tsx:402` | 本地图片保存时机和关闭影响提醒。 |
| CMS-H018 | 字段帮助 | 基础信息 → 站点图标字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 用于浏览器标签页，建议使用正方形 PNG、SVG 或 ICO 图片。 | `sites/SiteEditSheet.tsx:453` | 图片规格说明。 |
| CMS-H019 | 字段帮助 | 基础信息 → 默认站点字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 未匹配到域名的请求兜底到默认站点 | `sites/SiteEditSheet.tsx:464` | 域名匹配规则。 |
| CMS-H020 | 字段帮助 | SEO 与推送 Form.Section 说明标题<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 搜索推送（配置后发布内容自动推送搜索引擎） | `sites/SiteEditSheet.tsx:477` | 配置作用说明嵌在分组标题。 |
| CMS-H021 | 字段帮助 | 审核与 Webhook Form.Section 说明标题<br>条件：抽屉对应 Tab；Tabs 保留 DOM | Webhook（内容发布/下线/回收时向外部系统推送事件） | `sites/SiteEditSheet.tsx:503` | Webhook 与事件推送术语。 |
| CMS-H022 | 字段帮助 | 审核与 Webhook → 图形验证码字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 开启后前台游客提交评论/自定义表单需完成算术验证码（登录会员免验证） | `sites/SiteEditSheet.tsx:509` | 游客与会员提交行为。 |
| CMS-H023 | 字段帮助 | 审核与 Webhook Form.Section 说明标题<br>条件：抽屉对应 Tab；Tabs 保留 DOM | CDN 刷新（静态页更新后向 purge webhook 推送变更路径） | `sites/SiteEditSheet.tsx:511` | purge webhook 属实现术语。 |
| CMS-H024 | 字段帮助 | 审核与 Webhook Form.Section 说明标题<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 多语言站点关联（前台输出 hreflang 与语言切换） | `sites/SiteEditSheet.tsx:516` | hreflang 属输出协议术语。 |
| CMS-H025 | 字段帮助 | 扩展模型 → 绑定模型字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 绑定后可为站点维护自定义字段，主题通过 site.extend.{字段标识} 读取 | `sites/SiteEditSheet.tsx:532` | site.extend 是主题代码读取路径，业务作用与实现说明混写。 |
| CMS-H026 | 字段帮助 | 内容策略 → 已发布内容可编辑字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 关闭后已发布内容需先下线才能修改 | `sites/SiteEditSheet.tsx:559` | 编辑规则。 |
| CMS-H027 | 字段帮助 | 内容策略 → 回收站保留天数字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 超期由每日周期任务彻底删除；0 = 永久保留 | `sites/SiteEditSheet.tsx:563` | 彻底删除时机及数值语义。 |
| CMS-H028 | 字段帮助 | 内容策略 → 重建列表页数上限字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 单条内容发布时最多重建栏目前 N 页；0 = 全部重建 | `sites/SiteEditSheet.tsx:571` | 发布性能策略。 |
| CMS-H029 | 字段帮助 | 内容策略 → 允许开放 API 直接发布字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 开启后仍需应用具备 cms:publish scope 且授权行允许直接发布 | `sites/SiteEditSheet.tsx:580` | scope 与授权行属实现/权限术语；与开放授权顶部重复说明。 |
| CMS-H030 | 字段帮助 | 内容策略 → 自动替换敏感词字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 按敏感词库替换标题/摘要/正文；命中拦截词仍会拒绝保存 | `sites/SiteEditSheet.tsx:587` | 自动处理与拦截规则。 |
| CMS-H031 | 字段帮助 | 内容策略 → 自动替换易错词字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 按易错词库将常见错词替换为正确写法 | `sites/SiteEditSheet.tsx:591` | 自动处理范围。 |
| CMS-H032 | 字段帮助 | 内容策略 → 正文首图作封面字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 未填写封面图时，保存自动提取正文第一张图片 | `sites/SiteEditSheet.tsx:595` | 封面自动填充规则。 |
| CMS-H033 | 字段帮助 | 主题与图片 → 主题色字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 留空使用主题默认色 | `sites/SiteEditSheet.tsx:612` | 空值语义。 |
| CMS-H034 | 字段帮助 | 主题与图片 Form.Section 说明标题<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 图片处理（编辑器/封面上传时生效） | `sites/SiteEditSheet.tsx:627` | 配置生效时机嵌在标题。 |
| CMS-H035 | 字段帮助 | 主题与图片 → 最大宽度(px)字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 超宽等比压缩，0 = 不限制 | `sites/SiteEditSheet.tsx:630` | 图片缩放规则与数值语义。 |
| CMS-H036 | 字段帮助 | 主题与图片 → 缩略图宽度(px)字段 extraText<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 开启缩略图后生效 | `sites/SiteEditSheet.tsx:638` | 字段生效条件。 |
| CMS-H037 | 条件提醒 | 失效模板引用 Banner<br>条件：externalInvalidRefs.length &gt; 0 | 主题「{selectedTheme}」下存在 {externalInvalidRefs.length} 处失效模板引用；内置主题会回退默认模板，签名 DSL 主题将明确渲染失败：<br>{最多前 8 处引用：可选“栏目「{channelName}」”前缀 + {location}「{template}」+ 内容来源时可选“（{count} 条内容）”}<br>{超过 8 处时：等共 {externalInvalidRefs.length} 处…}<br>请到栏目管理 / 内容编辑中调整对应模板配置。 | `sites/SiteEditSheet.tsx:685` | 拼出完整主文与动态列表语义；签名 DSL/回退机制偏实现，但失效引用提醒必要。 |
| CMS-H038 | 字段帮助 | 模板与主题 Form.Section 说明标题<br>条件：抽屉对应 Tab；Tabs 保留 DOM | 默认模板（栏目/内容未指定模板时的站点级兜底；留空 = 主题默认） | `sites/SiteEditSheet.tsx:697` | 模板回退规则。 |
| CMS-H039 | 条件提醒 | Logo/站点图标/主题图片上传控件下方<br>条件：存在 prepared 且 uploadedValue 有值 | {prepared.file.name} · 图片已上传，保存后完成关联 | `sites/SiteImageInput.tsx:18` | 文件名动态；上传后仍需保存关联提醒。 |
| CMS-H040 | 条件提醒 | Logo/站点图标/主题图片上传控件下方<br>条件：存在 prepared 且 uploadedValue 无值 | {prepared.file.name} · 已准备，保存站点后上传 | `sites/SiteImageInput.tsx:18` | 文件名动态；尚未上传状态提醒。 |
| CMS-H041 | 字段帮助 | Logo/站点图标/主题图片上传控件下方<br>条件：无 siteId 且尚无 prepared 文件 | 可先选择图片。点击保存并成功创建站点后，才会上传图片。 | `sites/SiteImageInput.tsx:19` | 多个图片字段复用同一提示；上传时机说明。 |
| CMS-H042 | 常驻说明 | 抽屉顶部 Banner<br>条件：打开继承配置抽屉 | 开关开启表示该项沿父级链解析；关闭表示使用本站覆盖值。Webhook/CDN 密钥仅显示掩码，继承不会回显父级明文。 | `sites/SiteInheritanceSheet.tsx:77` | 继承规则与凭据安全说明混在一段；Webhook/CDN 偏技术。 |
| CMS-H043 | 常驻说明 | 弹窗顶部 Banner<br>条件：打开移动站点弹窗 | 移动会保留整棵子树；系统会阻止环与超过 8 层的移动，并为受影响站点提交 fenced 重建任务。 | `sites/SiteMoveModal.tsx:51` | fenced 属于实现术语；子树/层数/重建影响有业务价值。 |
| CMS-H044 | 常驻说明 | 弹窗顶部灰色说明段<br>条件：打开站点开放授权弹窗 | 开放应用持有 cms:write 只代表能调写接口，能写哪个站点由此处决定：**未在此授权的应用一律拒绝**。栏目留空表示该站点全部栏目。「允许直接发布」还需应用同时持有 cms:publish，且在站点编辑 →「内容策略」中开启「允许开放 API 直接发布」。 | `sites/SiteOpenGrantsModal.tsx:57` | 完整跨行文字；cms:write/cms:publish 是权限术语；源码中的 ** 是字面文本，不会转成加粗。 |
| CMS-H045 | 常驻说明 | 抽屉顶部 Banner<br>条件：打开有站点对象的静态化抽屉 | 全站静态化会将首页、全部栏目分页、全部已发布内容、sitemap.xml、robots.txt 渲染为静态 HTML 文件。当前有效静态化模式：{当前有效静态化模式中文标签}。混合模式下内容发布时已自动增量生成，全量生成用于模板/导航变更后的整站刷新（主题代码变更已由系统自动检测重建）。 | `sites/SiteStaticSheet.tsx:48` | 合并完整跨行文字；模式取 effectiveConfig.resolved.staticMode，未返回时取站点值。HTML/增量生成偏实现。 |
| CMS-H046 | 常驻说明 | 弹窗顶部灰色说明段<br>条件：打开站点授权用户弹窗 | 绑定用户后，仅超管与授权用户可管理该站点；不绑定任何用户则全员（有 CMS 权限者）可管理。 | `sites/SiteUsersModal.tsx:56` | 权限效果说明，和栏目/区块权限说明同类。 |
| CMS-H047 | 常驻说明 | 每个主题页面部件插槽行尾说明<br>条件：siteId 存在、用户有 cms:widget:list、主题返回插槽后 | 保存后加入配置草稿，构建并激活后上线。 | `sites/ThemeWidgetSlotsEditor.tsx:21` | 各插槽重复出现；与共享配置上线 Banner 重复发布流程。 |

### 栏目管理（10 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H048 | 字段帮助 | 栏目表中“隐藏”标签 Tooltip<br>条件：栏目 visible=false | 不在前台导航中显示 | `ChannelsPage.tsx:392` | 简短业务状态解释。 |
| CMS-H049 | 字段帮助 | 静态化模式字段 extraText<br>条件：栏目类型不是外链（channelType !== link） | 选择「动态渲染」后本栏目不产出静态文件，始终走 SSR | `ChannelsPage.tsx:490` | SSR 是实现术语；模式效果说明。 |
| CMS-H050 | 字段帮助 | 详情页归档字段 extraText<br>条件：栏目类型为列表（channelType=list） | 按日期/散列把详情页打散到子目录；内容自填静态路径时不生效。改动后需整站重建 | `ChannelsPage.tsx:504` | 静态路径规则与重建影响。 |
| CMS-H051 | 字段帮助 | 绑定表单字段 extraText<br>条件：栏目类型为单页（channelType=page） | 可选；表单显示在单页正文下方。切换栏目类型会清除绑定。 | `ChannelsPage.tsx:519` | 表单放置与类型切换影响。 |
| CMS-H052 | 字段帮助 | 模板配置 Form.Section 标题<br>条件：栏目类型为列表 | 模板配置（留空逐级回退：栏目 → 站点默认 → 主题默认） | `ChannelsPage.tsx:529` | 模板回退规则。 |
| CMS-H053 | 字段帮助 | 列表模板“保存后预览”按钮 title<br>条件：已有 editingRecord，栏目类型为列表 | 以当前选中模板试穿预览栏目列表页（不影响线上） | `ChannelsPage.tsx:539` | 原生悬停提示；“试穿”偏技术/设计术语。 |
| CMS-H054 | 字段帮助 | 详情模板“保存后预览”按钮 title<br>条件：已有 editingRecord，栏目类型为列表 | 以当前选中模板试穿预览最新一篇已发布内容（不影响线上） | `ChannelsPage.tsx:552` | 原生悬停提示，说明预览对象与线上影响。 |
| CMS-H055 | 字段帮助 | SEO 设置 Form.Section 标题<br>条件：编辑/新增栏目表单 | SEO 设置（留空继承站点默认） | `ChannelsPage.tsx:560` | 空值继承规则。 |
| CMS-H056 | 字段帮助 | 栏目名称 TextArea placeholder<br>条件：打开批量新增栏目弹窗 | 每行一个栏目，支持「名称&#124;slug」显式指定标识，如：<br>政务公开<br>通知公告&#124;tzgg<br>新闻中心&#124;news<br><br>未指定 slug 时按上方策略自动生成，路径冲突自动加序号 | `ChannelsPage.tsx:732` | 较长规则说明放在 placeholder 中；slug 是技术术语。 |
| CMS-H057 | 常驻说明 | 弹窗顶部灰色说明段<br>条件：打开栏目授权用户弹窗 | 绑定用户后，仅超管与授权用户可管理该栏目下的内容（列表可见性与增删改均受限）；不绑定则不限制。 | `ChannelsPage.tsx:748` | 权限边界说明，与站点授权说明同类。 |

### 内容管理（53 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H058 | 条件提醒 | 正文段落差异 → 结构 / 媒体变化 Banner<br>条件：change.kind 为 changed 且 change.before === change.after | 此段落文字相同，排版、结构或媒体发生了变化。 | `CmsBodyDiff.tsx:13` | 解释文字相同时仍标为差异的原因 |
| CMS-H059 | 常驻说明 | 复核面板顶部说明<br>条件：已保存 content 存在且复核策略成功加载 | 复核面向当前生效的发布修订。巡检发现的问题进入编辑事项，后续按审核发布流程处理。 | `CmsContentReviewPanel.tsx:32` | 复核对象与问题处理链路说明 |
| CMS-H060 | 字段帮助 | 配置复核策略 → 下次复核时间 extraText<br>条件：canManage &amp;&amp; editing | 留空时按复核周期安排。 | `CmsContentReviewPanel.tsx:49` | 字段缺省值业务规则 |
| CMS-H061 | 字段帮助 | 配置复核策略 → 资料有效期 extraText<br>条件：canManage &amp;&amp; editing | 到期会形成处理事项；需要撤下时请走发布中心。 | `CmsContentReviewPanel.tsx:50` | 到期不自动下线的业务规则与路径指引 |
| CMS-H062 | 条件提醒 | 巡检结果 → 业务问题 Banner<br>条件：policy.issues 有问题 | {复核问题类型名称} {issue.summary} | `CmsContentReviewPanel.tsx:60` | 动态巡检业务结果，具体文案来自接口；附编辑事项链接 |
| CMS-H063 | 常驻说明 | 确认人工复核说明<br>条件：canManage &amp;&amp; policy.enabled &amp;&amp; policy.activeRevisionId | 记录核查结论并安排下个周期，符合条件的复核到期事项同步办结。有效期、素材授权和失效链接问题仍需分别处理。 | `CmsContentReviewPanel.tsx:63` | 复核办结范围必要说明 |
| CMS-H064 | 条件提醒 | 人工复核对象变化 Banner<br>条件：可确认人工复核，reviewSubject 存在且在线修订或策略版本与开始填写时不一致 | 填写期间在线修订或复核策略已变化，请重新核查后填写结论。 | `CmsContentReviewPanel.tsx:65` | 防止核查结论误用于新修订的提醒 |
| CMS-H065 | 条件提醒 | 已有正文批注 → 引用变化 Banner<br>条件：note.anchor 存在且 anchorStatus 不是 current / missing | 该段落文字已更新，引用范围需要复核。 | `CmsEditorialNotesPanel.tsx:20` | 批注引用失效的必要提醒 |
| CMS-H066 | 条件提醒 | 已有正文批注 → 原段落缺失 Banner<br>条件：note.anchor 存在且 note.anchorStatus 为 missing | 原段落已删除，保留引用文字供审稿追溯。 | `CmsEditorialNotesPanel.tsx:20` | 批注锚点失效的必要提醒 |
| CMS-H067 | 字段帮助 | 添加批注 → 正文引用下说明<br>条件：canNote 为真，fieldPath 为 body 且 anchor 存在 | 批注记录此段落和原文范围；文字变化后会提示复核。 | `CmsEditorialNotesPanel.tsx:70` | 批注追踪规则，和已有批注变化提醒互补 |
| CMS-H068 | 条件提醒 | 添加批注 → 无效原文引用 Banner<br>条件：canNote 为真，正文 anchor 存在但 anchorValid 为假 | 引用内容必须是所选段落中的原文，请重新选择或修正引用。 | `CmsEditorialNotesPanel.tsx:71` | 引用约束必要提醒 |
| CMS-H069 | 条件提醒 | 协作面板顶部未保存提醒<br>条件：disabled 为真（编辑页传入 saveState !== saved） | 请先保存当前修改，再执行协作中的内容变更。 | `CmsEditorialPanel.tsx:38` | 防止未保存修改丢失的操作前提 |
| CMS-H070 | 条件提醒 | 质量检查成功 Banner<br>条件：quality.data.issues.length 为 0 | 当前稿件通过质量检查。发布前仍会重新校验修订与依赖。 | `CmsEditorialPanel.tsx:44` | 成功状态附带发布校验规则；修订与依赖偏实现术语 |
| CMS-H071 | 条件提醒 | 质量检查 → 问题 Banner<br>条件：quality.data.issues 存在问题；每项按 error / warning 显示 | {字段业务名称} {issue.message} | `CmsEditorialPanel.tsx:48` | 动态业务检查提示，完整具体文案来自接口返回；本次未跨范围展开服务端文案 |
| CMS-H072 | 常驻说明 | 语言变体页签顶部说明<br>条件：打开语言变体页签 | 每种语言独立编辑、审核与发布，来源修订更新后会提示译文需要复核。 | `CmsEditorialPanel.tsx:60` | 语言变体业务规则 |
| CMS-H073 | 常驻说明 | 来源同步页签顶部说明<br>条件：content.distributionSourceId 或 mappingSourceId 存在，打开来源同步页签 | 逐字段比较上次同步基线、当前目标稿与来源新稿。合并只写入工作稿。 | `CmsEditorialPanel.tsx:67` | 基线偏实现术语；与映射内容 Banner 重复 |
| CMS-H074 | 常驻说明 | 切换内容模型页签顶部 Banner<br>条件：打开切换内容模型页签 | 切换内容模型会重新映射扩展字段；图文、图集、音视频、外链属于创建时确定的内容形态。请先预览字段映射、校验问题与移除影响，再保存模型切换工作稿。 | `CmsEditorialPanel.tsx:76` | 较长规则说明，模型 / 形态 / 字段映射混写 |
| CMS-H075 | 条件提醒 | 模型切换预览 → 问题 Banner<br>条件：previewConversion.data 存在且 issues 非空 | {目标字段业务名称}：{issue.message} | `CmsEditorialPanel.tsx:81` | 动态业务校验提示，具体文案来自接口返回 |
| CMS-H076 | 条件提醒 | 模型切换预览 → 移除字段说明<br>条件：previewConversion.data 存在 | 将移除字段：{droppedFields 的业务名称，以 、 分隔；无字段时为 无} | `CmsEditorialPanel.tsx:82` | 字段丢失影响必要提醒 |
| CMS-H077 | 字段帮助 | 模型自定义富文本字段 placeholder<br>条件：模型字段为 richtext 且未自定义 field.placeholder | 支持 HTML | `ContentEditPage.tsx:109` | 格式能力说明；HTML 技术术语 |
| CMS-H078 | 常驻说明 | 顶部线上 / 工作稿状态栏<br>条件：内容编辑页面常驻 | 保存后留在工作稿，完成审核与发布后上线。 | `ContentEditPage.tsx:813` | 业务关键：保存与上线的区别；与其他工作稿说明重复 |
| CMS-H079 | 条件提醒 | 顶部预览链接 Banner<br>条件：lastPreview 存在（生成预览链接后） | 预览固定修订 #{lastPreview.revisionId} · 有效至 {lastPreview.expiresAt} | `ContentEditPage.tsx:830` | 固定修订与链接期限提示，动态占位保留 |
| CMS-H080 | 条件提醒 | 顶部浏览器恢复副本 Banner<br>条件：recovery.storageError 为真 | 浏览器无法保存恢复副本，请及时手动保存到服务器。 | `ContentEditPage.tsx:832` | 防丢稿提醒，虽为失败场景但具有业务必要性 |
| CMS-H081 | 条件提醒 | 顶部恢复未保存工作稿 Banner<br>条件：recovery.pending 存在 | 发现本浏览器在 {new Date(recovery.pending.savedAt).toLocaleString()} 保留的未保存工作稿。 | `ContentEditPage.tsx:833` | 防丢稿提醒；同条提供恢复修改 / 丢弃副本 |
| CMS-H082 | 条件提醒 | 顶部协同编辑锁 Banner<br>条件：lockHolder 存在 | {lockHolder.nickname} 正在编辑此内容（{lockHolder.lockedAt} 开始）。继续编辑可能相互覆盖：保存时系统会做版本冲突检测。 | `ContentEditPage.tsx:843` | 协同编辑风险提示；包含版本冲突实现说明 |
| CMS-H083 | 条件提醒 | 顶部持久锁定 Banner<br>条件：isPersistentlyLocked 为真 | 内容已被持久锁定{有操作人时：（操作人：{detail.lockedByName}）}{有锁定原因时：：{detail.lockReason}}。当前仅允许读取、预览和查看历史记录。 | `ContentEditPage.tsx:852` | 权限与操作范围必要提醒；持久锁定偏实现术语 |
| CMS-H084 | 条件提醒 | 顶部只读权限 Banner<br>条件：canUpdateContent 为假 | 当前账号没有内容编辑权限，本页以只读模式打开。 | `ContentEditPage.tsx:861` | 只读状态必要提醒 |
| CMS-H085 | 条件提醒 | 顶部映射来源 Banner<br>条件：isMapped 为真 | 本内容为映射内容（来源：{detail.mappingSourceTitle，缺省为 #detail.mappingSourceId}）。来源更新将形成待合并差异。当前工作稿可独立编辑，请在「协作与质量」中逐字段处理来源与目标冲突。 | `ContentEditPage.tsx:870` | 映射跟随规则与操作指引；与来源同步页说明重复 |
| CMS-H086 | 条件提醒 | 顶部审核驳回 Banner<br>条件：detail.editorialStatus 为 rejected 且 rejectReason 非空 | 驳回原因：{detail.rejectReason} | `ContentEditPage.tsx:877` | 业务反馈；具体原因由后端 / 审核人数据提供 |
| CMS-H087 | 条件提醒 | 内容正文区 → 链接型内容说明 Banner<br>条件：contentType 为 link | 链接型内容：前台列表点击标题直接跳转，不生成详情页。可手输外链，也可用右侧「内部链接」选择站内内容/栏目（目标改 slug 或换栏目时链接自动跟随）。 | `ContentEditPage.tsx:917` | 包含 slug 实现术语，业务规则与操作帮助混写 |
| CMS-H088 | 字段帮助 | 链接型内容 → 链接地址 placeholder<br>条件：contentType 为 link，输入为空 | https://… 或点右侧「内部链接」选择站内内容/栏目 | `ContentEditPage.tsx:922` | 占位附操作路径指引，与链接型内容 Banner 重复 |
| CMS-H089 | 字段帮助 | 信息侧栏 → 基本信息 → 内容模型 extraText<br>条件：新内容没有 id 时 | 内容模型独立于栏目，移动栏目不会改变模型 | `ContentEditPage.tsx:1093` | 模型与栏目关系说明；与复制弹窗说明重复 |
| CMS-H090 | 字段帮助 | 信息侧栏 → 基本信息 → 内容模型 extraText<br>条件：已有内容 id 时 | 在「协作与质量 → 切换内容模型」中预览字段映射后切换 | `ContentEditPage.tsx:1093` | 模型切换路径指引 |
| CMS-H091 | 字段帮助 | 基本信息 → 短标题 placeholder<br>条件：基本信息子页签，输入为空 | 列表窄位展示（可选） | `ContentEditPage.tsx:1129` | 字段用途说明，附可选标记 |
| CMS-H092 | 字段帮助 | 基本信息 → 摘要 placeholder<br>条件：基本信息子页签，输入为空 | 留空时前台自动截取正文 | `ContentEditPage.tsx:1130` | 摘要缺省业务行为 |
| CMS-H093 | 字段帮助 | 归属与来源 → 副栏目 placeholder<br>条件：归属与来源子页签，未选副栏目 | 同时展示在其他栏目（可选） | `ContentEditPage.tsx:1148` | 副栏目展示用途说明，附可选标记 |
| CMS-H094 | 常驻说明 | 信息侧栏 → SEO 顶部说明<br>条件：打开 SEO 子页签 | 留空则继承栏目/站点设置 | `ContentEditPage.tsx:1160` | 继承规则必要说明 |
| CMS-H095 | 字段帮助 | SEO → 社交图片说明 placeholder<br>条件：SEO 子页签，输入为空 | 用于 og:image:alt / twitter:image:alt | `ContentEditPage.tsx:1164` | 字段用途以 SEO 元标签实现名称表述 |
| CMS-H096 | 字段帮助 | 发布计划 → 置顶到期 placeholder<br>条件：发布计划子页签，日期为空 | 到期自动取消置顶 | `ContentEditPage.tsx:1176` | 到期业务行为 |
| CMS-H097 | 字段帮助 | 发布计划 → 定时发布 placeholder<br>条件：发布计划子页签，有 cms:content:publish 权限且日期为空 | 到期自动发布（每分钟检查） | `ContentEditPage.tsx:1187` | 到期业务行为附调度实现周期 |
| CMS-H098 | 字段帮助 | 发布计划 → 定时发布 placeholder<br>条件：发布计划子页签，无 cms:content:publish 权限（字段禁用） | 需要内容发布权限 | `ContentEditPage.tsx:1187` | 字段禁用原因说明 |
| CMS-H099 | 字段帮助 | 发布计划 → 过期下线 placeholder<br>条件：发布计划子页签，日期为空 | 到期自动下线（留空永不过期） | `ContentEditPage.tsx:1196` | 到期与缺省业务行为 |
| CMS-H100 | 字段帮助 | 高级设置 → 自定义 URL 标识 placeholder<br>条件：高级设置子页签，输入为空 | 留空使用 ID | `ContentEditPage.tsx:1200` | URL 标识缺省生成规则，含 ID 实现术语 |
| CMS-H101 | 字段帮助 | 高级设置 → 自定义静态路径 placeholder<br>条件：高级设置子页签，输入为空 | 留空按栏目 + URL 标识生成 | `ContentEditPage.tsx:1205` | 静态路径缺省生成规则，与字段 extraText 互补 |
| CMS-H102 | 字段帮助 | 信息侧栏 → 高级设置 → 自定义静态路径 extraText<br>条件：打开高级设置子页签 | 站内唯一，形如 news/2026/hello.html，仅支持 .html | `ContentEditPage.tsx:1206` | 字段格式与唯一性业务约束 |
| CMS-H103 | 字段帮助 | 高级设置 → 跳转链接 placeholder<br>条件：高级设置子页签，contentType !== link 且输入为空 | 填写后点击标题直接跳转 | `ContentEditPage.tsx:1214` | 填写字段的业务影响，与链接型内容规则相似 |
| CMS-H104 | 字段帮助 | 高级设置 → 详情模板 placeholder<br>条件：高级设置子页签，未选自定义模板 | 跟随栏目/站点默认 | `ContentEditPage.tsx:1224` | 模板缺省继承规则 |
| CMS-H105 | 字段帮助 | 信息侧栏 → 高级设置 → 模板试穿按钮 title<br>条件：打开高级设置子页签，悬浮试穿按钮 | 以当前选中模板试穿预览本文（不影响线上） | `ContentEditPage.tsx:1227` | 操作影响范围必要提醒 |
| CMS-H106 | 常驻说明 | 审批流程页签 → 本次提审预览说明<br>条件：formContent 使用提审预览分支，尚无已加载的实例送审稿件 | 审批流程根据当前站点和栏目确定。内容保存后提交审核，审批期间可在这里查看进度与处理记录。 | `ContentEditPage.tsx:1253` | 流程选择与操作引导 |
| CMS-H107 | 条件提醒 | 工作稿版本冲突弹窗顶部 Banner<br>条件：conflictVisible 为真；冲突处理面板而非确认框 | 服务器已有更新。下面保留原始基稿、服务器最新稿与本地修改；核对后可采用最新版本作为基线继续编辑。 | `ContentEditPage.tsx:1291` | 冲突处理规则必要说明；基线偏技术术语 |
| CMS-H108 | 条件提醒 | 内容检查结果面板 → 敏感词命中处理说明<br>条件：检查结果 sensitive 有命中 | 命中 {hit.count} 次 · {有 replaceWith 时：提交时将被替换为「{hit.replaceWith}」；否则：拦截词，请删除后再提交} | `ContentEditPage.tsx:1428` | 业务校验结果与处理影响提醒 |
| CMS-H109 | 字段帮助 | 内容列表 → 批量跨站分发按钮 title<br>条件：显示批量操作栏及分发按钮时；所选包含未发布内容则按钮禁用 | 仅已发布内容可跨站分发 | `ContentsPage.tsx:753` | 业务限制，按钮悬浮提示 |
| CMS-H110 | 常驻说明 | 复制内容弹窗底部说明<br>条件：打开复制内容弹窗 | 副本以草稿状态创建，URL 标识与自定义静态路径置空；移动或复制栏目不会改变内容模型。 | `ContentsPage.tsx:882` | 副本规则与模型规则合并说明；URL 属实现术语 |

### 素材中心（9 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H111 | 字段帮助 | 素材版本与授权侧栏 → 撤销授权 extraText<br>条件：打开素材版本与授权侧栏 | 撤销后相关内容停止源站公开访问，CDN 刷新进度可在任务中心查看。 | `AssetRightsFields.tsx:11` | 撤销影响必要说明，包含源站 / CDN 技术术语 |
| CMS-H112 | 字段帮助 | 音视频字段 → 时长 placeholder<br>条件：显示音视频内容字段，时长为空 | 读取媒体后自动填写，也可输入 03:45 | `components/CmsContentMediaFields.tsx:57` | 自动回填行为与手动输入路径 |
| CMS-H113 | 字段帮助 | 音视频字段 → 媒体海报 placeholder<br>条件：显示音视频内容字段，resource.data.media.poster 不存在 | 可选择或上传图片，留空时使用内容封面 | `components/CmsContentMediaFields.tsx:62` | 媒体海报缺省规则及素材选择路径 |
| CMS-H114 | 字段帮助 | 音视频字段 → 媒体海报 placeholder<br>条件：显示音视频内容字段，resource.data.media.poster 存在 | 已生成视频海报，留空将使用该海报；也可选择其他图片 | `components/CmsContentMediaFields.tsx:62` | 媒体海报缺省规则及替换路径 |
| CMS-H115 | 字段帮助 | 媒体处理侧栏 → 图片焦点标记说明<br>条件：图片处理表单可见 | 点击原图标记焦点，封面裁切会优先展示这个位置。 | `components/CmsMediaProcessingSheet.tsx:29` | 业务操作帮助 |
| CMS-H116 | 常驻说明 | 媒体处理侧栏顶部说明<br>条件：媒体信息加载成功（非 query.isError） | 处理结果用于新保存的内容修订，已发布内容保持原来的媒体版本。 | `components/CmsMediaProcessingSheet.tsx:76` | 处理结果生效边界，与工作稿 / 已发布隔离规则相似 |
| CMS-H117 | 条件提醒 | 媒体处理侧栏 → 动态图片 Banner<br>条件：result.animated 为真 | 动态图片保留原文件的全部动画帧，本次仅提取媒体信息和保存焦点。 | `components/CmsMediaProcessingSheet.tsx:83` | 媒体处理实现范围说明 |
| CMS-H118 | 条件提醒 | 媒体处理侧栏 → 外部地址 Banner<br>条件：resource.fileId 为空 | 外部地址不能进行服务器媒体处理，请先上传本站文件。 | `components/CmsMediaProcessingSheet.tsx:84` | 媒体处理业务前提 |
| CMS-H119 | 字段帮助 | 图片裁剪弹窗 → 操作说明<br>条件：裁剪弹窗有 resource | 在图片上按住鼠标拖拽框选裁剪区域（原图 {resource.width ?? '?'}×{resource.height ?? '?'}）{有 originalRect 时：，当前选区 {originalRect.width}×{originalRect.height} @ ({originalRect.left}, {originalRect.top})} | `ResourcesPage.tsx:190` | 裁剪交互帮助附像素坐标技术展示 |

### 内容模型（10 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H120 | 条件提醒 | 发布影响抽屉变更列表前 Banner<br>条件：加载到发布影响且 breaking=true | 存在结构或必填规则变化。发布后，新工作稿按新定义校验；已有修订仍使用原版本。 | `CmsSchemaPublishSheet.tsx:13` | 模型与组件两个发布抽屉复用；规则变更影响提醒。 |
| CMS-H121 | 常驻说明 | 引用模型列表前 Typography.Paragraph<br>条件：组件发布影响数据加载成功 | 新组件版本发布后，以下模型须明确选用新版本。线上模型不会被自动替换。 | `CmsSchemaPublishSheet.tsx:56` | 版本更新影响说明，与字段版本选择器重复。 |
| CMS-H122 | 条件提醒 | 递归字段控件 Banner<br>条件：字段递归 depth &gt; CMS_MODEL_MAX_DEPTH | 字段嵌套超过模型允许层数，请修正模型定义。 | `model-field-renderer.tsx:44` | 结构规则提醒；与 ModelFieldRules 嵌套层数提示同类。 |
| CMS-H123 | 条件提醒 | 字段编辑区域 Banner<br>条件：字段递归 depth &gt; CMS_MODEL_MAX_DEPTH | 字段最多嵌套 {CMS_MODEL_MAX_DEPTH} 层，请减少嵌套。 | `ModelFieldRules.tsx:20` | 结构规则提醒，max depth 来自 shared 常量。 |
| CMS-H124 | 条件提醒 | 复用组件版本选择器下方 Typography.Text<br>条件：选择 object/array/blocks 中组件版本，versionId 有值 | {已选组件子字段名称以“、”连接，无字段时显示“无字段”}。更新组件后需在此明确选择新版本。 | `ModelFieldRules.tsx:124` | 前半是动态字段摘要，后半是固定版本更新规则。 |
| CMS-H125 | 字段帮助 | 允许引用的模型字段 extraText<br>条件：字段类型 reference 或 references | 留空允许本站全部模型；跨站引用不可用 | `ModelFieldRules.tsx:149` | 引用范围与空值语义。 |
| CMS-H126 | 常驻说明 | 编辑抽屉顶部 Banner<br>条件：打开新增/编辑模型抽屉 | 先保存工作稿，再通过发布影响预览生成不可变模型版本。新内容使用发布版本，历史审核修订保留原定义。 | `ModelsPage.tsx:83` | 不可变版本/历史审核修订偏实现；与发布影响抽屉说明相关。 |
| CMS-H127 | 字段帮助 | 归属字段 extraText<br>条件：modal.isEdit=true | 归属创建后不可变更 | `ModelsPage.tsx:90` | 不可变字段规则。 |
| CMS-H128 | 字段帮助 | 归属字段 extraText<br>条件：modal.isEdit=false | 专属模型仅当前站点可用；共享模型全部站点可用 | `ModelsPage.tsx:90` | 业务可用范围说明。 |
| CMS-H129 | 字段帮助 | 扩展字段 Form.Section 标题<br>条件：打开模型编辑抽屉 | 扩展字段（标题、摘要、正文、封面、作者已内置） | `ModelsPage.tsx:91` | 字段系统基础信息说明。 |

### 受控分类（2 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H130 | 条件提醒 | 分类与标签字段 → 当前模型不兼容提醒<br>条件：value 中含不属于当前 known 分类集合的 id | 已有分类不适用于当前模型，请重新选择分类后保存。 | `CmsTaxonomyInput.tsx:24` | 模型变更后的数据适用性必要提醒 |
| CMS-H131 | 字段帮助 | 新建 / 编辑词表 → 适用内容模型 extraText<br>条件：打开词表编辑侧栏 | 留空适用于所有模型 | `TaxonomyPage.tsx:43` | 适用范围缺省业务规则 |

### 内容集合（4 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H132 | 字段帮助 | 新建 / 编辑集合 → 模型字段条件 extraText<br>条件：打开集合编辑侧栏 | 多个条件需全部满足 | `CollectionsPage.tsx:65` | 筛选 AND 语义必要说明 |
| CMS-H133 | 字段帮助 | 新建 / 编辑集合 → 分类 / 标签 extraText<br>条件：打开集合编辑侧栏 | 内容需全部匹配所选项 | `CollectionsPage.tsx:67` | 多选筛选 AND 语义必要说明，与模型条件帮助相似 |
| CMS-H134 | 字段帮助 | 新建 / 编辑集合 → 人工固定内容 extraText<br>条件：打开集合编辑侧栏 | 固定项优先，按选择顺序展示 | `CollectionsPage.tsx:84` | 固定内容排序业务规则 |
| CMS-H135 | 常驻说明 | 集合预览与版本侧栏顶部说明<br>条件：previewId 存在，打开预览侧栏 | 当前规则 v{preview.data.version} · 按已发布内容预览 | `CollectionsPage.tsx:89` | 版本标签附预览内容范围规则 |

### 内容工作台（15 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H136 | 字段帮助 | 新建 / 编辑事项侧栏 → 关联稿件 extraText<br>条件：打开事项编辑侧栏 | 输入标题搜索本站稿件；完成编辑后在复盘侧栏绑定已审核修订，发布激活后开始观察。 | `CmsEditorialTasks.tsx:48` | 搜索帮助与复盘链路规则混写；发布激活偏实现术语 |
| CMS-H137 | 条件提醒 | 观察结果 → 前后区间口径说明<br>条件：observation.before 与 after 都存在 | 前后使用等长区间，覆盖状态：发布前{before.coverage.available ? 完整 : 不足} / 发布后{after.coverage.available ? 完整 : 不足}。 | `CmsEditorialTaskSheet.tsx:17` | 统计区间可比性口径，含动态覆盖状态 |
| CMS-H138 | 条件提醒 | 观察结果 → 指标目标说明<br>条件：before 与 after 存在，goal 存在且 metric !== manual | {指标名称}：{发布前指标值}% → {发布后指标值}%；目标{no_result_rate 时：不高于；其他指标：不低于} {goal.targetValue}%，前后样本均需至少 {goal.minSample}。 | `CmsEditorialTaskSheet.tsx:20` | 动态指标判定口径，有业务必要性 |
| CMS-H139 | 条件提醒 | 观察结果 → 干扰激活 Banner<br>条件：observation.otherActivationIds.length &gt; 0 | 观察期间另有 {observation.otherActivationIds.length} 次站点激活，记录 #{observation.otherActivationIds.join('、#')}。指标变化不能直接证明本次编辑的因果效果。 | `CmsEditorialTaskSheet.tsx:22` | 统计因果边界必要提醒；站点激活偏实现术语 |
| CMS-H140 | 条件提醒 | 本轮处理 → 版本过期 Banner<br>条件：有 cms:editorial-task:manage 权限，version !== task.version | 事项已被更新，输入已保留。请重新打开侧栏后再提交。 | `CmsEditorialTaskSheet.tsx:45` | 并发处理冲突提醒 |
| CMS-H141 | 常驻说明 | 本轮处理 → 完成编辑说明<br>条件：有事项管理权限，task.status 为 open / in_progress 且非 reopening | 完成编辑会锁定解决修订与目标；后续发布必须激活同一修订。 | `CmsEditorialTaskSheet.tsx:48` | 解决修订、激活等实现术语；有业务操作影响 |
| CMS-H142 | 条件提醒 | 本轮处理 → 搜索指标权限 Banner<br>条件：有事项管理权限，task.source 为 search 且 canViewMetrics 为假 | 搜索问题需要整站访问统计权限才能设置指标目标和验证结果。 | `CmsEditorialTaskSheet.tsx:62` | 统计权限操作前提 |
| CMS-H143 | 常驻说明 | 本轮处理底部复盘口径说明<br>条件：有 cms:editorial-task:manage 权限 | 7 天用于中期观察；指标验证需完整 30 天和迟到结算期，前后覆盖完整、样本足够且达到改善目标。人工核验只记录事实与依据。 | `CmsEditorialTaskSheet.tsx:63` | 较长统计实现口径；迟到结算期需业务化解释 |
| CMS-H144 | 条件提醒 | 轮次 → 观察中断 Banner<br>条件：round.interruptedAt 非空 | {round.interruptionReason，缺省为：本轮观察已中断，请重开事项继续处理} | `CmsEditorialTaskSheet.tsx:83` | 动态中断原因由业务数据提供 |
| CMS-H145 | 常驻说明 | 来信办理策略侧栏顶部 Banner<br>条件：打开来信办理策略 | 设置仅应用于之后收到的新来信。既有来信保留收件时的审批策略。 | `CmsFeedbackList.tsx:49` | 配置不追溯旧来信 |
| CMS-H146 | 字段帮助 | 来信办理策略→办理审批<br>条件：打开来信办理策略 | 仅可选已发布的 CMS 来信办理流程；审批通过后自动完成办理。 | `CmsFeedbackList.tsx:51` | 流程范围与审批通过后的行为 |
| CMS-H147 | 条件提醒 | 来信办理侧栏→审批 Banner<br>条件：有管理权限且流程处于活动状态 | 办理结果正在审批，审批结束或撤回后可继续修改。 | `CmsFeedbackSheet.tsx:45` | 审批期间的编辑锁定 |
| CMS-H148 | 条件提醒 | 来信办理侧栏→版本变化 Banner<br>条件：有管理权限且 feedback.version 与本地版本不同 | 记录已被其他人更新。本次输入已保留，请核对最新资料后重新打开办理侧栏。 | `CmsFeedbackSheet.tsx:46` | 并发更新提醒 |
| CMS-H149 | 条件提醒 | 来信办理侧栏→提交审批下方<br>条件：有管理权限且绑定办理审批流程 | 先保存分派和处理状态，再填写办理结果提交审批。 | `CmsFeedbackSheet.tsx:56` | 解释保存与审批顺序 |
| CMS-H150 | 条件提醒 | 页面权限不足 Banner<br>条件：缺少 cms:site:list，或 cms:content:list / cms:form:list / cms:editorial-task:manage 全部缺少 | 需要站点查询权限，以及内容查询、表单查询或编辑事项管理权限，才能使用内容工作台。 | `CmsWorkspacePage.tsx:28` | 入口权限条件必要说明 |

### 友情链接（1 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H151 | 字段帮助 | 分组编辑→分组编码<br>条件：打开友情链接分组编辑 | 主题按组取数的稳定引用，创建后不可修改 | `FriendLinksPage.tsx:323` | 稳定引用与不可修改规则 |

### 检索管理（4 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H152 | 常驻说明 | 自定义词典 Tab 顶部 Banner<br>条件：打开自定义词典 Tab | 自定义词典用于纠正分词（如品牌名、行业术语）。新增/修改即时对新内容生效；历史内容需在「检索测试」中重建索引。 | `SearchAdminPage.tsx:241` | 与同义词字段的“随站点发布版本生效”并列，生效时机需后续核实 |
| CMS-H153 | 字段帮助 | 词典编辑→同义词<br>条件：打开词典编辑 | 扩展词可配置等价检索词；随站点发布版本生效。 | `SearchAdminPage.tsx:280` | 解释配置生效时机 |
| CMS-H154 | 字段帮助 | 词典编辑→词频权重<br>条件：打开词典编辑 | 越大越优先成词，默认 1000 | `SearchAdminPage.tsx:283` | 解释数值含义与默认值 |
| CMS-H155 | 常驻说明 | 搜索热词 Tab 顶部 Banner<br>条件：打开搜索热词 Tab | 统计前台搜索框的关键词频次（Redis 累计），可用于运营选题与内链词建设。 | `SearchAdminPage.tsx:351` | 暴露 Redis 存储实现 |

### SEO 管理（4 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H156 | 常驻说明 | 内链词 Tab 顶部 Banner<br>条件：有 SEO 管理权限并打开内链词 Tab | 内容详情页渲染时自动将正文中的关键词替换为站内链接（跳过已有链接区域），提升 SEO 内链密度。修改后新访问/重新生成的页面生效。 | `SeoPage.tsx:159` | 混合规则解释、SEO 目的与生效时机 |
| CMS-H157 | 条件提醒 | 搜索推送 Tab 顶部 Banner<br>条件：当前站点已配置百度 Token 或 IndexNow Key | 内容发布后将自动推送到已配置的搜索引擎；此处也可手动批量推送历史 URL。 | `SeoPage.tsx:224` | 已配置时的功能说明 |
| CMS-H158 | 条件提醒 | 搜索推送 Tab 顶部 Banner<br>条件：尚不满足推送配置条件 | 尚未配置推送凭证：请在「站点管理 → 编辑站点 → 搜索推送」中填写百度推送 Token 或 IndexNow Key，并绑定站点域名。 | `SeoPage.tsx:224` | 配置缺失时指引 |
| CMS-H159 | 常驻说明 | 死链检测 Tab 顶部 Banner<br>条件：有 SEO 管理权限并打开死链检测 Tab | 扫描已发布内容正文与友情链接中的链接：站内链接校验目标是否存在，外链探测可达性（限 200 条）。坏链明细在任务中心的任务详情中查看。 | `SeoPage.tsx:271` | 扫描范围、上限和结果入口 |

### 表单管理（1 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H160 | 字段帮助 | 编辑表单→字段定义→自定义校验<br>条件：打开表单编辑字段定义 | 自定义规则由服务端 RE2JS 线性时间引擎编译执行（最长 200 字符）；不支持反向引用等非 RE2 语法。 | `FormsPage.tsx:269` | RE2JS、线性时间引擎、RE2 语法等实现说明 |

### 敏感词库（1 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H161 | 常驻说明 | 列表上方 Banner<br>条件：打开敏感词库 | 敏感词库全局生效，作用于前台评论与自定义表单提交：拦截模式命中直接拒绝提交，替换模式命中替换为指定文本。 | `SensitiveWordsPage.tsx:66` | 全局作用域与拦截/替换行为 |

### 采集中心（2 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H162 | 字段帮助 | 采集规则编辑→自动发布<br>条件：打开采集规则编辑 | 采集后直接发布并静态化 | `CollectPage.tsx:225` | 描述发布与静态化行为 |
| CMS-H163 | 字段帮助 | 采集规则编辑→图片本地化<br>条件：打开采集规则编辑 | 下载远程图片转存文件中心 | `CollectPage.tsx:226` | 解释远程图片转存 |

### 页面部件（2 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H164 | 字段帮助 | 覆盖标题字段 extraText<br>条件：editingSourceType !== manual | 留空时实时跟随来源 | `WidgetEditPage.tsx:453` | 来源标题同步规则，人工条目不显示。 |
| CMS-H165 | 条件提醒 | 删除操作禁用原因 Tooltip<br>条件：record.referenceCount &gt; 0 | 请先解除所有页面和主题插槽引用 | `WidgetsPage.tsx:148` | 业务依赖限制；由公共操作列呈现禁用原因。 |

### 页面搭建（20 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H166 | 字段帮助 | 手机图片字段 extraText<br>条件：区块类型 hero 或 image | 可选；不选择时复用桌面图片，可分别为桌面 / 手机设置裁切焦点 | `CmsPageImageEditor.tsx:33` | 图片回退与焦点规则。 |
| CMS-H167 | 字段帮助 | 装饰图片字段 extraText<br>条件：区块类型 hero 或 image | 不传达正文信息时开启；开启后发布采用空替代文本，辅助阅读工具会跳过这张图片 | `CmsPageImageEditor.tsx:34` | 辅助阅读效果说明。 |
| CMS-H168 | 字段帮助 | 图片替代文本字段 extraText<br>条件：decorative=true | 发布时采用空替代文本，辅助阅读工具会跳过这张装饰图片。 | `CmsPageImageEditor.tsx:35` | 与装饰图片开关 extraText 重复说明。 |
| CMS-H169 | 字段帮助 | 图片替代文本字段 extraText<br>条件：decorative=false | 说明图片表达的内容或用途，供看不到图片的读者使用。发布前必填。 | `CmsPageImageEditor.tsx:35` | 辅助阅读用途与发布必填规则。 |
| CMS-H170 | 字段帮助 | 图片链接说明字段 extraText<br>条件：type=image 且 decorative=true | 装饰图片带点击链接时填写，例如“查看活动日程”。 | `CmsPageImageEditor.tsx:36` | 装饰图片链接的可访问性说明。 |
| CMS-H171 | 字段帮助 | 桌面/手机裁切预览下方 Typography.Paragraph<br>条件：对应端存在 source 图片 | 在原图上点击主体，或调节下方焦点位置。 | `CmsPageImageEditor.tsx:50` | 同文桌面/手机各一份，操作说明。 |
| CMS-H172 | 常驻说明 | 可替换参数编辑器顶部 Typography.Text<br>条件：打开保存预设或保存新版本弹窗 | 将标题、图片、栏目或链接等字段声明为参数，插入时即可替换；默认值取自当前区块。 | `CmsPagePresetLibrary.tsx:40` | 参数使用规则。 |
| CMS-H173 | 常驻说明 | 预设库抽屉顶部 Banner<br>条件：打开预设库抽屉 | 预设保存区块快照及可替换参数。插入、替换和升级先进入页面草稿，保存页面后生效；预设新版本不会自动修改已有页面。 | `CmsPagePresetLibrary.tsx:202` | 快照/草稿/版本机制说明。 |
| CMS-H174 | 条件提醒 | 当前实例版本 Banner<br>条件：已有 source 且 source.presetId=activeId | 当前选中实例来自 v{source.version}，包含 {instanceBlocks.length} 个区块；最新版本为 v{preset.currentVersion}。 | `CmsPagePresetLibrary.tsx:221` | 动态版本关系提醒，旁有升级当前组合按钮。 |
| CMS-H175 | 条件提醒 | 预设参数区 Typography.Text<br>条件：已加载 snapshot 且 snapshot.parameters.length=0 | 此版本没有可替换参数，将直接插入快照。 | `CmsPagePresetLibrary.tsx:230` | 不是通用空状态，明确插入行为。 |
| CMS-H176 | 条件提醒 | 已保存页面使用情况 Typography.Paragraph<br>条件：存在使用记录，每条记录显示一段 | {item.pageSlug} · {item.blockIds.length} 个区块 · v{item.sourceVersion} → v{item.latestVersion} · {item.canUpgrade ? '可升级' : item.sourceVersion &lt; item.latestVersion ? '存在新版，需取得全部区块编辑权限' : '已是最新版本'} | `CmsPagePresetLibrary.tsx:243` | 完整动态原文语义；需要全部区块编辑权限的升级限制有业务意义。 |
| CMS-H177 | 常驻说明 | 弹窗顶部 Banner<br>条件：saveModal.isEdit=true | 将保存 {saveBlocks.length} 个区块。基于 v{expectedVersion} 创建新版本，已有页面保留原快照。 | `CmsPagePresetLibrary.tsx:251` | 已有页面保持原快照的版本规则。 |
| CMS-H178 | 常驻说明 | 弹窗顶部 Banner<br>条件：saveModal.isEdit=false | 将保存 {saveBlocks.length} 个区块。可声明插入时需要替换的字段。 | `CmsPagePresetLibrary.tsx:251` | 新建预设流程说明。 |
| CMS-H179 | 字段帮助 | 展示受众字段 extraText<br>条件：打开任意区块属性编辑 | 游客/会员条件会自动强制页面动态渲染，敏感内容不可放入公开区块 | `PagesPage.tsx:389` | 动态渲染实现说明与公开敏感内容提醒混写。 |
| CMS-H180 | 字段帮助 | 内容集合字段 extraText<br>条件：区块类型 content-list | 选择集合后统一使用集合的筛选和排序，条数作为展示上限 | `PagesPage.tsx:410` | 业务取数规则。 |
| CMS-H181 | 字段帮助 | 自定义路径字段 extraText<br>条件：打开页面搭建抽屉 | 支持多级分段（如 zh/about）；不能与栏目路径或系统保留段冲突 | `PagesPage.tsx:513` | 路径规则。 |
| CMS-H182 | 字段帮助 | 接管首页字段 extraText<br>条件：打开页面搭建抽屉 | 启用后站点首页渲染此页面（每站点一个） | `PagesPage.tsx:514` | 首页接管规则，与工作区接管状态说明相呼应。 |
| CMS-H183 | 条件提醒 | 内容检查 Banner<br>条件：已有 editingPage 且 issues.length &gt; 0 | 内容检查：{issues.length} 项待处理（{dirty ? '当前工作稿，保存后可检查引用目标' : '已保存页面'}）<br>{逐项 issue.message，可点击定位区块} | `PagesPage.tsx:543` | 完整 Banner 主文与动态问题列表语义；脏稿用 inspectCmsPageBlocks，已保存稿优先 quality API。 |
| CMS-H184 | 条件提醒 | 上移/下移区块按钮 title<br>条件：页面存在任意不可管理区块（!allBlocksManageable） | 页面含只读区块，禁止重排 | `PagesPage.tsx:599` | 同文分别出现在 599/602 行两个悬停提示。 |
| CMS-H185 | 常驻说明 | 权限抽屉顶部 Typography.Paragraph<br>条件：打开区块权限抽屉 | 未配置授权时继承页面编辑权限；配置任一授权后采用 fail-closed，仅获授权用户/角色及平台超管可管理。 | `PagesPage.tsx:686` | fail-closed 属实现术语；权限效果必要。 |

### 互动问卷（9 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H186 | 条件提醒 | 设计页→答卷结构锁定 Banner<br>条件：已有答卷且题目结构锁定 | 已收集 {答卷数} 份答卷，题目结构已锁定；仍可调整标题、时间、状态与展示策略。 | `interaction/InteractionEditPage.tsx:314` | 锁定后的编辑范围 |
| CMS-H187 | 字段帮助 | 设计页→基本信息→形态<br>条件：kind=poll | 投票只含一道选择题，前台直接展示得票分布 | `interaction/InteractionEditPage.tsx:335` | 投票/问卷差异 |
| CMS-H188 | 字段帮助 | 设计页→基本信息→形态<br>条件：kind=survey | 问卷可包含多道单选/多选/文本题 | `interaction/InteractionEditPage.tsx:335` | 投票/问卷差异 |
| CMS-H189 | 字段帮助 | 设计页→基本信息→URL 标识<br>条件：打开设计页 | 前台地址 /interaction/{标识}/；正文用 [互动:标识] 嵌入。留空由标题自动生成 | `interaction/InteractionEditPage.tsx:347` | 公开路径、嵌入语法、自动生成 |
| CMS-H190 | 字段帮助 | 设计页→参与策略→每位会员一次<br>条件：participantScope 不是 member | 「每位会员一次」需先将参与范围设为仅会员 | `interaction/InteractionEditPage.tsx:371` | 跨字段配置依赖 |
| CMS-H191 | 字段帮助 | 设计页→Cloudflare Turnstile 高级设置<br>条件：展开高级设置 | 仅验证码策略为 Cloudflare Turnstile 时生效 | `interaction/InteractionEditPage.tsx:409` | 生效前提 |
| CMS-H192 | 条件提醒 | 互动结果侧栏→交叉分析<br>条件：可分析的单选/多选题少于2道 | 至少需要两道单选或多选题才能做交叉分析 | `interaction/InteractionResultsSheet.tsx:170` | 空分析状态有业务门槛说明 |
| CMS-H193 | 字段帮助 | 题目设计器→NPS 题型<br>条件：题型为 nps | NPS 固定 0-{CMS_INTERACTION_NPS_MAX} 分，结果自动计算净推荐值 | `interaction/QuestionDesigner.tsx:215` | 评分范围与净推荐值 |
| CMS-H194 | 字段帮助 | 题目设计器→矩阵行<br>条件：题型为 matrix | 矩阵行（每行各选一个下方的选项） | `interaction/QuestionDesigner.tsx:233` | 矩阵作答规则 |

### 访问统计（30 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H195 | 常驻说明 | 转化 Tab 顶部 Banner<br>条件：打开转化 Tab 且数据可用 | 成功转化以服务端已完成的表单、投票、评论和关注为准。内容归因采用同会话最近内容触点；没有有效触点的成功保留在站点总量中。下载交付与点击分别统计。 | `CmsAttributionPanel.tsx:13` | 成功转化事实与最近内容触点 |
| CMS-H196 | 常驻说明 | 转化 Tab→成功转化指标卡<br>条件：打开转化 Tab | 按业务成功事件计数 | `CmsAttributionPanel.tsx:15` | 指标口径 |
| CMS-H197 | 常驻说明 | 转化 Tab→转化访客指标卡<br>条件：打开转化 Tab | 分子属于当前区间浏览访客 | `CmsAttributionPanel.tsx:16` | 区间访客范围 |
| CMS-H198 | 常驻说明 | 转化 Tab→访客转化率指标卡<br>条件：打开转化 Tab | 转化访客 ÷ 浏览访客 | `CmsAttributionPanel.tsx:17` | 比率公式 |
| CMS-H199 | 常驻说明 | 转化 Tab→业务行为指标卡<br>条件：打开转化 Tab | 展示行为与服务端成功分开记录 | `CmsAttributionPanel.tsx:18` | 行为与成功的区分 |
| CMS-H200 | 常驻说明 | 转化 Tab→版位点击率指标卡<br>条件：打开转化 Tab | {clicks} 次点击 / {impressions} 次曝光；按曝光实例去重 | `CmsAttributionPanel.tsx:22` | 曝光实例去重说明 |
| CMS-H201 | 常驻说明 | 转化 Tab→业务目标说明<br>条件：打开转化 Tab 且统计与质量数据可用 | 不同目标的开始、失败与成功均单独展示；不把未经验证的点击相加成为转化。比率同时保留分子与分母供核验。 | `CmsAttributionPanel.tsx:25` | 与顶部转化说明主题重复 |
| CMS-H202 | 条件提醒 | 采集质量状态 Banner（总览也复用）<br>条件：status=disabled | 请在采集设置中启用并发布站点配置，启用前的浏览不会补采。 | `stats/CmsStatsQuality.tsx:10` | 需要启用并发布配置 |
| CMS-H203 | 条件提醒 | 采集质量状态 Banner（总览也复用）<br>条件：status=pending_publication | 采集配置与线上版本尚未一致，请在发布中心发布配置后访问线上站点。 | `stats/CmsStatsQuality.tsx:11` | 采集配置待发布 |
| CMS-H204 | 条件提醒 | 采集质量状态 Banner<br>条件：status=empty；无浏览时总览也可能复用 | 线上已启用采集，所选日期尚无事件。请访问已发布的站点页面后刷新；编辑预览不计入正式指标。 | `stats/CmsStatsQuality.tsx:12` | 业务空数据口径，普通空状态不计 |
| CMS-H205 | 条件提醒 | 采集质量状态 Banner<br>条件：status=collecting | 正式访问、搜索、阅读和业务成功使用同一套事件事实。 | `stats/CmsStatsQuality.tsx:13` | 采集正常时仍展示规则说明 |
| CMS-H206 | 条件提醒 | 采集质量状态 Banner（总览也复用）<br>条件：status=attention | 检测到拒收或事件上下文异常，请检查下方质量信息与失败原因。 | `stats/CmsStatsQuality.tsx:14` | 质量异常业务提醒 |
| CMS-H207 | 常驻说明 | 采集质量 Tab→状态下方说明<br>条件：打开采集质量 Tab | 质量指标按所选站点与日期统计，不受内容、栏目和来源筛选影响；拒收事件不计入正式运营指标。 | `stats/CmsStatsQuality.tsx:21` | 质量指标筛选范围 |
| CMS-H208 | 常驻说明 | 采集质量 Tab→成功转化待入库指标卡<br>条件：打开采集质量 Tab | 业务已成功，正在可靠投递 | `stats/CmsStatsQuality.tsx:34` | 成功事实与投递状态说明 |
| CMS-H209 | 常驻说明 | 内容/来源/搜索/转化等排行表上方<br>条件：对应报表组件打开 | 导出任务在后台生成完整统计快照，关闭页面后继续执行；可在导出中心查看进度、取消、重试和重复下载。 | `stats/CmsStatsReport.tsx:61` | 导出中心说明在多报表重复 |
| CMS-H210 | 条件提醒 | 行为维度排行表上方口径<br>条件：dimension 为 search/media/placement/form/interaction | 此维度的 UV 是发生对应行为的访客数；详情浏览和搜索、媒体、版位行为分别计量，不将点击等同于服务端成功。 | `stats/CmsStatsReport.tsx:63` | 报表 UV 与业务成功口径 |
| CMS-H211 | 条件提醒 | 搜索排行表下方→转为编辑事项<br>条件：dimension=search | 转为事项时保存当前时间区间的全站关键词证据，后续按同一关键词跟踪发布前后效果。 | `stats/CmsStatsReport.tsx:65` | 转事项证据与后续跟踪说明 |
| CMS-H212 | 常驻说明 | 采集质量 Tab→转化投递区域<br>条件：打开采集质量 Tab | 当前积压独立于报表日期；业务成功事实不变，晚到访问只更新归因结果。缺少上下文的成功记录不会丢弃。 | `stats/CmsTelemetryDeliveries.tsx:35` | 积压、迟到事件及归因处理 |
| CMS-H213 | 常驻说明 | 采集质量 Tab→投递明细侧栏顶部 Banner<br>条件：打开投递明细 | 重新投递使用原事件 ID 幂等入库；已入库记录仅重新计算归因。自动重试采用指数退避，连续失败 12 次后等待人工处理。 | `stats/CmsTelemetryDeliveries.tsx:47` | 事件 ID、幂等、指数退避、12 次重试等实现细节 |
| CMS-H214 | 常驻说明 | 访问采集设置侧栏表头 Banner<br>条件：打开访问采集设置 | 一个开关管理浏览、搜索、阅读和成功转化采集。保存后需要发布站点配置；预览、爬虫与探针不进入正式运营指标。 | `stats/CmsTelemetrySettings.tsx:25` | 配置发布与预览排除规则 |
| CMS-H215 | 字段帮助 | 访问采集设置→站点统计时区<br>条件：打开访问采集设置 | 自然日、小时分桶和对比周期均按此时区计算。报表中可以临时选择其他统计时区。 | `stats/CmsTelemetrySettings.tsx:27` | 自然日和报表时区解释 |
| CMS-H216 | 常驻说明 | 页面顶部统计口径提示<br>条件：打开访问统计 | 预览、内部测试、爬虫和技术请求不混入用户 PV | `StatsPage.tsx:115` | PV 采集范围 |
| CMS-H217 | 常驻说明 | 统计范围与快照说明<br>条件：统计概览数据可用 | {起始时间} 至 {结束时间}（{统计时区}，结束边界不含） · 统计截至 {watermark}[ · 对比 {对比起始时间} 至 {对比结束时间}] | `StatsPage.tsx:124` | 时区、结束边界和统计快照口径 |
| CMS-H218 | 条件提醒 | 概览上方→无法对比原因 Banner<br>条件：comparisonUnavailableReason 有值 | {overview.data.comparisonUnavailableReason} | `StatsPage.tsx:127` | 动态统计覆盖原因，未逐条展开 |
| CMS-H219 | 条件提醒 | 统计范围下方→保留事件起点<br>条件：earliestRetainedEventAt 有值 | 当前保留事件起点：{earliestRetainedEventAt}。对比可用性根据连续采集记录、暂停时段和保留策略判断。 | `StatsPage.tsx:128` | 统计数据保留与比较边界 |
| CMS-H220 | 常驻说明 | 总览 Tab→参与与阅读下方<br>条件：打开总览且统计数据可用 | 每日 UV 独立去重，不能相加替代区间 UV。参与会话满足活跃 10 秒、有效阅读、成功转化或至少浏览两页之一。 | `StatsPage.tsx:136` | UV 去重与参与会话定义 |
| CMS-H221 | 常驻说明 | 来源 Tab→会话来源与入口说明<br>条件：打开来源 Tab 且数据可用 | 来源固定为会话首次入口，后续内容跳转不会覆盖；转化率分母为对应来源的区间浏览访客。 | `StatsPage.tsx:140` | 会话入口及转化率分母 |
| CMS-H222 | 常驻说明 | 搜索 Tab→搜索点击率指标卡<br>条件：打开搜索 Tab 且数据可用 | 发生点击的搜索次数 ÷ 搜索次数 | `StatsPage.tsx:141` | 比率公式 |
| CMS-H223 | 常驻说明 | 搜索 Tab→搜索需求与后续阅读说明<br>条件：打开搜索 Tab 且数据可用 | 后续阅读与成功转化关联同一访客、同一会话、点击后 30 分钟内的目标内容，按最近一次搜索点击归因。 | `StatsPage.tsx:141` | 30 分钟窗口与最近搜索点击归因 |
| CMS-H224 | 常驻说明 | 搜索 Tab→无结果独立词指标卡<br>条件：打开搜索 Tab 且数据可用 | 全量去重，不受分页或排行截断影响 | `StatsPage.tsx:141` | 排行与全量去重区别 |

### 发布中心（25 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H225 | 常驻说明 | 发布单/任务详情→展开构建性能诊断<br>条件：有构建性能数据且展开诊断 | 分项为累计工作时长；查询包含连接等待与结果读取。并行任务与数据库、文件处理可能重叠，不与构建总耗时相加。以下显示最慢的构建目标。 | `CmsBuildPerformancePanel.tsx:25` | 构建计时、并行与数据库口径 |
| CMS-H226 | 常驻说明 | 实际交付记录侧栏→页面证据说明<br>条件：打开交付记录且数据可用 | 记录保留当次入口及版本。源站和公开入口分别检测，公开入口未配置时显示未验证；刷新请求响应后，仍会检查页面内容标记。 | `CmsDeliveryPanel.tsx:38` | 入口、版本与内容标记说明 |
| CMS-H227 | 常驻说明 | 交付验证 Tab 顶部 Banner<br>条件：打开交付验证 Tab | 发布激活、缓存刷新和实际页面生效分别记录。源站、公开入口及可见性版本均满足预期后才通过，未配置的公开入口保留为未验证。 | `CmsDeliveryPanel.tsx:80` | 实现检查规则与交付口径 |
| CMS-H228 | 字段帮助 | 配置交付入口弹窗→源站入口<br>条件：打开入口配置 | 填写站点入口地址，包含站点路径前缀。留空时使用系统配置的源站入口。 | `CmsDeliveryPanel.tsx:100` | 默认入口与路径前缀规则 |
| CMS-H229 | 字段帮助 | 配置交付入口弹窗→公开/CDN 入口<br>条件：打开入口配置 | 填写读者实际访问的地址；未配置时公开交付状态为未验证。 | `CmsDeliveryPanel.tsx:101` | 未配置时的验证状态 |
| CMS-H230 | 字段帮助 | 配置交付入口弹窗→关键页面路径<br>条件：打开入口配置 | 每行一个站内路径，最多20条，例如 /、/news/、/p/culture/。不要添加查询参数。 | `CmsDeliveryPanel.tsx:102` | 格式、数量与查询参数限制 |
| CMS-H231 | 条件提醒 | 部署容量 Tab→未测量 Banner<br>条件：summary.data.unmeasured&gt;0 | 还有 {未测量数量} 个部署尚未测量，占用合计仅包含已测量数据。点击“刷新容量”在后台计算。 | `CmsDeploymentCapacityPanel.tsx:53` | 避免把未测量当成完整空间总量 |
| CMS-H232 | 常驻说明 | 部署存储保留策略弹窗底部<br>条件：打开保留策略弹窗 | 在线、重要、构建中、待激活和被执行任务引用的部署始终受保护。已提交的回收任务可单独取消。 | `CmsDeploymentCapacityPanel.tsx:74` | 回收保护对象及取消规则 |
| CMS-H233 | 条件提醒 | 预览历史部署存储回收弹窗 Banner<br>条件：回收候选有未测量部署 | {未测量候选数量} 个候选尚未测量，因此空间合计不完整。 | `CmsDeploymentCapacityPanel.tsx:81` | 空间计量完整性提醒 |
| CMS-H234 | 常驻说明 | 预览历史部署存储回收弹窗底部<br>条件：打开回收预览且已取得预览数据 | 回收后保留发布审计记录，该部署无法回滚。取消会停止剩余步骤，已完成的回收保留。 | `CmsDeploymentCapacityPanel.tsx:82` | 不可回滚及取消边界，属于操作风险提醒 |
| CMS-H235 | 条件提醒 | 发布单详情→本次构建进度<br>条件：buildPlan.failedTargetKey 有值 | 未完成：{失败目标类别}[ #{目标ID}]。修正后可重新构建并复用已完成产物。 | `CmsDeploymentProgress.tsx:18` | 修正后重建与复用建议 |
| CMS-H236 | 条件提醒 | 发布单详情→变更审阅 Banner<br>条件：比较版本已过期且有 cms:publish:build 权限 | 线上版本已变化，请重新准备并审阅发布单。 | `CmsReleaseReviewPanel.tsx:29` | 防止基于旧线上版本上线 |
| CMS-H237 | 常驻说明 | 发布单详情→检查与影响范围说明<br>条件：打开变更审阅且已取得审阅数据 | 检查时间：{checkedAt}。检查针对本发布单固定版本；编辑完成后需重新审核或准备发布单，原发布范围不会随保存变化。 | `CmsReleaseReviewPanel.tsx:43` | 固定版本规则与发布范围说明 |
| CMS-H238 | 条件提醒 | 发布单详情→检查问题 Banner<br>条件：review.checks 有结果 | {检查对象标题} [固定修订 #{revisionId}] [字段/区块]；{check.message}；建议：{recommendedAction 对应中文标签} | `CmsReleaseReviewPanel.tsx:46` | 动态检查消息与操作建议，不逐条展开 |
| CMS-H239 | 条件提醒 | 发布单详情→缺少已批准依赖<br>条件：recommendedAction=select-approved 且没有可选依赖 | 当前没有可选择的已批准依赖；请由有权限的负责人完成审核，或调整引用后重新准备。 | `CmsReleaseReviewPanel.tsx:53` | 补充依赖前置条件 |
| CMS-H240 | 条件提醒 | 发布单详情→整站影响说明<br>条件：wholeSiteAffected=true | 包含站点、导航或共享部件变更，将检查整站展示影响。 | `CmsReleaseReviewPanel.tsx:57` | 影响范围提示 |
| CMS-H241 | 常驻说明 | 发布单 Tab 顶部 Banner<br>条件：打开发布单 Tab | 配置保存会合并到本站待构建的配置草稿；点击构建后冻结本次范围。内容批准表示修订可发布，构建并激活后才更新线上内容。 | `CmsReleasesPanel.tsx:85` | 保存、冻结、批准、构建和激活说明 |
| CMS-H242 | 条件提醒 | 创建发布单→选择已批准内容<br>条件：打开创建发布单侧栏且所选内容没有可发布修订 | 请先在内容编辑页完成审核或申请发布以生成可发布修订。 | `CmsReleasesPanel.tsx:97` | 审核前置条件 |
| CMS-H243 | 条件提醒 | 创建发布单→发布与撤下冲突 Banner<br>条件：同一内容同时被选择发布与撤下 | 同一内容不能同时发布与撤下 | `CmsReleasesPanel.tsx:101` | 输入冲突提醒 |
| CMS-H244 | 字段帮助 | 创建发布单→冻结公开配置复选项下方<br>条件：打开创建发布单弹窗 | 所选对象在创建发布单时冻结；后续编辑不会改变本次发布范围。 | `CmsReleasesPanel.tsx:106` | 解释固定发布范围 |
| CMS-H245 | 字段帮助 | 创建发布单→计划上线时间下方<br>条件：打开创建发布单弹窗 | 时间按所选时区解释。留空表示不设置排期；创建后在详情中构建候选部署。 | `CmsReleasesPanel.tsx:110` | 时区、排期和构建顺序 |
| CMS-H246 | 条件提醒 | 发布单详情→配置草稿 Banner<br>条件：source=configuration 且 status=draft | 本站后续配置保存会继续合并到这份草稿。确认变更范围后构建，构建后的发布单保持固定。 | `CmsReleasesPanel.tsx:116` | 与 Tab 顶部冻结规则重复 |
| CMS-H247 | 条件提醒 | 发布单详情→阻断检查 Banner<br>条件：blockingChecks 有结果 | {发布单阻断检查 message} | `CmsReleasesPanel.tsx:123` | 服务端检查结果，每条实际消息不展开 |
| CMS-H248 | 常驻说明 | 新建发布弹窗底部 Banner<br>条件：打开新建发布弹窗 | 提交后在队列中跟踪构建进度；配置型任务构建成功后，需到发布单激活。失败时可以恢复或重建。 | `PublishingPage.tsx:344` | 任务队列、构建和激活阶段说明 |
| CMS-H249 | 条件提醒 | 任务详情→错误 Banner<br>条件：任务有 errorMessage | {任务错误信息}；可选择断点恢复或重新开始。 | `PublishingPage.tsx:366` | 保留业务恢复建议，普通读取错误不计 |

### 内容分发（1 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H250 | 常驻说明 | 分发规则 Tab 顶部 Banner<br>条件：打开分发规则 Tab | 仅同步已发布内容；所有写入都先校验来源与目标 ACL。copy 生成独立草稿，mapping 生成正文跟随的映射草稿，scheduled 按 Cron 提交任务。 | `DistributionPage.tsx:354` | ACL、copy、mapping、scheduled、Cron 混在业务说明中 |

### 共享配置状态（5 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H251 | 常驻说明 | 共享配置提示 Banner<br>条件：CmsConfigurationNotice 未传 kind | 保存工作配置后，请前往发布中心审阅并激活。 | `CmsConfigurationNotice.tsx:13` | 聚合配置提示；可带草稿入口/发布中心按钮。调用面：ChannelsPage.tsx:765；sites/CmsSiteWorkspace.tsx:38；sites/SiteEditSheet.tsx:400；PagesPage.tsx:621；WidgetEditPage.tsx:533。 |
| CMS-H252 | 条件提醒 | 共享配置状态 Banner<br>条件：已保存对象，state.state=saved | 已保存配置尚未上线，请准备发布单并激活。 | `CmsConfigurationNotice.tsx:17` | saved 状态流程提醒；与其他草稿发布说明重复。调用面：ChannelsPage.tsx:765；sites/CmsSiteWorkspace.tsx:38；sites/SiteEditSheet.tsx:400；PagesPage.tsx:621；WidgetEditPage.tsx:533。 |
| CMS-H253 | 条件提醒 | 共享配置状态 Banner<br>条件：已保存对象，state.state=pending | 已保存配置已进入待发布单，构建并激活后生效。 | `CmsConfigurationNotice.tsx:17` | pending 状态流程提醒；可带相关发布单入口。调用面：ChannelsPage.tsx:765；sites/CmsSiteWorkspace.tsx:38；sites/SiteEditSheet.tsx:400；PagesPage.tsx:621；WidgetEditPage.tsx:533。 |
| CMS-H254 | 条件提醒 | 共享配置状态 Banner<br>条件：已保存对象，state.state=online | 已保存配置与当前生效的线上版本一致。 | `CmsConfigurationNotice.tsx:17` | online 绿色提示；状态标签另由 shared 常量提供。调用面：ChannelsPage.tsx:765；sites/CmsSiteWorkspace.tsx:38；sites/SiteEditSheet.tsx:400；PagesPage.tsx:621；WidgetEditPage.tsx:533。 |
| CMS-H255 | 条件提醒 | 共享配置状态 Banner<br>条件：传 kind 但 siteId 缺失，或 kind 非 site 且 objectId 缺失 | 保存对象后可查看配置上线状态。 | `CmsConfigurationNotice.tsx:21` | 组件支持该状态；本组页面/站点调用通常在保存后才挂载，部件编辑可覆盖新增对象。调用面：ChannelsPage.tsx:765；sites/CmsSiteWorkspace.tsx:38；sites/SiteEditSheet.tsx:400；PagesPage.tsx:621；WidgetEditPage.tsx:533。 为保留此组件全部分支，另记录非业务分支：已保存对象但查询出错时为“配置上线状态读取失败：{query.error.message}”；已保存但状态尚未返回时为“正在核对已保存配置与线上版本…”（均不计入业务提示条数）。 |

### 共享预览与字段（5 条）

| 编号 | 类型 | 位置与显示条件 | 原文 | 来源 | 梳理备注 |
| --- | --- | --- | --- | --- | --- |
| CMS-H256 | 条件提醒 | 内部链接目标回显 Typography.Text<br>条件：entity 引用目标返回 exists=false | {target.label}，链接已失效 | `CmsLinkInput.tsx:222` | 动态 target.label；被引用目标失效属于业务提醒；格式错误/解析失败等普通错误不纳入。 |
| CMS-H257 | 常驻说明 | 组合工作稿展开区顶部说明<br>条件：selectionOpen 为真 | 选择同一期专题需要查看的已保存内容、页面和部件。应用后，页面内跳转继续使用这组工作稿。 | `CmsWorkbenchPreview.tsx:90` | 工作稿组合预览操作帮助 |
| CMS-H258 | 常驻说明 | 预览工具栏下常驻 Banner<br>条件：预览侧栏打开 | 浏览模式用于站内导航；开启“定位编辑”后，点击区块、图片或列表可打开对应配置。只显示有权限编辑的对象，互动提交和统计采集保持关闭。 | `CmsWorkbenchPreview.tsx:98` | 功能说明与预览运行边界混写 |
| CMS-H259 | 条件提醒 | 素材选择字段下 → 未登记地址提醒<br>条件：有 siteId、canRead、有 selectedValue、query 成功且找不到 resource；selectedValue 不以 CMS_RESOURCE_URI_PREFIX 开头 | 此地址未登记为本站素材，请确认地址可用，或重新选择本站素材 | `components/CmsAssetField.tsx:81` | 外链与本站素材边界必要提醒 |
| CMS-H260 | 条件提醒 | 素材选择字段下 → 素材引用不可用提醒<br>条件：有 siteId、canRead、有 selectedValue、query 成功且找不到 resource；selectedValue 以 CMS_RESOURCE_URI_PREFIX 开头 | 素材不可用：可能已删除、不属于本站或类型不匹配 | `components/CmsAssetField.tsx:81` | 业务资产适用性必要提醒 |

## 验证与范围边界

- 依据当前菜单 seed、页面装配代码及 JSX 上下文核对入口、位置、条件和原文。260 条记录的来源文件均存在、行号均有效。
- 对静态完整文案做源码文本匹配；跨 JSX 标签拼接的开放授权和导出说明额外逐段核对。动态文本保留显示模板，不声称枚举了所有 API 问题消息。
- 本次是源码盘点，未逐页面进行浏览器实测，也未验证各条说明是否与当前服务端业务实现完全一致。
- 普通“加载中/查询失败”、常规空状态、按钮标签、普通输入占位、Toast、确认框正文、校验 required 消息、后端 API 文档描述不计入。保留有具体业务含义的条件提醒，如内容锁定、版本冲突、未测量空间和缺少已批准依赖。
- 主题参数说明已展开 9 条内置 description；运行时模型展示校验、内容质量检查、页面区块检查、发布阻断检查等按呈现点记录。
- 以上是首次只读盘点的验证边界。后续授权的界面清理范围与验证另列于下方。

## Banner 清理结果（2026-10-01）

本次删除常驻功能介绍、内部实现细节和重复规则说明，涉及 21 个产品文件。共移除 25 个 Banner 节点；SEO 搜索推送另删除已配置时的说明分支，仍保留未配置凭证的 warning，共计 26 处提示。保存预设 Banner 的新建/新版本两条文案共用一个节点，因此对应的原清单记录数与节点数不同。

共享配置入口只去掉聚合场景的固定说明 Banner，保留“查看我的配置草稿”或“打开发布中心”按钮。具体对象的上线状态、相关发布单入口和状态读取失败提醒继续展示。

| 文件 | 移除提示数 | 首轮清单编号 |
| --- | ---: | --- |
| `CmsAttributionPanel.tsx` | 1 | CMS-H195 |
| `CmsConfigurationNotice.tsx` | 1 | CMS-H251 |
| `CmsDeliveryPanel.tsx` | 1 | CMS-H227 |
| `CmsEditorialPanel.tsx` | 1 | CMS-H074 |
| `CmsFeedbackList.tsx` | 1 | CMS-H145 |
| `CmsPagePresetLibrary.tsx` | 2 | CMS-H173、CMS-H177、CMS-H178 |
| `CmsReleasesPanel.tsx` | 2 | CMS-H241、CMS-H246 |
| `CmsWorkbenchPreview.tsx` | 1 | CMS-H258 |
| `ContentEditPage.tsx` | 1 | CMS-H087 |
| `DistributionPage.tsx` | 1 | CMS-H250 |
| `ModelsPage.tsx` | 1 | CMS-H126 |
| `PublishingPage.tsx` | 1 | CMS-H248 |
| `SearchAdminPage.tsx` | 2 | CMS-H152、CMS-H155 |
| `SensitiveWordsPage.tsx` | 1 | CMS-H161 |
| `SeoPage.tsx` | 3 | CMS-H156、CMS-H158、CMS-H159 |
| `sites/SiteBlueprintSheet.tsx` | 1 | CMS-H015 |
| `sites/SiteInheritanceSheet.tsx` | 1 | CMS-H042 |
| `sites/SiteMoveModal.tsx` | 1 | CMS-H043 |
| `sites/SiteStaticSheet.tsx` | 1 | CMS-H045 |
| `stats/CmsTelemetryDeliveries.tsx` | 1 | CMS-H213 |
| `stats/CmsTelemetrySettings.tsx` | 1 | CMS-H214 |

保留错误、权限、编辑锁、版本冲突、依赖检查、模板失效、预览授权、统计完整性和不可回滚风险提示；保留字段帮助及灰色说明段。仅用于被删静态化介绍的有效配置查询与无用 import 一并清理。

验证：CMS 29 个测试文件 / 131 个用例通过；前端 ESLint（0 errors）、Stylelint、类型检查及全部入口正式 / Demo 构建通过；正式产物预算检查通过；Demo 的后台、会员、审批入口与登录后的启动冒烟通过。

本地浏览器检查了发布单列表和创建侧栏、内容分发、自定义词典、搜索热词、SEO 搜索推送：冗余说明已移除，列表与操作控件正常，未配置推送凭证的 warning 仍展示。只查看与打开界面，未提交业务数据。Demo 产物体积预算曾超标，随后正式构建按正式预算通过；未调整预算阈值。
