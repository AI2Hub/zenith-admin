import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { renderPrintContent } from '@zenith/shared';
import type { ReportPrintRenderPage, ReportPrintRenderResult } from '@zenith/shared';
import { renderPrintResultToDocx, renderPrintResultToPdf, renderPrintResultToWorkbook } from './report-print-export';

describe('report-print-export', () => {
  const result = renderPrintContent(
    '导出测试',
    {
      sheets: [
        {
          id: 'sheet-01',
          name: '明细',
          grid: {
            rows: 3,
            cols: 2,
            cells: [
              { row: 0, col: 0, v: '名称', s: { bold: true, border: true } },
              { row: 0, col: 1, v: '金额', s: { bold: true, border: true } },
              { row: 1, col: 0, v: '${name}', kind: 'text', s: { border: { left: { color: '#ff0000' }, right: { color: '#00ff00' } } } },
              { row: 1, col: 1, v: '${amount}', numFmt: '#,##0.00', formula: '=1+1' },
              { row: 2, col: 0, v: '二维码' },
              { row: 2, col: 1, v: '${QRCODE(name)}' },
            ],
            merges: [{ row: 2, col: 0, rowSpan: 1, colSpan: 2 }],
          },
          pageConfig: { repeatHeaderRows: { start: 0, end: 0 }, rowsPerPage: 1, footer: '第 {page}/{pages} 页' },
        },
        {
          id: 'sheet-02',
          name: '条码',
          grid: {
            rows: 1,
            cols: 1,
            cells: [{ row: 0, col: 0, v: '${CODE128(code)}' }],
          },
        },
      ],
    },
    [{ name: '测试', amount: 12.5, code: 'ABC-123' }],
  );

  it('生成多 sheet workbook 并保留公式/格式', async () => {
    const workbook = new ExcelJS.Workbook();
    const rowCount = await renderPrintResultToWorkbook(workbook, result);
    expect(rowCount).toBe(result.sheets.reduce((sum, sheet) => sum + sheet.grid.rows, 0));
    expect(workbook.worksheets).toHaveLength(2);
    const detailSheet = workbook.getWorksheet('明细');
    expect(detailSheet).toBeTruthy();
    const valueCell = detailSheet!.getCell(2, 2);
    expect(valueCell.numFmt).toBe('#,##0.00');
    expect(valueCell.value).toMatchObject({ formula: '1+1' });
    expect(detailSheet!.pageSetup.printTitlesRow).toBe('1:1');
  });

  it('生成真实 DOCX ZIP，包含分节、横向纸张、合并单元格与图片', async () => {
    const docxResult = renderPrintContent('Word 测试', {
      grid: {
        rows: 3,
        cols: 3,
        colWidths: [90, 90, 100],
        rowHeights: [30, 28, 28],
        cells: [
          { row: 0, col: 0, v: '合并标题', s: { bold: true, align: 'center', background: '#eeeeee', border: true } },
          { row: 0, col: 2, v: '图片', image: { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' } },
          { row: 1, col: 0, v: '纵向合并' },
          { row: 1, col: 1, v: 'A' },
          { row: 1, col: 2, v: 'B' },
          { row: 2, col: 1, v: 'C' },
          { row: 2, col: 2, v: 'D' },
        ],
        merges: [
          { row: 0, col: 0, rowSpan: 1, colSpan: 2 },
          { row: 1, col: 0, rowSpan: 2, colSpan: 1 },
        ],
      },
    }, [], {}, {
      paper: 'A4',
      orientation: 'landscape',
      margin: { top: 10, right: 11, bottom: 12, left: 13 },
      repeatHeaderRows: { start: 0, end: 0 },
    });

    const buffer = await renderPrintResultToDocx(docxResult);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const archive = await JSZip.loadAsync(buffer);
    const documentXml = await archive.file('word/document.xml')!.async('string');
    expect(documentXml).toContain('<w:sectPr');
    expect(documentXml).toContain('w:orient="landscape"');
    expect(documentXml).toContain('w:w="16838"');
    expect(documentXml).toContain('w:h="11906"');
    expect(documentXml).toContain('<w:gridSpan w:val="2"');
    expect(documentXml).toContain('<w:vMerge w:val="restart"');
    expect(Object.keys(archive.files).some((name) => name.startsWith('word/media/'))).toBe(true);
  });

  it('DOCX 图片总量超限时明确拒绝', async () => {
    const largePng = Buffer.alloc(1_800_000);
    Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(largePng);
    const src = `data:image/png;base64,${largePng.toString('base64')}`;
    const page = (pageNumber: number): ReportPrintRenderPage => ({
      sheetId: 'images',
      sheetName: '图片',
      pageNumber,
      totalPages: 6,
      grid: {
        rows: 1,
        cols: 1,
        cells: [{ row: 0, col: 0, kind: 'image', image: { src } }],
      },
      pageConfig: {},
    });
    const oversized = {
      ...result,
      pages: Array.from({ length: 6 }, (_, index) => page(index + 1)),
    } satisfies ReportPrintRenderResult;

    await expect(renderPrintResultToDocx(oversized)).rejects.toThrow('图片总大小超过');
  });

  it('PDF 对超宽合并单元格和长文本进行页面内裁剪', async () => {
    const pdfResult = renderPrintContent('PDF overflow', {
      grid: {
        rows: 1,
        cols: 2,
        colWidths: [1200, 1200],
        rowHeights: [28],
        cells: [{ row: 0, col: 0, v: 'very long text '.repeat(100), s: { wrap: true, border: true } }],
        merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }],
      },
    }, []);
    const buffer = await renderPrintResultToPdf(pdfResult);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(500);
  });
});
