/**
 * 统一的 OpenAPI 实体 DTO 定义，供所有路由模块复用。
 *
 * 实体 DTO 按业务域组织在 `./dtos/` 子目录，本文件作为统一的
 * re-export 入口，统一通过 `import { XxxDTO } from '../lib/openapi-dtos'` 导入。
 *
 * 新增 DTO 请直接在对应的子文件中维护：
 *   - dtos/roles.ts          角色
 *   - dtos/positions.ts      岗位
 *   - dtos/users.ts          用户
 *   - dtos/menus.ts          菜单
 *   - dtos/departments.ts    部门
 *   - dtos/tenants.ts        租户
 *   - dtos/api-tokens.ts     API Token
 *   - dtos/auth.ts           认证 / OAuth
 *   - dtos/dict.ts           字典
 *   - dtos/files.ts          文件存储
 *   - dtos/logs.ts           日志
 *   - dtos/announcements.ts  公告
 *   - dtos/system-configs.ts 系统配置 / 密码策略
 *   - dtos/cron-jobs.ts      定时任务
 *   - dtos/email-config.ts   邮件配置
 *   - dtos/cache.ts          缓存
 *   - dtos/db-backups.ts     数据库备份
 *   - dtos/monitor.ts        服务器监控
 *   - dtos/sessions.ts       在线会话 / 用户登录会话
 *   - dtos/workflow.ts       工作流
 *   - dtos/dashboard.ts      仪表盘
 *   - dtos/region.ts         地区
 *   - dtos/messages.ts       消息模板
 */
export * from './dtos';
