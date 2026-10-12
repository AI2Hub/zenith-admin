// ─── 知识中心：演示种子数据 ───────────────────────────────────────────────────

export const SEED_WIKI_SPACES = [
  { id: 1, name: '公司制度', description: '规章制度、行政流程与员工手册', icon: 'Landmark', visibility: 'public' as const, status: 'enabled' as const, sort: 1, aiSyncEnabled: false },
  { id: 2, name: '技术文档', description: '架构设计、开发规范与运维手册', icon: 'Code2', visibility: 'public' as const, status: 'enabled' as const, sort: 2, aiSyncEnabled: false },
  { id: 3, name: '管理层内参', description: '仅管理层可见的经营分析与决策纪要', icon: 'ShieldCheck', visibility: 'private' as const, status: 'enabled' as const, sort: 3, aiSyncEnabled: false },
];

/** 空间成员：管理员为全部空间负责人 */
export const SEED_WIKI_SPACE_MEMBERS = [
  { spaceId: 1, userId: 1, role: 'owner' as const },
  { spaceId: 2, userId: 1, role: 'owner' as const },
  { spaceId: 3, userId: 1, role: 'owner' as const },
];

export const SEED_WIKI_TAGS = [
  { id: 1, name: '新人必读', color: '#3b82f6' },
  { id: 2, name: '制度', color: '#8b5cf6' },
  { id: 3, name: '流程', color: '#10b981' },
  { id: 4, name: '最佳实践', color: '#f59e0b' },
  { id: 5, name: 'FAQ', color: '#06b6d4' },
];

export const SEED_WIKI_TEMPLATES = [
  {
    id: 1,
    name: '会议纪要',
    description: '例会 / 评审会通用纪要结构',
    status: 'enabled' as const,
    sort: 1,
    content: '# 会议纪要\n\n- **时间**：\n- **地点**：\n- **主持人**：\n- **参会人**：\n\n## 议题\n\n1. \n\n## 结论\n\n- \n\n## 待办事项\n\n| 事项 | 负责人 | 截止时间 |\n| --- | --- | --- |\n|  |  |  |\n',
  },
  {
    id: 2,
    name: '技术方案',
    description: '技术设计评审文档结构',
    status: 'enabled' as const,
    sort: 2,
    content: '# 技术方案：\n\n## 背景与目标\n\n## 现状分析\n\n## 方案设计\n\n### 总体架构\n\n### 关键流程\n\n## 影响面与兼容性\n\n## 上线计划与回滚方案\n\n## 风险评估\n',
  },
  {
    id: 3,
    name: '操作手册（SOP）',
    description: '标准作业流程模板',
    status: 'enabled' as const,
    sort: 3,
    content: '# 操作手册：\n\n## 适用范围\n\n## 前置条件\n\n## 操作步骤\n\n1. \n2. \n3. \n\n## 常见问题\n\n## 应急处理\n\n> 遇到无法处理的情况请联系值班同学。\n',
  },
];

/** 知识文档种子行：治理演示字段（有效期 / 复审 / 归档 / 陈旧天数）均为可选 */
export interface SeedWikiDoc {
  id: number;
  spaceId: number;
  parentId: number | null;
  title: string;
  summary: string;
  status: 'draft' | 'pending' | 'published' | 'rejected';
  sort: number;
  isPinned: boolean;
  tagIds: number[];
  content: string;
  ownerId?: number;
  expireAt?: string;
  reviewCycleDays?: number;
  nextReviewAt?: string;
  isArchived?: boolean;
  /** 落库时换算为 updatedAt = now - N 天（演示「长期未更新」） */
  updatedDaysAgo?: number;
}

export const SEED_WIKI_DOCS: SeedWikiDoc[] = [
  {
    id: 1,
    spaceId: 1,
    parentId: null,
    title: '新员工入职指南',
    summary: '入职第一周需要完成的事项与常用系统入口',
    status: 'published' as const,
    sort: 1,
    isPinned: true,
    tagIds: [1, 3],
    content: '# 新员工入职指南\n\n欢迎加入！本指南帮助你在第一周快速上手。\n\n## 第一天\n\n1. 领取工牌与办公设备\n2. 加入部门沟通群\n3. 完成账号开通：邮箱、VPN、OA\n\n## 第一周\n\n- 阅读[考勤与休假制度](/wiki/docs?docId=2)\n- 完成信息安全培训\n- 与直属上级对齐试用期目标\n\n## 常用系统\n\n| 系统 | 用途 |\n| --- | --- |\n| OA | 审批与考勤 |\n| Wiki | 知识文档 |\n| 工单 | IT 支持 |\n',
  },
  {
    id: 2,
    spaceId: 1,
    parentId: 1,
    title: '考勤与休假制度',
    summary: '工作时间、请假类型与审批流程',
    status: 'published' as const,
    sort: 1,
    isPinned: false,
    tagIds: [2, 3],
    content: '# 考勤与休假制度\n\n## 工作时间\n\n标准工时为每周一至周五 9:00-18:00，午休 1.5 小时。\n\n## 请假类型\n\n- **年假**：入职满一年 5 天，逐年递增\n- **病假**：需提供医院证明\n- **事假**：按日扣薪\n\n## 审批流程\n\n1. OA 提交申请\n2. 直属上级审批\n3. 3 天以上假期需部门负责人加签\n',
  },
  {
    id: 3,
    spaceId: 1,
    parentId: 1,
    title: '报销流程说明',
    summary: '差旅、招待与日常报销的标准流程',
    status: 'published' as const,
    sort: 2,
    isPinned: false,
    tagIds: [3],
    content: '# 报销流程说明\n\n## 报销范围\n\n差旅费、市内交通、业务招待、办公用品。\n\n## 流程\n\n1. 收集发票（电子发票需验真）\n2. OA 填写报销单并上传凭证\n3. 财务审核后 T+3 打款\n\n> 单笔超过 5000 元需提前申请。\n',
  },
  {
    id: 4,
    spaceId: 2,
    parentId: null,
    title: '后端开发规范',
    summary: 'API 设计、数据库与代码风格约定',
    status: 'published' as const,
    sort: 1,
    isPinned: true,
    tagIds: [4],
    content: '# 后端开发规范\n\n## API 设计\n\n- RESTful 风格，统一 `{ code, message, data }` 响应\n- 分页返回 `{ list, total, page, pageSize }`\n\n## 数据库\n\n- 表名蛇形复数，主键自增 `id`\n- 业务表必须带 `created_at` / `updated_at`\n\n## 代码风格\n\n- Service 承载业务逻辑，Route 只做协议转换\n- 禁止在循环中发起串行查询\n\n```ts\n// ✅ 并行\nconst [total, rows] = await Promise.all([countQuery, listQuery]);\n```\n',
  },
  {
    id: 5,
    spaceId: 2,
    parentId: null,
    title: '生产环境发布检查清单',
    summary: '每次上线前必须逐项确认的检查项',
    status: 'pending' as const,
    sort: 2,
    isPinned: false,
    tagIds: [4, 3],
    content: '# 生产环境发布检查清单\n\n## 发布前\n\n- [ ] 变更评审通过\n- [ ] 数据库迁移脚本已在预发验证\n- [ ] 回滚方案已准备\n\n## 发布中\n\n- [ ] 灰度 10% 观察 15 分钟\n- [ ] 核心指标无异常后全量\n\n## 发布后\n\n- [ ] 错误率 / 延迟监控 30 分钟\n- [ ] 通知相关方发布完成\n',
  },
  {
    id: 6,
    spaceId: 2,
    parentId: null,
    title: '常见问题 FAQ（草稿）',
    summary: '开发环境与工具链常见问题整理中',
    status: 'draft' as const,
    sort: 3,
    isPinned: false,
    tagIds: [5],
    content: '# 常见问题 FAQ\n\n> 整理中，欢迎补充。\n\n## 本地启动失败？\n\n检查 Node 版本与 .env 配置。\n\n## 数据库连接超时？\n\n确认 VPN 已连接。\n',
  },
  // ─── 内容治理演示数据：让已过期 / 待复审 / 长期未更新 / 已归档清单在干净环境下可见 ──
  {
    id: 7,
    spaceId: 1,
    parentId: null,
    title: '旧版考勤制度（已过期）',
    summary: '有效期已过的历史制度版本，保留供追溯',
    status: 'published' as const,
    sort: 4,
    isPinned: false,
    tagIds: [2],
    ownerId: 1,
    expireAt: '2025-06-30 23:59:59',
    content: '# 旧版考勤制度\n\n本版本已过期，仅供追溯，请以现行考勤与休假制度为准。\n',
  },
  {
    id: 8,
    spaceId: 1,
    parentId: null,
    title: '信息安全规范（待复审）',
    summary: '复审时间已到，需要负责人重新确认',
    status: 'published' as const,
    sort: 5,
    isPinned: false,
    tagIds: [2],
    ownerId: 1,
    reviewCycleDays: 90,
    nextReviewAt: '2025-09-01 00:00:00',
    content: '# 信息安全规范\n\n## 密码要求\n\n长度不少于 12 位，包含大小写字母与数字。\n\n## 设备管理\n\n办公电脑必须开启磁盘加密与锁屏。\n',
  },
  {
    id: 9,
    spaceId: 2,
    parentId: null,
    title: '旧架构说明（长期未更新）',
    summary: '超过 180 天未更新的沉睡文档',
    status: 'published' as const,
    sort: 4,
    isPinned: false,
    tagIds: [4],
    ownerId: 1,
    // 落库 / Mock 时换算为 updatedAt = now - 200 天，进入「长期未更新」清单
    updatedDaysAgo: 200,
    content: '# 旧架构说明\n\n> 本文档已长期未更新，内容可能与现状不符。\n\n## 历史架构\n\n单体应用 + 直连数据库。\n',
  },
  {
    id: 10,
    spaceId: 2,
    parentId: null,
    title: '下线系统交接记录（已归档）',
    summary: '已归档的历史交接材料',
    status: 'published' as const,
    sort: 5,
    isPinned: false,
    tagIds: [4],
    ownerId: 1,
    isArchived: true,
    content: '# 下线系统交接记录\n\n旧报表系统已下线，本文档归档备查。\n',
  },
];

/** 演示评论（挂在已发布文档上，作者为管理员） */
export const SEED_WIKI_COMMENTS = [
  { id: 1, docId: 1, parentId: null, content: '写得很全面，建议补充工位申请的入口链接。', status: 'visible' as const, authorId: 1 },
  { id: 2, docId: 1, parentId: 1, content: '已记录，下个版本补充。', status: 'visible' as const, authorId: 1 },
  { id: 3, docId: 4, parentId: null, content: '分页约定和现有网关行为一致，点赞。', status: 'visible' as const, authorId: 1 },
];

/** 无结果搜索词演示数据（近 30 天知识缺口，供治理「无结果搜索词」清单展示） */
export const SEED_WIKI_SEARCH_LOGS = [
  { keyword: 'VPN 配置', resultCount: 0, userId: 1 },
  { keyword: '远程办公申请流程', resultCount: 0, userId: 1 },
];
