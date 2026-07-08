/**
 * 结束节点
 */
const END_LABEL: Record<string, { text: string; color: string }> = {
  approved: { text: '已通过', color: 'var(--semi-color-success)' },
  rejected: { text: '已驳回', color: 'var(--semi-color-danger)' },
  withdrawn: { text: '已撤回', color: 'var(--semi-color-warning)' },
  cancelled: { text: '已取消', color: 'var(--semi-color-text-2)' },
};

export default function EndNode({ status }: Readonly<{ status?: string | null }>) {
  const meta = status ? END_LABEL[status] : null;
  return (
    <div className="fd-end-node">
      <div className="fd-end-node__circle" style={meta ? { borderColor: meta.color, color: meta.color } : undefined}>
        {meta ? meta.text : '结束'}
      </div>
    </div>
  );
}
