import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { JsonViewer, Typography } from '@douyinfe/semi-ui';

interface JsonPreviewPanelProps {
  /** JSON 文本内容 */
  readonly content: string;
  readonly style?: CSSProperties;
}

/**
 * JSON 只读预览面板：使用 Semi Design JsonViewer 渲染，支持折叠/展开、语法高亮。
 * 若 JSON 解析失败，降级为原始文本展示。
 */
export function JsonPreviewPanel({ content, style }: JsonPreviewPanelProps) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content]);

  if (parsed === null) {
    // JSON 解析失败，降级为等宽文本
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px', ...style }}>
        <Typography.Text
          type="warning"
          style={{ display: 'block', marginBottom: 12, fontSize: 12 }}
        >
          JSON 格式无效，显示原始内容
        </Typography.Text>
        <pre
          style={{
            margin: 0,
            fontSize: 13,
            fontFamily: 'Consolas, "JetBrains Mono", monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: 'var(--semi-color-text-1)',
          }}
        >
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px', ...style }}>
      <JsonViewer
        value={JSON.stringify(parsed, null, 2)}
        height="100%"
        width="100%"
        options={{ readOnly: true }}
      />
    </div>
  );
}

export default JsonPreviewPanel;
