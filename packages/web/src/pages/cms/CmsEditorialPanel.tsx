import { useEffect, useState } from 'react';
import { Banner, Button, Checkbox, Empty, Input, Select, Space, TabPane, Tabs, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import type { CmsContent, CmsModel, CmsDocumentAnchor } from '@zenith/shared/cms';
import { usePermission } from '@/hooks/usePermission';
import CmsEditorialNotesPanel from './CmsEditorialNotesPanel';
import { confirmDanger } from '@/utils/confirm';
import { cmsEditorFieldLabel, getCmsEditorFieldLocation } from './cms-editor-fields';
import {
  useCmsEditorialNotes, useCmsQuality,
  useCmsTranslations, useCreateCmsTranslation, useCmsDistributionConflict, useResolveCmsDistribution,
  usePreviewCmsTypeConversion, useConvertCmsType,
} from '@/hooks/queries/cms-editorial';

export default function CmsEditorialPanel({ content, models, onChanged, onOpen, onLocateField, initialAnchor, onAnchorUsed, disabled = false }: Readonly<{
  content?: CmsContent; models: CmsModel[]; onChanged: () => void; onOpen: (id: number) => void; onLocateField?: (fieldPath: string, nodeId?: string) => void; initialAnchor?: CmsDocumentAnchor | null; onAnchorUsed?: () => void; disabled?: boolean;
}>) {
  const { hasPermission } = usePermission();
  const notes = useCmsEditorialNotes(content?.id);
  const quality = useCmsQuality(content?.id);
  const translations = useCmsTranslations(content?.id);
  const conflict = useCmsDistributionConflict(content?.id, !!content?.distributionSourceId || !!content?.mappingSourceId);
  const createTranslation = useCreateCmsTranslation();
  const resolveDistribution = useResolveCmsDistribution();
  const previewConversion = usePreviewCmsTypeConversion();
  const convertType = useConvertCmsType();
  const [tab, setTab] = useState('quality');
  useEffect(() => { if (initialAnchor) setTab('notes'); }, [initialAnchor]);
  const [locale, setLocale] = useState('en-US');
  const [translationTitle, setTranslationTitle] = useState('');
  const [choices, setChoices] = useState<Record<string, 'source' | 'target'>>({});
  const [targetModel, setTargetModel] = useState<number>();
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [acknowledgeLoss, setAcknowledgeLoss] = useState(false);
  const canEdit = hasPermission('cms:content:update') && !disabled && !content?.lockedAt;
  const targetFields = models.find((model) => model.id === targetModel)?.fields ?? [];
  if (!content) return <Empty title="保存工作稿后开始协作" description="批注、检查和语言变体都关联具体稿件。" />;
  return <div style={{ padding: 16 }}>
    {disabled ? <Banner type="warning" description="请先保存当前修改，再执行协作中的内容变更。" /> : null}
    <Tabs collapsible="auto" type="line" activeKey={tab} onChange={setTab}>
      <TabPane tab={`质量检查（${quality.data?.issues.length ?? 0}）`} itemKey="quality">
        <Space vertical align="start" style={{ width: '100%' }}>
          <Space><Typography.Text>检查已保存工作稿 v{quality.data?.version ?? content.version}</Typography.Text><Button loading={quality.isFetching} onClick={() => void quality.refetch()}>重新检查</Button></Space>
          {quality.isError ? <Banner type="danger" description="质量检查失败，请重试。" /> : null}
          {quality.data?.issues.length === 0 ? <Banner type="success" description="当前稿件通过质量检查。发布前仍会重新校验修订与依赖。" /> : null}
          {quality.data?.issues.map((issue, index) => {
            const field = getCmsEditorFieldLocation(issue.fieldPath, content.modelFields, content.contentType, content.extend);
            return <Banner key={`${issue.rule}-${issue.fieldPath}-${index}`} type={issue.severity === 'error' ? 'danger' : 'warning'} closeIcon={null} description={<Space wrap>
              <Typography.Text strong>{field?.label ?? cmsEditorFieldLabel(issue.fieldPath, content.modelFields, content.extend)}</Typography.Text>
              <span>{issue.message}</span>
              {field && onLocateField ? <Button size="small" theme="borderless" onClick={() => onLocateField(issue.fieldPath)}>定位字段</Button> : null}
            </Space>} />;
          })}
        </Space>
      </TabPane>
      <TabPane tab={`审稿批注（${notes.data?.filter((note) => !note.resolved).length ?? 0}）`} itemKey="notes">
        <CmsEditorialNotesPanel key={content.id} content={content} disabled={disabled} initialAnchor={initialAnchor} onLocate={onLocateField} onAnchorUsed={onAnchorUsed} />
      </TabPane>
      <TabPane tab="语言变体" itemKey="languages">
        <Space vertical align="start" spacing={16} style={{ width: '100%' }}>
          <Typography.Paragraph>每种语言独立编辑、审核与发布，来源修订更新后会提示译文需要复核。</Typography.Paragraph>
          {(translations.data ?? []).map((variant) => <Space key={variant.id} wrap><Tag>{variant.locale}</Tag><Button theme="borderless" onClick={() => onOpen(variant.id)}>{variant.title}</Button>{variant.sourceChanged ? <Tag color="orange">源稿已更新</Tag> : null}</Space>)}
          {hasPermission('cms:content:create') ? <Space wrap><Input aria-label="目标语言" placeholder="语言，如 en-US" value={locale} onChange={setLocale} style={{ width: 150 }} /><Input aria-label="译文标题" placeholder="译文标题" value={translationTitle} onChange={setTranslationTitle} style={{ width: 260 }} /><Button disabled={disabled || !locale.trim() || !translationTitle.trim()} loading={createTranslation.isPending} onClick={async () => { const result = await createTranslation.mutateAsync({ params: { id: content.id }, body: { locale, title: translationTitle, channelId: content.channelId } }); Toast.success('语言工作稿已创建'); onOpen(result.id); }}>创建人工翻译稿</Button></Space> : null}
        </Space>
      </TabPane>
      {content.distributionSourceId || content.mappingSourceId ? <TabPane tab="来源同步" itemKey="distribution">
        <Space vertical align="start" style={{ width: '100%' }}>
          <Typography.Paragraph>逐字段比较上次同步基线、当前目标稿与来源新稿。合并只写入工作稿。</Typography.Paragraph>
          {conflict.isError ? <Banner type="danger" description="同步差异加载失败" /> : null}
          {!conflict.data?.conflicts.length ? <Banner type="success" description="当前没有待处理的分发冲突" /> : null}
          {(conflict.data?.conflicts ?? []).map((item) => <div key={item.field} style={{ width: '100%' }}><Typography.Title heading={6}>{item.field}</Typography.Title><div className="auto-grid" style={{ '--auto-grid-cols': 3 } as React.CSSProperties}>{[['上次同步', item.base], ['目标工作稿', item.target], ['来源新稿', item.incoming]].map(([label, value]) => <div key={String(label)}><Typography.Text type="secondary">{String(label)}</Typography.Text><pre style={{ maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(value, null, 2)}</pre></div>)}</div><Select placeholder="选择保留来源或目标" value={choices[item.field]} onChange={(value) => setChoices((previous) => ({ ...previous, [item.field]: value as 'source' | 'target' }))} optionList={[{ value: 'source', label: '采用来源新稿' }, { value: 'target', label: '保留目标修改' }]} /></div>)}
          {conflict.data?.conflicts.length ? <Button type="primary" disabled={!canEdit || conflict.data.conflicts.some((item) => !choices[item.field])} loading={resolveDistribution.isPending} onClick={async () => { await resolveDistribution.mutateAsync({ params: { id: content.id }, body: { expectedVersion: conflict.data!.version, choices } }); setChoices({}); onChanged(); Toast.success('已生成合并工作稿'); }}>确认合并到工作稿</Button> : null}
        </Space>
      </TabPane> : null}
      <TabPane tab="切换内容模型" itemKey="conversion">
        <Space vertical align="start" spacing={16} style={{ width: '100%' }}>
          <Banner type="info" description="切换内容模型会重新映射扩展字段；图文、图集、音视频、外链属于创建时确定的内容形态。请先预览字段映射、校验问题与移除影响，再保存模型切换工作稿。" />
          <Select placeholder="目标模型" value={targetModel} style={{ width: 280 }} onChange={(value) => { setTargetModel(Number(value)); setFieldMapping({}); setAcknowledgeLoss(false); previewConversion.reset(); }} optionList={models.map((model) => ({ value: model.id, label: model.name }))} />
          {targetFields.map((field) => <Space key={field.name} wrap><Typography.Text>{field.label}</Typography.Text><Select showClear placeholder="来源字段（空则按同名映射）" style={{ width: 260 }} value={fieldMapping[field.name]} onChange={(value) => { setFieldMapping((previous) => { const next = { ...previous }; if (value) next[field.name] = String(value); else delete next[field.name]; return next; }); previewConversion.reset(); }} optionList={(content.modelFields ?? []).map((source) => ({ value: source.name, label: source.label }))} /></Space>)}
          <Button disabled={!canEdit || !targetModel} loading={previewConversion.isPending} onClick={() => targetModel && void previewConversion.mutateAsync({ params: { id: content.id }, body: { modelId: targetModel, fieldMapping } })}>预览模型切换</Button>
          {previewConversion.data ? <>
            {previewConversion.data.issues.map((issue, index) => <Banner key={`${issue.fieldPath}-${index}`} type={issue.severity === 'error' ? 'danger' : 'warning'} description={`${cmsEditorFieldLabel(issue.fieldPath, targetFields, previewConversion.data?.values)}：${issue.message}`} />)}
            <Typography.Text>将移除字段：{previewConversion.data.droppedFields.map((name) => cmsEditorFieldLabel(`extend.${name}`, content.modelFields)).join('、') || '无'}</Typography.Text>
            <Checkbox checked={acknowledgeLoss} onChange={(event) => setAcknowledgeLoss(!!event.target.checked)}>已确认字段映射及移除影响</Checkbox>
            <Button type="warning" disabled={!canEdit || !acknowledgeLoss || previewConversion.data.issues.some((issue) => issue.severity === 'error')} loading={convertType.isPending} onClick={() => confirmDanger({ title: '切换为目标内容模型？', content: '将按确认的字段映射生成工作稿，完成审核与发布后生效。', onOk: async () => { await convertType.mutateAsync({ params: { id: content.id }, body: { modelId: targetModel!, fieldMapping, expectedVersion: previewConversion.data!.version, acknowledgeLoss } }); previewConversion.reset(); onChanged(); Toast.success('内容模型切换工作稿已保存'); } })}>应用模型切换</Button>
          </> : null}
        </Space>
      </TabPane>
    </Tabs>
  </div>;
}
