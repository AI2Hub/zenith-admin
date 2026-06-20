# 前端路由与菜单

本页介绍 Zenith Admin 前端路由的注册机制、动态菜单工作原理及路由守卫逻辑。

---

## 整体路由策略

项目使用 `react-router-dom v7`，路由分为两类：

- **固定路由**：硬编码在 `App.tsx` 中，例如 `/login`、`/profile`、`/announcements`、`/inbox`
- **动态路由**：登录后从后端 `/api/menus/user` 接口获取菜单树，按角色权限动态注册，例如 `/system/users`、`/system/roles`

`react-router-dom` 的 `basename` 会自动适配 GitHub Pages 的部署路径（读取 `import.meta.env.BASE_URL`）。Electron 环境使用 `HashRouter`，浏览器环境使用 `BrowserRouter`。

---

## 动态菜单路由注册流程

```text
用户登录成功，token 写入 localStorage
    ↓
App.tsx 渲染 AdminRouteLoader 组件
    ↓
并行请求 GET /api/menus/user 与 GET /api/menus（携带 Bearer token）
    ↓
`/api/menus/user` 返回当前用户有权访问的菜单树，`/api/menus` 用于判断 403/404
    ↓
flattenMenus() 扁平化：只保留有 `path` 且有 `component` 的菜单项（自动过滤固定路由不重复注册）
    ↓
通过 import.meta.glob('./pages/**/*.tsx') 懒加载对应组件文件
    ↓
在 Routes 中动态注册所有 <Route>
    ↓
侧边栏渲染的菜单树也同步来自此数据，与路由保持一致
```

### 菜单 `component` 字段说明

菜单表中 `component` 字段存储**相对于 `packages/web/src/pages/` 的文件路径**（不含 `.tsx` 后缀）。例如：

- `/system/users` → `users/UsersPage`
- `/system/roles` → `system/roles/RolesPage`
- `/system/dicts` → `system/dicts/DictsPage`

运行时会在 `packages/web/src/App.tsx` 中按 `./pages/${m.component}.tsx` 的形式拼接并懒加载；例如上面的 `users/UsersPage` 最终对应 `packages/web/src/pages/users/UsersPage.tsx`。

---

## 路由守卫

### 未登录保护

`App.tsx` 通过 `useAuth()` hook 检查 `localStorage` 中是否存在有效 token：

- **未登录**：可访问 `/login`、`/reset-password`、`/oauth/callback/:provider`、`/oauth2/authorize`；其他路由重定向到 `/login`，并通过 `redirect` query 保留来源路径
- **已登录**：进入 `AdminRouteLoader`，加载菜单后渲染后台布局
- **已登录访问认证页**：访问 `/login` 时跳转到安全的 `redirect` 目标或首页；访问 `/reset-password` 时跳转首页

### 无权限保护

用户访问没有对应菜单注册的路由时，会命中 `*` 通配路由。前端使用 `/api/menus` 返回的完整菜单路径判断页面是否存在：页面存在但当前用户菜单中没有注册时渲染 403；路径不存在时渲染 404。

按钮级权限通过 `PermissionContext` + `usePermission` hook 实现：

```tsx
import { usePermission } from '@/hooks/usePermission';

const { hasPermission } = usePermission();

// 只有拥有 'system:user:create' 权限的用户才能看到「新增」按钮
{hasPermission('system:user:create') && (
  <Button onClick={openCreate}>新增</Button>
)}
```

---

## 系统内置路由

以下路由为固定注册，与菜单数据库无关：

- `/login`：登录页（无需登录）
- `/reset-password`：重置密码页（无需登录）
- `/oauth/callback/:provider`：OAuth 第三方登录回调页（无需登录）
- `/oauth2/authorize`：OAuth2 授权同意页
- `/`：仪表盘首页（需要登录）
- `/profile`：个人中心（需要登录）
- `/announcements`：公告中心（需要登录）
- `/inbox`：我的消息（需要登录）
- `/workflow/designer/:id`：工作流设计器（接受动态 id 参数，需要登录）
- `/users`：重定向到 `/system/users`
- `/forbidden`：无权限提示页（需要登录）

`/profile`、`/announcements` 和 `/inbox` 虽然对应系统菜单中的隐藏菜单项，但路由是硬编码的，不经过动态加载。

---

## 标签页（Tab）管理

后台布局中包含标签页（多 Tab）导航，用户访问过的页面会以 Tab 形式保留在顶部。

**右键上下文菜单**支持以下操作：

- 固定/取消固定标签页
- 关闭当前标签
- 关闭其他标签
- 关闭左侧标签
- 关闭右侧标签
- 关闭全部标签

标签页支持拖拽排序、最大数量限制和 FIFO/LRU 自动淘汰策略。开启「保持标签页」偏好后，标签页状态持久化到 `localStorage` 的 `zenith_tabs`；关闭该偏好时仅保存在内存中。

---

## 路由加载性能

所有固定页面和动态页面组件均使用 `React.lazy` + `<Suspense>` 懒加载，动态页面通过 `import.meta.glob(['./pages/**/*.tsx', '!./pages/**/**Skeleton.tsx'])` 按菜单 `component` 字段加载；仪表盘首页使用 `DashboardSkeleton` 作为专用加载占位，其余页面使用轻量加载点占位。后台布局中还有 `NProgress` 顶部路由切换进度条。

---

## pages 目录结构

`packages/web/src/pages/` 下的一级目录包括：

```text
ai
analytics
announcements
chat
dashboard
forbidden
inbox
login
member
not-found
oauth
oauth2
payment
profile
reset-password
system
users
workflow
```

---

## 新增页面的完整流程

1. 在 `packages/web/src/pages/<module>/<ComponentName>.tsx` 创建页面组件
2. 在数据库 `menus` 表中新增菜单记录，`component` 字段填写相对路径（如 `<module>/<ComponentName>`）
3. 运行 `npm run db:seed` 或在「菜单管理」后台页面中手动创建菜单并分配权限
4. 刷新页面，动态路由自动注册，侧边栏自动显示新菜单
