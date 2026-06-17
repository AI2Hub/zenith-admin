import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, Toast } from '@douyinfe/semi-ui';
import { Crown } from 'lucide-react';
import { useMemberAuth } from '../../hooks/useMemberAuth';
import { useSmsCode } from '../../hooks/useSmsCode';

const PHONE_REGEX = /^1[3-9]\d{9}$/;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useMemberAuth();
  const { counting, send } = useSmsCode('register');
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');

  const handleRegister = async () => {
    if (!PHONE_REGEX.test(phone)) {
      Toast.warning('请输入正确的手机号');
      return;
    }
    if (smsCode.length !== 6) {
      Toast.warning('请输入 6 位验证码');
      return;
    }
    if (password && password.length < 6) {
      Toast.warning('密码至少 6 位');
      return;
    }
    setLoading(true);
    const res = await register({
      phone,
      smsCode,
      nickname: nickname || undefined,
      password: password || undefined,
    });
    setLoading(false);
    if (res.code === 0) {
      Toast.success('注册成功');
      navigate('/home', { replace: true });
    } else {
      Toast.error(res.message || '注册失败');
    }
  };

  return (
    <div className="m-auth-page">
      <div className="m-auth-head">
        <div className="m-auth-logo">
          <Crown size={32} />
        </div>
        <div className="m-auth-title">注册会员</div>
        <div className="m-auth-sub">手机号快速注册，即刻享受会员权益</div>
      </div>

      <Input
        size="large"
        placeholder="手机号"
        value={phone}
        onChange={setPhone}
        style={{ marginTop: 16 }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Input
          size="large"
          placeholder="6 位验证码"
          value={smsCode}
          onChange={setSmsCode}
          style={{ flex: 1 }}
        />
        <Button size="large" disabled={counting > 0} onClick={() => send(phone)}>
          {counting > 0 ? `${counting}s` : '获取验证码'}
        </Button>
      </div>
      <Input
        size="large"
        placeholder="昵称（选填）"
        value={nickname}
        onChange={setNickname}
        style={{ marginTop: 12 }}
      />
      <Input
        size="large"
        mode="password"
        placeholder="设置登录密码（选填，至少 6 位）"
        value={password}
        onChange={setPassword}
        onEnterPress={handleRegister}
        style={{ marginTop: 12 }}
      />

      <Button
        size="large"
        theme="solid"
        block
        loading={loading}
        onClick={handleRegister}
        style={{ marginTop: 24, background: 'var(--m-primary)' }}
      >
        注册并登录
      </Button>

      <div className="m-auth-footer">
        已有账户？
        <button type="button" className="m-auth-link" onClick={() => navigate('/login')}>
          返回登录
        </button>
      </div>
    </div>
  );
}
