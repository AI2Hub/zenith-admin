/**
 * IoT 今日上报量计数：Redis 日计数器（按应用时区业务日），仪表盘 O(1) 读取。
 * 遥测明细表按时间列无单列 B-tree 索引（只有 BRIN），不能拿它 count；计数是运营指标而非账本，
 * Redis 不可用时静默（部署 / 清库当日从 0 起算）。
 */
import { formatDate } from '../../lib/datetime';
import logger from '../../lib/logger';
import redis from '../../lib/redis';
import { config } from '../../config';

const COUNTER_PREFIX = `${config.redis.keyPrefix}iot:telemetry:count:`;
const COUNTER_TTL_SECONDS = 2 * 86_400;

function counterKey(date: Date): string {
  return `${COUNTER_PREFIX}${formatDate(date).replace(/-/g, '')}`;
}

/** 累加今日上报点数（fire-and-forget） */
export function bumpIotTelemetryCounter(count: number): void {
  if (count <= 0) return;
  const key = counterKey(new Date());
  void redis.multi().incrby(key, count).expire(key, COUNTER_TTL_SECONDS).exec()
    .catch((err) => logger.debug(`[iot] 今日上报计数失败: ${(err as Error).message}`));
}

export async function getIotTelemetryTodayCount(): Promise<number> {
  try {
    const raw = await redis.get(counterKey(new Date()));
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}
