import { useState, useCallback, useEffect } from 'react';
import {
  Button,
  Tag,
  Toast,
  Popconfirm,
  SideSheet,
  Typography,
  Tooltip,
  Dropdown,
  Progress,
  Modal,
  Empty,
  Input,
} from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import {
  RotateCcw,
  FileText,
  RefreshCw,
  ChevronDown,
  Activity,
  Search,
  Info,
} from 'lucide-react';
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
  composeProject: string | null;
  composeService: string | null;
}

interface StatsInfo {
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
}

const STATE_COLOR: Record<string, 'green' | 'grey' | 'orange' | 'blue' | 'red'> = {
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

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 将平铺容器列表按 Compose 项目分组，生成树形表格需要的层级结构 */
function groupByCompose(containers: ContainerInfo[]): (ContainerInfo & { children?: ContainerInfo[] })[] {
  const groups: Record<string, ContainerInfo[]> = {};
  const standalone: ContainerInfo[] = [];

  for (const c of containers) {
    if (c.composeProject) {
      if (!groups[c.composeProject]) groups[c.composeProject] = [];
      groups[c.composeProject].push(c);
    } else {
      standalone.push(c);
    }
  }

  const result: (ContainerInfo & { children?: ContainerInfo[] })[] = [];
  for (const [project, members] of Object.entries(groups)) {
    const runningCount = members.filter((m) => m.state === 'running').length;
    let parentState: string;
    if (runningCount === members.length) {
      parentState = 'running';
    } else if (runningCount > 0) {
      parentState = 'paused';
    } else {
      parentState = 'exited';
    }
    result.push({
      id: `__compose__${project}`,
      shortId: '',
      names: [`📦 ${project}`],
      image: `${members.length} 个服务`,
      imageId: '',
      command: '',
      created: Math.max(...members.map((m) => m.created)),
      state: parentState,
      status: `${runningCount}/${members.length} 运行中`,
      ports: members.flatMap((m) => m.ports),
      composeProject: project,
      composeService: null,
      children: members,
    });
  }

  return [...result, ...standalone];
}

export default function DockerPage() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [logsContainer, setLogsContainer] = useState<ContainerInfo | null>(null);
  const [logs, setLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [statsContainer, setStatsContainer] = useState<ContainerInfo | null>(null);
  const [stats, setStats] = useState<StatsInfo | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [inspectTarget, setInspectTarget] = useState<ContainerInfo | null>(null);
  const [inspectData, setInspectData] = useState('');
  const [inspectLoading, setInspectLoading] = useState(false);
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

  const openStats = async (c: ContainerInfo) => {
    setStatsContainer(c);
    setStatsLoading(true);
    setStats(null);
    const res = await request.get<StatsInfo>(`/api/docker/${c.id}/stats`);
    setStatsLoading(false);
    if (res.code === 0 && res.data) setStats(res.data);
  };

  const openInspect = async (c: ContainerInfo) => {
    setInspectTarget(c);
    setInspectLoading(true);
    setInspectData('');
    const res = await request.get<Record<string, unknown>>(`/api/docker/${c.id}/inspect`);
    setInspectLoading(false);
    if (res.code === 0 && res.data) {
      setInspectData(JSON.stringify(res.data, null, 2));
    }
  };

  const isGroup = (r: ContainerInfo) => r.id.startsWith('__compose__');

  const filtered = keyword
    ? groupByCompose(
        containers.filter(
          (c) =>
            c.names.join(',').toLowerCase().includes(keyword.toLowerCase()) ||
            c.image.toLowerCase().includes(keyword.toLowerCase()) ||
            (c.composeProject ?? '').toLowerCase().includes(keyword.toLowerCase()),
        ),
      )
    : groupByCompose(containers);

  const columns: ColumnProps<ContainerInfo>[] = [
    {
      title: '容器名 / 服务',
      render: (_: unknown, r: ContainerInfo) => {
        const name = r.names[0] ?? r.shortId;
        if (isGroup(r)) {
          return <Typography.Text strong>{name}</Typography.Text>;
        }
        return (
          <div>
            <Typography.Text size="small">{name}</Typography.Text>
            {r.composeService && (
              <Tag size="small" color="purple" style={{ marginLeft: 6 }}>
                {r.composeService}
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: '镜像',
      dataIndex: 'image',
      width: 220,
      render: (v: string, r: ContainerInfo) => {
        if (isGroup(r)) {
          return <Typography.Text type="tertiary" size="small">{v}</Typography.Text>;
        }
        return (
          <Tooltip content={v}>
            <Tag size="small" color="blue">{v.length > 30 ? `${v.slice(0, 30)}…` : v}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'state',
      width: 130,
      render: (v: string, r: ContainerInfo) => (
        <Tooltip content={r.status}>
          <Tag size="small" color={STATE_COLOR[v] ?? 'grey'}>{r.status}</Tag>
        </Tooltip>
      ),
    },
    {
      title: '端口映射',
      width: 200,
      render: (_: unknown, r: ContainerInfo) => {
        if (isGroup(r)) return null;
        return (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {formatPorts(r.ports)}
          </span>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created',
      width: 170,
      render: (v: number, r: ContainerInfo) => {
        if (isGroup(r)) return null;
        return formatDateTime(new Date(v * 1000));
      },
    },
    {
      title: '操作',
      width: 180,
      fixed: 'right' as const,
      render: (_: unknown, r: ContainerInfo) => {
        if (isGroup(r)) return null;
        const isRunning = r.state === 'running';
        const busy = !!actionLoading[r.id];
        return (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {isRunning ? (
              <Popconfirm
                title={`确定停止 ${r.names[0] ?? r.shortId}？`}
                okType="danger"
                onConfirm={() => void handleAction(r.id, 'stop')}
              >
                <Button size="small" theme="borderless" type="danger" loading={busy}>
                  停止
                </Button>
              </Popconfirm>
            ) : (
              <Button
                size="small"
                theme="borderless"
                loading={busy}
                onClick={() => void handleAction(r.id, 'start')}
              >
                启动
              </Button>
            )}
            <Button
              size="small"
              theme="borderless"
              onClick={() => void openLogs(r)}
            >
              日志
            </Button>
            <Dropdown
              trigger="click"
              position="bottomRight"
              render={
                <Dropdown.Menu>
                  <Dropdown.Item
                    icon={<RotateCcw size={13} />}
                    onClick={() => void handleAction(r.id, 'restart')}
                  >
                    重启
                  </Dropdown.Item>
                  <Dropdown.Item
                    icon={<Activity size={13} />}
                    onClick={() => void openStats(r)}
                  >
                    资源占用
                  </Dropdown.Item>
                  <Dropdown.Item
                    icon={<Info size={13} />}
                    onClick={() => void openInspect(r)}
                  >
                    检查详情
                  </Dropdown.Item>
                </Dropdown.Menu>
              }
            >
              <Button size="small" theme="borderless" icon={<ChevronDown size={13} />} />
            </Dropdown>
          </div>
        );
      },
    },
  ];

  return (
    <div className="page-container">
      <SearchToolbar>
        <Input
          prefix={<Search size={14} />}
          placeholder="搜索容器名 / 镜像 / Compose 项目"
          showClear
          value={keyword}
          onChange={setKeyword}
          style={{ width: 280 }}
        />
        <Button
          type="tertiary"
          icon={<RefreshCw size={14} />}
          onClick={() => void fetchContainers()}
        >
          刷新
        </Button>
      </SearchToolbar>

      {dockerAvailable ? (
        <ConfigurableTable
          bordered
          rowKey="id"
          dataSource={filtered}
          columns={columns}
          loading={loading}
          onRefresh={() => void fetchContainers()}
          refreshLoading={loading}
          empty="未检测到 Docker 容器"
          pagination={{ pageSize: 30, showSizeChanger: true }}
          expandAllGroupRows
        />
      ) : (
        <Empty
          title="Docker 不可用"
          description="无法连接到 Docker 守护进程，请确认 Docker 已安装并正在运行。"
          style={{ padding: '48px 0' }}
        />
      )}

      {/* 日志侧边抽屉 */}
      <SideSheet
        title={
          <span>
            <FileText size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            容器日志：{logsContainer?.names[0] ?? logsContainer?.shortId ?? ''}
          </span>
        }
        visible={!!logsContainer}
        onCancel={() => { setLogsContainer(null); setLogs(''); }}
        width={680}
        placement="right"
      >
        {logsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Typography.Text type="tertiary">加载中...</Typography.Text>
          </div>
        ) : (
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

      {/* 资源占用 Modal */}
      <Modal
        title={
          <span>
            <Activity size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            资源占用：{statsContainer?.names[0] ?? statsContainer?.shortId ?? ''}
          </span>
        }
        visible={!!statsContainer}
        onCancel={() => { setStatsContainer(null); setStats(null); }}
        footer={null}
        width={440}
      >
        {statsLoading && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Typography.Text type="tertiary">正在获取资源数据...</Typography.Text>
          </div>
        )}
        {!statsLoading && stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Typography.Text strong>CPU 使用率</Typography.Text>
                <Typography.Text>{stats.cpuPercent.toFixed(2)}%</Typography.Text>
              </div>
              <Progress
                percent={Math.min(stats.cpuPercent, 100)}
                showInfo={false}
                stroke={stats.cpuPercent > 80 ? 'var(--semi-color-danger)' : undefined}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Typography.Text strong>内存使用</Typography.Text>
                <Typography.Text>
                  {formatBytes(stats.memUsage)} / {formatBytes(stats.memLimit)}
                  <Typography.Text type="tertiary" size="small" style={{ marginLeft: 6 }}>
                    ({stats.memLimit > 0 ? ((stats.memUsage / stats.memLimit) * 100).toFixed(1) : 0}%)
                  </Typography.Text>
                </Typography.Text>
              </div>
              <Progress
                percent={stats.memLimit > 0 ? (stats.memUsage / stats.memLimit) * 100 : 0}
                showInfo={false}
                stroke={
                  stats.memLimit > 0 && stats.memUsage / stats.memLimit > 0.8
                    ? 'var(--semi-color-danger)'
                    : undefined
                }
              />
            </div>
          </div>
        )}
        {!statsLoading && !stats && (
          <Typography.Text type="tertiary">获取失败</Typography.Text>
        )}
      </Modal>

      {/* docker inspect 详情 Modal */}
      <Modal
        title={
          <span>
            <Info size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            检查详情：{inspectTarget?.names[0] ?? inspectTarget?.shortId ?? ''}
          </span>
        }
        visible={!!inspectTarget}
        onCancel={() => { setInspectTarget(null); setInspectData(''); }}
        footer={null}
        width={780}
        style={{ top: 40 }}
        bodyStyle={{ padding: 0 }}
      >
        {inspectLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Typography.Text type="tertiary">正在获取容器详情...</Typography.Text>
          </div>
        ) : (
          <pre
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              background: 'var(--semi-color-fill-0)',
              padding: 16,
              margin: 0,
              maxHeight: 'calc(100vh - 200px)',
              overflow: 'auto',
              borderRadius: '0 0 6px 6px',
            }}
          >
            {inspectData || '（暂无数据）'}
          </pre>
        )}
      </Modal>
    </div>
  );
}
