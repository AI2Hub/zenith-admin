import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button, Toast } from '@douyinfe/semi-ui';
import { Crown } from 'lucide-react';
import { useMemberAuth } from '../../hooks/useMemberAuth';
import { useSmsCode } from '../../hooks/useSmsCode';

const PHONE_REGEX = /^1[3-9]\d{9}$/;

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useMemberAuth();
  const { counting, send } = useSmsCode('login');
  const [tab, setTab] = useState<'password' | 'sms'>('password');
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');

  const handleLogin = async () => {
    if (tab === 'password') {
      if (!account || !password) {
        Toast.warning('请输入账号和密码');
        return;
      }
    } else if (!PHONE_REGEX.test(phone) || smsCode.length !== 6) {
      Toast.warning('请输入手机号和 6 位验证码');
      return;
    }
    setLoading(true);
    const res = await login(
      tab === 'password'
        ? { loginType: 'password', account, password }
        : { loginType: 'sms', phone, smsCode },
    );
    setLoading(false);
    if (res.code === 0) {
      Toast.success('登录成功');
      navigate('/home', { replace: true });
    } else {
      Toast.error(res.message || '登录失败');
    }
  };

  return (
    <div className="m-auth-page">
      <div className="m-auth-head">
        <div className="m-auth-logo">
          <Crown size={32} />
        </div>
        <div className="m-auth-title">会员登录</div>
        <div className="m-auth-sub">欢迎回来，登录你的会员账户</div>
      </div>

      <div className="m-auth-tabs">
        <button type="button" className={`m-auth-tab${tab === 'password' ? ' active' : ''}`} onClick={() => setTab('password')}>
          密码登录
        </button>
        <button type="button" className={`m-auth-tab${tab === 'sms' ? ' active' : ''}`} onClick={() => setTab('sms')}>
          验证码登录
        </button>
      </div>

      {tab === 'password' ? (
        <>
          <Input
            size="large"
            placeholder="手机号 / 邮箱 / 用户名"
            value={account}
            onChange={setAccount}
            style={{ marginTop: 16 }}
          />
          <Input
            size="large"
            mode="password"
            placeholder="登录密码"
            value={password}
            onChange={setPassword}
            onEnterPress={handleLogin}
            style={{ marginTop: 12 }}
          />
        </>
      ) : (
        <>
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
              onEnterPress={handleLogin}
              style={{ flex: 1 }}
            />
            <Button size="large" disabled={counting > 0} onClick={() => send(phone)}>
              {counting > 0 ? `${counting}s` : '获取验证码'}
            </Button>
          </div>
        </>
      )}

      <div style={{ textAlign: 'right', marginTop: 12 }}>
        <button type="button" className="m-auth-link" onClick={() => navigate('/forgot-password')}>
          忘记密码？
        </button>
      </div>

      <Button
        size="large"
        theme="solid"
        block
        loading={loading}
        onClick={handleLogin}
        style={{ marginTop: 24, background: 'var(--m-primary)' }}
      >
        登录
      </Button>

      <div className="m-auth-footer">
        还没有账户？
        <button type="button" className="m-auth-link" onClick={() => navigate('/register')}>
          立即注册
        </button>
      </div>
    </div>
  );
}
