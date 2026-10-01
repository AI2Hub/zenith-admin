import { useId, useState } from 'react';
import { Banner, Button, Empty, Form, Input, InputNumber, Select, SideSheet, Space, Spin, Tag, Toast, Typography, withField } from '@douyinfe/semi-ui';
import { Library, Plus, Trash2 } from 'lucide-react';
import type { BodyOf } from '@zenith/shared/core';
import {
  CMS_PAGE_BLOCK_TYPES, CMS_PAGE_PRESET_FIELDS, cmsPagePresetContract, resolveCmsPagePresetValues,
  validateCmsPagePresetDefinition, type CmsPageBlock, type CmsPagePreset, type CmsPagePresetParameter, type CmsPagePresetVersion,
} from '@zenith/shared/cms';
import { EditFormModal } from '@/components/EditFormModal';
import { ModalFooter } from '@/components/ModalFooter';
import { RefreshButton } from '@/components/toolbar-controls';
import { useEditModal } from '@/hooks/useEditModal';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { usePermission } from '@/hooks/usePermission';
import {
  useCmsPagePresets, useCmsPagePresetDetail, useCmsPagePresetVersions, useCmsPagePresetVersion, useCmsPagePresetUsages,
  useSaveCmsPagePreset, useCopyCmsPagePreset, useInstantiateCmsPagePreset,
} from '@/hooks/queries/cms-page-presets';
import { useCmsChannelTree } from '@/hooks/queries/cms-channels';
import { abortSubmit } from '@/lib/abort-submit';
import { confirmDanger } from '@/utils/confirm';
import { formatDateTime } from '@/utils/date';
import CmsAssetUrlField from './CmsAssetUrlField';
import { useCmsLinkPicker } from './CmsLinkInput';
import { flattenChannels } from './channel-tree';

type PresetValues = Partial<BodyOf<typeof cmsPagePresetContract.create>> & { expectedVersion?: number; note?: string };
type ParameterValues = Record<string, string | number>;
const blockLabel = (block: CmsPageBlock, index: number) => `${index + 1}. ${CMS_PAGE_BLOCK_TYPES.find(item => item.value === block.type)?.label ?? block.type}`;
const fullWidth = { width: '100%' } as const;

/** 参数只绑定预先声明的区块属性；没有任意对象路径或表达式入口。 */
function PresetParametersEditor({ blocks, value = [], onChange }: Readonly<{
  blocks: CmsPageBlock[]; value?: CmsPagePresetParameter[]; onChange?: (value: CmsPagePresetParameter[]) => void;
}>) {
  const update = (index: number, patch: Partial<CmsPagePresetParameter>) => onChange?.(value.map((item, i) => i === index ? { ...item, ...patch } : item));
  const available = blocks.flatMap(block => CMS_PAGE_PRESET_FIELDS.filter(field => field.blockTypes.includes(block.type))
    .filter(field => !value.some(item => item.blockId === block.id && item.field === field.value)).map(field => ({ block, field })));
  return <Space vertical align="start" spacing={12} style={fullWidth}>
    <Typography.Text type="tertiary">将标题、图片、栏目或链接等字段声明为参数，插入时即可替换；默认值取自当前区块。</Typography.Text>
    {value.map((parameter, index) => {
      const block = blocks.find(item => item.id === parameter.blockId);
      return <div key={index} style={fullWidth}>
        <Space wrap spacing={8} style={fullWidth}>
          <Input aria-label={`参数 ${index + 1} 标识`} placeholder="参数标识，如 title" value={parameter.key} maxLength={50} onChange={key => update(index, { key })} />
          <Input aria-label={`参数 ${index + 1} 名称`} placeholder="显示名称" value={parameter.label} maxLength={100} onChange={label => update(index, { label })} />
          <Select aria-label={`参数 ${index + 1} 区块`} value={parameter.blockId} style={{ minWidth: 150 }} optionList={blocks.map((item, i) => ({ value: item.id, label: blockLabel(item, i), disabled: !CMS_PAGE_PRESET_FIELDS.some(field => field.blockTypes.includes(item.type)) }))}
            onChange={next => {
              const target = blocks.find(item => item.id === next);
              const field = CMS_PAGE_PRESET_FIELDS.find(item => target && item.blockTypes.includes(target.type));
              if (target && field) update(index, { blockId: target.id, field: field.value });
            }} />
          <Select aria-label={`参数 ${index + 1} 字段`} value={parameter.field} style={{ minWidth: 120 }}
            optionList={CMS_PAGE_PRESET_FIELDS.filter(item => block && item.blockTypes.includes(block.type)).map(item => ({ value: item.value, label: item.label }))}
            onChange={next => { const field = CMS_PAGE_PRESET_FIELDS.find(item => item.value === next); if (field) update(index, { field: field.value }); }} />
          <Button aria-label={`移除参数 ${index + 1}`} icon={<Trash2 size={14} />} theme="borderless" type="danger" onClick={() => onChange?.(value.filter((_, i) => i !== index))} />
        </Space>
      </div>;
    })}
    <Button icon={<Plus size={14} />} disabled={!available.length || value.length >= 50} onClick={() => {
      const first = available[0]; if (!first) return;
      let ordinal = value.length + 1;
      while (value.some(item => item.key === `parameter_${ordinal}`)) ordinal++;
      onChange?.([...value, { key: `parameter_${ordinal}`, label: first.field.label, blockId: first.block.id, field: first.field.value }]);
    }}>添加可替换参数</Button>
  </Space>;
}
const FormPresetParameters = withField(PresetParametersEditor);

function PresetLinkInput({ siteId, value, onChange, disabled }: Readonly<{ siteId?: number; value: string; onChange: (value: string) => void; disabled?: boolean }>) {
  const picker = useCmsLinkPicker({ siteId, value, disabled, onPick: onChange });
  return <><Input value={value} onChange={onChange} disabled={disabled} suffix={picker.suffix} placeholder="选择站内目标或填写链接" />{picker.hint}{picker.modals}</>;
}

function PresetParameterInput({ parameter, value, siteId, onChange, disabled, channels }: Readonly<{
  parameter: CmsPagePresetParameter; value: string | number; siteId?: number; onChange: (value: string | number) => void;
  disabled?: boolean; channels: { value: string; label: string }[];
}>) {
  const kind = CMS_PAGE_PRESET_FIELDS.find(item => item.value === parameter.field)?.kind;
  const text = String(value);
  if (kind === 'image') return <CmsAssetUrlField siteId={siteId} value={text} onChange={onChange} disabled={disabled} allowUpload={false} />;
  if (kind === 'link') return <PresetLinkInput siteId={siteId} value={text} onChange={onChange} disabled={disabled} />;
  if (kind === 'number') return <InputNumber aria-label={parameter.label} value={typeof value === 'number' ? value : undefined} min={1} max={20} precision={0} onChange={next => { if (typeof next === 'number') onChange(next); }} disabled={disabled} style={fullWidth} />;
  if (kind === 'channel') return <Select aria-label={parameter.label} value={text || undefined} optionList={channels} filter showClear style={fullWidth} disabled={disabled}
    placeholder="选择本站栏目" onChange={next => onChange(typeof next === 'string' ? next : '')} />;
  return <Input aria-label={parameter.label} value={text} onChange={onChange} disabled={disabled} maxLength={2000} />;
}

export default function CmsPagePresetLibrary({ siteId, blocks, selectedBlockIds, onApply, disabled = false }: Readonly<{
  siteId?: number; blocks: CmsPageBlock[]; selectedBlockIds: string[];
  onApply: (blocks: CmsPageBlock[], mode: 'append' | 'replace-selected', replaceIds?: string[]) => void; disabled?: boolean;
}>) {
  const formId = useId();
  const isMobile = useIsMobile();
  const { hasPermission } = usePermission();
  const canSave = !disabled && hasPermission('cms:page:update');
  const [visible, setVisible] = useState(false);
  const [presetId, setPresetId] = useState<number>();
  const [versionNumber, setVersionNumber] = useState<number>();
  const [values, setValues] = useState<ParameterValues>({});
  const [saveBlocks, setSaveBlocks] = useState<CmsPageBlock[]>([]);
  const [saveParameters, setSaveParameters] = useState<CmsPagePresetParameter[]>([]);
  const [expectedVersion, setExpectedVersion] = useState<number>();
  const list = useCmsPagePresets(siteId, visible);
  const preset = list.data?.find(item => item.id === presetId);
  // 不复用上一站点的数据；切换站点后须从本站列表重新确认预设归属。
  const activeId = preset?.id;
  const latest = useCmsPagePresetDetail(activeId, visible);
  const versions = useCmsPagePresetVersions(activeId, visible);
  const historical = useCmsPagePresetVersion(activeId, versionNumber, visible && versionNumber !== undefined);
  const usages = useCmsPagePresetUsages(activeId, visible);
  const channels = useCmsChannelTree(visible ? siteId : undefined);
  const snapshot = versionNumber === undefined ? latest.data : historical.data;
  const save = useSaveCmsPagePreset();
  const copy = useCopyCmsPagePreset();
  const instantiate = useInstantiateCmsPagePreset();
  const selected = blocks.filter(block => selectedBlockIds.includes(block.id));
  const firstSource = selected[0]?.presetSource;
  const source = firstSource && selected.every(block => block.presetSource?.instanceId === firstSource.instanceId && block.presetSource.presetId === firstSource.presetId) ? firstSource : undefined;
  const instanceBlocks = source ? blocks.filter(block => block.presetSource?.instanceId === source.instanceId) : [];
  const canReplace = !disabled && selected.length > 0 && selected.every(block => block.canManage !== false);
  const canUpgrade = canReplace && !!source && source.presetId === activeId && !!latest.data && source.version < latest.data.version && instanceBlocks.every(block => block.canManage !== false);
  const choose = (id?: number) => { setPresetId(id); setVersionNumber(undefined); setValues({}); };
  const saved = (record: CmsPagePreset) => choose(record.id);
  const saveModal = useEditModal<CmsPagePreset, PresetValues>({
    entityName: '页面组合预设', save,
    defaults: () => ({ name: '', description: '', parameters: [] }),
    toValues: record => ({ name: record.name, description: record.description ?? '', parameters: saveParameters }),
    beforeSave: input => {
      if (!siteId || !canSave || !saveBlocks.length) { Toast.warning('请先选择可编辑的页面区块'); abortSubmit(); }
      const parameters = input.parameters ?? [];
      try { validateCmsPagePresetDefinition(saveBlocks, parameters); } catch (error) { Toast.warning(error instanceof Error ? error.message : '请检查参数声明'); abortSubmit(); }
      return { ...input, siteId, blocks: saveBlocks, parameters, expectedVersion };
    },
    successMessage: ({ isEdit }) => isEdit ? '已保存新版本，现有页面仍保留原快照' : '预设已保存',
    onSaved: saved,
  });
  const copyModal = useEditModal<CmsPagePreset, BodyOf<typeof cmsPagePresetContract.copy>>({
    entityName: '预设副本',
    save: { isPending: copy.isPending, mutateAsync: ({ id, values: input }) => copy.mutateAsync({ params: { id: id ?? 0 }, body: input }) },
    toValues: record => ({ name: `${record.name} 副本`.slice(0, 100) }),
    onSaved: saved,
    successMessage: () => '已创建独立预设副本',
  });

  function openSave(items: CmsPageBlock[], update = false) {
    if (!canSave || !items.length || items.some(block => block.canManage === false)) return;
    // 从实例保存新版本时保留原区块身份，使参数与后续实例升级能正确对应。
    const definition = items.map(block => ({
      id: update && block.presetSource && block.presetSource.presetId === activeId ? block.presetSource.blockId : block.id,
      type: block.type,
      props: structuredClone(block.props),
      ...(block.displayCondition ? { displayCondition: structuredClone(block.displayCondition) } : {}),
    }));
    setSaveBlocks(definition);
    setExpectedVersion(update ? latest.data?.version : undefined);
    setSaveParameters(update ? (latest.data?.parameters ?? []).filter(parameter => definition.some(block => block.id === parameter.blockId)) : []);
    if (update && preset) saveModal.openEdit(preset); else saveModal.openCreate();
  }

  function apply(mode: 'append' | 'replace-selected', upgrade = false) {
    const target = upgrade ? latest.data : snapshot;
    if (!target || !activeId || disabled || (mode === 'replace-selected' && !canReplace) || (upgrade && !canUpgrade)) return;
    let overrides = values;
    if (upgrade && source) {
      overrides = Object.fromEntries(target.parameters.flatMap(parameter => {
        const block = instanceBlocks.find(item => item.presetSource?.blockId === parameter.blockId);
        const current = block?.props[parameter.field] ?? source.values[parameter.key];
        return typeof current === 'string' || typeof current === 'number' ? [[parameter.key, current]] : [];
      }));
    }
    try { resolveCmsPagePresetValues(target, overrides); } catch (error) { Toast.warning(error instanceof Error ? error.message : '请检查参数值'); return; }
    const replaceIds = upgrade ? instanceBlocks.map(block => block.id) : selected.map(block => block.id);
    const remaining = mode === 'append' ? blocks.length : blocks.length - replaceIds.length;
    if (remaining + target.blocks.length > 50) { Toast.warning('插入后页面将超过 50 个区块，请先精简页面或替换更多区块'); return; }
    const run = () => instantiate.mutateAsync({ params: { id: activeId }, body: { version: target.version, values: overrides } }).then(result => {
      onApply(result.blocks, mode, mode === 'replace-selected' ? replaceIds : undefined);
      Toast.success(upgrade ? '已升级当前组合，请保存页面使更改生效' : '已插入组合，请保存页面使更改生效');
      setVisible(false);
    });
    if (mode === 'replace-selected') confirmDanger({ title: upgrade ? '升级当前组合实例？' : '替换选中的页面区块？',
      content: upgrade ? `将替换此实例的全部 ${replaceIds.length} 个区块，保留可对应的参数值；其他本地调整将被新版本覆盖。` : `将用该预设替换选中的 ${replaceIds.length} 个区块。更改在保存页面后生效。`,
      okText: upgrade ? '升级当前组合' : '替换区块', onOk: run });
    else instantiate.mutate({ params: { id: activeId }, body: { version: target.version, values: overrides } }, { onSuccess: result => {
      onApply(result.blocks, 'append'); Toast.success('已插入组合，请保存页面使更改生效'); setVisible(false);
    } });
  }

  const parameterDefaults = (version: CmsPagePresetVersion, parameter: CmsPagePresetParameter): string | number => {
    const fallback = version.blocks.find(block => block.id === parameter.blockId)?.props[parameter.field];
    return typeof fallback === 'string' || typeof fallback === 'number' ? fallback : parameter.field === 'count' ? 5 : '';
  };
  const channelOptions = flattenChannels(channels.data ?? []).filter(channel => channel.type === 'list' && channel.status === 'enabled').map(channel => ({ value: channel.code, label: channel.name }));

  return <>
    <Button icon={<Library size={14} />} disabled={!siteId} onClick={() => { choose(source?.presetId); setVisible(true); }}>组合预设库</Button>
    <SideSheet title="页面组合预设库" visible={visible} onCancel={() => setVisible(false)} closeOnEsc width={isMobile ? '100%' : 820}
      footer={<ModalFooter onCancel={() => setVisible(false)} cancelText="关闭" onOk={() => apply('append')} okText="追加到页面" loading={instantiate.isPending}
        disabled={disabled || !snapshot || historical.isFetching || latest.isFetching}
        extraActions={<Button disabled={!snapshot || !canReplace || instantiate.isPending} onClick={() => apply('replace-selected')}>替换选中区块</Button>} />}>
      <Space vertical align="start" spacing={16} style={fullWidth}>
        <Space wrap>
          <Button disabled={!canSave || !selected.length || selected.some(block => block.canManage === false)} onClick={() => openSave(selected)}>将选中区块存为预设</Button>
          <Button disabled={!canSave || !blocks.length || blocks.some(block => block.canManage === false)} onClick={() => openSave(blocks)}>将当前页面存为预设</Button>
          <RefreshButton loading={list.isFetching} onClick={() => { void list.refetch(); if (activeId) { void latest.refetch(); void versions.refetch(); void usages.refetch(); } }} />
        </Space>
        {list.isError ? <Banner type="danger" description="预设库加载失败，请刷新重试。" /> : null}
        <Select aria-label="选择组合预设" placeholder="选择本站组合预设" style={fullWidth} loading={list.isFetching} filter value={activeId}
          optionList={(list.data ?? []).map(item => ({ value: item.id, label: `${item.name} · v${item.currentVersion} · ${item.blockCount} 个区块` }))}
          onChange={value => choose(typeof value === 'number' ? value : undefined)} />
        {!list.isLoading && !list.data?.length ? <Empty description="还没有组合预设，可从当前页面或选中的区块保存。" /> : null}
        {preset ? <>
          <Space wrap>
            <Select aria-label="选择预设版本" value={versionNumber === undefined ? 'latest' : String(versionNumber)} style={{ minWidth: 220 }}
              optionList={[{ value: 'latest', label: `最新版本 v${preset.currentVersion}` }, ...(versions.data ?? []).map(item => ({ value: String(item.version), label: `v${item.version} · ${formatDateTime(item.createdAt)}` }))]}
              onChange={value => { const version = Number(value); setVersionNumber(Number.isSafeInteger(version) && version > 0 ? version : undefined); setValues({}); }} />
            <Button disabled={!canSave || !latest.data} onClick={() => copyModal.openEdit(preset)}>复制最新版本为新预设</Button>
            <Button disabled={!canSave || !selected.length || !latest.data || selected.some(block => block.canManage === false)} onClick={() => openSave(selected, true)}>用选中区块保存新版本</Button>
          </Space>
          {source && source.presetId === activeId ? <Space wrap>
            <Typography.Text type="tertiary">当前选中实例来自 v{source.version}，包含 {instanceBlocks.length} 个区块；最新版本为 v{preset.currentVersion}。</Typography.Text>
            <Button size="small" disabled={!canUpgrade || instantiate.isPending} onClick={() => apply('replace-selected', true)}>升级当前组合</Button>
          </Space> : null}
          {(latest.isError || historical.isError || versions.isError) ? <Banner type="danger" description="预设版本加载失败，请重新选择或刷新。" /> : null}
          <Spin spinning={latest.isFetching || historical.isFetching} style={fullWidth}>
            {snapshot ? <Space vertical align="start" spacing={12} style={fullWidth}>
              <Typography.Title heading={6}>{snapshot.name} · v{snapshot.version}</Typography.Title>
              {snapshot.description ? <Typography.Paragraph>{snapshot.description}</Typography.Paragraph> : null}
              <Space wrap>{snapshot.blocks.map((block, index) => <Tag key={block.id}>{blockLabel(block, index)}</Tag>)}</Space>
              {snapshot.note ? <Typography.Paragraph type="tertiary">版本说明：{snapshot.note}</Typography.Paragraph> : null}
              {snapshot.parameters.length ? <Typography.Text strong>追加 / 替换时使用的参数</Typography.Text> : <Typography.Text type="tertiary">此版本没有可替换参数，将直接插入快照。</Typography.Text>}
              {snapshot.parameters.map(parameter => <div key={`${snapshot.version}:${parameter.key}`} style={fullWidth}>
                <Typography.Text strong>{parameter.label}</Typography.Text>
                <PresetParameterInput parameter={parameter} value={values[parameter.key] ?? parameterDefaults(snapshot, parameter)} siteId={siteId} channels={channelOptions} disabled={disabled}
                  onChange={value => setValues(current => ({ ...current, [parameter.key]: value }))} />
              </div>)}
            </Space> : null}
          </Spin>
          <Typography.Title heading={6}>已保存页面中的使用情况</Typography.Title>
          {usages.isError ? <Banner type="warning" description="使用情况加载失败，请刷新重试。" /> : null}
          <Spin spinning={usages.isFetching} style={fullWidth}>
            {(usages.data ?? []).map(item => <div key={`${item.pageId}:${item.instanceId}`} style={{ marginBottom: 12 }}>
              <Typography.Text strong>{item.pageName}</Typography.Text>
              <Typography.Paragraph type="tertiary">{item.pageSlug} · {item.blockIds.length} 个区块 · v{item.sourceVersion} → v{item.latestVersion} · {item.canUpgrade ? '可升级' : item.sourceVersion < item.latestVersion ? '存在新版，需取得全部区块编辑权限' : '已是最新版本'}</Typography.Paragraph>
            </div>)}
            {!usages.isLoading && !usages.data?.length ? <Typography.Text type="tertiary">暂无已保存的使用记录；当前未保存的页面更改不会出现在这里。</Typography.Text> : null}
          </Spin>
        </> : null}
      </Space>
    </SideSheet>
    <EditFormModal modal={saveModal} formProps={{ id: `${formId}-save` }} width={isMobile ? '100%' : 760} title={saveModal.isEdit ? '保存预设新版本' : '保存页面组合预设'} okText="保存预设">
      <Form.Input id={`${formId}-name`} field="name" label="预设名称" maxLength={100} rules={[{ required: true, message: '请填写预设名称' }]} />
      <Form.TextArea id={`${formId}-description`} field="description" label="使用说明" maxLength={500} />
      {saveModal.isEdit ? <Form.Input id={`${formId}-note`} field="note" label="版本说明" maxLength={500} /> : null}
      <FormPresetParameters field="parameters" label="可替换参数" blocks={saveBlocks} />
    </EditFormModal>
    <EditFormModal modal={copyModal} formProps={{ id: `${formId}-copy` }} width={520} title="复制为独立预设" okText="创建副本">
      <Form.Input id={`${formId}-copy-name`} field="name" label="副本名称" maxLength={100} rules={[{ required: true, message: '请填写副本名称' }]} />
    </EditFormModal>
  </>;
}
