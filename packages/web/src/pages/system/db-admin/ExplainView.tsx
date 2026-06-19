import { useMemo, useState } from 'react';
import { Tree, Tag, Typography, Space, RadioGroup, Radio, JsonViewer, Empty } from '@douyinfe/semi-ui';

const { Text } = Typography;

interface PlanNode {
  'Node Type'?: string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Alias'?: string;
  'Startup Cost'?: number;
  'Total Cost'?: number;
  'Plan Rows'?: number;
  'Plan Width'?: number;
  'Actual Startup Time'?: number;
  'Actual Total Time'?: number;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Join Type'?: string;
  'Filter'?: string;
  'Index Cond'?: string;
  'Hash Cond'?: string;
  'Plans'?: PlanNode[];
  [key: string]: unknown;
}

interface ExplainRoot {
  Plan?: PlanNode;
  'Planning Time'?: number;
  'Execution Time'?: number;
  [key: string]: unknown;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function nodeDetail(n: PlanNode): string {
  const rel = n['Relation Name'];
  const idx = n['Index Name'];
  const alias = n['Alias'];
  if (idx) return rel ? `${rel} · ${idx}` : idx;
  if (rel) return alias && alias !== rel ? `${rel} (${alias})` : rel;
  if (n['Join Type']) return `${n['Join Type']} Join`;
  return '';
}

function buildLabel(n: PlanNode, analyzed: boolean): React.ReactNode {
  const totalCost = num(n['Total Cost']);
  const planRows = num(n['Plan Rows']);
  const actualRows = num(n['Actual Rows']);
  const actualTime = num(n['Actual Total Time']);
  const loops = num(n['Actual Loops']) ?? 1;
  // 估算与实际行数偏差较大时高亮（常见性能问题信号）
  let rowMisestimate = false;
  if (analyzed && planRows != null && actualRows != null) {
    const a = actualRows * loops;
    const ratio = a > planRows ? a / Math.max(planRows, 1) : planRows / Math.max(a, 1);
    rowMisestimate = ratio >= 10 && Math.max(a, planRows) >= 100;
  }
  const detail = nodeDetail(n);
  const cond = n['Index Cond'] || n['Hash Cond'] || n['Filter'];
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, padding: '2px 0' }}>
      <Space spacing={6} align="center">
        <Text strong>{n['Node Type'] ?? 'Node'}</Text>
        {detail && <Text type="tertiary" size="small">{detail}</Text>}
        {rowMisestimate && <Tag size="small" color="red">行数估算偏差大</Tag>}
      </Space>
      <Space spacing={10} style={{ fontSize: 11, color: 'var(--semi-color-text-2)' }}>
        {totalCost != null && <span>cost={totalCost.toFixed(2)}</span>}
        {planRows != null && <span>rows={planRows.toLocaleString()}</span>}
        {analyzed && actualTime != null && <span style={{ color: 'var(--semi-color-success)' }}>实际 {actualTime.toFixed(3)}ms</span>}
        {analyzed && actualRows != null && (
          <span style={{ color: rowMisestimate ? 'var(--semi-color-danger)' : 'var(--semi-color-success)' }}>
            实际行={(actualRows * loops).toLocaleString()}{loops > 1 ? ` (×${loops})` : ''}
          </span>
        )}
      </Space>
      {cond && (
        <Text type="tertiary" size="small" style={{ fontFamily: 'monospace', fontSize: 11 }} ellipsis={{ showTooltip: true }}>
          {cond}
        </Text>
      )}
    </div>
  );
}

interface TreeNodeData {
  key: string;
  label: React.ReactNode;
  children?: TreeNodeData[];
}

function toTreeData(n: PlanNode, analyzed: boolean, key = '0'): TreeNodeData {
  const children = (n.Plans ?? []).map((child, i) => toTreeData(child, analyzed, `${key}-${i}`));
  return { key, label: buildLabel(n, analyzed), children: children.length > 0 ? children : undefined };
}

function collectKeys(node: TreeNodeData, acc: string[] = []): string[] {
  acc.push(node.key);
  node.children?.forEach((c) => collectKeys(c, acc));
  return acc;
}

export function ExplainView({
  plan,
  analyzed,
  durationMs,
}: Readonly<{ plan: unknown; analyzed: boolean; durationMs: number }>) {
  const [view, setView] = useState<'tree' | 'json'>('tree');

  const root = (Array.isArray(plan) ? plan[0] : plan) as ExplainRoot | undefined;
  const planNode = root?.Plan;

  const treeData = useMemo(
    () => (planNode ? [toTreeData(planNode, analyzed)] : []),
    [planNode, analyzed],
  );
  const expandedKeys = useMemo(() => treeData.flatMap((t) => collectKeys(t)), [treeData]);

  const planningTime = num(root?.['Planning Time']);
  const executionTime = num(root?.['Execution Time']);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Tag color={analyzed ? 'green' : 'blue'}>{analyzed ? 'EXPLAIN ANALYZE（实际执行）' : 'EXPLAIN（仅估算）'}</Tag>
          {planningTime != null && <Tag color="grey">规划 {planningTime.toFixed(3)}ms</Tag>}
          {executionTime != null && <Tag color="violet">执行 {executionTime.toFixed(3)}ms</Tag>}
          <Tag color="grey">往返 {durationMs}ms</Tag>
        </Space>
        <RadioGroup type="button" value={view} onChange={(e) => setView(e.target.value as 'tree' | 'json')}>
          <Radio value="tree">树形</Radio>
          <Radio value="json">原始 JSON</Radio>
        </RadioGroup>
      </div>

      {view === 'tree' ? (
        treeData.length === 0 ? (
          <Empty title="无法解析查询计划" />
        ) : (
          <div style={{ border: '1px solid var(--semi-color-border)', borderRadius: 6, padding: 8, overflow: 'auto', maxHeight: 460 }}>
            <Tree
              treeData={treeData}
              expandedKeys={expandedKeys}
              motion={false}
              style={{ width: '100%' }}
            />
          </div>
        )
      ) : (
        <JsonViewer value={JSON.stringify(plan, null, 2)} height={440} width="100%" />
      )}
    </div>
  );
}

ExplainView.displayName = 'ExplainView';
