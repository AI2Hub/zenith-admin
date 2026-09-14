import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useUrlTabState } from '@/hooks/useUrlTabState';
import { ExceptionAlertLogsTab, ExceptionAlertsTab } from './ExceptionAlertsTab';
import { ExceptionEventsTab } from './ExceptionEventsTab';
import { ExceptionIssuesTab } from './ExceptionIssuesTab';

const TABS = ['issues', 'events', 'alerts', 'alertlogs'] as const;

/**
 * 异常日志（服务端异常）：与「数据分析 → 错误监控」共用 Issue 模型，这里只看 source = 'server'。
 * 分组 = 同一指纹的异常；事件 = 每次发生（带堆栈 / 请求快照 / 链路 ID）；告警规则固定服务端来源。
 */
export default function ExceptionLogsPage() {
  const [activeTab, setActiveTab] = useUrlTabState(TABS, 'issues');

  return (
    <div className="page-container page-tabs-page">
      <Tabs
        collapsible="auto"
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as typeof activeTab)}
        type="line"
        lazyRender
        keepDOM={false}
      >
        <TabPane tab="异常 Issue" itemKey="issues">
          <ExceptionIssuesTab active={activeTab === 'issues'} />
        </TabPane>
        <TabPane tab="异常事件" itemKey="events">
          <ExceptionEventsTab active={activeTab === 'events'} />
        </TabPane>
        <TabPane tab="告警规则" itemKey="alerts">
          <ExceptionAlertsTab active={activeTab === 'alerts'} />
        </TabPane>
        <TabPane tab="告警历史" itemKey="alertlogs">
          <ExceptionAlertLogsTab active={activeTab === 'alertlogs'} />
        </TabPane>
      </Tabs>
    </div>
  );
}
