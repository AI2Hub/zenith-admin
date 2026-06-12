import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as inspector from 'node:inspector';
import * as pty from 'node-pty';
import { verifyToken } from '../lib/jwt';
import type { JwtPayload } from '../middleware/auth';
import { isTokenBlacklisted } from '../lib/session-manager';
import { isSuperAdmin, getUserPermissions } from '../lib/permissions';
import { listShells } from '../services/terminal-files.service';

/**
 * 根据前端选择的 shell id 解析实际可执行文件与启动参数。
 * shell 列表由 listShells() 按当前平台动态探测；前端传入的 id 必须在白名单内，
 * 否则回退到平台默认 shell，避免任意可执行文件注入。
 */
function resolveShell(type: string | undefined): { file: string; args: string[] } {
  const { shells, defaultShell } = listShells();
  const id = type && shells.some((s) => s.id === type) ? type : defaultShell;
  const shell = shells.find((s) => s.id === id) ?? shells[0];
  // Windows 下 Git Bash 使用 login + interactive
  if (os.platform() === 'win32' && shell.id === 'bash') {
    return { file: shell.path, args: ['--login', '-i'] };
  }
  return { file: shell.path, args: [] };
}

/**
 * Web 终端 WebSocket 路由
 *
 * 端点：GET /api/ws/terminal?token=<accessToken>
 * 每个连接启动一个独立 pty 进程，连接断开时自动 kill，防止进程泄漏。
 * 权限：需要 `system:terminal:execute`（超级管理员自动拥有）。
 */
export function createWsTerminalRoute(upgradeWebSocket: UpgradeWebSocket) {
  const wsApp = new Hono();

  wsApp.get(
    '/',
    upgradeWebSocket(async (c) => {
      const token = c.req.query('token');
      const shellType = c.req.query('shell');
      const cwdParam = c.req.query('cwd');
      let payload: JwtPayload | null = null;

      if (token) {
        try {
          payload = await verifyToken<JwtPayload>(token);
        } catch {
          payload = null;
        }
      }

      let ptyProcess: pty.IPty | null = null;

      return {
        async onOpen(_evt, ws) {
          if (!payload) {
            ws.close(4001, 'Unauthorized');
            return;
          }

          // 检查 token 黑名单
          if (payload.jti) {
            try {
              const blacklisted = await isTokenBlacklisted(payload.jti);
              if (blacklisted) {
                ws.close(4001, 'Session revoked');
                return;
              }
            } catch { /* Redis 不可用时放行 */ }
          }

          // 权限校验：超管 或 拥有 system:terminal:execute
          const isSA = isSuperAdmin(payload.roles);
          if (!isSA) {
            try {
              const perms = await getUserPermissions(payload.userId);
              if (!perms.includes('system:terminal:execute')) {
                ws.close(4003, 'Forbidden');
                return;
              }
            } catch {
              ws.close(4003, 'Forbidden');
              return;
            }
          }

          // ⚠️ node-pty 在 Windows 上与 Node Inspector（调试器）附加存在已知死锁：
          // 当 inspector 激活时调用 pty.spawn() 会同步阻塞、冻结整个 Node 事件循环，
          // 导致后端所有请求无响应。检测到调试器时拒绝启动 pty，避免卡死整个服务。
          // 正常开发请用 `npm run dev`（已通过 scripts/dev.mjs 剖离 inspector）。
          if (os.platform() === 'win32' && inspector.url() !== undefined) {
            ws.send(JSON.stringify({
              type: 'terminal:error',
              message:
                '检测到 Node 调试器（Inspector）已附加。Windows 下 node-pty 与调试器冲突会导致后端卡死，' +
                'Web 终端已自动禁用。请改用 `npm run dev` 运行后端（已自动剖离调试器）。',
            }));
            ws.close(1011, 'Inspector attached');
            return;
          }

          // 启动 pty 进程（按前端选择的 shell 类型解析可执行文件）
          const { file: shellFile, args: shellArgs } = resolveShell(shellType);

          // 解析工作目录：优先使用前端传入的 cwd（须为已存在目录），否则回退用户主目录
          let cwd = process.env.HOME ?? process.cwd();
          if (cwdParam) {
            try {
              if (fs.existsSync(cwdParam) && fs.statSync(cwdParam).isDirectory()) {
                cwd = cwdParam;
              }
            } catch { /* 无效路径回退默认 */ }
          }

          try {
            ptyProcess = pty.spawn(shellFile, shellArgs, {
              name: 'xterm-256color',
              cols: 80,
              rows: 24,
              cwd,
              env: process.env,
            });

            ptyProcess.onData((data) => {
              try {
                ws.send(JSON.stringify({ type: 'terminal:output', data }));
              } catch { /* ws 可能已关闭 */ }
            });

            ptyProcess.onExit(() => {
              try {
                ws.send(JSON.stringify({ type: 'terminal:exit' }));
                ws.close(1000, 'Process exited');
              } catch { /* ignore */ }
              ptyProcess = null;
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ws.send(JSON.stringify({ type: 'terminal:error', message: `启动终端失败: ${msg}` }));
            ws.close(1011, 'Failed to start terminal');
          }
        },

        onMessage(evt, _ws) {
          if (!ptyProcess) return;
          try {
            const raw: unknown = typeof evt.data === 'string' ? JSON.parse(evt.data) : null;
            if (!raw || typeof raw !== 'object') return;
            const msg = raw as { type: string; data?: string; cols?: number; rows?: number };

            if (msg.type === 'terminal:input' && typeof msg.data === 'string') {
              ptyProcess.write(msg.data);
            } else if (msg.type === 'terminal:resize' && msg.cols && msg.rows) {
              ptyProcess.resize(
                Math.max(1, msg.cols),
                Math.max(1, msg.rows),
              );
            } else if (msg.type === 'terminal:close') {
              ptyProcess.kill();
              ptyProcess = null;
            }
          } catch { /* ignore malformed */ }
        },

        onClose() {
          if (ptyProcess) {
            ptyProcess.kill();
            ptyProcess = null;
          }
        },
      };
    }),
  );

  return wsApp;
}
