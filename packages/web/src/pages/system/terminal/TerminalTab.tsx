import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { TOKEN_KEY } from '@zenith/shared';
import { config } from '@/config';
import '@xterm/xterm/css/xterm.css';

interface TerminalTabProps {
  readonly sessionId: string;
  readonly active: boolean;
}

function buildWsUrl(): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  let wsBase = config.wsBaseUrl;
  if (!wsBase) {
    const base = config.apiBaseUrl || location.origin;
    wsBase = base.replace(/^http/, 'ws');
  }
  return `${wsBase}/api/ws/terminal?token=${encodeURIComponent(token)}`;
}

export default function TerminalTab({ sessionId, active }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);

  // 初始化 xterm + WebSocket（仅在 mount 时执行一次）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      theme: {
        background: '#1e1e2e',
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
      },
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
    const ws = new WebSocket(buildWsUrl());

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

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
