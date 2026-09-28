import { describe, expect, it } from 'vitest';
import { cmsStatsCsv, cmsStatsDateRange, formatCmsMetric, formatCmsScopeTime } from './cms-stats-presentation';
import { formatDateForApi } from '@/utils/date';

describe('statistics output', () => {
  it('exports reader keywords safely with quoted multiline cells and escaped formulas', () => {
    expect(cmsStatsCsv([['关键词', '计数'], ['=IMPORTXML("url")', 2], ['a,"b"\nc', 3]])).toBe('\uFEFF"关键词","计数"\r\n"\'=IMPORTXML(""url"")","2"\r\n"a,""b""\nc","3"');
  });
  it('preserves percentage and time units without multiplying percent rates twice', () => {
    expect(formatCmsMetric('engagementRate', 25)).toBe('25.0%');
    expect(formatCmsMetric('avgActiveMs', 12500)).toBe('12.5 秒');
    expect(formatCmsMetric('activeMs', 90000)).toBe('1.5 分钟');
  });
  it('uses the selected zone for date defaults and displays UTC scope boundaries in that zone', () => {
    const instant = new Date('2026-09-28T23:30:00Z');
    expect(formatDateForApi(cmsStatsDateRange('Asia/Shanghai', instant)[1])).toBe('2026-09-29');
    expect(formatDateForApi(cmsStatsDateRange('America/New_York', instant)[1])).toBe('2026-09-28');
    expect(formatCmsScopeTime('2026-09-28T00:00:00Z', 'Asia/Shanghai')).toBe('2026-09-28 08:00');
  });
});
