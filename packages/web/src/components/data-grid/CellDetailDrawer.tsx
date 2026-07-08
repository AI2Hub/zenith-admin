import { useEffect, useMemo, useState } from 'react';
import { Button, SideSheet, Tabs, TabPane, Toast } from '@douyinfe/semi-ui';
import Editor from '@monaco-editor/react';
import { Copy } from 'lucide-react';

import { useThemeController } from '@/providers/theme-controller';
import type { DataGridColumn } from './types';
import { columnKind, copyValue, displayValue } from './grid-format';
import { writeClipboard } from './clipboard-format';
import './data-grid.css';

interface CellDetailDrawerProps {
  visible: boolean;
  onClose: () => void;
  columns: DataGridColumn[];
  row: Record<string, unknown> | null;
  /** 1-based 展示行号 */
  rowNumber: number | null;
  /** 初始聚焦列 */
  columnName: string | null;
}

interface DetailContent {
  text: string;
  language: 'json' | 'plaintext';
  isNull: boolean;
}

function buildDetailContent(value: unknown): DetailContent {
  if (value === null || value === undefined) {
    return { text: '', language: 'plaintext', isNull: true };
  }
  if (typeof value === 'object') {
    return { text: JSON.stringify(value, null, 2), language: 'json', isNull: false };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return { text: JSON.stringify(JSON.parse(trimmed), null, 2), language: 'json', isNull: false };
      } catch {
        // 非合法 JSON，按纯文本处理
      }
    }
    return { text: value, language: 'plaintext', isNull: false };
  }
  return { text: String(value), language: 'plaintext', isNull: false };
}

/** 单元格详情 Drawer：Monaco 只读查看 + 整行转置视图 */
export function CellDetailDrawer(props: CellDetailDrawerProps) {
  const { visible, onClose, columns, row, rowNumber, columnName } = props;
  const { isDark } = useThemeController();
  const [activeTab, setActiveTab] = useState<string>('cell');
  const [activeColumn, setActiveColumn] = useState<string | null>(columnName);

  useEffect(() => {
    if (visible) {
      setActiveColumn(columnName);
      setActiveTab('cell');
    }
  }, [visible, columnName]);

  const column = useMemo(
    () => columns.find((c) => c.name === activeColumn) ?? null,
    [columns, activeColumn],
  );
  const value = row && activeColumn ? row[activeColumn] : undefined;
  const detail = useMemo(() => buildDetailContent(value), [value]);

  const charCount = detail.text.length;
  const byteCount = useMemo(
    () => (detail.isNull ? 0 : new TextEncoder().encode(detail.text).length),
    [detail],
  );

  const handleCopy = async () => {
    const kind = columnKind(column?.dataType);
    const text = detail.language === 'json' ? detail.text : copyValue(value, kind);
    const ok = await writeClipboard(text);
    if (ok) Toast.success('已复制');
    else Toast.warning('复制失败');
  };

  return (
    <SideSheet
      visible={visible}
      onCancel={onClose}
      width={560}
      title={rowNumber !== null ? `第 ${rowNumber} 行 · ${activeColumn ?? ''}` : activeColumn ?? '单元格详情'}
      placement="right"
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} type="line" size="small">
        <TabPane tab="单元格" itemKey="cell">
          <div className="dg-detail-meta">
            {column?.dataType && <span>类型：{column.dataType}</span>}
            <span>字符：{charCount.toLocaleString()}</span>
            <span>字节：{byteCount.toLocaleString()}</span>
            <Button
              size="small"
              theme="borderless"
              icon={<Copy size={13} />}
              onClick={() => void handleCopy()}
            >复制</Button>
          </div>
          {detail.isNull ? (
            <div className="dg-empty"><span className="dg-null">NULL</span></div>
          ) : (
            <div style={{ height: 'calc(100vh - 220px)', border: '1px solid var(--semi-color-border)', borderRadius: 'var(--semi-border-radius-small)', overflow: 'hidden' }}>
              <Editor
                value={detail.text}
                language={detail.language}
                theme={isDark ? 'vs-dark' : 'light'}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  wordWrap: 'on',
                  fontSize: 12,
                  lineNumbers: detail.language === 'json' ? 'on' : 'off',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            </div>
          )}
        </TabPane>
        <TabPane tab="整行（转置）" itemKey="row">
          <div style={{ maxHeight: 'calc(100vh - 180px)', overflow: 'auto' }}>
            {row && columns.map((c) => {
              const v = row[c.name];
              const kind = columnKind(c.dataType);
              const text = displayValue(v, kind);
              const isActive = c.name === activeColumn;
              return (
                <div
                  key={c.name}
                  className={`dg-transpose-row${isActive ? ' dg-transpose-row--active' : ''}`}
                >
                  <span className="dg-transpose-key" title={c.name}>{c.name}</span>
                  <span className="dg-transpose-type">{c.dataType ?? ''}</span>
                  <span
                    className="dg-transpose-value"
                    role="button"
                    tabIndex={0}
                    title="点击在「单元格」页查看"
                    onClick={() => { setActiveColumn(c.name); setActiveTab('cell'); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { setActiveColumn(c.name); setActiveTab('cell'); }
                    }}
                  >
                    {v === null || v === undefined
                      ? <span className="dg-null">NULL</span>
                      : (text.length > 300 ? text.slice(0, 300) + '…' : text)}
                  </span>
                </div>
              );
            })}
          </div>
        </TabPane>
      </Tabs>
    </SideSheet>
  );
}
