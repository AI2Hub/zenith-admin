import { useCallback, useEffect, useState } from 'react';
import { Form, Spin, Typography } from '@douyinfe/semi-ui';
import type { WorkflowApproverPreviewNode } from '@zenith/shared';
import { request } from '@/utils/request';

export type SelectedInitiatorApprovers = Record<string, number[]>;

export interface InitiatorApproverSelectNode {
  nodeKey: string;
  nodeName: string;
  selectableApprovers: Array<{ id: number; name: string }>;
  selectionRequired: boolean;
}

interface WorkflowInitiatorApproverFieldsProps {
  definitionId: number | null | undefined;
  value: SelectedInitiatorApprovers;
  onChange: (value: SelectedInitiatorApprovers) => void;
  onNodesChange?: (nodes: InitiatorApproverSelectNode[]) => void;
}

function pickSelected(value: SelectedInitiatorApprovers, nodeKey: string): number[] {
  const ids = value[nodeKey];
  return Array.isArray(ids) ? ids : [];
}

function formFieldSegment(value: string | number): string {
  return String(value).replace(/[^A-Za-z0-9_]/g, '_');
}

export function initiatorApproverFieldName(nodeKey: string, definitionId?: number | null): string {
  return `initiatorApprover__${formFieldSegment(definitionId ?? 'current')}__${formFieldSegment(nodeKey)}`;
}

function normalizeSelectedIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

export function selectedInitiatorApproversFromFormValues(
  values: Record<string, unknown>,
  nodes: InitiatorApproverSelectNode[],
  definitionId?: number | null,
): SelectedInitiatorApprovers {
  const out: SelectedInitiatorApprovers = {};
  for (const node of nodes) {
    out[node.nodeKey] = normalizeSelectedIds(values[initiatorApproverFieldName(node.nodeKey, definitionId)]);
  }
  return out;
}

export function compactSelectedInitiatorApprovers(
  value: SelectedInitiatorApprovers,
  nodes: InitiatorApproverSelectNode[],
): SelectedInitiatorApprovers | undefined {
  const allowedKeys = new Set(nodes.map((node) => node.nodeKey));
  const out: SelectedInitiatorApprovers = {};
  for (const [key, ids] of Object.entries(value)) {
    if (!allowedKeys.has(key) || !Array.isArray(ids) || ids.length === 0) continue;
    out[key] = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function firstMissingInitiatorApproverNode(
  value: SelectedInitiatorApprovers,
  nodes: InitiatorApproverSelectNode[],
): InitiatorApproverSelectNode | null {
  return nodes.find((node) => node.selectionRequired && pickSelected(value, node.nodeKey).length === 0) ?? null;
}

export default function WorkflowInitiatorApproverFields({
  definitionId,
  value,
  onChange,
  onNodesChange,
}: Readonly<WorkflowInitiatorApproverFieldsProps>) {
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<InitiatorApproverSelectNode[]>([]);

  const load = useCallback(async () => {
    if (!definitionId) {
      setNodes([]);
      onNodesChange?.([]);
      return;
    }
    setNodes([]);
    onNodesChange?.([]);
    setLoading(true);
    try {
      const res = await request.post<WorkflowApproverPreviewNode[]>(
        `/api/workflows/definitions/${definitionId}/preview`,
        { formData: null },
        { silent: true },
      );
      const next = (res.code === 0 ? res.data ?? [] : [])
        .filter((node) => node.selectionRequired)
        .map((node) => ({
          nodeKey: node.nodeKey,
          nodeName: node.nodeName,
          selectableApprovers: node.selectableApprovers ?? [],
          selectionRequired: node.selectionRequired ?? false,
        }));
      setNodes(next);
      onNodesChange?.(next);
    } finally {
      setLoading(false);
    }
  }, [definitionId, onNodesChange]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && nodes.length === 0) {
    return (
      <div style={{ padding: '8px 0' }}>
        <Spin size="small" />
      </div>
    );
  }
  if (nodes.length === 0) return null;

  return (
    <div style={{ marginTop: 8, marginBottom: 8 }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>自选审批人</Typography.Text>
      <div style={{ display: 'grid', gap: 10 }}>
        {nodes.map((node) => (
          <div key={node.nodeKey}>
            <Typography.Text size="small" style={{ display: 'block', marginBottom: 4 }}>
              {node.nodeName}
              {node.selectionRequired && <span style={{ color: 'var(--semi-color-danger)' }}> *</span>}
            </Typography.Text>
            <Form.Select
              field={initiatorApproverFieldName(node.nodeKey, definitionId)}
              noLabel
              multiple
              filter
              showClear
              style={{ width: '100%' }}
              placeholder="请选择审批人"
              emptyContent="暂无可选审批人"
              optionList={node.selectableApprovers.map((user) => ({ value: user.id, label: user.name }))}
              initValue={pickSelected(value, node.nodeKey)}
              onChange={(v) => {
                const ids = normalizeSelectedIds(v);
                onChange({ ...value, [node.nodeKey]: ids });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
