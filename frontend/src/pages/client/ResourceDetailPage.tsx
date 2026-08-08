import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { resourceApi, type Resource } from '../../api/resources';
import { useAuth } from '../../contexts/AuthContext';
import { normalizeFilePath } from '../../utils/path';

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

export default function ResourceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const isOwner = user?.id === resource?.uploader_id;
  const isLiked = resource?.likes?.some(l => l.user_id === user?.id) ?? false;
  const isUrged = resource?.urges?.some(u => u.urger_id === user?.id) ?? false;

  const fetchResource = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await resourceApi.get(Number(id));
      setResource(res.data);
    } catch {
      setError('加载资源失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchResource(); }, [id]);

  const handleLike = async () => {
    if (!resource) return;
    setActionLoading('like');
    try {
      if (isLiked) {
        await resourceApi.unlike(resource.id);
      } else {
        await resourceApi.like(resource.id);
      }
      await fetchResource();
    } catch {
      /* ignore */
    } finally {
      setActionLoading('');
    }
  };

  const handleUrge = async () => {
    if (!resource) return;
    setActionLoading('urge');
    try {
      await resourceApi.urge(resource.id);
      await fetchResource();
    } catch {
      /* ignore */
    } finally {
      setActionLoading('');
    }
  };

  const handleSubmitForReview = async () => {
    if (!resource) return;
    setActionLoading('submit');
    try {
      await resourceApi.submit(resource.id);
      await fetchResource();
    } catch {
      /* ignore */
    } finally {
      setActionLoading('');
    }
  };

  const handleReport = async () => {
    if (!resource || !reportReason.trim()) return;
    setActionLoading('report');
    try {
      await resourceApi.report(resource.id, reportReason.trim());
      setShowReportModal(false);
      setReportReason('');
    } catch {
      /* ignore */
    } finally {
      setActionLoading('');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resource || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      await resourceApi.addComment(resource.id, commentText.trim());
      setCommentText('');
      await fetchResource();
    } catch {
      /* ignore */
    } finally {
      setSubmittingComment(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div style={{ background: 'var(--color-parchment)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            border: '3px solid var(--color-hairline)', borderTopColor: 'var(--color-primary)',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p className="typography-caption" style={{ color: 'var(--color-ink-muted-48)' }}>加载中...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </motion.div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div style={{ background: 'var(--color-parchment)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '21px', color: 'var(--color-ink)', marginBottom: '16px' }}>{error || '资源未找到'}</p>
          <button onClick={() => navigate('/resources')}
            className="button-primary" style={{ fontFamily: 'inherit' }}>
            返回资源列表
          </button>
        </div>
      </div>
    );
  }

  const statusStyle = STATUS_COLORS[resource.status] || STATUS_COLORS.draft;

  return (
    <div style={{ background: 'var(--color-parchment)', minHeight: '100vh', paddingBottom: '80px' }}>
      {/* Banner */}
      <div style={{
        background: 'var(--color-canvas)', padding: '48px 36px 40px',
        borderBottom: '1px solid var(--color-hairline)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div className="bg-mesh-light" />
        <div className="bg-dots" />
        <div style={{ maxWidth: '1100px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: '9999px',
                fontSize: '13px', fontWeight: 500, letterSpacing: '-0.12px',
                background: 'var(--color-primary)', color: '#fff',
                boxShadow: '0 2px 8px rgba(0,102,204,0.25)',
              }}>
                {TYPE_LABELS[resource.resource_type] || resource.resource_type}
              </span>
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: '9999px',
                fontSize: '13px', fontWeight: 500,
                background: statusStyle.bg, color: statusStyle.text,
              }}>
                {STATUS_LABELS[resource.status] || resource.status}
              </span>
              <span style={{ fontSize: '14px', color: 'var(--color-ink-muted-48)' }}>
                {formatDate(resource.created_at)}
              </span>
            </div>
            <h1 className="typography-display-lg text-shadow-soft" style={{ color: 'var(--color-ink)' }}>
              {resource.title}
            </h1>
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1100px', margin: '32px auto 0', padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px' }}>
        {/* Left Column */}
        <div>
          {/* Resource Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
            className="glass-card"
            style={{
              padding: '24px', marginBottom: '24px',
            }}
          >
            {resource.resource_type === 'video' && resource.file_path ? (
              <div style={{ borderRadius: '11px', overflow: 'hidden', background: '#000' }}>
                <video controls style={{ width: '100%', maxHeight: '480px', display: 'block' }}
                  poster={normalizeFilePath(resource.thumbnail_path) || undefined}>
                  <source src={normalizeFilePath(resource.file_path)} />
                  您的浏览器不支持视频播放
                </video>
              </div>
            ) : resource.resource_type === 'image' ? (
              <div>
                <div style={{
                  borderRadius: '11px', overflow: 'hidden', background: 'var(--color-surface-pearl)',
                  marginBottom: resource.images && resource.images.length > 1 ? '12px' : '0',
                }}>
                  <img
                    src={normalizeFilePath(resource.images && resource.images.length > 0
                      ? resource.images[currentImageIndex].file_path
                      : resource.file_path)}
                    alt={resource.title}
                    style={{ width: '100%', maxHeight: '480px', objectFit: 'contain', display: 'block' }}
                  />
                </div>
                {resource.images && resource.images.length > 1 && (
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                    {resource.images.map((img, idx) => (
                      <motion.div
                        key={img.id}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setCurrentImageIndex(idx)}
                        style={{
                          width: '72px', height: '56px', borderRadius: '8px', overflow: 'hidden',
                          cursor: 'pointer', flexShrink: 0,
                          border: idx === currentImageIndex ? '2px solid var(--color-primary)' : '2px solid transparent',
                          opacity: idx === currentImageIndex ? 1 : 0.6,
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <img src={normalizeFilePath(img.file_path)} alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ) : resource.resource_type === 'link' && resource.external_url ? (
              <a href={resource.external_url} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '24px',
                  background: 'var(--color-surface-pearl)', borderRadius: '11px',
                  color: 'var(--color-primary)', textDecoration: 'none',
                  fontSize: '17px', fontWeight: 500,
                }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                {resource.external_url}
              </a>
            ) : resource.file_path ? (
              <a href={normalizeFilePath(resource.file_path)} target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px', padding: '24px',
                  background: 'var(--color-surface-pearl)', borderRadius: '11px',
                  color: 'var(--color-ink)', textDecoration: 'none',
                }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '12px',
                  background: 'var(--color-primary)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <p style={{ fontSize: '17px', fontWeight: 600, marginBottom: '4px' }}>下载文件</p>
                  <p style={{ fontSize: '14px', color: 'var(--color-ink-muted-48)' }}>
                    {formatFileSize(resource.file_size)}
                  </p>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </a>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-ink-muted-48)' }}>
                暂无文件内容
              </div>
            )}
          </motion.div>

          {/* Description */}
          {resource.description && (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="glass-card"
              style={{
                padding: '24px', marginBottom: '24px',
              }}
            >
              <h3 className="typography-tagline text-shadow-soft" style={{ marginBottom: '16px', color: 'var(--color-ink)' }}>
                资源描述
              </h3>
              <p style={{
                fontSize: '17px', lineHeight: 1.47, color: 'var(--color-ink-muted-80)',
                letterSpacing: '-0.374px', whiteSpace: 'pre-wrap',
              }}>
                {resource.description}
              </p>
            </motion.div>
          )}

          {/* Action Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="glass-card"
            style={{
              padding: '20px 24px', marginBottom: '24px',
              display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
            }}
          >
            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={handleLike}
              disabled={actionLoading === 'like'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', borderRadius: '9999px', border: '1px solid var(--color-hairline)',
                background: isLiked ? 'rgba(0,102,204,0.08)' : 'transparent',
                color: isLiked ? 'var(--color-primary)' : 'var(--color-ink-muted-80)',
                fontSize: '15px', fontWeight: 400, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24"
                fill={isLiked ? 'var(--color-primary)' : 'none'}
                stroke={isLiked ? 'var(--color-primary)' : 'currentColor'}
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
              {resource.like_count > 0 ? resource.like_count : '赞'}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={handleUrge}
              disabled={actionLoading === 'urge'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', borderRadius: '9999px', border: '1px solid var(--color-hairline)',
                background: isUrged ? 'rgba(245,158,11,0.08)' : 'transparent',
                color: isUrged ? '#d97706' : 'var(--color-ink-muted-80)',
                fontSize: '15px', fontWeight: 400, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              {resource.urge_count > 0 ? resource.urge_count : '催更'}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => setShowReportModal(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '10px 20px', borderRadius: '9999px', border: '1px solid var(--color-hairline)',
                background: 'transparent', color: 'var(--color-ink-muted-80)',
                fontSize: '15px', fontWeight: 400, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              举报
            </motion.button>

            {isOwner && (resource.status === 'draft' || resource.status === 'rejected') && (
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={handleSubmitForReview}
                disabled={actionLoading === 'submit'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '10px 20px', borderRadius: '9999px', border: 'none',
                  background: 'var(--color-primary)', color: '#fff',
                  fontSize: '15px', fontWeight: 400, cursor: 'pointer', fontFamily: 'inherit',
                  marginLeft: 'auto', transition: 'all 0.2s ease',
                }}
              >
                {actionLoading === 'submit' ? '提交中...' : '提交审核'}
              </motion.button>
            )}
          </motion.div>

          {/* Comments Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="glass-card"
            style={{
              padding: '24px', marginBottom: '24px',
            }}
          >
            <h3 className="typography-tagline text-shadow-soft" style={{ marginBottom: '20px', color: 'var(--color-ink)' }}>
              评论 {resource.comment_count > 0 && (
                <span style={{ fontSize: '17px', fontWeight: 400, color: 'var(--color-ink-muted-48)' }}>
                  ({resource.comment_count})
                </span>
              )}
            </h3>

            {/* Comment Form */}
            <form onSubmit={handleAddComment} style={{ marginBottom: '24px', display: 'flex', gap: '12px' }}>
              <input
                type="text"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="写下你的评论..."
                style={{
                  flex: 1, padding: '12px 16px', fontSize: '15px', fontWeight: 400,
                  fontFamily: 'inherit', color: 'var(--color-ink)',
                  border: '1px solid var(--color-hairline)', borderRadius: '9999px',
                  background: 'var(--color-surface-pearl)', outline: 'none',
                  transition: 'border-color 0.15s ease',
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--color-primary)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--color-hairline)'; }}
              />
              <motion.button
                type="submit"
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                disabled={!commentText.trim() || submittingComment}
                style={{
                  padding: '12px 24px', borderRadius: '9999px', border: 'none',
                  background: commentText.trim() ? 'var(--color-primary)' : 'var(--color-hairline)',
                  color: '#fff', fontSize: '15px', fontWeight: 400, cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background 0.2s ease',
                }}
              >
                {submittingComment ? '发送中...' : '发送'}
              </motion.button>
            </form>

            {/* Comments List */}
            {resource.comments && resource.comments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {resource.comments.map(comment => (
                  <div key={comment.id} style={{
                    padding: '16px', borderRadius: '11px',
                    background: 'var(--color-surface-pearl)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: 'var(--color-primary)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 600,
                      }}>
                        {(comment.user?.display_name || '?')[0]}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
                        {comment.user?.display_name || `用户${comment.user_id}`}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-ink-muted-48)' }}>
                        {formatDate(comment.created_at)}
                      </span>
                    </div>
                    <p style={{
                      fontSize: '15px', lineHeight: 1.47, color: 'var(--color-ink-muted-80)',
                      letterSpacing: '-0.374px',
                    }}>
                      {comment.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: 'var(--color-ink-muted-48)', fontSize: '15px', padding: '24px 0' }}>
                暂无评论，来发表第一条评论吧
              </p>
            )}
          </motion.div>

          {/* Review History */}
          {resource.reviews && resource.reviews.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="glass-card"
              style={{ padding: '24px' }}
            >
              <h3 className="typography-tagline text-shadow-soft" style={{ marginBottom: '20px', color: 'var(--color-ink)' }}>
                审核记录
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {resource.reviews.map(review => (
                  <div key={review.id} style={{
                    padding: '16px', borderRadius: '11px',
                    background: 'var(--color-surface-pearl)',
                    borderLeft: `3px solid ${review.decision === 'approved' ? '#16a34a' : review.decision === 'rejected' ? '#dc2626' : '#f59e0b'}`,
                  }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 500,
                        background: review.decision === 'approved' ? '#dcfce7' : review.decision === 'rejected' ? '#fef2f2' : '#fef9c3',
                        color: review.decision === 'approved' ? '#166534' : review.decision === 'rejected' ? '#dc2626' : '#a16207',
                      }}>
                        {review.decision === 'approved' ? '通过' : review.decision === 'rejected' ? '拒绝' : review.decision}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-ink-muted-48)' }}>
                        {formatDate(review.created_at)}
                      </span>
                    </div>
                    {review.comment && (
                      <p style={{ fontSize: '14px', color: 'var(--color-ink-muted-80)', lineHeight: 1.43 }}>
                        {review.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {/* Uploader Info */}
          <motion.div
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="glass-card"
            style={{ padding: '24px', marginBottom: '16px' }}
          >
            <h4 style={{
              fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.5px', color: 'var(--color-ink-muted-48)', marginBottom: '16px',
            }}>
              上传者
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: 'var(--color-primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: 600,
              }}>
                {(resource.uploader?.display_name || '?')[0]}
              </div>
              <div>
                <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-ink)' }}>
                  {resource.uploader?.display_name || `用户${resource.uploader_id}`}
                </p>
                {isOwner && (
                  <p style={{ fontSize: '13px', color: 'var(--color-ink-muted-48)' }}>
                    这是你的资源
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="glass-card"
            style={{ padding: '24px', marginBottom: '16px' }}
          >
            <h4 style={{
              fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.5px', color: 'var(--color-ink-muted-48)', marginBottom: '16px',
            }}>
              统计
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '28px', fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '-0.12px' }}>
                  {resource.like_count}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--color-ink-muted-48)' }}>点赞</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '28px', fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '-0.12px' }}>
                  {resource.urge_count}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--color-ink-muted-48)' }}>催更</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '28px', fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '-0.12px' }}>
                  {resource.comment_count}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--color-ink-muted-48)' }}>评论</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '28px', fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '-0.12px' }}>
                  {resource.file_size > 0 ? formatFileSize(resource.file_size) : '--'}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--color-ink-muted-48)' }}>大小</p>
              </div>
            </div>
          </motion.div>

          {/* Team Info */}
          <motion.div
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="glass-card"
            style={{ padding: '24px', marginBottom: '16px' }}
          >
            <h4 style={{
              fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.5px', color: 'var(--color-ink-muted-48)', marginBottom: '16px',
            }}>
              团队信息
            </h4>
            <p style={{ fontSize: '15px', color: 'var(--color-ink)' }}>
              团队 ID: {resource.team_id}
            </p>
            <p style={{ fontSize: '14px', color: 'var(--color-ink-muted-48)', marginTop: '4px' }}>
              可见范围: {resource.visibility === 'public' ? '公开' : '仅团队'}
            </p>
          </motion.div>

          {/* Back Link */}
          <motion.div
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <Link to="/resources"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                fontSize: '15px', color: 'var(--color-primary)', fontWeight: 400,
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              返回资源列表
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowReportModal(false)}
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
                padding: '32px', maxWidth: '440px', width: '90%',
                boxShadow: 'var(--shadow-product)',
              }}
            >
              <h3 style={{
                fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
                fontSize: '21px', fontWeight: 600, marginBottom: '16px',
              }}>
                举报资源
              </h3>
              <textarea
                value={reportReason}
                onChange={e => setReportReason(e.target.value)}
                placeholder="请描述举报原因..."
                rows={3}
                style={{
                  width: '100%', padding: '12px 16px', fontSize: '15px', fontWeight: 400,
                  fontFamily: 'inherit', color: 'var(--color-ink)',
                  border: '1px solid var(--color-hairline)', borderRadius: '11px',
                  background: 'var(--color-canvas)', outline: 'none', resize: 'vertical',
                  marginBottom: '20px',
                }}
              />
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setShowReportModal(false)}
                  style={{
                    padding: '10px 24px', borderRadius: '9999px', border: '1px solid var(--color-hairline)',
                    background: 'transparent', color: 'var(--color-ink)',
                    fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  取消
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  onClick={handleReport}
                  disabled={!reportReason.trim() || actionLoading === 'report'}
                  style={{
                    padding: '10px 24px', borderRadius: '9999px', border: 'none',
                    background: reportReason.trim() ? '#dc2626' : 'var(--color-hairline)',
                    color: '#fff', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {actionLoading === 'report' ? '提交中...' : '提交举报'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
