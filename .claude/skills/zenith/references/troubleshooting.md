# 调试与排错指南

常见问题及其排查步骤。

---

## Drizzle 迁移错误

### 问题：`npm run db:generate` 报错 "Integrity constraint violation"

**原因**：尝试对已有数据的列做不可兼容的修改（如 NOT NULL 列加到已有数据的表）。

**解决**：

1. 先给列设为 nullable，执行迁移
2. 更新已有数据
3. 再将列改为 NOT NULL

### 问题：pgEnum 添加新值失败

**原因**：PostgreSQL 的 `ALTER TYPE ADD VALUE` 有限制（不能放在中间位置）。

**解决**：Drizzle 会自动处理。如果手动写 SQL，新值只能添加到枚举末尾。如需在中间插入，需要创建新枚举并迁移。

### 问题：迁移文件已存在但 schema 有变化

**解决**：删除 `packages/server/drizzle/` 下最新的迁移文件，重新运行 `npm run db:generate`。

---

## Swagger 文档不更新

### 问题：新增路由后 `/api/docs` 不显示

**检查清单**：

1. 路由是否已在 `packages/server/src/index.ts` 中通过 `app.route('/api/xxx', xxxRoutes)` 注册？
2. 路由文件是否调用了 `xxxRouter.openapiRoutes([...] as const)`？
3. 是否重启了开发服务器？（热更新可能不生效，需要手动重启）
4. 检查浏览器缓存，尝试硬刷新（Ctrl+Shift+R）

### 问题：DTO 在 Swagger 中重复显示

**原因**：在路由文件中本地声明了带 `.openapi('EntityName')` 的 DTO，与 `lib/dtos/` 中的定义冲突。

**解决**：删除路由文件中的本地 DTO 声明，从 `lib/openapi-dtos` 导入。

---

## MSW Mock 不生效

### 问题：前端请求仍然打到真实后端

**检查清单**：

1. 确认环境变量 `VITE_DEMO_MODE=true`（检查 `packages/web/.env.demo` 或 `.env.development`）
2. 确认 `packages/web/src/mocks/index.ts` 中的 `enableMocking()` 被调用
3. 检查浏览器 DevTools → Application → Service Workers，确认 MSW worker 已注册
4. 新 handler 是否在 `packages/web/src/mocks/handlers/index.ts` 中注册？
5. 检查浏览器控制台是否有 MSW 的 warning（如 "passthrough" 表示请求未被拦截）

### 问题：Mock 数据与 seed 数据不一致

**解决**：以 `packages/server/src/db/seed.ts` 为准，同步更新 `packages/web/src/mocks/data/` 中的对应文件。

---

## 前后端类型不匹配

### 问题：前端 `res.data` 类型报错

**原因**：后端 DTO 和前端 `Xxx` 接口字段不一致。

**排查步骤**：

1. 对比 `packages/server/src/lib/dtos/xxx.ts` 中的 `XxxDTO` 和 `packages/shared/src/types.ts` 中的 `Xxx` 接口
2. 确保字段名、类型、可选性一致
3. 时间字段：后端 DTO 为 `z.string()`，前端 interface 为 `string`（`YYYY-MM-DD HH:mm:ss`）

### 问题：请求参数类型报错

**排查步骤**：

1. 检查 `packages/shared/src/validation.ts` 中的 schema 定义
2. 前端 `request.post('/api/xxx', payload)` 的 payload 类型应与 `CreateXxxInput` 匹配
3. 注意 `z.coerce.number()` 和 `z.number()` 的区别（前者自动转换字符串）

---

## 路由 404 错误

### 问题：访问 `/api/xxx` 返回 404

**检查清单**：

1. 路由是否已注册到 `packages/server/src/index.ts`？
2. `app.route('/api/xxxs', xxxRoutes)` 的路径前缀是否正确？
3. 路由文件中的 `path` 是否正确？（`/` 表示列表，`/{id}` 表示详情）
4. 检查 `xxxRouter.openapiRoutes([...])` 是否包含了该路由

### 问题：`DELETE /batch` 被匹配为 `DELETE /{id}`

**原因**：路由注册顺序错误。

**解决**：确保 `batchDeleteRoute` 在 `deleteRoute_` **之前**注册到 `openapiRoutes([...])`。

---

## 权限相关

### 问题：403 Forbidden

**排查步骤**：

1. 确认当前用户角色是否有对应权限码（如 `system:xxx:list`）
2. 检查 `guard({ permission: '...' })` 中的权限码是否与菜单中定义的 `permission` 一致
3. 超管角色（`role: 'admin'`）自动跳过权限检查

### 问题：按钮显示了但无权限操作

**原因**：前端没有用 `hasPermission()` 控制按钮显示。

**解决**：在操作按钮外层包裹 `{hasPermission('system:xxx:action') && <Button>...</Button>}`。

---

## 数据库查询问题

### 问题：分页 total 不正确

**排查步骤**：

1. 确认使用了 `db.$count(table, where)` 而非 `count()`
2. 确认 count 和 list 的 `where` 条件一致
3. 如果有 dataScope 或 tenantScope 过滤，count 查询也需要应用相同条件

### 问题：RQB 关联查询返回 null

**排查步骤**：

1. 确认 `schema.ts` 中已声明 `xxxRelations`
2. 确认 `db` 实例创建时传入了 `schema`
3. 检查 `with:` 中的关联名是否与 relations 中定义的一致

---

## 构建错误

### 问题：`npm run build` 失败

**排查步骤**：

1. 查看错误信息中的文件路径和行号
2. 常见原因：
   - 导入路径错误（相对路径 `../` 层级不对）
   - 类型不匹配（DTO 和 interface 不一致）
   - 缺少 `.openapi()` 调用（DTO 必须调用 `.openapi('Name')`）
3. 使用 `npm run dev:server` 或 `npm run dev:web` 可以获得更详细的实时错误信息

### 问题：共享包类型找不到

**原因**：`@zenith/shared` 的 tsconfig path 映射未正确配置。

**解决**：确认 `tsconfig.json` 中的 `paths` 包含 `"@zenith/shared": ["../../shared/src"]` 或类似映射。
