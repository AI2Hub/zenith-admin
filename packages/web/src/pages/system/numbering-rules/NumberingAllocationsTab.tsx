import { Banner, Empty } from '@douyinfe/semi-ui';
import type { ColumnProps } from '@douyinfe/semi-ui/lib/es/table';
import { getNumberingScene, numberingAllocationContract, type NumberingAllocation } from '@zenith/shared/platform';
import ConfigurableTable from '@/components/ConfigurableTable';
import EntityRefBadge from '@/components/entity-relations/EntityRefBadge';
import { ListSearchToolbar } from '@/components/list-page';
import { useListPage } from '@/hooks/useListPage';
import { usePermission } from '@/hooks/usePermission';
import { useNumberingAllocations } from '@/hooks/queries/numbering';
import { copyableNoColumn, createdAtColumn, renderEllipsis } from '@/utils/table-columns';
import { numberingBusinessRef } from './numbering-business-link';

export function NumberingAllocationsTab() {
  const { hasPermission } = usePermission();
  const allowed = hasPermission('system:numbering:allocation');
  const page = useListPage({ contract: numberingAllocationContract, useList: useNumberingAllocations, enabled: allowed, table: { empty: <Empty description="尚无编号记录。业务正式提交后，已分配的编号会显示在这里。" /> } });
  const columns: ColumnProps<NumberingAllocation>[] = [
    copyableNoColumn('业务编号', 'number', { width: 280 }),
    { title: '业务类型', dataIndex: 'scene', width: 150, render: scene => getNumberingScene(scene).label },
    { title: '业务对象', dataIndex: 'ownerKey', width: 160, render: renderEllipsis },
    { title: '关联业务', dataIndex: 'businessKey', width: 200, render: (key, row) => {
      const ref = numberingBusinessRef(row, hasPermission);
      return ref ? <EntityRefBadge entityRef={ref} capabilities={{ view: true, open: true }}>#{key}</EntityRefBadge> : renderEllipsis(key);
    } },
    { title: '规则 ID', dataIndex: 'ruleId', width: 100 },
    { title: '版本 ID', dataIndex: 'versionId', width: 100 },
    createdAtColumn,
  ];
  if (!allowed) return <Empty description="暂无生成记录查看权限" />;
  return (
    <>
      <p className="numbering-tab-description">已提交的编号永久保留，业务撤回、作废或外部调用失败时也不回收。</p>
      <ListSearchToolbar page={page} filters={['keyword', 'scene', ['startTime', 'endTime']]} />
      {page.listQuery.isError && <Banner type="danger" description="生成记录加载失败，请点击查询重试。" closeIcon={null} />}
      <ConfigurableTable<NumberingAllocation> columns={columns} {...page.tableProps} />
    </>
  );
}
