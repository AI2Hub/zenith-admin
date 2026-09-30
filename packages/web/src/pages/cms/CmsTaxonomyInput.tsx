import { Select, Space, Typography } from '@douyinfe/semi-ui';
import { cmsVocabularyApplies } from '@zenith/shared/cms';
import { useAllCmsVocabularies } from '@/hooks/queries/cms-vocabularies';
import { useAllCmsTags } from '@/hooks/queries/cms-tags';

export default function CmsTaxonomyInput({ siteId, modelId, value = [], onChange, disabled }: Readonly<{
  siteId?: number; modelId?: number | null; value?: number[]; onChange?: (ids: number[]) => void; disabled?: boolean;
}>) {
  const tags = useAllCmsTags(siteId); const vocabularies = useAllCmsVocabularies(siteId);
  const available = vocabularies.data?.filter(item => item.status === 'enabled' && cmsVocabularyApplies(item, modelId ?? null)) ?? [];
  const groups = [{ id: null, name: '自由标签', required: false, maxSelections: 100 }, ...available];
  const known = new Set((tags.data ?? []).filter(term => !term.vocabularyId || available.some(group => group.id === term.vocabularyId)).map(term => term.id));
  return <Space vertical align="start" style={{ width: '100%' }}>
    {groups.map(group => {
      const terms = tags.data?.filter(term => (term.vocabularyId ?? null) === group.id) ?? [];
      const ids = new Set(terms.map(term => term.id));
      return <div key={group.id ?? 'free'} style={{ width: '100%' }}>
        <Typography.Text type="secondary">{group.name}{group.required ? '（发布必选）' : ''}</Typography.Text>
        <Select multiple filter value={value.filter(id => ids.has(id))} disabled={disabled} loading={tags.isFetching || vocabularies.isFetching} style={{ width: '100%' }}
          maxTagCount={3} placeholder={`选择${group.name}`} optionList={terms.map(term => ({ value: term.id, label: term.parentId ? `${tags.data?.find(parent => parent.id === term.parentId)?.name ?? ''} / ${term.name}` : term.name, searchText: [term.name, ...(term.aliases ?? [])].join(' ') }))}
          onChange={next => onChange?.([...value.filter(id => !ids.has(id) && known.has(id)), ...(Array.isArray(next) ? next.map(Number) : [])])} />
      </div>;
    })}
    {value.some(id => !known.has(id)) ? <Typography.Text type="warning">已有分类不适用于当前模型，请重新选择分类后保存。</Typography.Text> : null}
  </Space>;
}
