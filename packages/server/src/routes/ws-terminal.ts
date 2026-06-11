import { Hono } from 'hono';
import type { UpgradeWebSocket } from 'hono/ws';
import * as os from 'node:os';
import * as pty from 'node-pty';
import { verifyToken } from '../lib/jwt';
import type { JwtPayload } from '../middleware/auth';
import { isTokenBlacklisted } from '../lib/session-manager';
import { isSuperAdmin, getUserPermissions } from '../lib/permissions';

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

          // 启动 pty 进程
          const shell =
            os.platform() === 'win32'
              ? (process.env.COMSPEC ?? 'powershell.exe')
              : (process.env.SHELL ?? '/bin/bash');

          try {
            ptyProcess = pty.spawn(shell, [], {
              name: 'xterm-256color',
              cols: 80,
              rows: 24,
              cwd: process.env.HOME ?? process.cwd(),
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
