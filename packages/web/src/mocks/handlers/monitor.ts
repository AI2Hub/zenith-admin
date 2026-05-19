import { http, HttpResponse } from 'msw';

const baseStatus = {
  os: {
    platform: 'linux',
    arch: 'x64',
    hostname: 'zenith-demo',
    release: '5.15.0',
    uptimeSeconds: 86400,
  },
  cpu: {
    model: 'Intel(R) Core(TM) i7-10700K CPU @ 3.80GHz',
    cores: 8,
    speed: 3800,
    loadAvg: [0.42, 0.51, 0.6] as const,
    usage: 12,
    perCore: [
      { index: 0, usage: 18, user: 12, system: 6, idle: 82 },
      { index: 1, usage: 9, user: 5, system: 4, idle: 91 },
      { index: 2, usage: 22, user: 16, system: 6, idle: 78 },
      { index: 3, usage: 7, user: 4, system: 3, idle: 93 },
      { index: 4, usage: 14, user: 10, system: 4, idle: 86 },
      { index: 5, usage: 11, user: 7, system: 4, idle: 89 },
      { index: 6, usage: 19, user: 13, system: 6, idle: 81 },
      { index: 7, usage: 6, user: 3, system: 3, idle: 94 },
    ],
  },
  memory: {
    total: 16 * 1024 * 1024 * 1024,
    used: 6 * 1024 * 1024 * 1024,
    free: 10 * 1024 * 1024 * 1024,
    usagePercent: 38,
    detail: {
      memTotal: 16 * 1024 * 1024 * 1024,
      memFree: 10 * 1024 * 1024 * 1024,
      memAvailable: 12 * 1024 * 1024 * 1024,
      buffers: 256 * 1024 * 1024,
      cached: 3 * 1024 * 1024 * 1024,
      shared: 64 * 1024 * 1024,
      swapTotal: 4 * 1024 * 1024 * 1024,
      swapFree: 4 * 1024 * 1024 * 1024,
      swapCached: 0,
      swapUsagePercent: 0,
      dirty: 12 * 1024 * 1024,
      writeback: 0,
    },
  },
  disk: {
    total: 512 * 1024 * 1024 * 1024,
    used: 128 * 1024 * 1024 * 1024,
    free: 384 * 1024 * 1024 * 1024,
    usagePercent: 25,
    mount: '/',
  },
  disks: [
    {
      filesystem: '/dev/nvme0n1p2',
      mount: '/',
      total: 512 * 1024 * 1024 * 1024,
      used: 128 * 1024 * 1024 * 1024,
      free: 384 * 1024 * 1024 * 1024,
      usagePercent: 25,
    },
    {
      filesystem: '/dev/nvme0n1p1',
      mount: '/boot',
      total: 1024 * 1024 * 1024,
      used: 320 * 1024 * 1024,
      free: 704 * 1024 * 1024,
      usagePercent: 31,
    },
    {
      filesystem: '/dev/sda1',
      mount: '/data',
      total: 2 * 1024 * 1024 * 1024 * 1024,
      used: 1.6 * 1024 * 1024 * 1024 * 1024,
      free: 0.4 * 1024 * 1024 * 1024 * 1024,
      usagePercent: 80,
    },
  ],
  network: [
    {
      name: 'eth0', rxBytes: 12_345_678_901, txBytes: 3_456_789_012,
      rxBps: 1_240_000, txBps: 320_000,
      rxPackets: 12_345_678, txPackets: 3_456_789,
      rxErrors: 0, txErrors: 0,
    },
    {
      name: 'docker0', rxBytes: 84_312_001, txBytes: 73_212_000,
      rxBps: 32_000, txBps: 28_000,
      rxPackets: 432_100, txPackets: 421_000,
      rxErrors: 0, txErrors: 0,
    },
  ],
  node: {
    version: 'v20.0.0',
    pid: 12345,
    uptime: 3600,
    memoryUsage: {
      rss: 64 * 1024 * 1024,
      heapTotal: 48 * 1024 * 1024,
      heapUsed: 32 * 1024 * 1024,
      external: 1 * 1024 * 1024,
    },
    cpuUsagePercent: 4.5,
    eventLoop: { meanMs: 0.42, p50Ms: 0.36, p95Ms: 1.2, p99Ms: 2.4, maxMs: 8.6, stddevMs: 0.5 },
    gc: {
      totalCount: 124,
      totalDurationMs: 86.5,
      byKind: {
        minor: { count: 110, durationMs: 32.4 },
        major: { count: 8, durationMs: 38.6 },
        incremental: { count: 6, durationMs: 15.5 },
      },
    },
    heapSpaces: [
      { name: 'new_space', size: 16 * 1024 * 1024, used: 6 * 1024 * 1024, available: 10 * 1024 * 1024 },
      { name: 'old_space', size: 32 * 1024 * 1024, used: 22 * 1024 * 1024, available: 10 * 1024 * 1024 },
    ],
    resourceUsage: {
      userCPUMicros: 4_200_000,
      systemCPUMicros: 1_100_000,
      maxRssBytes: 70 * 1024 * 1024,
      fsRead: 1024,
      fsWrite: 2048,
      voluntaryContextSwitches: 32_000,
      involuntaryContextSwitches: 1_200,
    },
  },
  http: {
    qps: 8.7, currentQps: 12, total: 522, errors: 4, errorRate: 0.77,
    total4xx: 18, total5xx: 2, p50: 24.3, p95: 89.2, p99: 154.6, max: 421.8,
  },
  database: {
    name: 'zenith_admin',
    size: 8 * 1024 * 1024,
    activeConnections: 3,
    totalConnections: 10,
    tableCount: 12,
    connectionStates: { active: 3, idle: 6, idleInTransaction: 1, other: 0 },
    cacheHit: { blksHit: 88_421, blksRead: 1_023, ratio: 98.86 },
    transactions: { commit: 12_345, rollback: 87, deadlocks: 0, tempBytes: 0 },
    slowQueries: null,
    slowQueriesAvailable: false,
  },
  redis: {
    version: '7.2.4',
    uptimeSeconds: 86400,
    connectedClients: 2,
    blockedClients: 0,
    rejectedConnections: 0,
    usedMemory: 2 * 1024 * 1024,
    usedMemoryHuman: '2.00M',
    usedMemoryRss: 6 * 1024 * 1024,
    memFragmentationRatio: 1.21,
    maxMemory: 0,
    maxMemoryPolicy: 'noeviction',
    totalCommandsProcessed: 15842,
    keyspaceHits: 1024,
    keyspaceMisses: 32,
    keyCount: 5,
    role: 'master',
    rdbLastSaveTime: Math.floor(Date.now() / 1000) - 600,
    rdbChangesSinceLastSave: 12,
    aofEnabled: false,
    masterLinkStatus: null,
    slowLog: [],
  },
};

function buildSeries(): Array<{
  t: number; cpu: number; mem: number; procCpu: number; heap: number;
  loopLagMean: number; loopLagP99: number; qps: number; errorRate: number;
  netRxBps: number; netTxBps: number;
}> {
  const now = Date.now();
  const points = [];
  for (let i = 359; i >= 0; i -= 1) {
    const t = now - i * 10_000;
    const wave = Math.sin(i / 12);
    points.push({
      t,
      cpu: Math.max(0, Math.round(15 + wave * 8 + Math.random() * 5)),
      mem: 38 + Math.round(wave * 2),
      procCpu: Math.max(0, Math.round(4 + wave * 2 + Math.random() * 2)),
      heap: 60 + Math.round(wave * 5),
      loopLagMean: 0.4 + Math.random() * 0.3,
      loopLagP99: 1 + Math.random() * 1.5,
      qps: Math.max(0, Math.round(8 + wave * 4 + Math.random() * 3)),
      errorRate: Math.max(0, +(Math.random() * 1.2).toFixed(2)),
      netRxBps: Math.max(0, Math.round(1_200_000 + wave * 600_000 + Math.random() * 300_000)),
      netTxBps: Math.max(0, Math.round(320_000 + wave * 160_000 + Math.random() * 80_000)),
    });
  }
  return points;
}

export const monitorHandlers = [
  http.get('/api/monitor', () => HttpResponse.json({ code: 0, message: 'success', data: baseStatus })),
  http.get('/api/monitor/timeseries', () =>
    HttpResponse.json({
      code: 0,
      message: 'success',
      data: { intervalSec: 10, capacity: 360, points: buildSeries() },
    })),
  http.get('/api/monitor/ws', () => {
    const now = Date.now();
    return HttpResponse.json({
      code: 0,
      message: 'success',
      data: {
        currentConnections: 3,
        currentUsers: 2,
        totalConnects: 128,
        totalDisconnects: 125,
        totalSent: 4521,
        totalRecv: 1023,
        connections: [
          { tokenId: 'a1b2c3d4e5f6', userId: 1, username: 'admin', nickname: '超级管理员', connectedAt: now - 1_200_000, lastActivityAt: now - 5_000, sent: 42, recv: 18 },
          { tokenId: 'f6e5d4c3b2a1', userId: 1, username: 'admin', nickname: '超级管理员', connectedAt: now - 320_000, lastActivityAt: now - 1_200, sent: 11, recv: 3 },
          { tokenId: '0123456789ab', userId: 2, username: 'demo', nickname: '演示账号', connectedAt: now - 60_000, lastActivityAt: now - 800, sent: 6, recv: 2 },
        ],
        recentDisconnects: [
          { tokenId: 'aaa11122233', userId: 2, username: 'demo', nickname: '演示账号', at: now - 30_000, reason: 'client-close', duration: 240_000, sent: 8, recv: 4 },
          { tokenId: 'bbb44455566', userId: 1, username: 'admin', nickname: '超级管理员', at: now - 600_000, reason: 'force-logout', duration: 3_600_000, sent: 96, recv: 31 },
        ],
      },
    });
  }),
  // SSE 推送：首帧发送 metrics 全量；后续每 10s 发送 metrics:diff（仅高频抖动字段）
  http.get('/api/monitor/stream', () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // 首帧：完整 snapshot
        controller.enqueue(encoder.encode(`event: metrics\ndata: ${JSON.stringify(baseStatus)}\n\n`));
        // 后续：仅推送 cpu.usage / memory.usagePercent / http.currentQps / network[].rxBps,txBps 等少量抖动字段
        const timer = setInterval(() => {
          const wave = Math.sin(Date.now() / 12_000);
          const patch = {
            cpu: {
              usage: Math.max(0, Math.round(15 + wave * 8 + Math.random() * 5)),
              perCore: baseStatus.cpu.perCore.map((c) => ({
                ...c,
                usage: Math.max(0, Math.min(100, c.usage + Math.round((Math.random() - 0.5) * 10))),
              })),
            },
            memory: { usagePercent: 38 + Math.round(wave * 2) },
            http: {
              currentQps: Math.max(0, Math.round(8 + wave * 4 + Math.random() * 3)),
              qps: +(8 + wave * 2).toFixed(2),
            },
          };
          controller.enqueue(encoder.encode(`event: metrics:diff\ndata: ${JSON.stringify(patch)}\n\n`));
        }, 10_000);
        return () => clearInterval(timer);
      },
    });
    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }),
];
