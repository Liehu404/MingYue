import { Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';
import AdminLayout from './components/layout/AdminLayout';
import AuthLayout from './components/layout/AuthLayout';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Client pages
import DashboardPage from './pages/client/DashboardPage';
import ResourceListPage from './pages/client/ResourceListPage';
import ResourceDetailPage from './pages/client/ResourceDetailPage';
import UploadPage from './pages/client/UploadPage';
import MyResourcesPage from './pages/client/MyResourcesPage';
import TeamListPage from './pages/client/TeamListPage';
import TeamDetailPage from './pages/client/TeamDetailPage';
import TeamOverviewPage from './pages/client/TeamOverviewPage';
import PartitionPage from './pages/client/PartitionPage';
import ProfilePage from './pages/client/ProfilePage';

// Admin pages
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import UserManagementPage from './pages/admin/UserManagementPage';
import CollegeManagementPage from './pages/admin/CollegeManagementPage';
import PartitionManagementPage from './pages/admin/PartitionManagementPage';
import TeamManagementPage from './pages/admin/TeamManagementPage';
import ReviewQueuePage from './pages/admin/ReviewQueuePage';
import ReportManagementPage from './pages/admin/ReportManagementPage';
import ImageManagementPage from './pages/admin/ImageManagementPage';
import VisualOrgPage from './pages/admin/VisualOrgPage';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#1d1d1f' }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>页面渲染错误</h1>
          <pre style={{ background: '#f5f5f7', padding: 16, borderRadius: 8, fontSize: 14, overflow: 'auto' }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children, requireAdmin }: { children: ReactNode; requireAdmin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div className="typography-lead" style={{ color: '#7a7a7a' }}>加载中...</div>
    </div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && user.role !== 'super_admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Auth routes */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Client routes */}
            <Route path="/" element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="resources" element={<ResourceListPage />} />
              <Route path="resources/:id" element={<ResourceDetailPage />} />
              <Route path="upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
              <Route path="my-resources" element={<ProtectedRoute><MyResourcesPage /></ProtectedRoute>} />
              <Route path="teams" element={<TeamListPage />} />
              <Route path="teams/:id" element={<TeamDetailPage />} />
              <Route path="teams-overview" element={<TeamOverviewPage />} />
              <Route path="partitions" element={<PartitionPage />} />
              <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            </Route>

            {/* Admin routes */}
            <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="users" element={<UserManagementPage />} />
              <Route path="colleges" element={<CollegeManagementPage />} />
              <Route path="partitions" element={<PartitionManagementPage />} />
              <Route path="teams" element={<TeamManagementPage />} />
              <Route path="reviews" element={<ReviewQueuePage />} />
              <Route path="reports" element={<ReportManagementPage />} />
              <Route path="images" element={<ImageManagementPage />} />
              <Route path="org" element={<VisualOrgPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
