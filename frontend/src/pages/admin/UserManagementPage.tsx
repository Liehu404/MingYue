import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { userApi, type User } from '../../api/users';
import { collegeApi, type College } from '../../api/colleges';

const ROLE_OPTIONS = [
  { label: '超级管理员', value: 'super_admin' },
  { label: '管理员', value: 'admin' },
  { label: '教师', value: 'teacher' },
  { label: '学生', value: 'student' },
];

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  super_admin: { bg: 'rgba(0,102,204,0.08)', text: '#0066cc' },
  admin: { bg: 'rgba(88,86,214,0.08)', text: '#5856d6' },
  teacher: { bg: 'rgba(255,149,0,0.08)', text: '#cc7000' },
  student: { bg: 'rgba(52,199,89,0.08)', text: '#248a3d' },
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  teacher: '教师',
  student: '学生',
};

interface FormData {
  username: string;
  display_name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  college_id: number | null;
}

const EMPTY_FORM: FormData = {
  username: '',
  display_name: '',
  email: '',
  phone: '',
  password: '',
  role: 'student',
  college_id: null,
};

export default function UserManagementPage() {
  const [activeTab, setActiveTab] = useState<'active' | 'pending'>('active');
  const [users, setUsers] = useState<User[]>([]);
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colleges, setColleges] = useState<College[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeRes, pendingRes, collegesRes] = await Promise.all([
        userApi.list({ is_active: true }),
        userApi.list({ is_active: false }),
        collegeApi.list(),
      ]);
      setUsers(activeRes.data || []);
      setPendingUsers(pendingRes.data || []);
      setColleges(collegesRes.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '加载用户数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openAddModal = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setForm({
      username: user.username || '',
      display_name: user.display_name || '',
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      role: user.role || 'student',
      college_id: user.college_id ?? null,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!form.username.trim()) { setFormError('请输入用户名'); return; }
    if (!form.email.trim()) { setFormError('请输入邮箱'); return; }
    if (!editingUser && !form.password.trim()) { setFormError('请输入密码'); return; }

    setSubmitting(true);
    try {
      const data: Record<string, unknown> = {
        username: form.username.trim(),
        display_name: form.display_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: form.role,
        college_id: form.college_id,
      };
      if (form.password.trim()) {
        data.password = form.password.trim();
      }
      if (data.college_id === null || data.college_id === undefined || (typeof data.college_id === 'string' && (data.college_id as string) === '')) {
        delete data.college_id;
      }

      if (editingUser) {
        await userApi.update(editingUser.id, data);
      } else {
        await userApi.create(data);
      }
      setModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (user: User) => {
    try {
      await userApi.approve(user.id);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || '审核失败');
    }
  };

  const handleDeactivate = async (user: User) => {
    if (!window.confirm(`确定要停用用户 "${user.display_name || user.username}" 吗？`)) return;
    try {
      await userApi.update(user.id, { is_active: false });
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || '操作失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await userApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || '删除失败');
    }
  };

  const displayedUsers = activeTab === 'active' ? users : pendingUsers;

  const getTableContent = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan={7} style={{ padding: 60, textAlign: 'center' }}>
            <div style={{
              width: 28, height: 28, border: '3px solid #e0e0e0',
              borderTopColor: '#0066cc', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </td>
        </tr>
      );
    }

    if (error) {
      return (
        <tr>
          <td colSpan={7} style={{ padding: 60, textAlign: 'center' }}>
            <p style={{ color: '#dc2626', fontSize: 14, margin: '0 0 12px 0' }}>{error}</p>
            <button onClick={loadData} style={pillButtonStyle('#0066cc')}>重试</button>
          </td>
        </tr>
      );
    }

    if (displayedUsers.length === 0) {
      return (
        <tr>
          <td colSpan={7} style={{ padding: 60, textAlign: 'center' }}>
            <p style={{ color: '#7a7a7a', fontSize: 15, margin: 0 }}>
              {activeTab === 'active' ? '暂无已激活用户' : '暂无待审核用户'}
            </p>
          </td>
        </tr>
      );
    }

    return displayedUsers.map((user) => {
      const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.student;
      return (
        <motion.tr
          key={user.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          style={tableRowStyle}
        >
          <td style={tdStyle}>{user.username}</td>
          <td style={tdStyle}>{user.display_name || '-'}</td>
          <td style={tdStyle}>{user.email || '-'}</td>
          <td style={tdStyle}>{user.phone || '-'}</td>
          <td style={tdStyle}>
            <span style={{
              display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
              fontSize: 12, fontWeight: 600,
              background: roleColor.bg, color: roleColor.text,
            }}>
              {ROLE_LABELS[user.role] || user.role}
            </span>
          </td>
          <td style={tdStyle}>
            <span style={{
              fontSize: 13, color: user.is_active ? '#34c759' : '#ff3b30',
            }}>
              {user.is_active ? '已激活' : '待审核'}
            </span>
          </td>
          <td style={tdStyle}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => openEditModal(user)} style={actionBtnStyle('#0066cc', true)}>
                编辑
              </button>
              {activeTab === 'pending' ? (
                <button onClick={() => handleApprove(user)} style={actionBtnStyle('#34c759', false)}>
                  通过
                </button>
              ) : (
                <button onClick={() => handleDeactivate(user)} style={actionBtnStyle('#ff9500', true)}>
                  停用
                </button>
              )}
              <button onClick={() => setDeleteTarget(user)} style={actionBtnStyle('#dc2626', true)}>
                删除
              </button>
            </div>
          </td>
        </motion.tr>
      );
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #07111e 0%, #0f172a 52%, #111827 100%)',
        padding: '56px 36px 76px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
      }}>
        <div className="bg-mesh-dark" />
        <div className="bg-dots" />
        <div className="shimmer-line" />
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{
              fontFamily: '"SF Pro Display", system-ui, -apple-system, sans-serif',
              fontSize: 40, fontWeight: 600, lineHeight: 1.10, color: '#1d1d1f', margin: 0,
              position: 'relative', zIndex: 1,
            }}>
              用户管理
            </h1>
            <p style={{ fontSize: 17, color: 'rgba(226, 232, 240, 0.72)', letterSpacing: '-0.022em', margin: '10px 0 0 0', position: 'relative', zIndex: 1 }}>
              管理平台所有注册用户
            </p>
          </div>
          <button onClick={openAddModal} style={{ ...pillButtonStyle('#0066cc'), position: 'relative', zIndex: 1 }}>
            添加用户
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1180, margin: '-32px auto 0', padding: '0 24px 36px', position: 'relative', zIndex: 1 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #e0e0e0' }}>
          <button
            onClick={() => setActiveTab('active')}
            style={{
              padding: '10px 24px',
              fontSize: 15,
              fontWeight: activeTab === 'active' ? 600 : 400,
              color: activeTab === 'active' ? '#1d1d1f' : '#7a7a7a',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'active' ? '2px solid #0066cc' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              transition: 'color 0.15s',
            }}
          >
            已激活用户
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              padding: '10px 24px',
              fontSize: 15,
              fontWeight: activeTab === 'pending' ? 600 : 400,
              color: activeTab === 'pending' ? '#1d1d1f' : '#7a7a7a',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === 'pending' ? '2px solid #0066cc' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              transition: 'color 0.15s',
            }}
          >
            待审核用户 ({pendingUsers.length})
          </button>
        </div>

        {/* Table */}
        <div className="glass-card" style={{ overflowX: 'auto', borderRadius: '24px', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <thead>
              <tr>
                {['用户名', '显示名', '邮箱', '手机', '角色', '状态', '操作'].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {getTableContent()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div style={overlayStyle} onClick={() => setModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25 }}
              style={modalStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={modalTitleStyle}>
                {editingUser ? '编辑用户' : '添加用户'}
              </h2>

              {formError && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,0.06)', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>用户名 *</label>
                  <input style={inputStyle} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="请输入用户名" />
                </div>
                <div>
                  <label style={labelStyle}>显示名</label>
                  <input style={inputStyle} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="请输入显示名称" />
                </div>
                <div>
                  <label style={labelStyle}>邮箱 *</label>
                  <input style={inputStyle} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="请输入邮箱" />
                </div>
                <div>
                  <label style={labelStyle}>手机号</label>
                  <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="请输入手机号" />
                </div>
                <div>
                  <label style={labelStyle}>{editingUser ? '新密码 (留空不修改)' : '密码 *'}</label>
                  <input style={inputStyle} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editingUser ? '留空则不修改密码' : '请输入密码'} />
                </div>
                <div>
                  <label style={labelStyle}>角色</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>所属学院</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.college_id ?? ''} onChange={(e) => setForm({ ...form, college_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">不限</option>
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button onClick={() => setModalOpen(false)} style={pillButtonStyle('#7a7a7a')}>
                  取消
                </button>
                <button onClick={handleSubmit} disabled={submitting} style={pillButtonStyle('#0066cc', false)}>
                  {submitting ? '提交中...' : editingUser ? '保存' : '创建'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <div style={overlayStyle} onClick={() => setDeleteTarget(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25 }}
              style={modalStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={modalTitleStyle}>确认删除</h2>
              <p style={{ fontSize: 15, color: '#1d1d1f', margin: '0 0 20px 0', fontFamily: 'system-ui, sans-serif' }}>
                确定要删除用户 "{deleteTarget.display_name || deleteTarget.username}" 吗？此操作不可撤销。
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button onClick={() => setDeleteTarget(null)} style={pillButtonStyle('#7a7a7a')}>取消</button>
                <button onClick={handleDelete} style={pillButtonStyle('#dc2626', false)}>删除</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Shared Styles ── */

const pillButtonStyle = (color: string, outlined = false): React.CSSProperties => ({
  padding: '9px 22px',
  borderRadius: 9999,
  border: `1px solid ${outlined ? color : 'transparent'}`,
  background: outlined ? 'transparent' : color,
  color: outlined ? color : '#ffffff',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  transition: 'opacity 0.15s',
  whiteSpace: 'nowrap',
});

const actionBtnStyle = (color: string, outlined: boolean): React.CSSProperties => ({
  padding: '4px 14px',
  borderRadius: 9999,
  border: `1px solid ${color}`,
  background: outlined ? 'transparent' : color,
  color: outlined ? color : '#ffffff',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
});

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  fontSize: 13,
  fontWeight: 600,
  color: '#7a7a7a',
  borderBottom: '1px solid #e0e0e0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 14,
  color: '#1d1d1f',
  borderBottom: '1px solid #f0f0f0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
};

const tableRowStyle: React.CSSProperties = {
  transition: 'background 0.1s',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.35)',
  backdropFilter: 'blur(4px)',
};

const modalStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 18,
  padding: '28px 30px',
  width: '90%',
  maxWidth: 480,
  boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
};

const modalTitleStyle: React.CSSProperties = {
  margin: '0 0 20px 0',
  fontSize: 21,
  fontWeight: 600,
  color: '#1d1d1f',
  fontFamily: '"SF Pro Display", system-ui, -apple-system, sans-serif',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#1d1d1f',
  marginBottom: 5,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 44,
  padding: '0 16px',
  borderRadius: 9999,
  border: '1px solid #e0e0e0',
  fontSize: 14,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#1d1d1f',
  outline: 'none',
  background: '#ffffff',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};
