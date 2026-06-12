import { useEffect, useRef, useMemo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { TOKEN_KEY } from '@zenith/shared';
import { config } from '@/config';
import { useThemeController } from '@/providers/theme-controller';
import { useTerminalPreferences } from './useTerminalPreferences';
import { resolveTheme, toXtermTheme } from './themes';
import '@xterm/xterm/css/xterm.css';

interface TerminalTabProps {
  readonly sessionId: string;
  readonly active: boolean;
  readonly shell: string;
  readonly cwd?: string;
}

function buildWsUrl(shell: string, cwd?: string): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  let wsBase = config.wsBaseUrl;
  if (!wsBase) {
    const base = config.apiBaseUrl || location.origin;
    wsBase = base.replace(/^http/, 'ws');
  }
  const cwdPart = cwd ? `&cwd=${encodeURIComponent(cwd)}` : '';
  return `${wsBase}/api/ws/terminal?token=${encodeURIComponent(token)}&shell=${encodeURIComponent(shell)}${cwdPart}`;
}

export default function TerminalTab({ sessionId, active, shell, cwd }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const { isDark } = useThemeController();
  const { terminal } = useTerminalPreferences();

  const currentTheme = useMemo(
    () => resolveTheme(isDark ? terminal.themeDark : terminal.themeLight, isDark ? 'dark' : 'light'),
    [isDark, terminal.themeDark, terminal.themeLight],
  );

  // 用 ref 持有最新配置，供仅在 mount 时执行的初始化闭包读取
  const initCfgRef = useRef({
    theme: currentTheme,
    fontSize: terminal.fontSize,
    fontFamily: terminal.fontFamily,
    lineHeight: terminal.lineHeight,
  });
  initCfgRef.current = {
    theme: currentTheme,
    fontSize: terminal.fontSize,
    fontFamily: terminal.fontFamily,
    lineHeight: terminal.lineHeight,
  };

  // 初始化 xterm + WebSocket（仅在 mount 时执行一次）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      theme: toXtermTheme(initCfgRef.current.theme),
      fontFamily: initCfgRef.current.fontFamily,
      fontSize: initCfgRef.current.fontSize,
      lineHeight: initCfgRef.current.lineHeight,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    // 建立 WebSocket 连接
    const ws = new WebSocket(buildWsUrl(shell, cwd));

    ws.onopen = () => {
      // 连接后立即同步当前终端大小
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: 'terminal:resize', cols, rows }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as { type: string; data?: string; message?: string };
        if (msg.type === 'terminal:output' && msg.data) {
          term.write(msg.data);
        } else if (msg.type === 'terminal:exit') {
          term.write('\r\n\x1b[33m[进程已退出]\x1b[0m\r\n');
        } else if (msg.type === 'terminal:error' && msg.message) {
          term.write(`\r\n\x1b[31m[错误] ${msg.message}\x1b[0m\r\n`);
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      term.write('\r\n\x1b[31m[WebSocket 连接错误]\x1b[0m\r\n');
    };

    ws.onclose = (evt) => {
      if (evt.code === 4001) {
        term.write('\r\n\x1b[31m[认证失败，请重新登录]\x1b[0m\r\n');
      } else if (evt.code === 4003) {
        term.write('\r\n\x1b[31m[无权限访问终端]\x1b[0m\r\n');
      } else if (evt.code !== 1000) {
        term.write('\r\n\x1b[33m[连接已断开]\x1b[0m\r\n');
      }
    };

    // 将用户输入发送到服务端 pty
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal:input', data }));
      }
    });

    // 终端大小变化时同步到服务端
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal:resize', cols, rows }));
      }
    });

    // 监听容器 resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      ws.close(1000);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  // sessionId 变化（新 tab）时重新初始化
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // tab 切换为激活时重新 fit
  useEffect(() => {
    if (active && fitRef.current) {
      const timer = setTimeout(() => fitRef.current?.fit(), 50);
      return () => clearTimeout(timer);
    }
  }, [active]);

  // 主题 / 字体 / 字号 / 行高变化时更新终端（不重建实例，保留会话内容）
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = toXtermTheme(currentTheme);
    term.options.fontSize = terminal.fontSize;
    term.options.fontFamily = terminal.fontFamily;
    term.options.lineHeight = terminal.lineHeight;
    fitRef.current?.fit();
  }, [currentTheme, terminal.fontSize, terminal.fontFamily, terminal.lineHeight]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
