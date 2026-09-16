import { useState } from 'react';
import { Banner, Button, Empty, Space, Spin, Toast, Typography } from '@douyinfe/semi-ui';
import SignaturePad from '@/components/SignaturePad';
import DateTimeText from '@/components/DateTimeText';
import { useMySignature, useSaveMySignature, useDeleteMySignature } from '@/hooks/queries/personal-signature';
import { confirmDanger } from '@/utils/confirm';

export default function MySignatureTab() {
  const query = useMySignature();
  const save = useSaveMySignature();
  const remove = useDeleteMySignature();
  const [editing, setEditing] = useState(false);
  const [drawing, setDrawing] = useState('');
  const startDrawing = () => { setDrawing(''); setEditing(true); };
  const saveSignature = async () => {
    if (!drawing) return;
    await save.mutateAsync({ body: { dataUrl: drawing } });
    setEditing(false);
    setDrawing('');
    Toast.success('我的签名已保存');
  };

  return (
    <div className="profile-section">
      <Typography.Title heading={5}>我的签名</Typography.Title>
      <Typography.Paragraph type="tertiary" className="profile-signature-description">
        保存后，可在允许复用的表单和审批中使用。每次签署会保留当次签名，更换或删除个人签名不会改变已保存的签署记录。
      </Typography.Paragraph>
      {query.error && <Banner type="warning" closeIcon={null} description={query.error.message} />}
      {query.isLoading ? <Spin /> : editing ? (
        <div className="profile-signature-editor">
          <SignaturePad value={drawing} onChange={setDrawing} width={600} height={200} disabled={save.isPending} />
          <Space spacing={8}>
            <Button onClick={() => setEditing(false)} disabled={save.isPending}>取消</Button>
            <Button type="primary" disabled={!drawing} loading={save.isPending} onClick={() => void saveSignature()}>保存签名</Button>
          </Space>
        </div>
      ) : (
        <>
          {query.data ? (
            <>
              <div style={{ padding: 16, maxWidth: 600, background: '#fff', border: '1px solid var(--semi-color-border)', borderRadius: 'var(--semi-border-radius-medium)' }}>
                <img src={query.data.dataUrl} alt="我的手写签名" style={{ display: 'block', maxWidth: '100%', maxHeight: 200 }} />
              </div>
              <Typography.Paragraph type="tertiary" size="small" style={{ marginTop: 8 }}>
                更新于 <DateTimeText value={query.data.updatedAt} mode="absolute" />
              </Typography.Paragraph>
            </>
          ) : <Empty description="尚未保存个人签名" style={{ padding: 24 }} />}
          <Space spacing={8} style={{ marginTop: 16 }}>
            <Button type="primary" onClick={startDrawing}>{query.data ? '更换签名' : '设置签名'}</Button>
            {query.data && <Button type="danger" loading={remove.isPending} onClick={() => confirmDanger({
              title: '删除我的签名？', content: '删除后需重新设置个人签名才能复用，已有签署记录不受影响。',
              onOk: async () => { await remove.mutateAsync({}); Toast.success('个人签名已删除'); },
            })}>删除签名</Button>}
            {query.error && <Button onClick={() => void query.refetch()}>重新加载</Button>}
          </Space>
        </>
      )}
    </div>
  );
}
