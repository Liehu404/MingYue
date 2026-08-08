import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function AuthLayout() {
  return (
    <div className="auth-shell">
      <div className="auth-shell-orb auth-shell-orb-1" />
      <div className="auth-shell-orb auth-shell-orb-2" />

      <div className="auth-shell-grid">
        <section className="auth-shell-copy">
          <div className="auth-shell-badge">Industrial research access</div>
          <h1 className="auth-shell-title">明月学术平台</h1>
          <p className="auth-shell-description">
            资源、战队、审核与管理员能力统一收束在同一套界面语言里，让协作入口看起来更稳、更高级，也更适合长期使用。
          </p>

          <div className="auth-shell-metrics">
            <div className="auth-shell-metric">
              <span className="auth-shell-metric-value">24 / 7</span>
              <span className="auth-shell-metric-label">Access Window</span>
            </div>
            <div className="auth-shell-metric">
              <span className="auth-shell-metric-value">Zero</span>
              <span className="auth-shell-metric-label">Logic Changes</span>
            </div>
            <div className="auth-shell-metric">
              <span className="auth-shell-metric-value">Sync</span>
              <span className="auth-shell-metric-label">Remote Ready</span>
            </div>
          </div>
        </section>

        <div className="auth-shell-panel">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: '100%' }}
          >
            <Outlet />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
