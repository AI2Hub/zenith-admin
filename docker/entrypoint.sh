#!/bin/sh
# Server entrypoint.
#
# 迁移由 compose 的 `migrate` 服务（或 k8s Job）在服务启动前执行一次，
# 避免 api / worker 副本各自启动时并发迁移；
# 见 docker-compose.yml。要手动执行：docker compose run --rm migrate
#
# 传入参数时直接执行该命令（compose 的 `command:` 覆盖，例如 migrate 服务的
# `node dist/db/migrate.js`），否则启动服务进程；进程角色由 ZENITH_ROLES 决定。
# Using exec so Node.js receives OS signals (SIGTERM) for graceful shutdown.
set -e

# npm scripts inject npm_package_version automatically; plain `node` does not.
# /api/health reports it, so derive it from package.json here.
export npm_package_version="$(node -p "require('./package.json').version")"

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

echo "Starting server (ZENITH_ROLES=${ZENITH_ROLES:-<unset>})..."
exec node dist/index.js
