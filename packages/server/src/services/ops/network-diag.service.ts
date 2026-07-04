import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';
import * as net from 'node:net';
import * as dns from 'node:dns/promises';
import { httpRequest } from '../../lib/http-client';

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

// ─── DNS 记录解析（A/AAAA/MX/TXT/NS/CNAME/SOA）──────────────────────────────
export type DnsRecordType = 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME' | 'SOA';

export async function resolveDns(host: string, type: DnsRecordType): Promise<{ type: DnsRecordType; records: string[] }> {
  try {
    let records: string[] = [];
    switch (type) {
      case 'A': records = await dns.resolve4(host); break;
      case 'AAAA': records = await dns.resolve6(host); break;
      case 'MX': records = (await dns.resolveMx(host)).map((r) => `${r.priority} ${r.exchange}`); break;
      case 'TXT': records = (await dns.resolveTxt(host)).map((r) => r.join('')); break;
      case 'NS': records = await dns.resolveNs(host); break;
      case 'CNAME': records = await dns.resolveCname(host); break;
      case 'SOA': {
        const soa = await dns.resolveSoa(host);
        records = [`nsname=${soa.nsname} hostmaster=${soa.hostmaster} serial=${soa.serial} refresh=${soa.refresh} retry=${soa.retry} expire=${soa.expire} minttl=${soa.minttl}`];
        break;
      }
      default: records = [];
    }
    return { type, records };
  } catch (err) {
    const e = err as { code?: string };
    return { type, records: e.code ? [`查询失败: ${e.code}`] : ['查询失败'] };
  }
}

/** 反向 DNS（PTR）：IP → 主机名 */
export async function reverseDns(ip: string): Promise<{ hostnames: string[] }> {
  if (!net.isIP(ip)) throw new Error('非法 IP 地址');
  try {
    const hostnames = await dns.reverse(ip);
    return { hostnames };
  } catch (err) {
    const e = err as { code?: string };
    return { hostnames: e.code ? [`查询失败: ${e.code}`] : [] };
  }
}

/** HTTP(S) 探测：返回状态码、耗时、关键响应头 */
export async function httpProbe(url: string): Promise<{
  ok: boolean; status: number; statusText: string; latencyMs: number;
  server: string | null; contentType: string | null; contentLength: string | null;
  redirectLocation: string | null; error: string | null;
}> {
  const start = Date.now();
  try {
    const res = await httpRequest(url, { method: 'GET', timeout: 10000, redirect: 'manual' });
    const latencyMs = Date.now() - start;
    const h = res.headers;
    return {
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      statusText: res.raw.statusText ?? '',
      latencyMs,
      server: h.get('server'),
      contentType: h.get('content-type'),
      contentLength: h.get('content-length'),
      redirectLocation: h.get('location'),
      error: null,
    };
  } catch (err) {
    return {
      ok: false, status: 0, statusText: '', latencyMs: Date.now() - start,
      server: null, contentType: null, contentLength: null, redirectLocation: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 本机网卡信息 */
export interface InterfaceInfo {
  name: string;
  address: string;
  netmask: string;
  family: string;
  mac: string;
  internal: boolean;
  cidr: string | null;
}

export function getInterfaces(): InterfaceInfo[] {
  const result: InterfaceInfo[] = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    const addrs = ifaces[name];
    if (!addrs) continue;
    for (const a of addrs) {
      result.push({
        name,
        address: a.address,
        netmask: a.netmask,
        family: String(a.family).startsWith('IP') ? String(a.family) : `IPv${a.family}`,
        mac: a.mac,
        internal: a.internal,
        cidr: a.cidr ?? null,
      });
    }
  }
  return result;
}
