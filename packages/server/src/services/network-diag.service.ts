import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';
import * as net from 'node:net';

const execFileAsync = promisify(execFile);

export type NetDiagType = 'ping' | 'traceroute';

/** 验证主机名/IP：只允许合法字符，防止命令注入 */
export function validateHost(host: string): void {
  if (!/^[a-zA-Z0-9._-]{1,253}$/.test(host)) {
    throw new Error('非法主机名或 IP 地址');
  }
}

/** 启动 ping 或 traceroute 子进程，返回 stdout 流和 kill 函数 */
export function spawnNetDiag(
  type: NetDiagType,
  host: string,
): { kill: () => void; lines: NodeJS.ReadableStream } {
  const platform = os.platform();

  let cmd: string;
  let args: string[];

  if (type === 'ping') {
    cmd = 'ping';
    args = platform === 'win32' ? ['-n', '4', host] : ['-c', '4', '-W', '3', host];
  } else {
    cmd = platform === 'win32' ? 'tracert' : 'traceroute';
    args = platform === 'win32' ? ['-h', '30', host] : ['-m', '30', '-w', '3', host];
  }

  const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  // 合并 stderr 到输出
  proc.stderr?.on('data', (d: Buffer) => { proc.stdout.push(d); });

  return {
    kill: () => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } },
    lines: proc.stdout as NodeJS.ReadableStream,
  };
}

/** 执行 nslookup 并返回纯文本结果 */
export async function runNslookup(host: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('nslookup', [host], { timeout: 10000 });
    return stdout + stderr;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return e.stdout ?? e.stderr ?? e.message ?? String(err);
  }
}

/** TCP 端口连通性检测 */
export async function checkPort(
  host: string,
  port: number,
  timeoutMs = 5000,
): Promise<{ open: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      const latencyMs = Date.now() - start;
      socket.destroy();
      resolve({ open: true, latencyMs });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ open: false, latencyMs: timeoutMs });
    });
    socket.on('error', () => {
      resolve({ open: false, latencyMs: Date.now() - start });
    });
    socket.connect(port, host);
  });
}
