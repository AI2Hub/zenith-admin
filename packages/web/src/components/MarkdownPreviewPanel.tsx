import type { CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Typography } from '@douyinfe/semi-ui';
import { FileText, X } from 'lucide-react';
import { useThemeController } from '@/providers/theme-controller';
import 'highlight.js/styles/github-dark.css';
import './MarkdownPreviewPanel.css';

const { Text } = Typography;

interface MarkdownPreviewPanelProps {
  readonly content: string;
  readonly fileName: string;
  readonly onClose: () => void;
  readonly style?: CSSProperties;
}

/**
 * Markdown 只读预览面板：使用 react-markdown + remark-gfm + rehype-highlight 渲染。
 * 支持 GFM（表格/任务列表/删除线）和代码块语法高亮，无 dangerouslySetInnerHTML。
 */
export function MarkdownPreviewPanel({ content, fileName, onClose, style }: MarkdownPreviewPanelProps) {
  const { isDark } = useThemeController();

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--semi-color-bg-0)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* 顶栏：文件名 + 关闭 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderBottom: '1px solid var(--semi-color-border)',
          background: 'var(--semi-color-bg-1)',
          flexShrink: 0,
        }}
      >
        <FileText size={15} style={{ color: 'var(--semi-color-primary)', flexShrink: 0 }} />
        <Text
          ellipsis={{ showTooltip: true }}
          style={{ flex: 1, fontSize: 13, fontWeight: 500, minWidth: 0 }}
        >
          {fileName}
        </Text>
        <X
          size={18}
          style={{ cursor: 'pointer', color: 'var(--semi-color-text-2)', flexShrink: 0 }}
          onClick={onClose}
        />
      </div>

      {/* Markdown 渲染区域 */}
      <div
        className={`md-preview-body${isDark ? ' md-preview-body--dark' : ''}`}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
      >
        <div className="md-preview-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default MarkdownPreviewPanel;
