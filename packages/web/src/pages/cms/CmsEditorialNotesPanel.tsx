import { useEffect, useState } from 'react';
import { Banner, Button, Divider, Empty, Input, Select, Space, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { cmsDocumentAnchorStatus, cmsDocumentBlocks, type CmsContent, type CmsDocumentAnchor, type CmsEditorialNote } from '@zenith/shared/cms';
import UserSelect from '@/components/UserSelect';
import { usePermission } from '@/hooks/usePermission';
import { useAddCmsEditorialNote, useCmsEditorialNotes, useReplyCmsEditorialNote, useResolveCmsEditorialNote } from '@/hooks/queries/cms-editorial';
import { cmsEditorFieldLabel } from './cms-editor-fields';

function NoteThread({ note, content, canNote, onLocate }: Readonly<{ note: CmsEditorialNote; content: CmsContent; canNote: boolean; onLocate?: (fieldPath: string, nodeId?: string) => void }>) {
  const resolve = useResolveCmsEditorialNote();
  const reply = useReplyCmsEditorialNote();
  const [replying, setReplying] = useState(false);
  const [message, setMessage] = useState('');
  const [mentions, setMentions] = useState<number[]>([]);
  return <section style={{ width: '100%' }}>
    <Space wrap><Tag color={note.resolved ? 'green' : 'orange'}>{note.resolved ? '已解决' : '待处理'}</Tag><Typography.Text strong>{note.createdByName ?? '审稿人'}</Typography.Text>
      <Typography.Text type="tertiary">{note.createdAt} · {cmsEditorFieldLabel(note.fieldPath, content.modelFields, content.extend)}{note.revisionId ? ` · 修订 #${note.revisionId}` : ' · 工作稿'}</Typography.Text></Space>
    {note.anchor && <>
      <blockquote style={{ margin: '12px 0', padding: '8px 12px', borderLeft: '3px solid var(--semi-color-primary)', whiteSpace: 'pre-wrap' }}>{note.anchor.quote}</blockquote>
      {note.anchorStatus !== 'current' && <Banner type="warning" description={note.anchorStatus === 'missing' ? '原段落已删除，保留引用文字供审稿追溯。' : '该段落文字已更新，引用范围需要复核。'} />}
    </>}
    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{note.message}</Typography.Paragraph>
    {note.replies.map((item) => <div key={item.id} style={{ margin: '8px 0 8px 16px', padding: 12, background: 'var(--surface-card)', borderRadius: 6 }}>
      <Space><Typography.Text strong>{item.createdByName ?? '审稿人'}</Typography.Text><Typography.Text type="tertiary">{item.createdAt}</Typography.Text></Space>
      <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{item.message}</Typography.Paragraph>
    </div>)}
    {note.resolved && <Typography.Paragraph type="tertiary">{note.resolvedByName ?? '审稿人'}于 {note.resolvedAt ?? note.updatedAt} 解决此会话</Typography.Paragraph>}
    <Space wrap>
      {onLocate && note.fieldPath && note.anchorStatus !== 'missing' && <Button size="small" onClick={() => onLocate(note.fieldPath!, note.anchor?.nodeId)}>定位{note.anchor ? '段落' : '字段'}</Button>}
      {canNote && <Button size="small" loading={resolve.isPending} onClick={() => resolve.mutate({ params: { id: content.id, noteId: note.id }, body: { resolved: !note.resolved } })}>{note.resolved ? '重新打开' : '解决会话'}</Button>}
      {canNote && !note.resolved && <Button size="small" onClick={() => setReplying((value) => !value)}>{replying ? '收起回复' : '回复'}</Button>}
    </Space>
    {canNote && !note.resolved && replying && <Space vertical align="start" style={{ width: '100%', marginTop: 12 }}>
      <TextArea value={message} onChange={setMessage} placeholder="回复此批注会话" maxCount={5000} style={{ width: '100%' }} />
      <UserSelect multiple value={mentions} onChange={(value) => setMentions(Array.isArray(value) ? value : [])} placeholder="提醒相关人员（可选）" />
      <Button disabled={!message.trim()} loading={reply.isPending} onClick={() => reply.mutate({ params: { id: content.id, noteId: note.id }, body: { message: message.trim(), mentionedUserIds: mentions } }, { onSuccess: () => { setMessage(''); setMentions([]); setReplying(false); Toast.success('回复已添加'); } })}>发送回复</Button>
    </Space>}
    <Divider margin={16} />
  </section>;
}

export default function CmsEditorialNotesPanel({ content, disabled, initialAnchor, onLocate, onAnchorUsed }: Readonly<{ content: CmsContent; disabled: boolean; initialAnchor?: CmsDocumentAnchor | null; onLocate?: (fieldPath: string, nodeId?: string) => void; onAnchorUsed?: () => void }>) {
  const { hasPermission } = usePermission();
  const notes = useCmsEditorialNotes(content.id);
  const add = useAddCmsEditorialNote();
  const [message, setMessage] = useState('');
  const [fieldPath, setFieldPath] = useState<string>();
  const [anchor, setAnchor] = useState<CmsDocumentAnchor>();
  const [mentions, setMentions] = useState<number[]>([]);
  const blocks = cmsDocumentBlocks(content.bodyDocument);
  const anchorValid = !anchor || (!!anchor.quote.trim() && cmsDocumentAnchorStatus(content.bodyDocument, anchor) === 'current');
  const canNote = (hasPermission('cms:content:update') || hasPermission('cms:content:audit')) && !disabled;
  useEffect(() => { if (initialAnchor) { setAnchor(initialAnchor); setFieldPath('body'); } }, [initialAnchor]);
  return <Space vertical align="start" spacing={16} style={{ width: '100%' }}>
    {notes.isError && <Banner type="danger" description="批注加载失败" />}
    {!notes.isFetching && !notes.data?.length && <Empty title="暂无审稿批注" description="可针对整篇、字段或正文段落提出意见并通过回复跟进。" />}
    {(notes.data ?? []).map((note) => <NoteThread key={note.id} note={note} content={content} canNote={canNote} onLocate={onLocate} />)}
    {canNote && <Space vertical align="start" style={{ width: '100%' }}>
      <Typography.Title heading={6}>添加批注</Typography.Title>
      <Select showClear value={fieldPath} onChange={(value) => { setFieldPath(value == null ? undefined : String(value)); setAnchor(undefined); }} placeholder="整篇批注或选择字段" style={{ width: '100%' }} optionList={[{ value: 'title', label: '标题' }, { value: 'body', label: '正文' }, { value: 'attachments', label: '附件' }, ...(content.modelFields ?? []).map((field) => ({ value: `extend.${field.name}`, label: field.label }))]} />
      {fieldPath === 'body' && <>
        <Select showClear value={anchor?.nodeId} style={{ width: '100%' }} placeholder="选择已保存段落（可选）" optionList={blocks.map((block, index) => ({ value: block.id, label: `${index + 1}. ${block.text.slice(0, 100)}` }))}
          onChange={(value) => { const block = blocks.find((item) => item.id === value); setAnchor(block ? { nodeId: block.id, quote: block.text.slice(0, 2000), startOffset: 0, endOffset: Math.min(block.text.length, 2000) } : undefined); }} />
        {anchor && <>
          <Input value={anchor.quote} aria-label="批注引用文字" placeholder="可改为段落中的一段原文" maxLength={2000} onChange={(quote) => {
            const text = blocks.find((block) => block.id === anchor.nodeId)?.text ?? '';
            const startOffset = text.indexOf(quote);
            setAnchor({ ...anchor, quote, startOffset: Math.max(0, startOffset), endOffset: Math.max(0, startOffset) + quote.length });
          }} />
          <Typography.Text type="tertiary">批注记录此段落和原文范围；文字变化后会提示复核。</Typography.Text>
          {!anchorValid && <Banner type="warning" description="引用内容必须是所选段落中的原文，请重新选择或修正引用。" />}
        </>}
      </>}
      <TextArea value={message} onChange={setMessage} placeholder="输入审稿意见" maxCount={5000} style={{ width: '100%' }} />
      <UserSelect multiple value={mentions} onChange={(value) => setMentions(Array.isArray(value) ? value : [])} placeholder="提醒相关人员（可选）" />
      <Button type="primary" disabled={!message.trim() || !anchorValid} loading={add.isPending} onClick={() => add.mutate({ params: { id: content.id }, body: { message: message.trim(), fieldPath, mentionedUserIds: mentions, anchor, expectedVersion: anchor ? content.version : undefined, revisionId: anchor ? undefined : content.submittedRevisionId ?? undefined } }, { onSuccess: () => { setMessage(''); setMentions([]); setAnchor(undefined); onAnchorUsed?.(); Toast.success('批注已添加'); } })}>添加批注</Button>
    </Space>}
  </Space>;
}
