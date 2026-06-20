# Demo 演示模式（MSW Mock）

Zenith Admin 支持无后端服务的纯前端演示模式，通过 [MSW（Mock Service Worker）](https://mswjs.io/) 拦截所有 API 请求，在浏览器中直接返回预设的 Mock 数据。Demo 站即使用此模式构建，托管在 GitHub Pages 上。

---

## 工作原理

```text
浏览器发出 fetch/XHR 请求
    ↓
Service Worker（mockServiceWorker.js）拦截请求
    ↓
MSW Handler 匹配路径和方法
    ↓
返回 Mock 数据（无实际网络请求）
    ↓
前端像收到真实接口响应一样正常渲染
```

整个过程对前端业务代码（`request.ts`）完全透明，无需修改任何业务逻辑。

---

## 开启 Demo 模式

在 `packages/web/.env` 中设置：

```ini
VITE_DEMO_MODE=true
```

启动后，前端请求会由 `mockServiceWorker.js` 按已注册的 handlers 处理。

---

## 构建 Demo 站

```bash
npm run build:demo
```

此命令使用 `packages/web/.env.demo` 中的变量构建前端，并将产物输出到 `packages/web/dist/`。

实际构建产物会先输出到 `packages/web/dist/`，随后由 `.github/workflows/pages.yml` 在 CI 中复制到 `docs/.vitepress/dist/demo/`，再与文档站一起发布。

```ini
# packages/web/.env.demo 的关键变量
VITE_DEMO_MODE=true
VITE_APP_TITLE=Zenith Admin
VITE_API_BASE_URL=
VITE_WS_BASE_URL=
VITE_BASE_URL=
```

Demo 站与文档站通过 `.github/workflows/pages.yml` 一同部署到 GitHub Pages。

---

## 目录结构

```text
packages/web/src/mocks/
├── data/               # 静态 Mock 数据（与 seed-data.ts / seed.ts 对齐）
│   ├── ai.ts
│   ├── announcements.ts
│   ├── chat.ts
│   ├── chat-bots.ts
│   ├── checkin.ts
│   ├── data-mask.ts
│   ├── departments.ts
│   ├── dicts.ts
│   ├── email-config.ts
│   ├── email-send-logs.ts
│   ├── email-templates.ts
│   ├── in-app-messages.ts
│   ├── in-app-templates.ts
│   ├── logs.ts
│   ├── members.ts
│   ├── menus.ts
│   ├── payment.ts
│   ├── positions.ts
│   ├── regions.ts
│   ├── roles.ts
│   ├── sms-configs.ts
│   ├── sms-send-logs.ts
│   ├── sms-templates.ts
│   ├── system.ts
│   ├── tags.ts
│   ├── tenants.ts
│   ├── user-groups.ts
│   ├── users.ts
│   ├── workflow-categories.ts
│   ├── workflow-forms.ts
│   ├── workflow.ts
│   └── index.ts        # 汇总导出
├── handlers/           # MSW Handler 定义（每个模块一个文件）
│   ├── ai-conversations.ts
│   ├── ai-prompt-templates.ts
│   ├── ai-providers.ts
│   ├── ai-usage.ts
│   ├── analytics.ts
│   ├── api-tokens.ts
│   ├── announcements.ts
│   ├── auth.ts
│   ├── cache.ts
│   ├── chat.ts
│   ├── chat-bots.ts
│   ├── checkin.ts
│   ├── cron-jobs.ts
│   ├── dashboard.ts
│   ├── data-mask.ts
│   ├── db-admin.ts
│   ├── db-backups.ts
│   ├── db-query-favorites.ts
│   ├── departments.ts
│   ├── dicts.ts
│   ├── email-config.ts
│   ├── email-send-logs.ts
│   ├── email-templates.ts
│   ├── fallback.ts
│   ├── files.ts
│   ├── frontend-errors.ts
│   ├── in-app-messages.ts
│   ├── in-app-templates.ts
│   ├── ip-access-logs.ts
│   ├── login-logs.ts
│   ├── maintenance.ts
│   ├── member-admin.ts
│   ├── member-front.ts
│   ├── menus.ts
│   ├── monitor-alerts.ts
│   ├── monitor.ts
│   ├── oauth.ts
│   ├── oauth-config.ts
│   ├── oauth2-apps.ts
│   ├── oauth2-auth.ts
│   ├── operation-logs.ts
│   ├── payment.ts
│   ├── ports.ts
│   ├── positions.ts
│   ├── rate-limit.ts
│   ├── regions.ts
│   ├── roles.ts
│   ├── sessions.ts
│   ├── sms-configs.ts
│   ├── sms-send-logs.ts
│   ├── sms-templates.ts
│   ├── system-configs.ts
│   ├── tags.ts
│   ├── tenants.ts
│   ├── terminal-files.ts
│   ├── terminal-sessions.ts
│   ├── user-ai-config.ts
│   ├── user-groups.ts
│   ├── user-permissions.ts
│   ├── users.ts
│   ├── workflow-automations.ts
│   ├── workflow-categories.ts
│   ├── workflow-extra.ts
│   ├── workflow-forms.ts
│   ├── workflow.ts
│   └── index.ts        # 汇总所有 handlers
├── utils/              # 辅助工具
│   └── date.ts         # mockDateTime() / mockDate()
├── browser.ts          # setupWorker（浏览器环境）
└── index.ts            # enableMocking() 入口，VITE_DEMO_MODE 控制是否激活
```

---

## 维护规范

### 新增业务模块时

1. 若模块有初始种子数据，先在 `packages/shared/src/seed-data.ts` 中声明对应 `SEED_XXXS` 常量
2. 在 `packages/server/src/db/seed.ts` 中导入并写入数据库
3. 在 `data/` 下创建对应数据文件，导入共享种子数据并按 Demo 需要展开
4. 在 `handlers/` 下创建对应的 Handler 文件，实现接口模拟
5. 在 `handlers/index.ts` 中导入并注册新 Handler
6. 在 `data/index.ts` 中导出新数据

### 修改 API 接口格式时

如果后端接口的请求/响应格式发生变化，需要同步更新对应的 MSW Handler，确保 Demo 模式不出现格式不一致的问题。

---

## Handler 示例

```typescript
// packages/web/src/mocks/handlers/positions.ts
import { http, HttpResponse } from 'msw';
import { mockPositions } from '@/mocks/data/positions';

export const positionsHandlers = [
  http.get('/api/positions', ({ request }) => {
    const url = new URL(request.url);
    const keyword = url.searchParams.get('keyword') ?? '';
    const status = url.searchParams.get('status') ?? '';
    const page = Number(url.searchParams.get('page')) || 1;
    const pageSize = Number(url.searchParams.get('pageSize')) || 10;

    const filtered = mockPositions.filter((p) => {
      if (keyword && !p.name.includes(keyword) && !p.code.includes(keyword)) return false;
      if (status && p.status !== status) return false;
      return true;
    });
    const total = filtered.length;
    const list = filtered.slice((page - 1) * pageSize, page * pageSize);
    return HttpResponse.json({ code: 0, message: 'ok', data: { list, total, page, pageSize } });
  }),
];
```

---

## 访问 Demo 站

线上 Demo 站地址：[https://iwangbowen.github.io/zenith-admin/demo/](https://iwangbowen.github.io/zenith-admin/demo/)

默认登录账号：

| 账号    | 密码     | 说明                     |
| ------- | -------- | ------------------------ |
| `admin` | `123456` | 超级管理员，拥有所有权限 |
