import { useQueryClient } from '@tanstack/react-query';
import { Banner, Form } from '@douyinfe/semi-ui';
import type { WorkflowBusinessFormProps } from '@/components/workflow/BusinessFormHost';
import { invalidateAccessRequests } from '@/hooks/queries/identity-access-governance';

export default function AccessRequestApprovalForm({ value, getFormApi }: Readonly<WorkflowBusinessFormProps>) {
  const queryClient = useQueryClient();
  const mfaRequired = value.mfaRequired === true;
  return <Form allowEmpty labelPosition="left" labelWidth={110} getFormApi={api => getFormApi?.({
    getValues: () => ({}),
    validate: async () => {
      const values = await api.validate() as { mfaCode?: string };
      return mfaRequired ? { mfaCode: values.mfaCode } : {};
    },
    onActionSuccess: () => invalidateAccessRequests(queryClient),
  })}>
    {mfaRequired && <>
      <Banner type="info" closeIcon={null} description="本次权限审批要求验证本人身份。尚未绑定认证器时，请先到个人中心的账号安全中绑定。" />
      <Form.Input field="mfaCode" label="本人动态验证码" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
        rules={[{ required: true, message: '请输入本人认证器的六位验证码' }, { pattern: /^\d{6}$/, message: '请输入六位数字验证码' }]} />
    </>}
  </Form>;
}
