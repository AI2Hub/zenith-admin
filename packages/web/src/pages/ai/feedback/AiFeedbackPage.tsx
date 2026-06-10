import { useState, useCallback, useEffect } from 'react';
import { Button, Tag, Typography, Select } from '@douyinfe/semi-ui';
import { RotateCcw, Search, ThumbsUp, ThumbsDown } from 'lucide-react';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import type { AiMessage } from '@zenith/shared';
import { request } from '@/utils/request';
import { formatDateTime } from '@/utils/date';
import ConfigurableTable from '@/components/ConfigurableTable';
import { SearchToolbar } from '@/components/SearchToolbar';
import { usePagination } from '@/hooks/usePagination';

const { Text } = Typography;

const FEEDBACK_OPTIONS = [
  { value: '', label: '全部' },
  { value: '1', label: '👍 点赞' },
  { value: '-1', label: '👎 点踩' },
];

export default function AiFeedbackPage() {
  const [feedbackFilter, setFeedbackFilter] = useState('');
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const [data, setData] = useState<{ list: AiMessage[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (p = page, ps = pageSize, fb = feedbackFilter) => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(p), pageSize: String(ps) });
    if (fb) qs.set('feedback', fb);
    const res = await request.get<{ list: AiMessage[]; total: number; page: number; pageSize: number }>(
      `/api/ai/conversations/admin/feedback?${qs.toString()}`
    );
    if (res.code === 0 && res.data) setData(res.data);
    setLoading(false);
  }, [page, pageSize, feedbackFilter]);

  // Initial load
  useEffect(() => { void fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => { setPage(1); void fetchData(1, pageSize, feedbackFilter); };
  const handleReset = () => { setFeedbackFilter(''); setPage(1); void fetchData(1, pageSize, ''); };

  const columns: ColumnProps<AiMessage>[] = [
    {
      title: '反馈',
      dataIndex: 'feedback',
      width: 80,
      align: 'center',
      fixed: 'left',
      render: (v: number) => v === 1
        ? <Tag color="green" size="small"><ThumbsUp size={11} style={{ verticalAlign: -2, marginRight: 3 }} />点赞</Tag>
        : <Tag color="red" size="small"><ThumbsDown size={11} style={{ verticalAlign: -2, marginRight: 3 }} />点踩</Tag>,
    },
    {
      title: 'AI 回复内容',
      dataIndex: 'content',
      render: (v: string) => (
        <Text ellipsis={{ showTooltip: { opts: { style: { maxWidth: 600 } } } }} style={{ fontSize: 13 }}>
          {v}
        </Text>
      ),
    },
    { title: '对话 ID', dataIndex: 'conversationId', width: 90, align: 'center' },
    { title: '消息 ID', dataIndex: 'id', width: 90, align: 'center' },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => formatDateTime(v),
      fixed: 'right',
    },
  ];

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      <SearchToolbar>
        <Select
          value={feedbackFilter}
          onChange={(v) => setFeedbackFilter(String(v))}
          optionList={FEEDBACK_OPTIONS}
          style={{ width: 120 }}
          placeholder="反馈类型"
        />
        <Button type="primary" icon={<Search size={14} />} onClick={handleSearch}>查询</Button>
        <Button type="tertiary" icon={<RotateCcw size={14} />} onClick={handleReset}>重置</Button>
      </SearchToolbar>
      <div style={{ flex: 1, minHeight: 0, marginTop: 12 }}>
        <ConfigurableTable<AiMessage>
          bordered
          rowKey="id"
          columns={columns}
          dataSource={data?.list ?? []}
          loading={loading}
          onRefresh={() => void fetchData()}
          refreshLoading={loading}
          pagination={{
            total: data?.total ?? 0,
            currentPage: page,
            pageSize,
            pageSizeOpts: [10, 20, 50],
            showSizeChanger: true,
            showTotal: true,
            onPageChange: (p) => { setPage(p); void fetchData(p, pageSize, feedbackFilter); },
            onPageSizeChange: (ps) => { setPageSize(ps); setPage(1); void fetchData(1, ps, feedbackFilter); },
          }}
        />
      </div>
    </div>
  );
}
