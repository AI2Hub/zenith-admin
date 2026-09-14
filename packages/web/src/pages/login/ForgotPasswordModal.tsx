import { useState, type FormEvent } from 'react';
import { Toast } from '@douyinfe/semi-ui';
import { Mail } from 'lucide-react';
import AppModal from '@/components/AppModal';
import { ModalFooter } from '@/components/ModalFooter';
import { useForgotPassword } from '@/hooks/queries/auth-public';
import { EMAIL_PATTERN, useLoginForm } from './login-form';
import { LoginField } from './LoginField';

interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
}

interface ForgotPasswordValues extends Record<string, string> {
  email: string;
}

const INITIAL: ForgotPasswordValues = { email: '' };
const RULES = {
  email: [
    { required: true, message: '请输入邮箱地址' },
    { pattern: EMAIL_PATTERN, message: '邮箱格式不正确' },
  ],
};

/** 找回密码弹窗：点击「忘记密码」后才加载；表单用登录页的受控字段实现，不引入 Semi Form */
export default function ForgotPasswordModal({ visible, onClose }: Readonly<ForgotPasswordModalProps>) {
  const [sent, setSent] = useState(false);
  const form = useLoginForm<ForgotPasswordValues>(INITIAL, RULES);
  const forgotPasswordMutation = useForgotPassword();
  const loading = forgotPasswordMutation.isPending;

  const handleClose = () => {
    setSent(false);
    form.reset();
    onClose();
  };

  const submit = async () => {
    if (sent) {
      handleClose();
      return;
    }
    const values = form.validate();
    if (!values || loading) return;
    try {
      await forgotPasswordMutation.mutateAsync({ body: { email: values.email } });
      setSent(true);
    } catch (err) {
      Toast.error(err instanceof Error ? err.message : '发送失败，请稍后重试');
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submit();
  };

  return (
    <AppModal
      title="找回密码"
      visible={visible}
      onCancel={handleClose}
      // 发送成功后只保留「我知道了」（Modal 自带页脚）；表单态由 <form> 自己的页脚提交，支持回车
      footer={sent ? undefined : null}
      onOk={handleClose}
      okText="我知道了"
      hasCancel={false}
      width={400}
    >
      {sent ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Mail size={48} style={{ color: 'var(--semi-color-primary)', marginBottom: 16 }} />
          <p style={{ fontSize: 15, marginBottom: 8, fontWeight: 500 }}>重置链接已发送</p>
          <p style={{ color: 'var(--semi-color-text-2)', fontSize: 13 }}>
            如邮箱已注册，重置链接已发送至您的邮箱，请在 30 分钟内完成重置。
          </p>
        </div>
      ) : (
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <p style={{ color: 'var(--semi-color-text-2)', fontSize: 13, marginBottom: 16 }}>
            请输入注册时使用的邮箱地址，我们将向该邮箱发送密码重置链接。
          </p>
          <LoginField
            {...form.field('email')}
            id="forgot-password-email"
            label="邮箱地址"
            labelPosition="left"
            placeholder="请输入邮箱"
            prefix={<Mail size={14} />}
            size="large"
            type="email"
            autoComplete="email"
            autoFocus
          />
          <ModalFooter onCancel={handleClose} onOk={submit} okText="发送重置链接" loading={loading} />
        </form>
      )}
    </AppModal>
  );
}
