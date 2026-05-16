import ExcelJS from 'exceljs';
import { formatDateTime } from './datetime';

/** Format a date to 'YYYY-MM-DD HH:mm:ss'. Returns '' for null/undefined. */
export function formatDateTimeForExcel(date: Date | string | null | undefined): string {
  if (!date) return '';
  return formatDateTime(date);
}

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  transform?: (value: unknown) => string;
}

/** Apply column transforms to a data row, returning a plain object keyed by column key. */
function applyTransforms(columns: ExcelColumn[], row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const col of columns) {
    const val = row[col.key];
    result[col.key] = col.transform ? col.transform(val) : val;
  }
  return result;
}

/** Generate an Excel buffer from column definitions and data rows */
export async function exportToExcel(
  columns: ExcelColumn[],
  data: Record<string, unknown>[],
  sheetName = 'Sheet1'
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? 18,
  }));

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8E8E8' },
  };

  const BATCH_SIZE = 500;
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    for (const row of data.slice(i, i + BATCH_SIZE)) {
      sheet.addRow(applyTransforms(columns, row));
    }
    if (i + BATCH_SIZE < data.length) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }

  return await workbook.xlsx.writeBuffer();
}

/**
 * Yields rows from a paginated fetch function in batches, enabling memory-efficient
 * async iteration without loading the entire result set at once.
 *
 * @param fetchFn  - A function that accepts `(limit, offset)` and returns a row batch.
 * @param batchSize - Rows per batch (default: 2000).
 *
 * @example
 * const rows = batchIterable(
 *   (limit, offset) =>
 *     db.select().from(loginLogs).where(cond).orderBy(desc(loginLogs.id)).limit(limit).offset(offset),
 * );
 * const stream = await streamToExcel(columns, rows, sheetName);
 */
export async function* batchIterable<T>(
  fetchFn: (limit: number, offset: number) => Promise<T[]>,
  batchSize = 2000
): AsyncIterable<T> {
  let offset = 0;
  while (true) {
    const batch = await fetchFn(batchSize, offset);
    for (const row of batch) yield row;
    if (batch.length < batchSize) break;
    offset += batchSize;
  }
}

/** Generate a streaming Excel ReadableStream from column definitions and data rows.
 *
 * The returned ReadableStream is available immediately; data is written asynchronously
 * to avoid backpressure deadlock (workbook.commit() would hang waiting for a consumer
 * that hasn't started yet if we awaited it before returning the stream).
 *
 * `data` accepts both plain arrays and async iterables (e.g. `batchIterable(...)`).
 * Rows are written in object mode so ExcelJS maps values to cells by column key
 * rather than by positional array index.
 */
export function streamToExcel(
  columns: ExcelColumn[],
  data: AsyncIterable<Record<string, unknown>> | Iterable<Record<string, unknown>>,
  sheetName = 'Sheet1'
): Promise<ReadableStream> {
  return new Promise((resolve, reject) => {
    import('node:stream').then(({ PassThrough, Readable }) => {
      const passThrough = new PassThrough();
      // Return the Web ReadableStream immediately so the HTTP response can start
      // consuming it while ExcelJS writes data asynchronously.
      resolve(Readable.toWeb(passThrough) as ReadableStream);

      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: passThrough });
      const sheet = workbook.addWorksheet(sheetName);

      sheet.columns = columns.map((col) => ({
        key: col.key,
        width: col.width ?? 18,
      }));

      const headerRow = sheet.addRow(columns.map((col) => col.header));
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
      headerRow.commit();

      // `for await...of` handles both sync Iterable (arrays) and AsyncIterable (generators,
      // batchIterable cursors, etc.) so callers can pass either without any conversion.
      (async () => {
        for await (const row of data) {
          sheet.addRow(applyTransforms(columns, row)).commit();
        }
        sheet.commit();
        await workbook.commit();
      })().catch((err: Error) => passThrough.destroy(err));
    }).catch(reject);
  });
}
