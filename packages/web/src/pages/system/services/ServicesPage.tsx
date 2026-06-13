import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Button, Tag, Toast, SideSheet, Typography, Input, Empty,
} from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { RefreshCw, Search, Play, Square, FileText } from 'lucide-react';
import { TOKEN_KEY } from '@zenith/shared';
import { config } from '@/config';
import { request } from '@/utils/request';
import { SearchToolbar } from '@/components/SearchToolbar';
import ConfigurableTable from '@/components/ConfigurableTable';

interface ServiceInfo {
  name: string;
  description: string;
  loadState: string;
  activeState: string;
  subState: string;
}

const STATE_COLOR: Record<string, 'green' | 'grey' | 'red' | 'orange'> = {
  active: 'green', inactive: 'grey', failed: 'red', activating: 'orange',
};

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

export default function ServicesPage() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [logsService, setLogsService] = useState<ServiceInfo | null>(null);
  const [logs, setLogs] = useState('');
  const [logsFollowing, setLogsFollowing] = useState(false);
  const logsAbortRef = useRef<AbortController | null>(null);
  const logsPreRef = useRef<HTMLPreElement>(null);

  // 自动滚到底部
  useEffect(() => {
    if (logsFollowing && logsPreRef.current) {
      logsPreRef.current.scrollTop = logsPreRef.current.scrollHeight;
    }
  }, [logs, logsFollowing]);

  useEffect(() => () => { logsAbortRef.current?.abort(); }, []);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const chk = await request.get<{ available: boolean }>('/api/systemd/check', { silent: true });
    if (chk.code !== 0 || !chk.data?.available) { setAvailable(false); setLoading(false); return; }
    setAvailable(true);
    const res = await request.get<ServiceInfo[]>('/api/systemd/');
    setLoading(false);
    if (res.code === 0 && res.data) setServices(res.data);
  }, []);

  useEffect(() => { void fetchServices(); }, [fetchServices]);

  const handleAction = async (name: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading((p) => ({ ...p, [name]: true }));
    const res = await request.post(`/api/systemd/${name}/${action}`, {});
    setActionLoading((p) => ({ ...p, [name]: false }));
    if (res.code === 0) {
      const msg = { start: '已启动', stop: '已停止', restart: '已重启' }[action];
      Toast.success({ content: msg, duration: 2 });
      void fetchServices();
    }
  };

  const openLogs = async (svc: ServiceInfo) => {
    logsAbortRef.current?.abort();
    setLogsService(svc);
    setLogs('');
    setLogsFollowing(false);
    const res = await request.get<{ logs: string }>(`/api/systemd/${svc.name}/logs`);
    if (res.code === 0 && res.data) setLogs(res.data.logs);
  };

  const closeLogs = () => {
    logsAbortRef.current?.abort();
    logsAbortRef.current = null;
    setLogsService(null);
    setLogs('');
    setLogsFollowing(false);
  };

  const toggleFollow = () => {
    if (logsFollowing) {
      logsAbortRef.current?.abort();
      logsAbortRef.current = null;
      setLogsFollowing(false);
    } else if (logsService) {
      setLogsFollowing(true);
      const abort = new AbortController();
      logsAbortRef.current = abort;
      void fetchStream(
        `/api/systemd/${logsService.name}/logs/stream`,
        (text) => setLogs((prev) => prev + text),
        abort.signal,
      ).catch(() => { /* disconnected */ }).finally(() => { setLogsFollowing(false); });
    }
  };

  const filtered = keyword
    ? services.filter((s) =>
        s.name.toLowerCase().includes(keyword.toLowerCase()) ||
        s.description.toLowerCase().includes(keyword.toLowerCase()),
      )
    : services;

  const columns: ColumnProps<ServiceInfo>[] = [
    {
      title: '服务名',
      render: (_: unknown, r: ServiceInfo) => (
        <Typography.Text size="small" code style={{ fontSize: 12 }}>{r.name}</Typography.Text>
      ),
    },
    {
      title: '描述',
      render: (_: unknown, r: ServiceInfo) => (
        <Typography.Text size="small" type="secondary" ellipsis={{ showTooltip: true }}>{r.description || '—'}</Typography.Text>
      ),
    },
    {
      title: '状态', width: 130,
      render: (_: unknown, r: ServiceInfo) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Tag size="small" color={STATE_COLOR[r.activeState] ?? 'grey'}>{r.activeState}</Tag>
          {r.subState && r.subState !== r.activeState && (
            <Tag size="small" color="grey">{r.subState}</Tag>
          )}
        </div>
      ),
    },
    {
      title: '加载状态', dataIndex: 'loadState', width: 100,
      render: (v: string) => <Tag size="small" color={v === 'loaded' ? 'blue' : 'grey'}>{v}</Tag>,
    },
    {
      title: '操作', width: 200, fixed: 'right' as const,
      render: (_: unknown, r: ServiceInfo) => {
        const busy = !!actionLoading[r.name];
        const isActive = r.activeState === 'active';
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            {isActive
              ? <Button size="small" theme="borderless" type="danger" loading={busy} onClick={() => void handleAction(r.name, 'stop')}>停止</Button>
              : <Button size="small" theme="borderless" loading={busy} onClick={() => void handleAction(r.name, 'start')}>启动</Button>
            }
            <Button size="small" theme="borderless" loading={busy} onClick={() => void handleAction(r.name, 'restart')}>重启</Button>
            <Button size="small" theme="borderless" icon={<FileText size={13} />} onClick={() => void openLogs(r)}>日志</Button>
          </div>
        );
      },
    },
  ];

  if (available === false) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          title="systemd 不可用"
          description="当前系统不支持 systemd，此功能仅在 Linux 系统（systemd 可用）下生效。"
          style={{ padding: '80px 0' }}
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <SearchToolbar>
        <Input prefix={<Search size={14} />} placeholder="搜索服务名 / 描述" showClear value={keyword} onChange={setKeyword} style={{ width: 260 }} />
        <Button type="tertiary" icon={<RefreshCw size={14} />} onClick={() => void fetchServices()}>刷新</Button>
      </SearchToolbar>
      <ConfigurableTable
        bordered rowKey="name" dataSource={filtered} columns={columns} loading={loading}
        onRefresh={() => void fetchServices()} refreshLoading={loading}
        empty="未找到 systemd 服务" pagination={{ pageSize: 50, showSizeChanger: true }}
      />

      <SideSheet
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span><FileText size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />服务日志：{logsService?.name ?? ''}</span>
            <Button size="small" type={logsFollowing ? 'primary' : 'tertiary'} onClick={toggleFollow} style={{ marginRight: 32 }}
              icon={logsFollowing ? <Square size={13} /> : <Play size={13} />}>
              {logsFollowing ? '停止追踪' : '实时追踪'}
            </Button>
          </div>
        }
        visible={!!logsService} onCancel={closeLogs} width={680} placement="right"
      >
        <pre ref={logsPreRef} style={{
          fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          background: 'var(--semi-color-fill-0)', padding: 12, borderRadius: 6,
          height: 'calc(100vh - 120px)', overflow: 'auto', margin: 0,
        }}>
          {logs || '（暂无日志）'}
        </pre>
      </SideSheet>
    </div>
  );
}
