import { useState, useCallback, useEffect } from 'react';
import { Button, Input, Tag } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { Search, RotateCcw } from 'lucide-react';
import { request } from '@/utils/request';
import { SearchToolbar } from '@/components/SearchToolbar';
import ConfigurableTable from '@/components/ConfigurableTable';

interface PortEntry {
  protocol: string;
  localAddress: string;
  localPort: number;
  state: string;
  pid: number | null;
  processName: string | null;
}

function localDisplay(entry: PortEntry): string {
  const addr = entry.localAddress === '0.0.0.0' || entry.localAddress === '::' || entry.localAddress === '*' ? '*' : entry.localAddress;
  return `${addr}:${entry.localPort}`;
}

export default function PortsPage() {
  const [data, setData] = useState<PortEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  const fetchData = useCallback(async (kw = '') => {
    setLoading(true);
    const res = await request.get<PortEntry[]>('/api/ports');
    setLoading(false);
    if (res.code === 0 && res.data) {
      const all = res.data;
      const filtered = kw
        ? all.filter((p) =>
            String(p.localPort).includes(kw) ||
            (p.processName ?? '').toLowerCase().includes(kw.toLowerCase()) ||
            p.localAddress.includes(kw) ||
            p.protocol.includes(kw),
          )
        : all;
      setData(filtered);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleSearch = () => { setSearchKeyword(keyword); void fetchData(keyword); };
  const handleReset = () => { setKeyword(''); setSearchKeyword(''); void fetchData(''); };

  const columns: ColumnProps<PortEntry>[] = [
    {
      title: '协议',
      dataIndex: 'protocol',
      width: 80,
      render: (v: string) => <Tag color="blue" size="small">{v.toUpperCase()}</Tag>,
    },
    {
      title: '本地地址',
      width: 200,
      render: (_: unknown, r: PortEntry) => (
        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{localDisplay(r)}</span>
      ),
    },
    {
      title: '端口',
      dataIndex: 'localPort',
      width: 100,
      sorter: (a, b) => (a?.localPort ?? 0) - (b?.localPort ?? 0),
      render: (v: number) => <strong>{v}</strong>,
    },
    {
      title: '状态',
      dataIndex: 'state',
      width: 110,
      render: (v: string) => (
        <Tag color={v === 'LISTEN' ? 'green' : 'orange'} size="small">{v}</Tag>
      ),
    },
    {
      title: 'PID',
      dataIndex: 'pid',
      width: 90,
      render: (v: number | null) => v ?? '—',
    },
    {
      title: '进程名',
      dataIndex: 'processName',
      render: (v: string | null) => v ?? '—',
    },
  ];

  return (
    <div className="page-container">
      <SearchToolbar>
        <Input
          prefix={<Search size={14} />}
          placeholder="搜索端口/进程/地址/协议"
          value={keyword}
          onChange={setKeyword}
          onEnterPress={handleSearch}
          showClear
          style={{ width: 260 }}
        />
        <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
        <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>
      </SearchToolbar>

      <ConfigurableTable
        bordered
        rowKey={(r) => `${r?.protocol}-${r?.localAddress}-${r?.localPort}`}
        dataSource={data}
        columns={columns}
        loading={loading}
        onRefresh={() => void fetchData(searchKeyword)}
        refreshLoading={loading}
        empty="暂无监听端口数据"
        pagination={{ pageSize: 50, showSizeChanger: true }}
      />
    </div>
  );
}
