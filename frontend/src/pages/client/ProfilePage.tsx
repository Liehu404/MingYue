import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import client from '../../api/client';

const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  advisor: '指导教师',
  student: '学生',
  guest: '访客',
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: '#eb2f96',
  admin: '#fa8c16',
  advisor: '#722ed1',
  student: '#52c41a',
  guest: '#8c8c8c',
};

const TEAM_ROLE_LABELS: Record<string, string> = {
  '队长': '队长',
  '项管': '项管',
  '技术组长': '技术组长',
  '成员': '成员',
};

const TEAM_ROLE_COLORS: Record<string, string> = {
  '队长': '#faad14',
  '项管': '#722ed1',
  '技术组长': '#2f54eb',
  '成员': '#52c41a',
};

export default function ProfilePage() {
  const { user } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [changing, setChanging] = useState(false);

  if (!user) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ background: 'var(--color-parchment)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2 className="typography-display-md" style={{ marginBottom: '12px', color: 'var(--color-ink-muted-48)' }}>
            请先登录
          </h2>
          <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)' }}>
            登录后即可查看个人中心。
          </p>
        </div>
      </motion.div>
    );
  }

  const roleName = ROLE_LABELS[user.role] || user.role;
  const roleColor = ROLE_COLORS[user.role] || '#8c8c8c';
  const initial = (user.display_name || user.username).charAt(0).toUpperCase();

  const teams = user.team_memberships || [];

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      alert('两次输入的新密码不一致');
      return;
    }
    if (passwordForm.new_password.length < 6) {
      alert('新密码长度不能少于6位');
      return;
    }
    try {
      setChanging(true);
      await client.post('/auth/change-password', {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      alert('密码修改成功');
      setShowPasswordModal(false);
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err: any) {
      alert(err?.response?.data?.message || '密码修改失败');
    } finally {
      setChanging(false);
    }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] } },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      style={{ background: 'var(--color-parchment)', minHeight: '100vh', width: '100%' }}
    >
      {/* Banner */}
      <section className="product-tile-light" style={{ paddingTop: '60px', paddingBottom: '48px' }}>
        <div className="tile-content">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
            style={{ textAlign: 'center' }}
          >
            {/* Avatar */}
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: 'var(--radius-full)',
                background: '#0066cc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: '#fff',
                fontSize: '28px',
                fontWeight: 600,
                boxShadow: '0 4px 20px rgba(0, 102, 204, 0.3)',
              }}
            >
              {initial}
            </div>

            <h1 className="typography-display-lg" style={{ marginBottom: '8px' }}>
              {user.display_name || user.username}
            </h1>

            <span
              style={{
                display: 'inline-block',
                padding: '4px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: roleColor,
                background: `${roleColor}18`,
                borderRadius: 'var(--radius-pill)',
              }}
            >
              {roleName}
            </span>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section style={{ maxWidth: '740px', margin: '0 auto', padding: '0 var(--spacing-lg) 80px' }}>
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          {/* Info Card */}
          <motion.div
            variants={fadeInUp}
            style={{
              background: 'var(--color-canvas)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px 32px',
              border: '1px solid var(--color-hairline)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <h2 className="typography-tagline" style={{ marginBottom: '20px', fontSize: '20px' }}>
              个人信息
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
              <InfoField label="用户名" value={user.username} />
              <InfoField label="邮箱" value={user.email || '未设置'} />
              <InfoField label="手机号" value={user.phone || '未设置'} />
              <InfoField label="角色" value={roleName} />
            </div>
          </motion.div>

          {/* Teams Card */}
          <motion.div
            variants={fadeInUp}
            style={{
              background: 'var(--color-canvas)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px 32px',
              border: '1px solid var(--color-hairline)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <h2 className="typography-tagline" style={{ marginBottom: '20px', fontSize: '20px' }}>
              所属战队
            </h2>
            {teams.length === 0 ? (
              <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)' }}>
                你还没有加入任何战队。
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {teams.map((t, idx) => {
                  const teamRoleName = TEAM_ROLE_LABELS[t.team_role] || t.team_role;
                  const teamRoleColor = TEAM_ROLE_COLORS[t.team_role] || '#52c41a';

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-surface-pearl)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: 600,
                          }}
                        >
                          {String(t.team_id).charAt(0)}
                        </div>
                        <span
                          className="typography-body"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            window.location.href = `/teams/${t.team_id}`;
                          }}
                        >
                          战队 #{t.team_id}
                        </span>
                      </div>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          color: teamRoleColor,
                          background: `${teamRoleColor}18`,
                          borderRadius: 'var(--radius-pill)',
                        }}
                      >
                        {teamRoleName}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Password Change Card */}
          <motion.div
            variants={fadeInUp}
            style={{
              background: 'var(--color-canvas)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px 32px',
              border: '1px solid var(--color-hairline)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <h2 className="typography-tagline" style={{ marginBottom: '12px', fontSize: '20px' }}>
              安全设置
            </h2>
            <p className="typography-caption" style={{ color: 'var(--color-ink-muted-48)', marginBottom: '16px' }}>
              定期更新密码可保护你的账户安全。
            </p>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="button-secondary-pill"
              style={{ padding: '8px 20px', fontSize: '14px' }}
            >
              修改密码
            </button>
          </motion.div>
        </motion.div>
      </section>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowPasswordModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              background: 'var(--color-canvas)',
              borderRadius: 'var(--radius-lg)',
              padding: '32px',
              width: '100%',
              maxWidth: '440px',
              boxShadow: 'var(--shadow-product)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="typography-tagline" style={{ marginBottom: '24px' }}>修改密码</h2>
            <form onSubmit={handlePasswordChange}>
              <div style={{ marginBottom: '16px' }}>
                <label
                  className="typography-caption-strong"
                  style={{ display: 'block', marginBottom: '6px', color: 'var(--color-ink)' }}
                >
                  当前密码
                </label>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                  placeholder="输入当前密码"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '17px',
                    border: '1px solid var(--color-hairline)',
                    borderRadius: 'var(--radius-sm)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    background: 'var(--color-surface-pearl)',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  className="typography-caption-strong"
                  style={{ display: 'block', marginBottom: '6px', color: 'var(--color-ink)' }}
                >
                  新密码
                </label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  placeholder="输入新密码（至少6位）"
                  required
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '17px',
                    border: '1px solid var(--color-hairline)',
                    borderRadius: 'var(--radius-sm)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    background: 'var(--color-surface-pearl)',
                  }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label
                  className="typography-caption-strong"
                  style={{ display: 'block', marginBottom: '6px', color: 'var(--color-ink)' }}
                >
                  确认新密码
                </label>
                <input
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  placeholder="再次输入新密码"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '17px',
                    border: '1px solid var(--color-hairline)',
                    borderRadius: 'var(--radius-sm)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    background: 'var(--color-surface-pearl)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
                  }}
                  className="button-secondary-pill"
                >
                  取消
                </button>
                <button type="submit" className="button-primary" disabled={changing}>
                  {changing ? '修改中...' : '确认修改'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="typography-caption-strong" style={{ display: 'block', color: 'var(--color-ink-muted-48)', marginBottom: '4px' }}>
        {label}
      </span>
      <span className="typography-body">{value}</span>
    </div>
  );
}
