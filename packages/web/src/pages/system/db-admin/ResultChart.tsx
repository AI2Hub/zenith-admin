import { useMemo, useState } from 'react';
import { Empty, RadioGroup, Radio, Select, Space, Typography } from '@douyinfe/semi-ui';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
} from 'recharts';

const { Text } = Typography;

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#14b8a6'];

type ChartType = 'bar' | 'line' | 'pie';

interface Props {
  columns: Array<{ name: string; dataType: string }>;
  rows: Array<Record<string, unknown>>;
}

function isNumericValue(v: unknown): boolean {
  if (typeof v === 'number') return true;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return true;
  return false;
}

export function ResultChart({ columns, rows }: Readonly<Props>) {
  const dataCols = columns.filter((c) => !c.name.startsWith('__'));

  // 推断数值列（取样前若干行判断）
  const numericCols = useMemo(() => {
    const sample = rows.slice(0, 20);
    return dataCols.filter((c) => sample.length > 0 && sample.every((r) => r[c.name] == null || isNumericValue(r[c.name]))).map((c) => c.name);
  }, [dataCols, rows]);

  const categoryCols = dataCols.map((c) => c.name).filter((n) => !numericCols.includes(n));

  const [type, setType] = useState<ChartType>('bar');
  const [xCol, setXCol] = useState<string>(categoryCols[0] ?? dataCols[0]?.name ?? '');
  const [yCol, setYCol] = useState<string>(numericCols[0] ?? '');

  const chartData = useMemo(() => {
    if (!xCol || !yCol) return [];
    return rows.slice(0, 200).map((r) => ({
      x: r[xCol] == null ? '' : String(r[xCol]),
      y: typeof r[yCol] === 'number' ? r[yCol] : Number(r[yCol]) || 0,
    }));
  }, [rows, xCol, yCol]);

  const allCols = dataCols.map((c) => ({ label: c.name, value: c.name }));
  const yOptions = (numericCols.length > 0 ? numericCols : dataCols.map((c) => c.name)).map((n) => ({ label: n, value: n }));

  if (dataCols.length === 0 || rows.length === 0) {
    return <Empty title="无可视化数据" />;
  }

  return (
    <div>
      <Space wrap style={{ marginBottom: 12 }} align="center">
        <RadioGroup type="button" value={type} onChange={(e) => setType(e.target.value as ChartType)}>
          <Radio value="bar">柱状图</Radio>
          <Radio value="line">折线图</Radio>
          <Radio value="pie">饼图</Radio>
        </RadioGroup>
        <Space spacing={4}>
          <Text type="tertiary" size="small">{type === 'pie' ? '分类' : 'X 轴'}</Text>
          <Select size="small" value={xCol} onChange={(v) => setXCol(v as string)} optionList={allCols} style={{ width: 150 }} />
        </Space>
        <Space spacing={4}>
          <Text type="tertiary" size="small">{type === 'pie' ? '数值' : 'Y 轴'}</Text>
          <Select size="small" value={yCol} onChange={(v) => setYCol(v as string)} optionList={yOptions} style={{ width: 150 }} />
        </Space>
        {rows.length > 200 && <Text type="tertiary" size="small">（仅展示前 200 行）</Text>}
      </Space>

      {!xCol || !yCol ? <Empty title="请选择坐标轴列" /> : (
        <ResponsiveContainer width="100%" height={360}>
          {type === 'bar' ? (
            <BarChart data={chartData} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--semi-color-border)" />
              <XAxis dataKey="x" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <RTooltip contentStyle={{ background: 'var(--semi-color-bg-2)', border: '1px solid var(--semi-color-border)', borderRadius: 6, fontSize: 12 }} />
              <Bar dataKey="y" name={yCol} fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={chartData} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--semi-color-border)" />
              <XAxis dataKey="x" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <RTooltip contentStyle={{ background: 'var(--semi-color-bg-2)', border: '1px solid var(--semi-color-border)', borderRadius: 6, fontSize: 12 }} />
              <Line type="monotone" dataKey="y" name={yCol} stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          ) : (
            <PieChart>
              <Pie data={chartData.slice(0, 12)} dataKey="y" nameKey="x" cx="50%" cy="50%" outerRadius={120} label>
                {chartData.slice(0, 12).map((d, i) => <Cell key={`${d.x}-${i}`} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <RTooltip contentStyle={{ background: 'var(--semi-color-bg-2)', border: '1px solid var(--semi-color-border)', borderRadius: 6, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}

ResultChart.displayName = 'ResultChart';
