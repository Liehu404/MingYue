import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { resourceApi, type Resource } from '../../api/resources';
import { usePageBackground } from '../../hooks/usePageBackground';
import { normalizeFilePath } from '../../utils/path';
import { partitionApi, type Partition } from '../../api/partitions';
import resourceGallery from '../../assets/illustrations/resource-gallery.svg';

const TYPE_TABS = [
  { key: '', label: '全部' },
  { key: 'video', label: '视频' },
  { key: 'image', label: '图片' },
  { key: 'document', label: '文档' },
  { key: 'table', label: '表格' },
  { key: 'link', label: '链接' },
];

const TYPE_LABELS: Record<string, string> = {
  video: '视频', image: '图片', document: '文档', table: '表格', link: '链接',
};

function flattenPartitions(partitions: Partition[], depth = 0): { id: number; name: string; depth: number }[] {
  const result: { id: number; name: string; depth: number }[] = [];
  for (const p of partitions) {
    result.push({ id: p.id, name: p.name, depth });
    if (p.children && p.children.length > 0) {
      result.push(...flattenPartitions(p.children, depth + 1));
    }
  }
  return result;
}

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } }
};

export default function ResourceListPage() {
  const heroBg = usePageBackground('resources-hero');
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeType, setActiveType] = useState('');
  const [partitionId, setPartitionId] = useState<number | ''>('');
  const [flatPartitions, setFlatPartitions] = useState<{ id: number; name: string; depth: number }[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');

  const PAGE_SIZE = 12;

  const fetchResources = useCallback(async (pageNum: number, append: boolean) => {
    if (pageNum === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError('');
    try {
      const params: Record<string, unknown> = {
        page: pageNum,
        per_page: PAGE_SIZE,
      };
      if (search.trim()) params.search = search.trim();
      if (activeType) params.resource_type = activeType;
      if (partitionId) params.partition_id = partitionId;

      const res = await resourceApi.list(params);
      const data = res.data;
      if (append) {
        setResources(prev => [...prev, ...data]);
      } else {
        setResources(data);
      }
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      setError('加载资源失败，请重试');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, activeType, partitionId]);

  useEffect(() => {
    setPage(1);
    fetchResources(1, false);
  }, [fetchResources]);

  useEffect(() => {
    partitionApi.tree().then(res => {
      setFlatPartitions(flattenPartitions(res.data));
    }).catch(() => { });
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleTypeChange = (type: string) => {
    setActiveType(type);
    setPage(1);
  };

  const handlePartitionChange = (id: number | '') => {
    setPartitionId(id);
    setPage(1);
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchResources(nextPage, true);
  };

  const formatDate = (d: string | null) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div style={{
      background: heroBg ? `url(${heroBg}) center/cover no-repeat` : 'var(--color-parchment)',
      minHeight: '100vh', padding: '60px 0', position: 'relative', overflow: 'hidden',
    }}>
      <div className="bg-grid-subtle" />
      <div className="tile-content" style={{ position: 'relative', zIndex: 1 }}>
        {/* Banner */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="typography-display-lg text-shadow-elevated" style={{ marginBottom: '12px' }}>全部资源。</h1>
          <p className="typography-lead" style={{ color: 'var(--color-ink-muted-48)', marginBottom: '40px' }}>
            浏览我们整理好的学术库，找寻你所需要的知识。
          </p>
          <motion.div
            className="resource-banner"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <img src={resourceGallery} alt="资源展示视觉" className="resource-banner-img" />
          </motion.div>
        </motion.div>

        {/* Search & Filters */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass-card"
          style={{ width: '100%', maxWidth: '720px', marginBottom: '32px', padding: '24px' }}
        >
          {/* Search Bar */}
          <form onSubmit={handleSearch} style={{ position: 'relative', marginBottom: '20px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted-48)"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="搜索资源..."
              style={{
                width: '100%', padding: '12px 16px 12px 44px', fontSize: '17px', fontWeight: 400,
                fontFamily: 'inherit', color: 'var(--color-ink)',
                border: '1px solid var(--color-hairline)', borderRadius: '9999px',
                background: 'var(--color-canvas)', outline: 'none',
                letterSpacing: '-0.374px', lineHeight: 1.47,
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                boxShadow: 'var(--shadow-soft)',
              }}
              onFocus={e => {
                e.target.style.borderColor = 'var(--color-primary)';
                e.target.style.boxShadow = '0 0 0 3px rgba(0,102,204,0.15)';
              }}
              onBlur={e => {
                e.target.style.borderColor = 'var(--color-hairline)';
                e.target.style.boxShadow = 'var(--shadow-soft)';
              }}
            />
          </form>

          {/* Type Filter Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {TYPE_TABS.map(tab => (
              <motion.button
                key={tab.key}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleTypeChange(tab.key)}
                style={{
                  padding: '8px 20px', borderRadius: '9999px', border: 'none',
                  background: activeType === tab.key ? 'var(--color-ink)' : 'var(--color-surface-chip)',
                  color: activeType === tab.key ? '#fff' : 'var(--color-ink-muted-80)',
                  fontSize: '14px', fontWeight: 400, cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab.label}
              </motion.button>
            ))}
          </div>

          {/* Partition Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-ink-muted-48)', whiteSpace: 'nowrap', fontWeight: 400 }}>
              分区筛选:
            </span>
            <select
              value={partitionId}
              onChange={e => handlePartitionChange(e.target.value ? Number(e.target.value) : '')}
              style={{
                padding: '8px 16px', fontSize: '14px', fontWeight: 400,
                fontFamily: 'inherit', color: 'var(--color-ink)',
                border: '1px solid var(--color-hairline)', borderRadius: '9999px',
                background: 'var(--color-canvas)', outline: 'none', cursor: 'pointer',
                appearance: 'none', WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%237a7a7a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
                paddingRight: '36px', maxWidth: '280px',
              }}
            >
              <option value="">全部分区</option>
              {flatPartitions.map(p => (
                <option key={p.id} value={p.id}>
                  {'  '.repeat(p.depth)}{p.name}
                </option>
              ))}
            </select>
          </div>
        </motion.div>

        {/* Resource Grid */}
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
                  width: '100%', height: '160px', borderRadius: '11px',
                  background: 'var(--color-parchment)', marginBottom: '16px',
                }} />
                <div style={{
                  width: '50px', height: '12px', borderRadius: '6px',
                  background: 'var(--color-hairline)', marginBottom: '12px',
                }} />
                <div style={{
                  width: '75%', height: '21px', borderRadius: '6px',
                  background: 'var(--color-parchment)', marginBottom: '8px',
                }} />
                <div style={{
                  width: '45%', height: '14px', borderRadius: '7px',
                  background: 'var(--color-parchment)', marginBottom: '16px',
                }} />
                <div style={{
                  width: '60%', height: '14px', borderRadius: '7px',
                  background: 'var(--color-parchment)',
                }} />
              </div>
            ))}
          </motion.div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ textAlign: 'center', padding: '60px 24px' }}
          >
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted-48)"
              strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
              style={{ marginBottom: '20px' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p style={{ fontSize: '17px', color: 'var(--color-ink-muted-48)', marginBottom: '12px' }}>{error}</p>
            <button onClick={() => fetchResources(1, false)} className="button-primary" style={{ fontFamily: 'inherit' }}>
              重试
            </button>
          </motion.div>
        ) : resources.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ textAlign: 'center', padding: '80px 24px' }}
          >
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted-48)"
              strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
              style={{ marginBottom: '24px' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <h3 style={{
              fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
              fontSize: '24px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-ink)',
            }}>
              未找到资源
            </h3>
            <p style={{ fontSize: '17px', color: 'var(--color-ink-muted-48)', marginBottom: '24px' }}>
              尝试调整搜索条件或筛选器
            </p>
            <button
              onClick={() => { setSearchInput(''); setSearch(''); setActiveType(''); setPartitionId(''); }}
              className="button-primary" style={{ fontFamily: 'inherit' }}>
              清除所有筛选
            </button>
          </motion.div>
        ) : (
          <>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeType}-${partitionId}-${search}-${page}`}
                className="store-utility-grid"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                style={{ padding: 0 }}
              >
                {resources.map(res => {
                  const typeLabel = TYPE_LABELS[res.resource_type] || res.resource_type;
                  return (
                    <motion.div key={res.id} variants={fadeInUp}>
                      <Link to={`/resources/${res.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                        <div className="store-utility-card resource-card">
                          <div className="resource-card-glow" />
                          {/* Thumbnail / Preview */}
                          <div className="resource-card-media" style={{
                            width: '100%', height: '170px', borderRadius: '11px',
                            background: res.thumbnail_path
                              ? `url(${normalizeFilePath(res.thumbnail_path)}) center/cover no-repeat`
                              : res.resource_type === 'video'
                                ? 'linear-gradient(135deg, #1d1d1f 0%, #3a3a3c 100%)'
                                : res.resource_type === 'image'
                                  ? 'linear-gradient(135deg, #e8f0fe 0%, #d2e3fc 100%)'
                                  : 'linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 100%)',
                            marginBottom: '16px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden',
                          }}>
                            {!res.thumbnail_path && (
                              <div style={{ textAlign: 'center' }}>
                                {res.resource_type === 'video' ? (
                                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)"
                                    strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="5 3 19 12 5 21 5 3" fill="rgba(255,255,255,0.15)" />
                                  </svg>
                                ) : res.resource_type === 'image' ? (
                                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted-48)"
                                    strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                  </svg>
                                ) : res.resource_type === 'link' ? (
                                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted-48)"
                                    strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                                  </svg>
                                ) : (
                                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted-48)"
                                    strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
                                    <polyline points="14 2 14 8 20 8" />
                                  </svg>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Type Tag */}
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '8px' }}>
                            {typeLabel}
                          </div>

                          {/* Title */}
                          <h3 className="text-shadow-card" style={{
                            fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
                            fontSize: '21px', fontWeight: 600, letterSpacing: '0.231px',
                            marginBottom: '8px', color: 'var(--color-ink)',
                            lineHeight: 1.19, overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {res.title}
                          </h3>

                          {/* Meta Row */}
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '16px',
                            fontSize: '13px', color: 'var(--color-ink-muted-48)',
                            marginBottom: '16px', flexWrap: 'wrap',
                          }}>
                            {res.uploader && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                                  <circle cx="12" cy="7" r="4" />
                                </svg>
                                {res.uploader.display_name}
                              </span>
                            )}
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                              </svg>
                              {res.like_count}
                            </span>
                            <span>{formatDate(res.created_at)}</span>
                          </div>

                          {/* View Link */}
                          <div className="text-link" style={{ fontSize: '14px' }}>
                            查看详情 <span>&rsaquo;</span>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>

            {/* Load More */}
            {hasMore && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                style={{ marginTop: '32px', textAlign: 'center' }}
              >
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{
                    padding: '14px 36px', borderRadius: '9999px',
                    border: '1px solid var(--color-hairline)',
                    background: 'var(--color-canvas)', color: 'var(--color-ink)',
                    fontSize: '17px', fontWeight: 400, cursor: 'pointer',
                    fontFamily: 'inherit', transition: 'all 0.2s ease',
                    boxShadow: 'var(--shadow-soft)',
                  }}
                >
                  {loadingMore ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        width: '16px', height: '16px', borderRadius: '50%',
                        border: '2px solid var(--color-hairline)',
                        borderTopColor: 'var(--color-primary)',
                        animation: 'spin 0.6s linear infinite',
                        display: 'inline-block',
                      }} />
                      加载中...
                    </span>
                  ) : (
                    '加载更多'
                  )}
                </motion.button>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
