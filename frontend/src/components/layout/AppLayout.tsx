import { Link, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const isHome = loc.pathname === '/';

  return (
    <>
      <nav className="global-nav">
        <Link to="/" className="global-brand" aria-label="明月学术平台首页">
          <span className="global-brand-mark">M</span>
          <span className="global-brand-copy">
            <span className="global-brand-title">明月学术</span>
            <span className="global-brand-subtitle">Research OS</span>
          </span>
        </Link>

        <div className="global-nav-links">
          <Link to="/" className="global-nav-link">首页</Link>
          <Link to="/resources" className="global-nav-link">资源广场</Link>
          <Link to="/teams" className="global-nav-link">战队</Link>
          <Link to="/partitions" className="global-nav-link">分区</Link>
          {user ? (
            <>
              <Link to="/upload" className="global-nav-link">上传</Link>
              <Link to="/my-resources" className="global-nav-link">我的资源</Link>
            </>
          ) : null}
        </div>

        <div className="global-nav-utility">
          {user ? (
            <>
              <span className="global-nav-user">{user.display_name}</span>
              <Link to="/profile" className="global-nav-link">个人中心</Link>
              {(user.role === 'super_admin') && (
                <Link to="/admin" className="global-nav-link">管理端</Link>
              )}
              <button onClick={logout} className="button-utility">
                退出
              </button>
            </>
          ) : (
            <Link to="/login" className="global-nav-link">登录</Link>
          )}
        </div>
      </nav>

      {!isHome && (
        <div className="sub-nav-frosted">
          <div className="sub-nav-title">明月学术平台</div>
          <div>
            {user ? (
              <Link to="/upload" className="button-primary" style={{ marginRight: 12, padding: '7px 18px', fontSize: 14 }}>
                上传资源
              </Link>
            ) : (
              <Link to="/login" className="button-primary" style={{ marginRight: 12, padding: '7px 18px', fontSize: 14 }}>
                登录
              </Link>
            )}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.main
          key={loc.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
    </>
  );
}
