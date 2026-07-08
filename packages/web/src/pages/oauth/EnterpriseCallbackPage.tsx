import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spin, Toast } from '@douyinfe/semi-ui';
import { REFRESH_TOKEN_KEY, TOKEN_KEY, type LoginResponse } from '@zenith/shared';
import { request } from '@/utils/request';
import { markPostLoginHome } from '@/lib/post-login';

export default function EnterpriseCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('正在处理企业登录...');

  useEffect(() => {
    const samlTicket = searchParams.get('samlTicket');
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const callback = samlTicket
      ? request.post<{ loginResult: LoginResponse; redirectTo?: string | null }>(
        '/api/auth/enterprise/saml/exchange',
        { ticket: samlTicket },
        { silent: true },
      )
      : code && state
        ? request.post<{ loginResult: LoginResponse; redirectTo?: string | null }>(
          '/api/auth/enterprise/callback',
          { code, state },
          { silent: true },
        )
        : null;
    if (!callback) {
      setMessage('企业登录参数不完整');
      return;
    }
    callback
      .then((res) => {
        if (res.code === 0 && res.data?.loginResult?.token) {
          localStorage.setItem(TOKEN_KEY, res.data.loginResult.token.accessToken);
          localStorage.setItem(REFRESH_TOKEN_KEY, res.data.loginResult.token.refreshToken);
          Toast.success('登录成功');
          // 整页刷新最终落地 BASE_URL（首页），打标记供 HomeEntry 应用默认首页偏好
          markPostLoginHome();
          navigate(res.data.redirectTo || '/', { replace: true });
          globalThis.location.href = import.meta.env.BASE_URL;
          return;
        }
        setMessage(res.message || '企业登录失败');
        Toast.error(res.message || '企业登录失败');
        setTimeout(() => navigate('/login', { replace: true }), 2000);
      })
      .catch(() => {
        setMessage('企业登录失败');
        setTimeout(() => navigate('/login', { replace: true }), 2000);
      });
  }, [navigate, searchParams]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16 }}>
      <Spin size="large" />
      <span>{message}</span>
    </div>
  );
}
