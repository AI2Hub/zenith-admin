import { useNavigate, Navigate } from 'react-router-dom';
import { Avatar, Button, Modal } from '@douyinfe/semi-ui';
import { Crown, LogOut, Palette } from 'lucide-react';
import { useMemberAuth } from '../../hooks/useMemberAuth';
import { MemberPage } from '../../components/MemberPage';
import { ThemeColorPicker } from '../../components/ThemeColorPicker';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { member, logout } = useMemberAuth();

  if (!member) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    Modal.confirm({
      title: '退出登录',
      content: '确定要退出当前账户吗？',
      okText: '退出',
      cancelText: '取消',
      onOk: () => {
        logout();
        navigate('/login', { replace: true });
      },
    });
  };

  return (
    <MemberPage title="我的资料">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '20px 24px',
          background: '#fff',
          borderRadius: 12,
          border: '1px solid var(--m-border)',
          marginBottom: 16,
        }}
      >
        <Avatar size="large" src={member.avatar ?? undefined} style={{ background: 'var(--m-primary)', flexShrink: 0 }}>
          {member.nickname?.[0] ?? 'U'}
        </Avatar>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{member.nickname ?? '会员'}</div>
          <div style={{ fontSize: 13, color: 'var(--m-text-secondary)' }}>
            {member.phone ?? member.email ?? member.username ?? '—'}
          </div>
        </div>
        {member.levelName && (
          <span className="m-level-badge">
            <Crown size={11} />
            {member.levelName}
          </span>
        )}
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid var(--m-border)',
          padding: '20px 24px',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          <Palette size={16} color="var(--m-primary)" />
          个性化设置
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10, color: 'var(--m-text)' }}>主题颜色</div>
        <ThemeColorPicker />
      </div>

      <Button
        type="danger"
        theme="light"
        icon={<LogOut size={15} />}
        onClick={handleLogout}
      >
        退出登录
      </Button>
    </MemberPage>
  );
}
