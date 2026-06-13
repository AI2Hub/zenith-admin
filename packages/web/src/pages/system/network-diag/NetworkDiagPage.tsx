import { useState, useRef, useEffect, useCallback } from 'react';
import { Button, Input, Select, InputNumber, Tag, Typography } from '@douyinfe/semi-ui';
import { Play, Square, Wifi, Search } from 'lucide-react';
import { TOKEN_KEY } from '@zenith/shared';
import { config } from '@/config';
import { request } from '@/utils/request';

const TOOL_OPTIONS = [
  { value: 'ping', label: 'Ping', desc: '检测主机连通性和延迟' },
  { value: 'traceroute', label: 'Traceroute', desc: '追踪数据包路由路径' },
  { value: 'nslookup', label: 'NSLookup', desc: 'DNS 正向/反向解析' },
  { value: 'port-check', label: '端口检测', desc: '检测 TCP 端口是否开放' },
] as const;

type ToolType = (typeof TOOL_OPTIONS)[number]['value'];

const STREAMING_TOOLS: ToolType[] = ['ping', 'traceroute'];

async function fetchStream(
  url: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  const base = config.apiBaseUrl || '';
  const resp = await fetch(`${base}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!resp.ok) { onChunk(`\n❌ HTTP ${resp.status}\n`); return; }
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

export default function NetworkDiagPage() {
  const [tool, setTool] = useState<ToolType>('ping');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(80);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // 输出更新时自动滚到底部
  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [output]);

  const handleRun = useCallback(async () => {
    if (!host.trim()) return;
    setOutput('');
    setRunning(true);

    if (STREAMING_TOOLS.includes(tool)) {
      const abort = new AbortController();
      abortRef.current = abort;
      const params = new URLSearchParams({ type: tool, host: host.trim() });
      try {
        await fetchStream(
          `/api/network-diag/stream?${params.toString()}`,
          (text) => setOutput((prev) => prev + text),
          abort.signal,
        );
      } catch (e) {
        if (!(e instanceof Error && e.name === 'AbortError')) {
          setOutput((prev) => `${prev}\n❌ 错误: ${(e as Error).message}\n`);
        }
      }
      abortRef.current = null;
    } else if (tool === 'nslookup') {
      const res = await request.get<{ output: string }>(
        `/api/network-diag/nslookup?host=${encodeURIComponent(host.trim())}`,
      );
      setOutput(res.code === 0 && res.data ? res.data.output : '查询失败');
    } else if (tool === 'port-check') {
      const res = await request.post<{ open: boolean; latencyMs: number }>(
        '/api/network-diag/port-check',
        { host: host.trim(), port },
      );
      if (res.code === 0 && res.data) {
        const { open, latencyMs } = res.data;
        setOutput(open
          ? `✅ ${host.trim()}:${port} 端口开放（延迟 ${latencyMs} ms）`
          : `❌ ${host.trim()}:${port} 端口不可达（超时 ${latencyMs} ms）`,
        );
      }
    }
    setRunning(false);
  }, [tool, host, port]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setOutput((prev) => `${prev}\n\n⬛ 已手动停止\n`);
  }, []);

  const selectedTool = TOOL_OPTIONS.find((t) => t.value === tool)!;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: 12 }}>
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Wifi size={18} style={{ color: 'var(--semi-color-primary)' }} />
        <Typography.Title heading={6} style={{ margin: 0 }}>网络诊断</Typography.Title>
      </div>

      {/* 工具栏 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <Typography.Text size="small" type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            诊断工具
          </Typography.Text>
          <Select
            value={tool}
            onChange={(v) => setTool(v as ToolType)}
            style={{ width: 140 }}
            optionList={TOOL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Typography.Text size="small" type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            主机名 / IP
          </Typography.Text>
          <Input
            placeholder="如 google.com 或 8.8.8.8"
            value={host}
            onChange={setHost}
            prefix={<Search size={13} />}
            showClear
            onEnterPress={() => !running && void handleRun()}
          />
        </div>
        {tool === 'port-check' && (
          <div>
            <Typography.Text size="small" type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              端口
            </Typography.Text>
            <InputNumber min={1} max={65535} value={port} onChange={(v) => setPort(Number(v))} style={{ width: 100 }} />
          </div>
        )}
        {!running ? (
          <Button
            type="primary"
            icon={<Play size={14} />}
            disabled={!host.trim()}
            onClick={() => void handleRun()}
          >
            运行
          </Button>
        ) : (
          <Button type="danger" icon={<Square size={14} />} onClick={handleStop}>停止</Button>
        )}
      </div>

      {/* 工具说明 */}
      <div>
        <Tag color="blue" size="small">{selectedTool.label}</Tag>
        <Typography.Text type="tertiary" size="small" style={{ marginLeft: 8 }}>{selectedTool.desc}</Typography.Text>
      </div>

      {/* 输出区 */}
      <div style={{ flex: 1, minHeight: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--semi-color-border)' }}>
        <div style={{
          padding: '4px 12px',
          background: 'var(--semi-color-fill-1)',
          borderBottom: '1px solid var(--semi-color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Typography.Text size="small" type="secondary">输出</Typography.Text>
          {running && <Tag color="green" size="small">● 运行中</Tag>}
        </div>
        <pre
          ref={preRef}
          style={{
            margin: 0,
            padding: 12,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            background: 'var(--semi-color-bg-1)',
            height: 'calc(100% - 32px)',
            overflow: 'auto',
            color: 'var(--semi-color-text-0)',
          }}
        >
          {output || <Typography.Text type="tertiary" style={{ fontStyle: 'italic' }}>等待运行...</Typography.Text>}
        </pre>
      </div>
    </div>
  );
}
