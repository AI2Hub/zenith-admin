import { useEffect, useState } from 'react';
import { Button, Modal, Spin, Toast } from '@douyinfe/semi-ui';
import { LayoutTemplate } from 'lucide-react';
import type { WorkflowTemplate, WorkflowDefinition } from '@zenith/shared';
import { request } from '@/utils/request';

interface Props {
  visible: boolean;
  onCancel: () => void;
  /** Called with the new definition's id on successful clone */
  onCreated: (definitionId: number) => void;
}

export function TemplateGalleryModal({ visible, onCancel, onCreated }: Props) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [cloneLoadingId, setCloneLoadingId] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    void request
      .get<WorkflowTemplate[]>('/api/workflows/templates')
      .then((res) => {
        if (res.code === 0) setTemplates(res.data ?? []);
      })
      .finally(() => setLoading(false));
  }, [visible]);

  const handleUse = async (tpl: WorkflowTemplate) => {
    setCloneLoadingId(tpl.id);
    try {
      const res = await request.post<WorkflowDefinition>(
        `/api/workflows/templates/${tpl.id}/clone`,
        {},
      );
      if (res.code === 0) {
        Toast.success('已从模板创建流程');
        onCreated(res.data.id);
      }
    } finally {
      setCloneLoadingId(null);
    }
  };

  return (
    <Modal
      title="从模板新建流程"
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={760}
      closeOnEsc
    >
      <Spin spinning={loading}>
        {!loading && templates.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--semi-color-text-2)', padding: '40px 0' }}>
            暂无可用模板
          </div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            maxHeight: 480,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              style={{
                border: '1px solid var(--semi-color-border)',
                borderRadius: 8,
                padding: '16px 14px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                background: 'var(--semi-color-bg-2)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                {tpl.color ? (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: tpl.color,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <LayoutTemplate size={14} style={{ color: 'var(--semi-color-primary)', flexShrink: 0 }} />
                )}
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tpl.name}
                </span>
              </div>
              {tpl.categoryName && (
                <span style={{ fontSize: 11, color: 'var(--semi-color-text-2)' }}>
                  {tpl.categoryName}
                </span>
              )}
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: 'var(--semi-color-text-2)',
                  flex: 1,
                  overflow: 'hidden',
                  maxHeight: 36,
                  lineHeight: '18px',
                }}
              >
                {tpl.description || '暂无描述'}
              </p>
              <Button
                size="small"
                type="primary"
                theme="solid"
                loading={cloneLoadingId === tpl.id}
                style={{ marginTop: 8, width: '100%' }}
                onClick={() => void handleUse(tpl)}
              >
                使用此模板
              </Button>
            </div>
          ))}
        </div>
      </Spin>
    </Modal>
  );
}
