import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collegeApi, type College } from '../../api/colleges';

interface FormData {
  name: string;
  description: string;
}

const EMPTY_FORM: FormData = { name: '', description: '' };

export default function CollegeManagementPage() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCollege, setEditingCollege] = useState<College | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<College | null>(null);

  const loadColleges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await collegeApi.list();
      setColleges(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '加载学院数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadColleges(); }, [loadColleges]);

  const openAddModal = () => {
    setEditingCollege(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (college: College) => {
    setEditingCollege(college);
    setForm({ name: college.name, description: college.description || '' });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!form.name.trim()) { setFormError('请输入学院名称'); return; }
    setSubmitting(true);
    try {
      const data = { name: form.name.trim(), description: form.description.trim() };
      if (editingCollege) {
        await collegeApi.update(editingCollege.id, data);
      } else {
        await collegeApi.create(data);
      }
      setModalOpen(false);
      await loadColleges();
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await collegeApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      await loadColleges();
    } catch (err: any) {
      alert(err?.response?.data?.detail || '删除失败');
    }
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
              fontSize: 40, fontWeight: 600, lineHeight: 1.10, color: '#ffffff', margin: 0,
              position: 'relative', zIndex: 1,
            }}>
              学院管理
            </h1>
            <p style={{ fontSize: 17, color: 'rgba(226, 232, 240, 0.72)', letterSpacing: '-0.022em', margin: '10px 0 0 0', position: 'relative', zIndex: 1 }}>
              管理平台所属学院信息
            </p>
          </div>
          <button onClick={openAddModal} style={{ ...pillBtnPrimary, position: 'relative', zIndex: 1 }}>
            添加学院
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1180, margin: '-32px auto 0', padding: '0 24px 36px', position: 'relative', zIndex: 1 }}>
        <div className="glass-card" style={{ overflowX: 'auto', borderRadius: '24px', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <thead>
              <tr>
                <th style={thStyle}>名称</th>
                <th style={thStyle}>描述</th>
                <th style={thStyle}>创建时间</th>
                <th style={{ ...thStyle, width: 140 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ padding: 60, textAlign: 'center' }}>
                    <div style={spinnerStyle} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={4} style={{ padding: 60, textAlign: 'center' }}>
                    <p style={{ color: '#dc2626', fontSize: 14, margin: '0 0 12px 0' }}>{error}</p>
                    <button onClick={loadColleges} style={pillBtnPrimary}>重试</button>
                  </td>
                </tr>
              ) : colleges.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 60, textAlign: 'center' }}>
                    <p style={{ color: '#7a7a7a', fontSize: 15, margin: 0 }}>暂无学院数据</p>
                  </td>
                </tr>
              ) : (
                colleges.map((c) => (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    style={tableRowStyle}
                  >
                    <td style={tdStyle}>{c.name}</td>
                    <td style={{ ...tdStyle, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.description || '-'}
                    </td>
                    <td style={tdStyle}>{c.created_at ? new Date(c.created_at).toLocaleDateString('zh-CN') : '-'}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => openEditModal(c)} style={actionBtnStyle('#0066cc', true)}>编辑</button>
                        <button onClick={() => setDeleteTarget(c)} style={actionBtnStyle('#dc2626', true)}>删除</button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
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
                {editingCollege ? '编辑学院' : '添加学院'}
              </h2>

              {formError && (
                <div style={errorBoxStyle}>{formError}</div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>名称 *</label>
                  <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入学院名称" />
                </div>
                <div>
                  <label style={labelStyle}>描述</label>
                  <textarea
                    style={{ ...inputStyle, height: 100, padding: '12px 16px', borderRadius: 16, resize: 'vertical' }}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="请输入学院描述"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button onClick={() => setModalOpen(false)} style={pillBtnSecondary}>取消</button>
                <button onClick={handleSubmit} disabled={submitting} style={pillBtnPrimary}>
                  {submitting ? '提交中...' : editingCollege ? '保存' : '创建'}
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
                确定要删除学院 "{deleteTarget.name}" 吗？此操作不可撤销。
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button onClick={() => setDeleteTarget(null)} style={pillBtnSecondary}>取消</button>
                <button onClick={handleDelete} style={pillBtnDanger}>删除</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Shared Styles ── */

const pillBtnPrimary: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 9999, border: 'none',
  background: '#0066cc', color: '#ffffff',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
};

const pillBtnSecondary: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 9999,
  border: '1px solid #7a7a7a', background: 'transparent', color: '#7a7a7a',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
};

const pillBtnDanger: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 9999, border: 'none',
  background: '#dc2626', color: '#ffffff',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
};

const actionBtnStyle = (color: string, outlined: boolean): React.CSSProperties => ({
  padding: '4px 14px', borderRadius: 9999,
  border: `1px solid ${color}`,
  background: outlined ? 'transparent' : color,
  color: outlined ? color : '#ffffff',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
});

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 14px',
  fontSize: 13, fontWeight: 600, color: '#7a7a7a',
  borderBottom: '1px solid #e0e0e0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px', fontSize: 14, color: '#1d1d1f',
  borderBottom: '1px solid #f0f0f0',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  whiteSpace: 'nowrap',
};

const tableRowStyle: React.CSSProperties = {
  transition: 'background 0.1s',
};

const spinnerStyle: React.CSSProperties = {
  width: 28, height: 28, border: '3px solid #e0e0e0',
  borderTopColor: '#0066cc', borderRadius: '50%',
  animation: 'spin 0.8s linear infinite', margin: '0 auto',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
};

const modalStyle: React.CSSProperties = {
  background: '#ffffff', borderRadius: 18, padding: '28px 30px',
  width: '90%', maxWidth: 480,
  boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
};

const modalTitleStyle: React.CSSProperties = {
  margin: '0 0 20px 0', fontSize: 21, fontWeight: 600,
  color: '#1d1d1f',
  fontFamily: '"SF Pro Display", system-ui, -apple-system, sans-serif',
};

const errorBoxStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 10,
  background: 'rgba(220,38,38,0.06)', color: '#dc2626',
  fontSize: 13, marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 500,
  color: '#1d1d1f', marginBottom: 5,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 16px',
  borderRadius: 9999, border: '1px solid #e0e0e0',
  fontSize: 14, fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#1d1d1f', outline: 'none', background: '#ffffff',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
};
