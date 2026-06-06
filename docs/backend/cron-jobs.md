# 定时任务

定时任务模块基于 **pg-boss**（PostgreSQL 队列库）实现，支持在后台 UI 中创建、修改状态、手动执行任务，并可查看每次执行的历史日志。相较于进程内调度（node-cron），pg-boss 的核心优势是：

- **精确一次执行**：基于 PostgreSQL `SKIP LOCKED`，多进程/多机器部署时不会重复执行
- **进程重启持久化**：调度配置存储在数据库，重启后无需重新加载
- **内置指数退避重试**：任务失败后可自动按指数间隔重试

## 概念说明

| 概念 | 说明 |
|------|------|
| **Handler（处理器）** | 实际执行业务逻辑的 TypeScript 函数，需在代码中预先注册 |
| **任务（Job）** | 在后台 UI 中创建，将 Cron 表达式与某个 Handler 关联起来 |
| **执行日志** | 每次任务执行（手动或定时）的详情记录，包含开始/结束时间、状态、输出 |

## 菜单入口

**系统管理 → 定时任务**（路由：`/system/cron-jobs`，权限：`system:cronjob:list`）

## Cron 表达式格式

支持标准 5 段式 Cron：

```text
┌───── 分钟 (0–59)
│ ┌───── 小时 (0–23)
│ │ ┌───── 日期 (1–31)
│ │ │ ┌───── 月份 (1–12)
│ │ │ │ ┌───── 星期 (0–7，0 和 7 均表示周日)
│ │ │ │ │
* * * * *
```

常用示例：

| 表达式 | 含义 |
|--------|------|
| `0 2 * * *` | 每天凌晨 2 点执行 |
| `*/15 * * * *` | 每 15 分钟执行一次 |
| `0 9 * * 1` | 每周一上午 9 点执行 |
| `0 0 1 * *` | 每月 1 日零点执行 |

UI 中提供 Cron 表达式校验按钮，填写后可即时验证格式是否正确。

## 如何注册新的 Handler

Handler 在 `packages/server/src/lib/pg-boss-scheduler.ts` 中通过内部 `handlerRegistry.set(name, fn)` 静态注册。添加新 Handler 需直接修改该文件：

```typescript
// packages/server/src/lib/pg-boss-scheduler.ts
// 在现有 handlerRegistry.set(...) 区块中追加：
handlerRegistry.set('myNewTask', async (params) => {
  // 任务业务逻辑
  console.log('执行自定义任务', params);
});
```

> **注意**：无法从外部模块动态注册 Handler，必须直接编辑 `pg-boss-scheduler.ts`。
> 修改后，在后台「定时任务」页面的「处理器」下拉框中即可看到该 Handler，并为其配置触发时间。

## 相关接口

| 接口 | 说明 |
|------|------|
| `GET /api/cron-jobs` | 获取任务列表（支持按名称筛选） |
| `POST /api/cron-jobs` | 创建任务 |
| `PUT /api/cron-jobs/{id}` | 更新任务 |
| `DELETE /api/cron-jobs/{id}` | 删除任务 |
| `POST /api/cron-jobs/{id}/run` | 立即执行一次（不影响定时计划） |
| `PUT /api/cron-jobs/{id}/status` | 更新任务状态（`enabled` / `disabled`） |
| `GET /api/cron-jobs/logs` | 查看全部执行日志（分页） |
| `GET /api/cron-jobs/{id}/logs` | 查看单任务执行日志（分页） |
| `GET /api/cron-jobs/handlers` | 获取已注册的 Handler 列表 |
| `POST /api/cron-jobs/validate` | 校验 Cron 表达式格式 |
| `GET /api/cron-jobs/export` | 导出任务列表 |

## 数据库表

- `cron_jobs`：任务定义（名称、Handler、Cron 表达式、状态、重试配置）
- `cron_job_logs`：任务执行历史（开始时间、结束时间、状态、输出）
- `pgboss.*`：pg-boss 内部表（独立 schema，自动管理），包括队列、调度、归档等
