import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';

const execFileAsync = promisify(execFile);

export interface PortEntry {
  protocol: string;
  localAddress: string;
  localPort: number;
  state: string;
  pid: number | null;
  processName: string | null;
}

/**
 * 获取当前系统正在监听的端口列表。
 * Linux/macOS：使用 `ss -tlnp` 或回退到 `netstat -tlnp`。
 * Windows：使用 `netstat -ano`。
 */
export async function getListeningPorts(): Promise<PortEntry[]> {
  const platform = os.platform();
  if (platform === 'win32') {
    return getPortsWindows();
  }
  return getPortsUnix();
}

async function getPortsUnix(): Promise<PortEntry[]> {
  let output = '';
  try {
    // 优先使用 ss（更现代，性能更好）
    const { stdout } = await execFileAsync('ss', ['-tlnp'], { timeout: 5000 });
    output = stdout;
    return parseSsOutput(output);
  } catch {
    // 回退到 netstat
    try {
      const { stdout } = await execFileAsync('netstat', ['-tlnp'], { timeout: 5000 });
      output = stdout;
      return parseNetstatOutput(output);
    } catch {
      return [];
    }
  }
}

async function getPortsWindows(): Promise<PortEntry[]> {
  try {
    const { stdout } = await execFileAsync('netstat', ['-ano'], { timeout: 5000 });
    return parseNetstatWindowsOutput(stdout);
  } catch {
    return [];
  }
}

/** 解析 `ss -tlnp` 输出 */
function parseSsOutput(output: string): PortEntry[] {
  const entries: PortEntry[] = [];
  const lines = output.split('\n').slice(1); // 跳过标题行
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const [proto, , , local] = parts;
    if (!proto || (!proto.startsWith('tcp') && !proto.startsWith('udp'))) continue;
    const colonIdx = local.lastIndexOf(':');
    if (colonIdx < 0) continue;
    const localAddr = local.slice(0, colonIdx);
    const localPort = Number.parseInt(local.slice(colonIdx + 1), 10);
    if (Number.isNaN(localPort)) continue;
    // 解析进程信息：users:(("nginx",pid=123,fd=6))
    const processInfo = parts.find((p) => p.startsWith('users:'));
    let pid: number | null = null;
    let processName: string | null = null;
    if (processInfo) {
      const nameMatch = /"([^"]+)"/.exec(processInfo);
      const pidMatch = /pid=(\d+)/.exec(processInfo);
      if (nameMatch) processName = nameMatch[1];
      if (pidMatch) pid = Number.parseInt(pidMatch[1], 10);
    }
    entries.push({ protocol: proto.replace(/\d$/, ''), localAddress: localAddr, localPort, state: 'LISTEN', pid, processName });
  }
  return entries;
}

/** 解析 `netstat -tlnp` 输出（Linux） */
function parseNetstatOutput(output: string): PortEntry[] {
  const entries: PortEntry[] = [];
  const lines = output.split('\n').slice(2); // 跳过两行标题
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const [proto, , , local, , stateOrPid] = parts;
    if (!proto || (!proto.startsWith('tcp') && !proto.startsWith('udp'))) continue;
    const colonIdx = local.lastIndexOf(':');
    if (colonIdx < 0) continue;
    const localAddr = local.slice(0, colonIdx);
    const localPort = Number.parseInt(local.slice(colonIdx + 1), 10);
    if (Number.isNaN(localPort)) continue;
    // state 字段在 tcp 中是第 6 列，pid/program 在第 7 列
    const state = stateOrPid === 'LISTEN' ? 'LISTEN' : parts[5] ?? '';
    const pidInfo = parts[6] ?? '';
    const pidMatch = /^(\d+)\/(.+)/.exec(pidInfo);
    const pid = pidMatch ? Number.parseInt(pidMatch[1], 10) : null;
    const processName = pidMatch ? pidMatch[2] : null;
    entries.push({ protocol: proto.replace(/\d$/, ''), localAddress: localAddr, localPort, state, pid, processName });
  }
  return entries;
}

/** 解析 `netstat -ano` 输出（Windows） */
function parseNetstatWindowsOutput(output: string): PortEntry[] {
  const entries: PortEntry[] = [];
  const lines = output.split('\n').slice(4); // 跳过标题
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [proto, local, , state, pidStr] = parts;
    if (!proto || (!proto.startsWith('TCP') && !proto.startsWith('UDP'))) continue;
    if (state !== 'LISTENING') continue;
    const colonIdx = local.lastIndexOf(':');
    if (colonIdx < 0) continue;
    const localAddr = local.slice(0, colonIdx);
    const localPort = Number.parseInt(local.slice(colonIdx + 1), 10);
    if (Number.isNaN(localPort)) continue;
    const pid = pidStr ? Number.parseInt(pidStr, 10) : null;
    entries.push({ protocol: proto.toLowerCase().replace(/\d$/, ''), localAddress: localAddr, localPort, state: 'LISTEN', pid, processName: null });
  }
  return entries;
}
