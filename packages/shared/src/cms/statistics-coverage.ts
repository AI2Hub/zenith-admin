/** Configuration coverage is independent of traffic volume and retained event minima. */
export function cmsStatisticsCoverage(input: {
  start: string; end: string; knownSince: string | null; purgedThrough: string | null;
  firstEventAt: string | null; changes: ReadonlyArray<{ at: string; enabled: boolean }>;
}): { available: boolean; reason: 'available' | 'not_started' | 'unknown' | 'paused' | 'retention' } {
  const start = Date.parse(input.start), end = Date.parse(input.end);
  if (input.purgedThrough && start <= Date.parse(input.purgedThrough)) return { available: false, reason: 'retention' };
  if (!input.knownSince || start < Date.parse(input.knownSince)) {
    const firstKnownActivity = input.firstEventAt ?? input.changes.find(change => change.enabled)?.at;
    return { available: false, reason: !firstKnownActivity || end <= Date.parse(firstKnownActivity) ? 'not_started' : 'unknown' };
  }
  const changes = [...input.changes].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let enabled: boolean | undefined;
  for (const change of changes) {
    const at = Date.parse(change.at);
    if (at <= start) enabled = change.enabled;
    else if (at < end && (!enabled || !change.enabled)) return { available: false, reason: 'paused' };
    else if (at >= end) break;
  }
  return enabled === undefined ? { available: false, reason: 'unknown' } : enabled ? { available: true, reason: 'available' } : { available: false, reason: 'paused' };
}
