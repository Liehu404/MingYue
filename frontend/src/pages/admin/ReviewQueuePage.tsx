import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { reviewApi } from '../../api/resources';

interface PendingResource {
  id: number;
  title: string;
  resource_type: string;
  status: string;
  urge_count: number;
  uploader?: { id: number; display_name: string } | null;
  created_at: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'rgba(255,204,0,0.10)', text: '#8a6d00' },
  approved: { bg: 'rgba(52,199,89,0.08)', text: '#248a3d' },
  rejected: { bg: 'rgba(220,38,38,0.06)', text: '#dc2626' },
  submitted: { bg: 'rgba(0,102,204,0.08)', text: '#0066cc' },
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  submitted: '已提交',
};

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  document: '文档',
  video: '视频',
  image: '图片',
  link: '链接',
  other: '其他',
};

export default function ReviewQueuePage() {
  const [resources, setResources] = useState<PendingResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review action modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<PendingResource | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewComment, setReviewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reviewApi.pending();
      // The API may return resources directly or under a list key
      const data = res.data?.resources ?? res.data ?? [];
      setResources(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '加载审核队列失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  const openReviewModal = (resource: PendingResource, decision: 'approved' | 'rejected') => {
    setReviewTarget(resource);
    setReviewDecision(decision);
    setReviewComment('');
    setReviewError(null);
    setReviewModalOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!reviewTarget) return;
    setReviewError(null);
    setSubmitting(true);
    try {
      await reviewApi.submit({
        resource_id: reviewTarget.id,
        decision: reviewDecision,
        comment: reviewComment.trim() || undefined,
      });
      setReviewModalOpen(false);
      await loadPending();
    } catch (err: any) {
      setReviewError(err?.response?.data?.detail || err?.message || '操作失败');
    } finally {
      setSubmitting(false);
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
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h1 style={{
            fontFamily: '"SF Pro Display", system-ui, -apple-system, sans-serif',
            fontSize: 40, fontWeight: 600, lineHeight: 1.10, color: '#ffffff', margin: 0,
            position: 'relative', zIndex: 1,
          }}>
            审核队列
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(226, 232, 240, 0.72)', letterSpacing: '-0.022em', margin: '10px 0 0 0', position: 'relative', zIndex: 1 }}>
            Review resources submitted by users
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1180, margin: '-32px auto 0', padding: '0 24px 36px', position: 'relative', zIndex: 1 }}>
        <div className="glass-card" style={{ overflowX: 'auto', borderRadius: '24px', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <thead>
              <tr>
                <th style={thStyle}>资源标题</th>
                <th style={thStyle}>上传者</th>
                <th style={thStyle}>类型</th>
                <th style={thStyle}>状态</th>
                <th style={thStyle}>催审</th>
                <th style={{ ...thStyle, width: 180 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 60, textAlign: 'center' }}>
                    <div style={spinnerStyle} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} style={{ padding: 60, textAlign: 'center' }}>
                    <p style={{ color: '#dc2626', fontSize: 14, margin: '0 0 12px 0' }}>{error}</p>
                    <button onClick={loadPending} style={pillBtnPrimary}>重试</button>
                  </td>
                </tr>
              ) : resources.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 60, textAlign: 'center' }}>
                    <p style={{ color: '#7a7a7a', fontSize: 15, margin: 0 }}>暂无待审核资源</p>
                  </td>
                </tr>
              ) : (
                resources.map((r) => {
                  const statusColor = STATUS_COLORS[r.status] || STATUS_COLORS.pending;
                  return (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      style={tableRowStyle}
                    >
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{r.title}</td>
                      <td style={tdStyle}>{r.uploader?.display_name || '-'}</td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
                          fontSize: 11, fontWeight: 500,
                          background: 'rgba(0,0,0,0.04)', color: '#7a7a7a',
                        }}>
                          {RESOURCE_TYPE_LABELS[r.resource_type] || r.resource_type}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 9999,
                          fontSize: 12, fontWeight: 500,
                          background: statusColor.bg, color: statusColor.text,
                        }}>
                          {STATUS_LABELS[r.status] || r.status}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {r.urge_count > 0 ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 22, height: 22, borderRadius: '50%',
                            background: '#ff3b30', color: '#fff', fontSize: 12, fontWeight: 600,
                          }}>
                            {r.urge_count}
                          </span>
                        ) : (
                          <span style={{ color: '#7a7a7a', fontSize: 13 }}>0</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => openReviewModal(r, 'approved')} style={actionBtn('#34c759', false)}>
                            通过
                          </button>
                          <button onClick={() => openReviewModal(r, 'rejected')} style={actionBtn('#dc2626', true)}>
                            驳回
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Action Modal */}
      <AnimatePresence>
        {reviewModalOpen && reviewTarget && (
          <div style={overlayStyle} onClick={() => setReviewModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25 }}
              style={modalStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={modalTitleStyle}>
                {reviewDecision === 'approved' ? '通过资源' : '驳回资源'}
              </h2>
              <p style={{ fontSize: 14, color: '#7a7a7a', margin: '0 0 16px 0', fontFamily: 'system-ui, sans-serif' }}>
                资源: {reviewTarget.title}
              </p>

              {reviewError && <div style={errorBoxStyle}>{reviewError}</div>}

              <div>
                <label style={labelStyle}>审核意见 ({reviewDecision === 'approved' ? '可选' : '必填'})</label>
                <textarea
                  style={{
                    width: '100%', height: 120, padding: '12px 16px',
                    borderRadius: 16, border: '1px solid #e0e0e0',
                    fontSize: 14, fontFamily: 'system-ui, -apple-system, sans-serif',
                    color: '#1d1d1f', outline: 'none', background: '#ffffff',
                    resize: 'vertical', boxSizing: 'border-box',
                  }}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={
                    reviewDecision === 'approved'
                      ? '通过理由（可选）...'
                      : '请填写驳回原因...'
                  }
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button onClick={() => setReviewModalOpen(false)} style={pillBtnSecondary}>取消</button>
                <button
                  onClick={handleSubmitReview}
                  disabled={submitting || (reviewDecision === 'rejected' && !reviewComment.trim())}
                  style={{
                    ...pillBtnPrimary,
                    opacity: submitting || (reviewDecision === 'rejected' && !reviewComment.trim()) ? 0.5 : 1,
                    background: reviewDecision === 'approved' ? '#34c759' : '#dc2626',
                  }}
                >
                  {submitting ? '提交中...' : reviewDecision === 'approved' ? '确认通过' : '确认驳回'}
                </button>
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
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const pillBtnSecondary: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 9999, border: '1px solid #7a7a7a',
  background: 'transparent', color: '#7a7a7a',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const actionBtn = (color: string, outlined: boolean): React.CSSProperties => ({
  padding: '4px 14px', borderRadius: 9999,
  border: `1px solid ${color}`,
  background: outlined ? 'transparent' : color,
  color: outlined ? color : '#ffffff',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
});

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 14px',
  fontSize: 13, fontWeight: 600, color: '#7a7a7a',
  borderBottom: '1px solid #e0e0e0',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px', fontSize: 14, color: '#1d1d1f',
  borderBottom: '1px solid #f0f0f0',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const tableRowStyle: React.CSSProperties = { transition: 'background 0.1s' };

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
  margin: '0 0 4px 0', fontSize: 21, fontWeight: 600,
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
