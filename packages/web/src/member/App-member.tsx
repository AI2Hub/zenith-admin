import { type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Spin } from '@douyinfe/semi-ui';
import { MemberAuthProvider, useMemberAuth } from './hooks/useMemberAuth';
import MemberLayout from './layouts/MemberLayout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import HomePage from './pages/home/HomePage';
import PointsPage from './pages/points/PointsPage';
import WalletPage from './pages/wallet/WalletPage';
import CouponsPage from './pages/coupons/CouponsPage';
import LevelPage from './pages/level/LevelPage';
import ProfilePage from './pages/profile/ProfilePage';
import EditProfilePage from './pages/profile/EditProfilePage';
import ChangePasswordPage from './pages/profile/ChangePasswordPage';

/** 受保护路由：未登录跳转登录页 */
function RequireMember({ children }: Readonly<{ children: ReactNode }>) {
  const { member, loading } = useMemberAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="m-loading-wrap">
        <Spin size="large" />
      </div>
    );
  }
  if (!member) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { member } = useMemberAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        element={
          <RequireMember>
            <MemberLayout />
          </RequireMember>
        }
      >
        <Route path="/home" element={<HomePage />} />
        <Route path="/points" element={<PointsPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/coupons" element={<CouponsPage />} />
        <Route path="/level" element={<LevelPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/edit" element={<EditProfilePage />} />
        <Route path="/profile/password" element={<ChangePasswordPage />} />
      </Route>
      <Route path="*" element={<Navigate to={member ? '/home' : '/login'} replace />} />
    </Routes>
  );
}

export default function MemberApp() {
  return (
    <MemberAuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </MemberAuthProvider>
  );
}
