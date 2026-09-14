import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useUrlTabState } from '@/hooks/useUrlTabState';
import CatalogTab from './CatalogTab';
import MatrixTab from './MatrixTab';

/**
 * 接口目录：全部契约操作的名称 / 地址 / 方法 / 认证 / 权限码 / 审计 / 功能门控，
 * 由 `@zenith/shared` 契约在浏览器内派生（与服务端门禁同源，无需后端接口）；
 * 「权限矩阵」Tab 叠加某角色 / 用户对每个接口的判定。
 */
export default function ApiCatalogPage() {
  const [activeTab, setActiveTab] = useUrlTabState(['catalog', 'matrix'] as const, 'catalog');
  return (
    <div className="page-container page-tabs-page">
      <Tabs collapsible="auto" activeKey={activeTab} onChange={(k) => setActiveTab(k as typeof activeTab)} type="line" lazyRender keepDOM={false}>
        <TabPane tab="接口目录" itemKey="catalog"><CatalogTab /></TabPane>
        <TabPane tab="权限矩阵" itemKey="matrix"><MatrixTab /></TabPane>
      </Tabs>
    </div>
  );
}
