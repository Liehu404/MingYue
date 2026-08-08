import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { reviewApi } from '../../api/resources';

interface Report {
  id: number;
  resource_id: number;
  reason: string;
  status: string;
  created_at: string | null;
  reporter_id: number;
  reporter?: { id: number; display_name: string } | null;
  resource?: { id: number; title: string } | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'rgba(255,204,0,0.10)', text: '#8a6d00' },
  resolved: { bg: 'rgba(52,199,89,0.08)', text: '#248a3d' },
  dismissed: { bg: 'rgba(220,38,38,0.06)', text: '#dc2626' },
};

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  resolved: '已处理',
  dismissed: '已驳回',
};

export default function ReportManagementPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reviewApi.reports();
      // The API may return reports directly or under a list key
      const data = res.data?.reports ?? res.data ?? [];
      setReports(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '加载举报数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleResolve = async (report: Report, status: 'resolved' | 'dismissed') => {
    if (!window.confirm(`确定要${status === 'resolved' ? '处理' : '驳回'}此举报吗？`)) return;
    try {
      await reviewApi.resolveReport(report.id, { status });
      await loadReports();
    } catch (err: any) {
      alert(err?.response?.data?.detail || '操作失败');
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
            举报管理
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(226, 232, 240, 0.72)', letterSpacing: '-0.022em', margin: '10px 0 0 0', position: 'relative', zIndex: 1 }}>
            Review and manage user reports
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1180, margin: '-32px auto 0', padding: '0 24px 36px', position: 'relative', zIndex: 1 }}>
        <div className="glass-card" style={{ overflowX: 'auto', borderRadius: '24px', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <thead>
              <tr>
                <th style={thStyle}>资源</th>
                <th style={thStyle}>举报原因</th>
                <th style={thStyle}>举报人</th>
                <th style={thStyle}>状态</th>
                <th style={thStyle}>日期</th>
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
                    <button onClick={loadReports} style={pillBtnPrimary}>重试</button>
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 60, textAlign: 'center' }}>
                    <p style={{ color: '#7a7a7a', fontSize: 15, margin: 0 }}>暂无举报记录</p>
                  </td>
                </tr>
              ) : (
                reports.map((r) => {
                  const statusColor = STATUS_COLORS[r.status] || STATUS_COLORS.pending;
                  return (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      style={tableRowStyle}
                    >
                      <td style={{ ...tdStyle, fontWeight: 500 }}>
                        {r.resource?.title || `资源 #${r.resource_id}`}
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.reason}
                      </td>
                      <td style={tdStyle}>{r.reporter?.display_name || '-'}</td>
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
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('zh-CN') : '-'}
                      </td>
                      <td style={tdStyle}>
                        {r.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => handleResolve(r, 'resolved')} style={actionBtn('#34c759', false)}>
                              处理
                            </button>
                            <button onClick={() => handleResolve(r, 'dismissed')} style={actionBtn('#dc2626', true)}>
                              驳回
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#7a7a7a', fontSize: 13 }}>-</span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
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
