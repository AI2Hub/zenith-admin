/**
 * 服务器监控相关 DTO
 */
import { z } from '@hono/zod-openapi';

export const MonitorDTO = z
  .object({
    os: z.object({
      platform: z.string(),
      release: z.string(),
      arch: z.string(),
      hostname: z.string(),
      uptimeSeconds: z.number().int(),
    }),
    cpu: z.object({
      model: z.string(),
      cores: z.number().int(),
      speed: z.number(),
      loadAvg: z.array(z.number()),
      usage: z.number(),
      perCore: z
        .array(z.object({
          index: z.number().int(),
          usage: z.number(),
          user: z.number(),
          system: z.number(),
          idle: z.number(),
        }))
        .optional(),
    }),
    memory: z.object({
      total: z.number(),
      used: z.number(),
      free: z.number(),
      usagePercent: z.number(),
      detail: z
        .object({
          memTotal: z.number(),
          memFree: z.number(),
          memAvailable: z.number(),
          buffers: z.number(),
          cached: z.number(),
          shared: z.number(),
          swapTotal: z.number(),
          swapFree: z.number(),
          swapCached: z.number(),
          swapUsagePercent: z.number(),
          dirty: z.number(),
          writeback: z.number(),
        })
        .nullable()
        .optional(),
    }),
    disk: z
      .object({
        total: z.number(),
        used: z.number(),
        free: z.number(),
        usagePercent: z.number(),
        mount: z.string().optional(),
      })
      .nullable(),
    disks: z
      .array(z.object({
        filesystem: z.string(),
        total: z.number(),
        used: z.number(),
        free: z.number(),
        usagePercent: z.number(),
        mount: z.string(),
      }))
      .optional(),
    network: z
      .array(z.object({
        name: z.string(),
        rxBytes: z.number(),
        txBytes: z.number(),
        rxBps: z.number(),
        txBps: z.number(),
        rxPackets: z.number(),
        txPackets: z.number(),
        rxErrors: z.number(),
        txErrors: z.number(),
      }))
      .optional(),
    node: z.object({
      version: z.string(),
      uptime: z.number().int(),
      pid: z.number().int(),
      memoryUsage: z.record(z.string(), z.number()),
      cpuUsagePercent: z.number().optional(),
      eventLoop: z
        .object({
          meanMs: z.number(),
          p50Ms: z.number(),
          p95Ms: z.number(),
          p99Ms: z.number(),
          maxMs: z.number(),
          stddevMs: z.number(),
        })
        .optional(),
      gc: z
        .object({
          totalCount: z.number(),
          totalDurationMs: z.number(),
          byKind: z.record(z.string(), z.object({ count: z.number(), durationMs: z.number() })),
        })
        .optional(),
      heapSpaces: z
        .array(z.object({ name: z.string(), size: z.number(), used: z.number(), available: z.number() }))
        .optional(),
      resourceUsage: z
        .object({
          userCPUMicros: z.number(),
          systemCPUMicros: z.number(),
          maxRssBytes: z.number(),
          fsRead: z.number(),
          fsWrite: z.number(),
          voluntaryContextSwitches: z.number(),
          involuntaryContextSwitches: z.number(),
        })
        .optional(),
    }),
    http: z
      .object({
        qps: z.number(),
        currentQps: z.number(),
        total: z.number(),
        errors: z.number(),
        errorRate: z.number(),
        total4xx: z.number(),
        total5xx: z.number(),
        p50: z.number(),
        p95: z.number(),
        p99: z.number(),
        max: z.number(),
      })
      .optional(),
    database: z.unknown().nullable(),
    redis: z.unknown().nullable(),
  })
  .openapi('MonitorInfo');

export const MonitorTimeseriesDTO = z
  .object({
    intervalSec: z.number().int(),
    capacity: z.number().int(),
    points: z.array(
      z.object({
        t: z.number(),
        cpu: z.number(),
        mem: z.number(),
        procCpu: z.number(),
        heap: z.number(),
        loopLagMean: z.number(),
        loopLagP99: z.number(),
        qps: z.number(),
        errorRate: z.number(),
        netRxBps: z.number().optional(),
        netTxBps: z.number().optional(),
      }),
    ),
  })
  .openapi('MonitorTimeseries');

export const MonitorWsDTO = z
  .object({
    currentConnections: z.number().int(),
    currentUsers: z.number().int(),
    totalConnects: z.number().int(),
    totalDisconnects: z.number().int(),
    totalSent: z.number().int(),
    totalRecv: z.number().int(),
    connections: z.array(
      z.object({
        tokenId: z.string(),
        userId: z.number().int(),
        username: z.string().nullable(),
        nickname: z.string().nullable(),
        connectedAt: z.number(),
        lastActivityAt: z.number(),
        sent: z.number().int(),
        recv: z.number().int(),
      }),
    ),
    recentDisconnects: z.array(
      z.object({
        tokenId: z.string(),
        userId: z.number().int(),
        username: z.string().nullable(),
        nickname: z.string().nullable(),
        at: z.number(),
        reason: z.string(),
        duration: z.number().int(),
        sent: z.number().int(),
        recv: z.number().int(),
      }),
    ),
  })
  .openapi('MonitorWs');
