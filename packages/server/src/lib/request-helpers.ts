import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { UAParser } from 'ua-parser-js';
import ipRangeCheck from 'ip-range-check';
import { SESSION_CLIENT_HEADER, SESSION_CLIENT_KINDS, type SessionClientKind } from '@zenith/shared/identity';
import { config } from '../config';

/**
 * 从请求头中提取客户端真实 IP。
 * 优先信任反向代理的 x-forwarded-for / x-real-ip 头；
 * 无反代时（本地直连）通过 getConnInfo 取 TCP 层真实连接 IP，不可被客户端伪造。
 */
export function getClientIp(c: Context): string {
  let remoteAddress = '127.0.0.1';
  try {
    remoteAddress = getConnInfo(c).remote.address ?? remoteAddress;
  } catch {
    // Hono app.request() and non-node adapters do not expose TCP connection metadata.
  }
  const isTrustedProxy = (address: string) => config.trustedProxyCidrs.some((range) => {
    try { return ipRangeCheck(address, range); } catch { return false; }
  });
  if (!isTrustedProxy(remoteAddress)) return remoteAddress;
  const forwarded = c.req.header('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  let clientIp = remoteAddress;
  for (let index = forwarded.length - 1; index >= 0 && isTrustedProxy(clientIp); index--) {
    clientIp = forwarded[index];
  }
  if (clientIp !== remoteAddress) return clientIp;
  return c.req.header('x-real-ip')?.trim() ?? remoteAddress;
}

/**
 * 解析 User-Agent 字符串，返回浏览器和操作系统信息。
 */
export function parseUserAgent(ua: string): { browser: string; os: string } {
  const parser = new UAParser(ua);
  const b = parser.getBrowser();
  const o = parser.getOS();
  return {
    browser: b.name ? `${b.name} ${b.version ?? ''}`.trim() : 'Unknown',
    os: o.name ? `${o.name} ${o.version ?? ''}`.trim() : 'Unknown',
  };
}

const CLIENT_KIND_SET: ReadonlySet<string> = new Set(SESSION_CLIENT_KINDS);

/**
 * 登录终端类型：前端各入口经 `X-Zenith-Client` 自报（网页 / 移动审批 / 桌面端），
 * 只接受枚举内的值，缺省或伪造值一律按 web——它只影响会话展示与「按终端分别计算」的并发分组，不参与鉴权。
 */
export function getClientKind(c: Context): SessionClientKind {
  const raw = c.req.header(SESSION_CLIENT_HEADER)?.trim().toLowerCase();
  return raw && CLIENT_KIND_SET.has(raw) ? (raw as SessionClientKind) : 'web';
}

export interface ClientInfo {
  ip: string;
  ua: string;
  client: SessionClientKind;
}

/**
 * 从请求中提取客户端 IP、User-Agent 与终端类型（登录日志 / 风险事件 / 登录锁定 / 会话审计共用）。
 * IP 复用 getClientIp 的可信代理链判定，直连客户端伪造的 x-forwarded-for / x-real-ip 不生效；
 * 截断到 64 字符防止异常长值溢出各日志表的 ip varchar(64)。
 */
export function getClientInfo(c: Context): ClientInfo {
  return {
    ip: getClientIp(c).slice(0, 64),
    ua: c.req.header('user-agent') ?? '',
    client: getClientKind(c),
  };
}
