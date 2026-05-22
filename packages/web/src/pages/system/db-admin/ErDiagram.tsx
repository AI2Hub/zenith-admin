import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { AutoComplete, Button, Switch, Space, Tooltip, Toast } from '@douyinfe/semi-ui';
import { Download, Search } from 'lucide-react';
import { toPng } from 'html-to-image';

export interface ErColumn {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
}

export interface ErTable {
  schema: string;
  name: string;
  columns: ErColumn[];
}

export interface ErFk {
  schema: string;
  table: string;
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
}

export interface ErSchema {
  tables: ErTable[];
  foreignKeys: ErFk[];
}

interface TableNodeData extends Record<string, unknown> {
  schema: string;
  name: string;
  columns: ErColumn[];
  fkColumns: Set<string>;
  dimmed: boolean;
}

const NODE_WIDTH = 240;
const ROW_HEIGHT = 22;
const HEADER_HEIGHT = 32;

function estimateHeight(colCount: number): number {
  return HEADER_HEIGHT + colCount * ROW_HEIGHT + 8;
}

const TableNode = memo(({ data, selected }: NodeProps) => {
  const d = data as TableNodeData;
  return (
    <div
      style={{
        width: NODE_WIDTH,
        background: 'var(--semi-color-bg-0)',
        border: `1px solid ${selected ? 'var(--semi-color-primary)' : 'var(--semi-color-border)'}`,
        borderRadius: 6,
        boxShadow: selected ? '0 0 0 2px var(--semi-color-primary-light-default)' : 'none',
        opacity: d.dimmed ? 0.25 : 1,
        fontSize: 12,
        overflow: 'hidden',
        transition: 'opacity 120ms',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--semi-color-primary)', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ background: 'var(--semi-color-primary)', width: 6, height: 6 }} />
      <div
        style={{
          height: HEADER_HEIGHT,
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          background: 'var(--semi-color-fill-1)',
          color: 'var(--semi-color-text-0)',
          fontWeight: 600,
          borderBottom: '1px solid var(--semi-color-border)',
        }}
      >
        <span style={{ color: 'var(--semi-color-text-2)', marginRight: 4 }}>{d.schema}.</span>
        <span>{d.name}</span>
      </div>
      <div>
        {d.columns.map((col) => {
          const isFk = !col.isPrimaryKey && d.fkColumns.has(col.name);
          let icon: React.ReactNode = <span style={{ width: 12, display: 'inline-block' }} />;
          if (col.isPrimaryKey) icon = <span title="主键" style={{ color: '#f7ba1e' }}>🔑</span>;
          else if (isFk) icon = <span title="外键" style={{ color: 'var(--semi-color-primary)' }}>🔗</span>;
          return (
            <div
              key={col.name}
              style={{
                height: ROW_HEIGHT,
                padding: '0 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderBottom: '1px dashed var(--semi-color-border)',
                color: 'var(--semi-color-text-1)',
              }}
            >
              {icon}
              <span style={{ fontWeight: col.isPrimaryKey ? 600 : 400 }}>{col.name}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--semi-color-text-2)', fontSize: 10 }}>{col.dataType}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
TableNode.displayName = 'TableNode';

const nodeTypes = { table: TableNode };

interface ErDiagramProps {
  schema: ErSchema;
  onNodeDoubleClick?: (full: string) => void;
}

function layoutWithDagre(nodes: RFNode[], edges: RFEdge[]): RFNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 80, marginx: 20, marginy: 20 });
  nodes.forEach((n) => {
    const cols = (n.data as TableNodeData).columns;
    const h = cols ? estimateHeight(cols.length) : 60;
    g.setNode(n.id, { width: NODE_WIDTH, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
    };
  });
}

function ErDiagramInner({ schema, onNodeDoubleClick }: Readonly<ErDiagramProps>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hideIsolated, setHideIsolated] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();

  // 参与外键的表集合
  const connectedTables = useMemo(() => {
    const s = new Set<string>();
    schema.foreignKeys.forEach((fk) => {
      s.add(`${fk.schema}.${fk.table}`);
      s.add(`${fk.referencedSchema}.${fk.referencedTable}`);
    });
    return s;
  }, [schema]);

  const visibleTables = useMemo(() => {
    if (!hideIsolated) return schema.tables;
    return schema.tables.filter((t) => connectedTables.has(`${t.schema}.${t.name}`));
  }, [schema.tables, hideIsolated, connectedTables]);

  const baseNodes = useMemo<RFNode[]>(() => {
    const fkCols = new Map<string, Set<string>>();
    schema.foreignKeys.forEach((fk) => {
      const k = `${fk.schema}.${fk.table}`;
      let set = fkCols.get(k);
      if (!set) {
        set = new Set();
        fkCols.set(k, set);
      }
      const target = set;
      fk.columns.forEach((c) => target.add(c));
    });
    return visibleTables.map((t) => {
      const id = `${t.schema}.${t.name}`;
      return {
        id,
        type: 'table',
        position: { x: 0, y: 0 },
        data: {
          schema: t.schema,
          name: t.name,
          columns: t.columns,
          fkColumns: fkCols.get(id) ?? new Set<string>(),
          dimmed: false,
        } satisfies TableNodeData,
      };
    });
  }, [schema, visibleTables]);

  const baseEdges = useMemo<RFEdge[]>(() => {
    const visibleIds = new Set(visibleTables.map((t) => `${t.schema}.${t.name}`));
    return schema.foreignKeys
      .filter((fk) => visibleIds.has(`${fk.schema}.${fk.table}`) && visibleIds.has(`${fk.referencedSchema}.${fk.referencedTable}`))
      .map((fk, i) => ({
      id: `er-${i}-${fk.schema}.${fk.table}-${fk.columns.join(',')}`,
      source: `${fk.schema}.${fk.table}`,
      target: `${fk.referencedSchema}.${fk.referencedTable}`,
      label: fk.columns.join(','),
      labelStyle: { fontSize: 10, fill: 'var(--semi-color-text-2)' },
      labelBgStyle: { fill: 'var(--semi-color-bg-0)' },
      style: { stroke: 'var(--semi-color-primary)', strokeWidth: 1.2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--semi-color-primary)' },
    }));
  }, [schema, visibleTables]);

  // 搜索候选：表名 / schema.表名 / schema.表名.列名
  const searchOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    schema.tables.forEach((t) => {
      const full = `${t.schema}.${t.name}`;
      opts.push({ value: full, label: full });
      t.columns.forEach((c) => {
        opts.push({ value: `${full}.${c.name}`, label: `${full}.${c.name}` });
      });
    });
    return opts;
  }, [schema]);

  const laidOutNodes = useMemo(() => layoutWithDagre(baseNodes, baseEdges), [baseNodes, baseEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(laidOutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(baseEdges);

  useEffect(() => {
    setNodes(laidOutNodes);
    setEdges(baseEdges);
    setSelectedId(null);
  }, [laidOutNodes, baseEdges, setNodes, setEdges]);

  useEffect(() => {
    if (!selectedId) {
      setNodes((ns) => ns.map((n) => ({ ...n, data: { ...(n.data as TableNodeData), dimmed: false } })));
      setEdges((es) => es.map((e) => ({ ...e, style: { ...e.style, opacity: 1, strokeWidth: 1.2 } })));
      return;
    }
    const related = new Set<string>([selectedId]);
    const relatedEdges = new Set<string>();
    baseEdges.forEach((e) => {
      if (e.source === selectedId || e.target === selectedId) {
        related.add(e.source);
        related.add(e.target);
        relatedEdges.add(e.id);
      }
    });
    setNodes((ns) => ns.map((n) => ({
      ...n,
      data: { ...(n.data as TableNodeData), dimmed: !related.has(n.id) },
    })));
    setEdges((es) => es.map((e) => ({
      ...e,
      style: {
        ...e.style,
        opacity: relatedEdges.has(e.id) ? 1 : 0.1,
        strokeWidth: relatedEdges.has(e.id) ? 2 : 1,
      },
    })));
  }, [selectedId, baseEdges, setNodes, setEdges]);

  const handleNodeClick = useCallback((_: unknown, node: RFNode) => {
    setSelectedId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const handleNodeDoubleClick = useCallback((_: unknown, node: RFNode) => {
    onNodeDoubleClick?.(node.id);
  }, [onNodeDoubleClick]);

  const handlePaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleSearchSelect = useCallback((value: string | number | Record<string, unknown>) => {
    const v = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    if (!v) return;
    const parts = v.split('.');
    const tableId = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : v;
    const exists = nodes.find((n) => n.id === tableId);
    if (!exists) {
      Toast.warning('表不在当前视图中（可能被“隐藏孤立表”过滤）');
      return;
    }
    setSelectedId(tableId);
    setTimeout(() => {
      rf.fitView({ nodes: [{ id: tableId }], duration: 400, maxZoom: 1.2, padding: 0.35 });
    }, 50);
  }, [nodes, rf]);

  const handleExportPng = useCallback(async () => {
    const el = wrapperRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
    if (!el) {
      Toast.error('未找到画布');
      return;
    }
    // 导出前先 fitView，避免仅导出可见区域
    rf.fitView({ padding: 0.1, duration: 0 });
    await new Promise((r) => setTimeout(r, 100));
    const bounds = el.getBoundingClientRect();
    try {
      const dataUrl = await toPng(el, {
        backgroundColor: '#ffffff',
        width: bounds.width,
        height: bounds.height,
        pixelRatio: 2,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `er-diagram-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      a.click();
      Toast.success('已导出 PNG');
    } catch {
      Toast.error('导出失败');
    }
  }, [rf]);

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        height: 640,
        border: '1px solid var(--semi-color-border)',
        borderRadius: 6,
        background: 'var(--semi-color-bg-0)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          borderBottom: '1px solid var(--semi-color-border)',
          background: 'var(--semi-color-fill-0)',
          flexShrink: 0,
        }}
      >
        <Space>
          <AutoComplete
            data={searchOptions}
            value={searchValue}
            onChange={(v) => setSearchValue(String(v ?? ''))}
            onSelect={handleSearchSelect}
            placeholder="搜索表或列..."
            prefix={<Search size={14} />}
            showClear
            style={{ width: 260 }}
            emptyContent="无匹配"
          />
          <Tooltip content="隐藏没有外键关联的独立表">
            <Space spacing="tight">
              <Switch size="small" checked={hideIsolated} onChange={setHideIsolated} />
              <span style={{ fontSize: 12, color: 'var(--semi-color-text-1)' }}>隐藏孤立表</span>
            </Space>
          </Tooltip>
          <Button icon={<Download size={14} />} size="small" onClick={handleExportPng}>导出 PNG</Button>
        </Space>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

export function ErDiagram(props: Readonly<ErDiagramProps>) {
  return (
    <ReactFlowProvider>
      <ErDiagramInner {...props} />
    </ReactFlowProvider>
  );
}
