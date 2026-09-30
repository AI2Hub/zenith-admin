import { Form } from '@douyinfe/semi-ui';
import type { CmsSite } from '@zenith/shared/cms';
import { EditFormSheet } from '@/components/EditFormModal';
import { FormTimezoneSelect } from '@/components/FormTimezoneSelect';
import { useEditModal } from '@/hooks/useEditModal';
import { useConfigureCmsTelemetry } from '@/hooks/queries/cms-stats';

interface TelemetryValues { enabled: boolean; timeZone: string }
export function useCmsTelemetrySettings() {
  const mutation = useConfigureCmsTelemetry();
  const modal = useEditModal<TelemetryValues & { id: number }, TelemetryValues>({
    entityName: '访问采集',
    save: { isPending: mutation.isPending, mutateAsync: async ({ id, values }) => {
      const saved = await mutation.mutateAsync({ params: { id: id! }, body: values });
      return { id: saved.siteId, enabled: saved.enabled, timeZone: saved.timeZone };
    } },
    successMessage: () => '采集配置已保存，请发布配置使线上页面生效',
  });
  return {
    open: (site: CmsSite) => {
      const settings = site.settings.telemetry as Partial<TelemetryValues> | undefined;
      modal.openEdit({ id: site.id, enabled: settings?.enabled === true, timeZone: settings?.timeZone ?? 'Asia/Shanghai' });
    },
    // 最长标签「站点统计时区」6 字约 84px + 必填星号，useEditModal 默认 labelWidth 90 装不下会折行
    editor: <EditFormSheet modal={modal} title="访问采集设置" width={520} formProps={{ labelWidth: 120 }}>
      <Form.Switch field="enabled" label="启用访问采集" />
      <FormTimezoneSelect field="timeZone" label="站点统计时区" extraText="自然日、小时分桶和对比周期均按此时区计算。报表中可以临时选择其他统计时区。" />
    </EditFormSheet>,
  };
}
