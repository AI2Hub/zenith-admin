import { useMemo } from 'react';
import FileViewer from '@file-viewer/react';
import { archiveRenderer } from '@file-viewer/renderer-archive';
import { presentationRenderer } from '@file-viewer/renderer-presentation';
import pptxWorkerUrl from '@file-viewer/pptx/worker/pptx.worker.js?url';
import { configuredFileViewerRenderers } from 'virtual:file-viewer-renderers';
import { useThemeController } from '@/providers/theme-controller';
import { isSpreadsheetFile, resolveFileMimeType } from '@/utils/file-utils';
import type { CSSProperties } from 'react';
import type { ViewerOptions } from '@file-viewer/react';

interface FileViewerPreviewPanelProps {
  readonly file: File;
  readonly style?: CSSProperties;
}

const fileViewerRenderers = [
  ...(Array.isArray(configuredFileViewerRenderers)
    ? configuredFileViewerRenderers
    : [configuredFileViewerRenderers]),
  archiveRenderer,
  presentationRenderer,
] as ViewerOptions['renderers'];

// 压缩包解析走 public/ 下原样下发的 libarchive 文件，且只传 workerUrl、不传 wasmUrl：
// 1. Vite dev 会改写 `?url` 拿到的 worker-bundle.js 源码（new URL 资源改写），
//    archive 渲染器的 patch 正则随即失效；
// 2. 即使源码原样，渲染器的 fetch→patch→blob Worker 链路也起不来（实测必超时），
//    而直链 `new Worker(workerUrl, { type: 'module' })` 180ms 即成功，
//    worker 内 `new URL("libarchive.wasm", import.meta.url)` 自动指向同目录 wasm。
// public/ 文件不进 transform 管道，dev 与构建产物都是字节级原样；
// `libarchive.js` 升级后须同步重拷这两个文件（见 vite.config 里 fileViewerRenderers 的注释）。
const archiveWorkerSource =
  `${import.meta.env.BASE_URL}vendor/libarchive/worker-bundle.js`;

/** 文件浏览器端只读预览，不依赖外部预览或转换服务。 */
export default function FileViewerPreviewPanel({ file, style }: FileViewerPreviewPanelProps) {
  const { isDark } = useThemeController();
  // 表格渲染器的暗色主题不会调和文件内嵌样式（如导出文件的黑字、浅灰表头填充），
  // 会出现黑字压暗底 / 亮字压浅底的不可读组合，因此表格预览恒用亮色渲染
  const isSpreadsheet = isSpreadsheetFile(resolveFileMimeType(file.type, file.name));
  const useDarkTheme = isDark && !isSpreadsheet;
  const options = useMemo<ViewerOptions>(() => ({
    theme: useDarkTheme ? 'dark' : 'light',
    locale: 'zh-CN',
    styleIsolation: 'shadow',
    rendererMode: 'replace',
    autoRenderers: false,
    renderers: fileViewerRenderers,
    // 表格预览恒用 1:1 实际尺寸：spreadsheet 渲染器（3.1.x 起）默认会对宽表做
    // shrink-to-fit（auto → 按 width 算出如 67% 再整体缩小），把十几列硬塞进
    // 可见宽度导致字小看不清；传 fit: 'actual' 即显式关闭该默认收缩，保持
    // 100% + 横向滚动的 Excel 习惯，用户仍可用工具栏手动缩小总览。
    // 非表格类型保持默认自适应（undefined），不受影响。
    fit: isSpreadsheet ? 'actual' : undefined,
    ui: { density: 'compact' },
    toolbar: {
      position: 'top-center',
      download: false,
      print: true,
      exportHtml: false,
      zoom: true,
      search: true,
      theme: false,
    },
    docx: {
      worker: true,
      visualPagination: true,
    },
    presentation: {
      workerUrl: pptxWorkerUrl,
      workerType: 'module',
    },
    spreadsheet: {
      worker: 'auto',
      textEncoding: 'auto',
      resizableColumns: true,
      resizableRows: true,
    },
    archive: {
      // 只给 workerUrl：渲染器此时直接 `new Worker(workerUrl)`，wasm 由 worker 内
      // 相对路径自解析；一旦同时给 wasmUrl 就会走 fetch→patch→blob Worker 链路，
      // 该链路在 dev 与生产构建下均无法启动（见上方注释），还会卡 30s 超时。
      workerUrl: archiveWorkerSource,
    },
    drawing: {
      // vite-plugin 的 copyAssets 不分发 vendor/drawio/viewer-static.min.js（仅 full 包带），
      // 走官方 diagrams.net viewer 只会 404 后等超时再回退，这里直接使用内置离线 SVG 渲染。
      preferOfficial: false,
    },
    geo: {
      // 默认即离线空底图；显式声明避免将来默认值变化后悄悄请求外部瓦片服务
      // （OpenFreeMap / OSM / 天地图 均需显式配置才会启用）。
      basemap: 'offline',
    },
  }), [useDarkTheme, isSpreadsheet]);

  return (
    <div style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0, ...style }}>
      <FileViewer file={file} options={options} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
