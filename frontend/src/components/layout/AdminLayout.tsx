import { Link, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';

const ADMIN_LINKS = [
  { to: '/admin', label: '仪表盘', exact: true },
  { to: '/admin/users', label: '用户管理' },
  { to: '/admin/colleges', label: '学院管理' },
  { to: '/admin/partitions', label: '分区管理' },
  { to: '/admin/teams', label: '战队管理' },
  { to: '/admin/reviews', label: '审核队列' },
  { to: '/admin/reports', label: '举报管理' },
  { to: '/admin/images', label: '图片素材' },
  { to: '/admin/org', label: '组织架构' },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const loc = useLocation();

  if (!user || user.role !== 'super_admin') {
    return (
      <div className="admin-shell admin-shell-empty">
        <h1 className="typography-display-lg" style={{ color: '#1d1d1f', marginBottom: 16 }}>无权限访问</h1>
        <Link to="/" className="button-primary">返回首页</Link>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <div className="admin-shell-topbar">
        <Link to="/admin" className="admin-shell-brand">
          <span className="global-brand-mark">A</span>
          <span className="global-brand-copy">
            <span className="global-brand-title">管理中枢</span>
            <span className="global-brand-subtitle">Super Admin Console</span>
          </span>
        </Link>

        <div className="admin-shell-links">
          {ADMIN_LINKS.map((l) => {
            const active = l.exact ? loc.pathname === l.to : loc.pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.to}
                className={`admin-shell-link${active ? ' admin-shell-link-active' : ''}`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <Link to="/" className="button-secondary-pill admin-shell-return">
          返回客户端
        </Link>
      </div>

      <AnimatePresence mode="wait">
        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="admin-shell-content"
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
    </div>
  );
}
