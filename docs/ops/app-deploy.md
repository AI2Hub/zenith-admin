# 应用版本与部署

「系统运维」里的应用交付由两个相邻页面组成：

- **应用版本**：统一维护应用（`client` 客户端 / `service` 服务端）、版本和制品。服务端应用的部署包使用 `platform=server`、`kind=archive`，上传与 sha256 校验复用应用版本的制品上传链路。
- **应用部署**：维护部署目标（应用 × 环境 × 主机组 × 部署路径）、部署记录和发布备份。版本页的服务端版本可通过「部署」深链跳转到部署记录。

## 主机目录布局

每个部署目标在主机上使用以下布局，部署不覆盖历史目录：

```text
/opt/apps/order-svc/
├── releases/
│   ├── 20260915071426-1.0.0/
│   └── 20260915072055-1.1.0/
├── shared/
│   ├── logs/
│   └── config/
├── current -> releases/20260915072055-1.1.0
└── tmp/
```

`current` 切换通过临时软链 + `mv` 原子替换；回滚只切换到主机上已有的 release，不需要重新上传制品。部署成功后按 `keepReleases` 清理旧目录，但当前版本与上一版本始终受保护。

## 部署流水线

一次部署由任务中心异步执行，支持滚动 / 并行策略、进度、取消、重试和 WS 日志：

```text
预检 → 上传制品 → sha256 校验 → 解包 → shared 软链 → 切换 current
  → beforeSwitch 钩子 → 重启 → 健康检查 → 清理旧 release
```

健康检查支持 HTTP、TCP 和自定义命令。健康检查失败且目标开启自动回滚时，会切回部署前版本并重启；失败的 release 仍登记为非 current 还原点，便于排查和手工清理。

### 取消与重试

- 切换前取消会停止未开始的主机；切换后的主机继续完成重启和健康检查，避免主机停在「已切换但未重启」。
- 任务中心回收后从数据库中的主机状态继续执行，已成功的主机跳过。
- 「重试失败主机」会创建新的部署记录；同一目标同时只能有一个 pending / running run。

## 安全边界

- 主机只通过统一 `HostExecutor` 执行，命令使用 argv 数组，SSH 使用 TOFU host key 指纹校验。
- 部署目录必须是绝对路径，不能是 `/` 或系统目录；release 名称和 shared 路径经过服务端校验。
- 部署脚本仅允许有部署管理权限的管理员编辑，脚本执行目录固定为目标 release 或 `current`，环境变量通过独立参数传入。
- 制品上传、发布、部署、回滚、删除 release 均有权限和审计记录；部署完成通过 `ops.deploy.finished` 通知发起人。

## API

| 能力 | API |
| --- | --- |
| 部署目标 | `/api/deploy/targets`：列表、详情、CRUD、主机目录对账 |
| 部署记录 | `/api/deploy/runs`：列表、详情、日志增量、发起、重试、取消 |
| 发布备份 | `/api/deploy/releases`：按应用 / 目标 / 主机查询 release 还原点、删除非 current release |
| 应用版本 | `/api/app-releases/apps`、`/api/app-releases/releases`、`/api/app-releases/artifacts` |

执行操作需要 `system:deploy:execute`；部署目标与 release 管理需要 `system:deploy:manage`；只读查看需要 `system:deploy:list`。
