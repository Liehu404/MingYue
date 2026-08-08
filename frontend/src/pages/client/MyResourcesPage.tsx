import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { resourceApi, type Resource } from '../../api/resources';

type FilterTab = 'all' | 'draft' | 'pending' | 'published' | 'rejected';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'pending', label: '审核中' },
  { key: 'published', label: '已发布' },
  { key: 'rejected', label: '已拒绝' },
];

const TYPE_LABELS: Record<string, string> = {
  video: '视频', image: '图片', document: '文档', table: '表格', link: '链接',
};

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', pending: '审核中', published: '已发布', rejected: '已拒绝',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#f0f0f0', text: '#6b7280' },
  pending: { bg: '#fef9c3', text: '#a16207' },
  published: { bg: '#dcfce7', text: '#166534' },
  rejected: { bg: '#fef2f2', text: '#dc2626' },
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: '公开', team_only: '仅团队',
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export default function MyResourcesPage() {
  const navigate = useNavigate();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { my: 1 };
      if (activeTab !== 'all') {
        params.status = activeTab;
      }
      const res = await resourceApi.list(params);
      setResources(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchResources(); }, [activeTab]);

  const handleSubmitReview = async (id: number) => {
    setActionLoading(id);
    try {
      await resourceApi.submit(id);
      await fetchResources();
    } catch {
      /* ignore */
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await resourceApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      await fetchResources();
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const filteredResources = resources;

  return (
    <div style={{ background: 'var(--color-parchment)', minHeight: '100vh', paddingBottom: '80px' }}>
      {/* Banner */}
      <div style={{ background: 'var(--color-canvas)', padding: '48px 36px 40px', borderBottom: '1px solid var(--color-hairline)' }}>
        <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 style={{
              fontFamily: "'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
              fontSize: '40px', fontWeight: 600, lineHeight: 1.1, letterSpacing: 0,
              marginBottom: '8px', color: 'var(--color-ink)',
            }}>
              我的资源
            </h1>
            <p style={{
              fontFamily: "'SF Pro Text', system-ui, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
              fontSize: '21px', fontWeight: 400, lineHeight: 1.19, letterSpacing: '0.231px',
              color: 'var(--color-ink-muted-48)',
            }}>
              管理你上传的学术资料
            </p>
          </motion.div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '0 24px' }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          style={{
            display: 'flex', gap: '8px', padding: '24px 0',
            borderBottom: '1px solid var(--color-hairline)', overflowX: 'auto',
          }}
        >
          {TABS.map(tab => (
            <motion.button
              key={tab.key}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '8px 20px', borderRadius: '9999px', border: 'none',
                background: activeTab === tab.key ? 'var(--color-ink)' : 'transparent',
                color: activeTab === tab.key ? '#fff' : 'var(--color-ink-muted-80)',
                fontSize: '14px', fontWeight: 400, cursor: 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
              }}
            >
              {tab.label}
            </motion.button>
          ))}
        </motion.div>
      </div>

      {/* Resource Grid or Empty/Loading */}
      <div style={{ maxWidth: '1440px', margin: '32px auto 0', padding: '0 24px' }}>
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="store-utility-grid" style={{ padding: 0 }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                background: 'var(--color-canvas)', borderRadius: '18px',
                border: '1px solid var(--color-hairline)', padding: '24px',
              }}>
                <div style={{
                  width: '60px', height: '14px', borderRadius: '7px',
                  background: 'var(--color-hairline)', marginBottom: '16px',
                }} />
                <div style={{
                  width: '80%', height: '21px', borderRadius: '6px',
                  background: 'var(--color-parchment)', marginBottom: '12px',
                }} />
                <div style={{
                  width: '60%', height: '14px', borderRadius: '7px',
                  background: 'var(--color-parchment)', marginBottom: '24px',
                }} />
                <div style={{
                  width: '100%', height: '36px', borderRadius: '18px',
                  background: 'var(--color-parchment)',
                }} />
              </div>
            ))}
          </motion.div>
        ) : filteredResources.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ textAlign: 'center', padding: '80px 24px' }}
          >
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted-48)"
              strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
              style={{ marginBottom: '24px' }}>
              <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <h3 style={{
              fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
              fontSize: '24px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-ink)',
            }}>
              {activeTab === 'all' ? '暂无资源' : `暂无${STATUS_LABELS[activeTab]}资源`}
            </h3>
            <p style={{ fontSize: '17px', color: 'var(--color-ink-muted-48)', marginBottom: '24px' }}>
              {activeTab === 'all'
                ? '你还没有上传任何资源，开始分享你的学术资料吧'
                : '此状态下没有资源'}
            </p>
            <Link to="/upload"
              className="button-primary"
              style={{ fontFamily: 'inherit' }}>
              上传资源
            </Link>
          </motion.div>
        ) : (
          <motion.div
            className="store-utility-grid"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            style={{ padding: 0 }}
          >
            {filteredResources.map(res => {
              const typeLabel = TYPE_LABELS[res.resource_type] || res.resource_type;
              const statusStyle = STATUS_COLORS[res.status] || STATUS_COLORS.draft;
              return (
                <motion.div key={res.id} variants={fadeInUp}>
                  <div style={{
                    background: 'var(--color-canvas)', borderRadius: '18px',
                    border: '1px solid var(--color-hairline)', padding: '24px',
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    cursor: 'pointer',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
                    onClick={() => navigate(`/resources/${res.id}`)}
                  >
                    {/* Tags Row */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '9999px',
                        fontSize: '12px', fontWeight: 500,
                        background: 'var(--color-primary)', color: '#fff',
                      }}>
                        {typeLabel}
                      </span>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '9999px',
                        fontSize: '12px', fontWeight: 500,
                        background: statusStyle.bg, color: statusStyle.text,
                      }}>
                        {STATUS_LABELS[res.status] || res.status}
                      </span>
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '9999px',
                        fontSize: '12px', fontWeight: 500,
                        background: 'rgba(210,210,215,0.64)', color: 'var(--color-ink-muted-80)',
                      }}>
                        {VISIBILITY_LABELS[res.visibility] || res.visibility}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 style={{
                      fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
                      fontSize: '21px', fontWeight: 600, letterSpacing: '0.231px',
                      marginBottom: '8px', color: 'var(--color-ink)',
                      lineHeight: 1.19,
                    }}>
                      {res.title}
                    </h3>

                    {/* Description Preview */}
                    {res.description && (
                      <p style={{
                        fontSize: '14px', lineHeight: 1.43, color: 'var(--color-ink-muted-48)',
                        letterSpacing: '-0.224px', marginBottom: '16px',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {res.description}
                      </p>
                    )}

                    {/* Date */}
                    <p style={{ fontSize: '13px', color: 'var(--color-ink-muted-48)', marginBottom: '20px' }}>
                      {formatDate(res.created_at)}
                    </p>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(res.status === 'draft' || res.status === 'rejected') && (
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={e => { e.stopPropagation(); handleSubmitReview(res.id); }}
                          disabled={actionLoading === res.id}
                          style={{
                            flex: 1, padding: '10px 16px', borderRadius: '9999px', border: 'none',
                            background: 'var(--color-primary)', color: '#fff',
                            fontSize: '14px', fontWeight: 400, cursor: 'pointer',
                            fontFamily: 'inherit', transition: 'all 0.2s ease',
                          }}
                        >
                          {actionLoading === res.id ? '提交中...' : '提交审核'}
                        </motion.button>
                      )}
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={e => { e.stopPropagation(); setDeleteTarget(res); }}
                        style={{
                          flex: 1, padding: '10px 16px', borderRadius: '9999px',
                          border: '1px solid var(--color-hairline)',
                          background: 'transparent', color: '#dc2626',
                          fontSize: '14px', fontWeight: 400, cursor: 'pointer',
                          fontFamily: 'inherit', transition: 'all 0.2s ease',
                        }}
                      >
                        删除
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setDeleteTarget(null)}
            style={{
              position: 'fixed', inset: 0, zIndex: 2000,
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--color-canvas)', borderRadius: '18px',
                padding: '32px', maxWidth: '400px', width: '90%',
                boxShadow: 'var(--shadow-product)',
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  background: '#fef2f2', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto 16px',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <h3 style={{
                  fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
                  fontSize: '21px', fontWeight: 600, marginBottom: '8px',
                }}>
                  确认删除
                </h3>
                <p style={{ fontSize: '15px', color: 'var(--color-ink-muted-48)', lineHeight: 1.47 }}>
                  确定要删除资源<br />
                  "{deleteTarget.title}" 吗？此操作不可撤销。
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: '12px 24px', borderRadius: '9999px',
                    border: '1px solid var(--color-hairline)', background: 'transparent',
                    color: 'var(--color-ink)', fontSize: '15px', fontWeight: 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  取消
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    flex: 1, padding: '12px 24px', borderRadius: '9999px',
                    border: 'none', background: '#dc2626', color: '#fff',
                    fontSize: '15px', fontWeight: 400, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {deleting ? '删除中...' : '删除'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
