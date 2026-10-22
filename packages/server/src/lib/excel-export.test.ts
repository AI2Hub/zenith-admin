import { describe, it, expect } from 'vitest';
import { exportToExcel, ExcelColumn } from './excel-export';

// 四路发布验证并行时，ExcelJS 冷加载会与 lint/build/docs 争抢转译资源。
// 独占运行约 2s；保留 60s 上限只覆盖资源饥饿，真卡死仍会及时失败。
const EXCELJS_COLD_START_TIMEOUT_MS = 60_000;

describe('exportToExcel', () => {
  it('should generate an ArrayBuffer', async () => {
    const columns: ExcelColumn[] = [{ header: 'Name', key: 'name' }];
    const data = [{ name: 'Test' }];
    const buffer = await exportToExcel(columns, data);
    expect(buffer).toBeDefined();
    expect(buffer).toBeInstanceOf(Uint8Array);
  }, EXCELJS_COLD_START_TIMEOUT_MS);
});
