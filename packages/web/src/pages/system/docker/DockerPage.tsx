import { useState, useCallback, useEffect } from 'react';
import { Button, Tag, Toast, Popconfirm, SideSheet, Typography, Tooltip } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Play, Square, RotateCcw, FileText, RefreshCw } from 'lucide-react';
import { request } from '@/utils/request';
import { SearchToolbar } from '@/components/SearchToolbar';
import ConfigurableTable from '@/components/ConfigurableTable';
import { formatDateTime } from '@/utils/date';

interface PortBinding {
  privatePort: number;
  publicPort?: number;
  type: string;
}

interface ContainerInfo {
  id: string;
  shortId: string;
  names: string[];
  image: string;
  imageId: string;
  command: string;
  created: number;
  state: string;
  status: string;
  ports: PortBinding[];
}

const STATE_COLOR: Record<string, string> = {
  running: 'green',
  exited: 'grey',
  paused: 'orange',
  created: 'blue',
  dead: 'red',
};

function formatPorts(ports: PortBinding[]): string {
  const bindings = ports
    .filter((p) => p.publicPort)
    .map((p) => `${p.publicPort}→${p.privatePort}/${p.type}`)
    .join(', ');
  return bindings || '—';
}

export default function DockerPage() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [logsContainer, setLogsContainer] = useState<ContainerInfo | null>(null);
  const [logs, setLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState(true);

  const fetchContainers = useCallback(async () => {
    setLoading(true);
    const res = await request.get<ContainerInfo[]>('/api/docker', { silent: true });
    setLoading(false);
    if (res.code === 0 && res.data) {
      setContainers(res.data);
      setDockerAvailable(true);
    } else {
      setDockerAvailable(false);
    }
  }, []);

  useEffect(() => { void fetchContainers(); }, [fetchContainers]);

  const handleAction = async (id: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading((p) => ({ ...p, [id]: true }));
    const res = await request.post(`/api/docker/${id}/${action}`, {});
    setActionLoading((p) => ({ ...p, [id]: false }));
    if (res.code === 0) {
    const msgMap = { start: '已启动', stop: '已停止', restart: '已重启' } as const;
      Toast.success({ content: msgMap[action], duration: 2 });
      void fetchContainers();
    }
  };

  const openLogs = async (c: ContainerInfo) => {
    setLogsContainer(c);
    setLogsLoading(true);
    setLogs('');
    const res = await request.get<{ logs: string }>(`/api/docker/${c.id}/logs?tail=500`);
    setLogsLoading(false);
    if (res.code === 0 && res.data) setLogs(res.data.logs);
  };

  const columns: ColumnProps<ContainerInfo>[] = [
    {
      title: '容器名',
      render: (_: unknown, r: ContainerInfo) => (
        <div>
          <Typography.Text strong size="small">{r.names[0] ?? r.shortId}</Typography.Text>
          {r.names.length > 1 && (
            <Typography.Text type="tertiary" size="small"> +{r.names.length - 1}</Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: '镜像',
      dataIndex: 'image',
      width: 200,
      render: (v: string) => <Tag size="small" color="blue">{v}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'state',
      width: 100,
      render: (v: string, r: ContainerInfo) => (
        <Tooltip content={r.status}>
          <Tag size="small" color={STATE_COLOR[v] ?? 'grey'}>{v}</Tag>
        </Tooltip>
      ),
    },
    {
      title: '端口映射',
      width: 200,
      render: (_: unknown, r: ContainerInfo) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{formatPorts(r.ports)}</span>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created',
      width: 170,
      render: (v: number) => formatDateTime(new Date(v * 1000)),
    },
    {
      title: '操作',
      width: 200,
      fixed: 'right' as const,
      render: (_: unknown, r: ContainerInfo) => {
        const isRunning = r.state === 'running';
        const busy = actionLoading[r.id];
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            {!isRunning && (
              <Button size="small" theme="borderless" loading={busy} icon={<Play size={12} />} onClick={() => void handleAction(r.id, 'start')}>启动</Button>
            )}
            {isRunning && (
              <Popconfirm title={`确定停止容器 ${r.names[0] ?? r.shortId}？`} okType="danger" onConfirm={() => void handleAction(r.id, 'stop')}>
                <Button size="small" theme="borderless" type="danger" loading={busy} icon={<Square size={12} />}>停止</Button>
              </Popconfirm>
            )}
            <Button size="small" theme="borderless" loading={busy} icon={<RotateCcw size={12} />} onClick={() => void handleAction(r.id, 'restart')}>重启</Button>
            <Button size="small" theme="borderless" icon={<FileText size={12} />} onClick={() => void openLogs(r)}>日志</Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="page-container">
      <SearchToolbar>
        <Button type="tertiary" icon={<RefreshCw size={14} />} onClick={() => void fetchContainers()}>刷新</Button>
      </SearchToolbar>

      {!dockerAvailable && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--semi-color-text-2)' }}>
          <Typography.Text type="tertiary">无法连接 Docker，请确认 Docker 守护进程正在运行。</Typography.Text>
        </div>
      )}

      {dockerAvailable && (
        <ConfigurableTable
          bordered
          rowKey="id"
          dataSource={containers}
          columns={columns}
          loading={loading}
          onRefresh={() => void fetchContainers()}
          refreshLoading={loading}
          empty="未检测到 Docker 容器"
          pagination={{ pageSize: 30, showSizeChanger: true }}
        />
      )}

      {/* 日志侧边抽屉 */}
      <SideSheet
        title={`容器日志：${logsContainer?.names[0] ?? logsContainer?.shortId ?? ''}`}
        visible={!!logsContainer}
        onCancel={() => setLogsContainer(null)}
        width={640}
        placement="right"
      >
        {logsLoading && <Typography.Text type="tertiary">加载中...</Typography.Text>}
        {!logsLoading && (
          <pre
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              background: 'var(--semi-color-fill-0)',
              padding: 12,
              borderRadius: 6,
              maxHeight: 'calc(100vh - 120px)',
              overflow: 'auto',
              margin: 0,
            }}
          >
            {logs || '（暂无日志）'}
          </pre>
        )}
      </SideSheet>
    </div>
  );
}
