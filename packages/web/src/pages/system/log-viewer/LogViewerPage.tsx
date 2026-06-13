import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Button, Input, Tag, Typography, Toast, Select, Switch,
} from '@douyinfe/semi-ui';
import { FolderOpen, Play, Square, Search, FileText } from 'lucide-react';
import { TOKEN_KEY } from '@zenith/shared';
import { config } from '@/config';
import { request } from '@/utils/request';

/** 常用日志路径 */
const COMMON_LOG_PATHS = [
  '/var/log/syslog',
  '/var/log/messages',
  '/var/log/auth.log',
  '/var/log/kern.log',
  '/var/log/nginx/access.log',
  '/var/log/nginx/error.log',
  '/var/log/apache2/access.log',
  '/var/log/apache2/error.log',
  '/var/log/mysql/error.log',
  '/var/log/postgresql/postgresql.log',
  '/var/log/redis/redis-server.log',
];

async function fetchStream(
  url: string, onChunk: (t: string) => void, signal: AbortSignal,
): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const resp = await fetch(`${config.apiBaseUrl || ''}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!resp.ok) { onChunk(`\nHTTP ${resp.status}\n`); return; }
  const reader = resp.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}

/** 简单关键词高亮：将匹配行用颜色标记 */
function highlightLines(content: string, keyword: string, filterOnly: boolean): string {
  if (!keyword.trim()) return content;
  const lines = content.split('\n');
  const kw = keyword.trim().toLowerCase();
  const result: string[] = [];
  for (const line of lines) {
    if (line.toLowerCase().includes(kw)) {
      result.push(`>>> ${line}`); // 标记匹配行
    } else if (!filterOnly) {
      result.push(line);
    }
  }
  return result.join('\n');
}

export default function LogViewerPage() {
  const [filePath, setFilePath] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filterOnly, setFilterOnly] = useState(false);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // 追踪模式下自动滚到底部
  useEffect(() => {
    if (following && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [content, following]);

  // 组件卸载清理
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const loadContent = useCallback(async () => {
    if (!filePath.trim()) return;
    setLoading(true);
    const res = await request.get<{ content: string }>(
      `/api/log-viewer/content?path=${encodeURIComponent(filePath.trim())}&lines=500`,
    );
    setLoading(false);
    if (res.code === 0 && res.data) {
      setContent(res.data.content);
    } else {
      Toast.error({ content: `读取失败：${res.message ?? '未知错误'}`, duration: 3 });
    }
  }, [filePath]);

  const startFollow = useCallback(() => {
    if (!filePath.trim()) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setFollowing(true);
    const url = `/api/log-viewer/stream?path=${encodeURIComponent(filePath.trim())}`;
    void fetchStream(url, (text) => setContent((prev) => prev + text), abort.signal)
      .catch(() => { /* abort = ok */ })
      .finally(() => setFollowing(false));
  }, [filePath]);

  const stopFollow = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFollowing(false);
    setContent((prev) => `${prev}\n\n⬛ 已停止追踪\n`);
  }, []);

  const displayContent = content ? highlightLines(content, keyword, filterOnly) : '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: 12 }}>
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileText size={18} style={{ color: 'var(--semi-color-primary)' }} />
        <Typography.Title heading={6} style={{ margin: 0 }}>日志查看器</Typography.Title>
      </div>

      {/* 文件路径区 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <Typography.Text size="small" type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            日志文件路径
          </Typography.Text>
          <Input
            prefix={<FolderOpen size={13} />}
            placeholder="/var/log/syslog"
            value={filePath}
            onChange={setFilePath}
            showClear
            onEnterPress={() => void loadContent()}
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <Typography.Text size="small" type="secondary" style={{ display: 'block', marginBottom: 4 }}>常用路径</Typography.Text>
          <Select
            placeholder="选择常用路径"
            onChange={(v) => setFilePath(v as string)}
            style={{ width: '100%' }}
            optionList={COMMON_LOG_PATHS.map((p) => ({ value: p, label: p.split('/').pop() ?? p }))}
          />
        </div>
        <Button type="primary" icon={<FolderOpen size={13} />} loading={loading} onClick={() => void loadContent()}>
          加载
        </Button>
        {!following
          ? <Button icon={<Play size={13} />} onClick={startFollow} disabled={!filePath.trim()}>追踪末尾</Button>
          : <Button type="danger" icon={<Square size={13} />} onClick={stopFollow}>停止追踪</Button>
        }
      </div>

      {/* 关键词过滤区 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Input
            prefix={<Search size={13} />}
            placeholder="关键词高亮"
            value={keyword}
            onChange={setKeyword}
            showClear
            style={{ width: 220 }}
          />
          <Typography.Text size="small" type="secondary">仅显示匹配行</Typography.Text>
          <Switch size="small" checked={filterOnly} onChange={setFilterOnly} />
        </div>
        {following && <Tag color="green" size="small">● 实时追踪中</Tag>}
        {content && (
          <Typography.Text size="small" type="tertiary">
            共 {content.split('\n').length} 行
          </Typography.Text>
        )}
        {content && (
          <Button size="small" theme="borderless" type="tertiary" onClick={() => setContent('')}>清空</Button>
        )}
      </div>

      {/* 输出区 */}
      <div style={{ flex: 1, minHeight: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--semi-color-border)' }}>
        <pre
          ref={preRef}
          style={{
            margin: 0,
            padding: 12,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            background: 'var(--semi-color-bg-1)',
            height: '100%',
            overflow: 'auto',
            color: 'var(--semi-color-text-0)',
          }}
        >
          {displayContent || (
            <Typography.Text type="tertiary" style={{ fontStyle: 'italic' }}>
              {loading ? '加载中...' : '请选择日志文件并点击「加载」'}
            </Typography.Text>
          )}
        </pre>
      </div>
    </div>
  );
}
