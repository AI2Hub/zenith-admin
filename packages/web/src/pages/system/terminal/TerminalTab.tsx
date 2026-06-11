import { useEffect, useRef } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { TOKEN_KEY } from '@zenith/shared';
import { config } from '@/config';
import { useThemeController } from '@/providers/theme-controller';
import '@xterm/xterm/css/xterm.css';

export type ShellType = 'powershell' | 'cmd' | 'bash';

interface TerminalTabProps {
  readonly sessionId: string;
  readonly active: boolean;
  readonly shell: ShellType;
}

// 深色主题（与应用内容区暗色背景 --color-layout-bg 一致）
const DARK_THEME: ITheme = {
  background: '#232429',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  selectionBackground: '#45475a',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#cba6f7',
  cyan: '#94e2d5',
  white: '#bac2de',
};

// 浅色主题（VS Code Light 风格）
const LIGHT_THEME: ITheme = {
  background: '#ffffff',
  foreground: '#383a42',
  cursor: '#000000',
  selectionBackground: '#add6ff',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
};

function getTheme(isDark: boolean): ITheme {
  return isDark ? DARK_THEME : LIGHT_THEME;
}

function buildWsUrl(shell: ShellType): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  let wsBase = config.wsBaseUrl;
  if (!wsBase) {
    const base = config.apiBaseUrl || location.origin;
    wsBase = base.replace(/^http/, 'ws');
  }
  return `${wsBase}/api/ws/terminal?token=${encodeURIComponent(token)}&shell=${encodeURIComponent(shell)}`;
}

export default function TerminalTab({ sessionId, active, shell }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const { isDark } = useThemeController();
  // 用 ref 持有最新 isDark，供仅在 mount 时执行的初始化闭包读取
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  // 初始化 xterm + WebSocket（仅在 mount 时执行一次）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      theme: getTheme(isDarkRef.current),
      fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2,
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
    const ws = new WebSocket(buildWsUrl(shell));

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

  // 明暗模式切换时更新终端配色（不重建终端，保留会话内容）
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getTheme(isDark);
    }
  }, [isDark]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
