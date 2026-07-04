# 项目结构

Zenith Admin 采用 npm monorepo 结构，核心目录如下：

```text
zenith-admin/
├── docs/                 # VitePress 文档站
├── packages/
│   ├── server/           # Hono 后端服务
│   ├── shared/           # 共享类型、常量、Zod schema
│   ├── web/              # React 管理后台与会员前台
│   └── electron/         # Electron 桌面客户端
├── package.json          # 根脚本与工作区配置
└── README.md
```

## `packages/server`

后端基于 **Hono v4**，通过 `@hono/node-server` 在 Node.js 中运行。

关注这些目录：

- `packages/server/src/routes/`：API 路由（认证、用户、部门、岗位、角色、菜单、字典、通知、日志、监控、会话、定时任务、会员、支付、工作流、AI、运维等）
- `packages/server/src/services/`：Service 层（业务逻辑、数据映射 `mapXxx`、前置校验 `ensureXxx`；所有路由均已完成提取）
- `packages/server/src/db/`：Drizzle schema、统一数据库类型别名、迁移与 seed
- `packages/server/src/middleware/`：认证（`auth.ts`）、IP 访问控制（`ip-access.ts`）、权限守卫（`guard.ts`）、接口限流（`rate-limit.ts`）
- `packages/server/src/lib/`：通用能力封装，详见下方列表
- `packages/server/src/types/`：后端全局类型声明
- `packages/server/drizzle/`：生成的迁移文件

`src/lib/` 主要模块：

| 文件 | 说明 |
| --- | --- |
| `session-manager.ts` | Redis 会话管理（在线会话 + 黑名单） |
| `redis.ts` | ioredis 客户端单例与工具 |
| `oauth/` | OAuth 提供方抽象（GitHub / 钉钉 / 企业微信） |
| `pg-boss-scheduler.ts` | 定时任务调度器（基于 pg-boss，PostgreSQL 多进程安全） |
| `db-backup.ts` | 基于 pg_dump 的数据库备份 |
| `file-storage.ts` | 文件存储抽象（本地 / 阿里云 OSS / S3 / COS / OBS / Kodo / BOS / Azure Blob / SFTP） |
| `email.ts` | SMTP 邮件发送 |
| `password-policy.ts` | 密码复杂度校验与过期策略 |
| `system-config.ts` | 系统配置读取封装 |
| `tenant.ts` | 多租户数据隔离工具 |
| `data-scope.ts` | 数据权限过滤（全部 / 部门 / 本人） |
| `permissions.ts` | 菜单与按钮权限判断 |
| `excel-export.ts` | Excel 导出工具 |
| `captcha.ts` | 图形验证码生成 |
| `sanitize.ts` | XSS 输入清洗 |
| `ws-manager.ts` | WebSocket 连接管理 |
| `logger.ts` | 日志工具（基于 winston） |

## `packages/web`

前端基于 **React 19 + Vite + Semi Design**。

关注这些目录：

- `packages/web/src/pages/`：页面级组件
- `packages/web/src/layouts/`：后台主布局
- `packages/web/src/components/`：公共组件
- `packages/web/src/hooks/`：认证、主题等逻辑
- `packages/web/src/hooks/queries/`：TanStack Query 域 hooks（服务端状态，按业务域拆分）
- `packages/web/src/lib/`：前端通用库封装
- `packages/web/src/member/`：会员前台独立 SPA
- `packages/web/src/mocks/`：MSW Demo 模式数据与 handlers
- `packages/web/src/utils/`：请求封装、日期处理等工具
- `packages/web/src/providers/`：全局 Provider
- `packages/web/src/styles/`：全局样式
- `packages/web/src/webrtc/`：音视频通话相关逻辑

## `packages/shared`

共享层用于减少前后端重复定义：

- `packages/shared/src/types.ts`：实体类型、分页类型、接口响应类型
- `packages/shared/src/validation.ts`：Zod 校验 schema
- `packages/shared/src/constants.ts`：常量与枚举
- `packages/shared/src/seed-data.ts`：前后端共用初始种子数据
- `packages/shared/src/index.ts`：共享包导出入口

## `docs`

文档站使用 **VitePress** 构建，当前按以下思路组织：

- `index.md`：Landing Page
- `guide/`：快速开始、开发、结构、部署、Docker、PWA、Electron、Demo
- `product/`：产品概览与功能模块
- `backend/`：接口规范、数据库说明
- `frontend/`：UI 规范、认证与请求
- `ai/`：AI 开发辅助说明（AGENTS.md 、Zenith Skill）
- `changelog/`：版本更新历史

## 为什么这样分层

这样的结构适合后台项目长期演进：

- **业务边界清晰**：前后端职责明确
- **复用成本低**：共享类型和校验只维护一份
- **协作效率高**：文档、代码、脚本都在根仓库统一管理
