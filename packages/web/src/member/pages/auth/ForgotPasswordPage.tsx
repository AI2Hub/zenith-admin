import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, Toast } from '@douyinfe/semi-ui';
import { Crown } from 'lucide-react';
import { memberRequest } from '../../utils/member-request';
import { useSmsCode } from '../../hooks/useSmsCode';

const PHONE_REGEX = /^1[3-9]\d{9}$/;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { counting, send } = useSmsCode('reset');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!PHONE_REGEX.test(phone)) {
      Toast.warning('请输入正确的手机号');
      return;
    }
    if (smsCode.length !== 6) {
      Toast.warning('请输入 6 位验证码');
      return;
    }
    if (newPassword.length < 6) {
      Toast.warning('新密码至少 6 位');
      return;
    }
    setLoading(true);
    const res = await memberRequest.post(
      '/api/member/auth/reset-password',
      { phone, smsCode, newPassword },
      { silent: true },
    );
    setLoading(false);
    if (res.code === 0) {
      Toast.success('密码已重置，请重新登录');
      navigate('/login', { replace: true });
    } else {
      Toast.error(res.message || '重置失败');
    }
  };

  return (
    <div className="m-auth-page">
      <div className="m-auth-head">
        <div className="m-auth-logo">
          <Crown size={32} />
        </div>
        <div className="m-auth-title">重置密码</div>
        <div className="m-auth-sub">通过手机验证码重置登录密码</div>
      </div>

      <Input size="large" placeholder="手机号" value={phone} onChange={setPhone} style={{ marginTop: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Input size="large" placeholder="6 位验证码" value={smsCode} onChange={setSmsCode} style={{ flex: 1 }} />
        <Button size="large" disabled={counting > 0} onClick={() => send(phone)}>
          {counting > 0 ? `${counting}s` : '获取验证码'}
        </Button>
      </div>
      <Input
        size="large"
        mode="password"
        placeholder="新密码（至少 6 位）"
        value={newPassword}
        onChange={setNewPassword}
        onEnterPress={handleReset}
        style={{ marginTop: 12 }}
      />

      <Button
        size="large"
        theme="solid"
        block
        loading={loading}
        onClick={handleReset}
        style={{ marginTop: 24, background: 'var(--m-primary)' }}
      >
        重置密码
      </Button>

      <div className="m-auth-footer">
        想起密码了？
        <button type="button" className="m-auth-link" onClick={() => navigate('/login')}>
          返回登录
        </button>
      </div>
    </div>
  );
}
