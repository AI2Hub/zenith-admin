# Docker 部署

使用 Docker Compose 一键启动 Zenith Admin 全部服务（PostgreSQL + Redis + API + Nginx），无需在宿主机手动安装运行时环境。

## 前置依赖

- [Docker](https://docs.docker.com/get-docker/) >= 24
- [Docker Compose](https://docs.docker.com/compose/) >= v2（已内置于 Docker Desktop）

---

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/iwangbowen/zenith-admin.git
cd zenith-admin

# 2. 配置环境变量（至少修改 JWT_SECRET）
cp .env.docker .env
# 用编辑器打开 .env，修改 JWT_SECRET 为强随机字符串

# 3. 启动全部服务（首次会自动构建镜像，约 2-5 分钟）
docker compose up -d

# 4. 查看服务状态
docker compose ps
```

服务启动完成后，访问：

- **前端**：`http://localhost`（默认 80 端口）
- **API**：`http://localhost:3300`（仅需调试时使用）

> 首次启动时后端容器会自动执行 Drizzle 数据库迁移，无需手动操作。

---

## 服务拓扑

```text
postgres ─┐
redis    ─┤──→  api (Node.js :3300)  ──→  web (Nginx :80)
```

| 服务 | 镜像 | 说明 |
| --- | --- | --- |
| `postgres` | `postgres:16-alpine` | 持久化业务数据 |
| `redis` | `redis:7-alpine` | 会话状态与黑名单 |
| `api` | 本地构建 `server` stage | Hono 后端，启动时自动迁移 |
| `web` | 本地构建 `web` stage | Nginx 托管前端 + 反向代理 `/api` |

---

## 环境变量

复制 `.env.docker` 为 `.env` 后按需修改：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | *(必须修改)* | JWT 签名密钥，生产环境使用 ≥ 32 字符强随机字符串 |
| `POSTGRES_PASSWORD` | `postgres` | PostgreSQL 密码 |
| `POSTGRES_PORT` | `5432` | PostgreSQL 宿主机映射端口 |
| `REDIS_PASSWORD` | *(空，无认证)* | Redis 密码，留空则不启用 `requirepass` |
| `REDIS_PORT` | `6379` | Redis 宿主机映射端口 |
| `REDIS_URL` | `redis://redis:6379` | 覆盖完整 Redis 连接 URL（外部 Redis 或 Redis 密码场景使用） |
| `WEB_PORT` | `80` | 前端对外端口 |
| `API_PORT` | `3300` | 后端 API 对外端口 |
| `ALLOWED_ORIGINS` | *(空)* | CSRF 白名单，生产环境设置为前端域名 |
| `CORS_ORIGIN` | `*` | CORS 允许来源，同域部署无需修改 |
| `LOG_LEVEL` | `info` | 日志级别（`debug` / `info` / `warn` / `error`） |
| `TAG` | `latest` | 镜像标签，多版本管理时使用（如 `0.63.0`） |

::: warning 生产环境安全提示
`JWT_SECRET` 务必修改为强随机字符串。推荐使用：

```bash
openssl rand -base64 32
```

同时建议设置 `ALLOWED_ORIGINS` 防止 CSRF 攻击。若设置 `REDIS_PASSWORD`，请同步将 `REDIS_URL` 配置为带密码的连接串，例如 `redis://:your_password@redis:6379/0`。
:::

---

## 常用操作

```bash
# 查看所有服务实时日志
docker compose logs -f

# 只看后端日志
docker compose logs -f api

# 只看 Nginx 日志
docker compose logs -f web

# 停止所有服务（保留数据卷）
docker compose down

# 停止并删除所有数据卷（⚠️ 数据将永久丢失）
docker compose down -v

# 进入后端容器调试
docker compose exec api sh

# 查看数据库
docker compose exec postgres psql -U postgres -d zenith_admin
```

---

## 升级版本

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建镜像（--no-cache 确保获取最新依赖）
docker compose build --no-cache

# 3. 重启服务（数据库迁移在容器启动时自动执行）
docker compose up -d
```

---

## 本地开发基础设施

如果你在本地以 `npm run dev` 开发，只需用 Docker 启动数据库和缓存服务即可：

```bash
# 启动 PostgreSQL(5432) + Redis(6379)，与本地 dev 默认连接配置一致
docker compose -f docker-compose.dev.yml up -d

# 正常启动开发服务器
npm run dev
```

此方式不会构建 Node.js / Nginx 镜像，启动速度极快。

---

## 镜像构建说明

`Dockerfile` 采用多阶段构建，最终生成两个精简镜像：

| 阶段 | 目标镜像 | 基础 | 说明 |
| --- | --- | --- | --- |
| `builder` | *(中间层)* | `node:24-alpine` | 安装全量依赖、编译 shared + server + web |
| `server` | `zenith-admin-api` | `node:22-alpine` | 仅含生产依赖 + 编译产物，约 300MB |
| `web` | `zenith-admin-web` | `nginx:1.27-alpine` | 静态文件 + nginx 配置，约 30MB |

**关键技术说明**：`packages/shared` 的 `package.json` 开发模式下导出 TypeScript 源文件（供 `tsx` 使用），在 `builder` 阶段完成编译后，Dockerfile 会自动将 exports 切换为 `dist/*.js`，保证生产环境 Node.js 能正常解析，无需改动源代码。

---

## 数据持久化

所有运行时数据均通过 Docker 命名卷持久化，容器重启或重建后数据不会丢失：

| 卷名 | 内容 |
| --- | --- |
| `postgres_data` | 所有业务数据 |
| `redis_data` | 会话状态与强制下线黑名单 |
| `api_storage` | 本地文件上传（`STORAGE_PROVIDER=local` 时使用） |
| `api_logs` | 服务器运行日志 |

备份数据卷：

```bash
# 备份 PostgreSQL
docker compose exec postgres pg_dump -U postgres zenith_admin > backup.sql

# 恢复 PostgreSQL
docker compose exec -T postgres psql -U postgres zenith_admin < backup.sql
```
