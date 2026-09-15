# SQL 监控

SQL 监控位于「系统设置 → 系统监控 → SQL 监控」（`/system/sql-monitor`），与数据库管理台职责分离：

- **服务监控 → 数据库 Tab**：展示连接数、缓存命中率、事务、死锁和慢 SQL Top 5 等摘要，并提供 SQL 监控入口。
- **数据库管理**：负责表结构、数据浏览、SQL 控制台、执行历史、备份、ER 图和表 / 索引维护。
- **SQL 监控**：负责查询统计、活动会话、锁与阻塞、历史采样和受权限保护的取消 / 终止操作。

## 数据来源

实时查询统计来自 PostgreSQL `pg_stat_statements`，活动会话来自 `pg_stat_activity`，锁等待来自 `pg_locks`。扩展不可用时页面仍展示数据库连接和缓存等基础状态，并明确提示查询统计不可用，不影响服务监控和数据库管理台。

生产数据库需要在 `postgresql.conf` 中配置：

```text
shared_preload_libraries = 'pg_stat_statements'
```

然后重启 PostgreSQL。迁移会在扩展可用时尝试执行 `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`；无法启用时迁移不会阻断系统启动。

## 采样与调度

系统指标和 SQL 采样由固定系统调度任务 `monitor-metrics-persist` 每分钟触发。SQL 采样开关、采样间隔、每次采样 Top N 和 SQL 文本长度通过「SQL 监控」运行时设置管理，不在普通用户定时任务中重复创建。

采样按累计总耗时保存 Top SQL 快照，原始文本经过截断和脱敏。`pg_stat_statements` 不提供真实 P95 / P99，因此页面只展示调用次数、总耗时、平均耗时、缓存块和临时块等可验证指标，不用平均值伪造分位数。

## 数据保留

`sql_query_samples` 已注册到「数据保留」页面，默认保留 14 天，由统一 `data-retention` 系统任务分批清理。SQL 监控页面只展示当前有效保留天数并跳转到数据保留配置，不维护第二套清理逻辑。

## 安全边界

- SQL 监控接口仅平台运维权限可见，不向租户管理员暴露其他租户或平台 SQL。
- SQL 文本展示前会清理字符串、数字、注释和 dollar-quoted 内容；活动会话同样脱敏。
- 取消 / 终止会话需要独立权限，并校验 `pid` 对应的 backend 启动令牌，避免 PID 复用误操作。
- 重置 `pg_stat_statements` 和清空采样历史需要 SQL 监控管理权限。
