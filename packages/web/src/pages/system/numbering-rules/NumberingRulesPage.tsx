import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useUrlTabState } from '@/hooks/useUrlTabState';
import { NumberingRulesTab } from './NumberingRulesTab';
import { NumberingAllocationsTab } from './NumberingAllocationsTab';
import './numbering-rules.css';

const TABS = ['rules', 'allocations'] as const;

export default function NumberingRulesPage() {
  const [activeTab, setActiveTab] = useUrlTabState(TABS, 'rules');
  return (
    <div className="page-container page-tabs-page">
      <Tabs collapsible="auto" activeKey={activeTab} onChange={(key) => setActiveTab(key as typeof activeTab)} type="line" lazyRender keepDOM={false}>
        <TabPane tab="编号规则" itemKey="rules"><NumberingRulesTab /></TabPane>
        <TabPane tab="生成记录" itemKey="allocations"><NumberingAllocationsTab /></TabPane>
      </Tabs>
    </div>
  );
}
