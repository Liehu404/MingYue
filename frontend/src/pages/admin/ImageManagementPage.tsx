import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import client from '../../api/client';

interface UploadedImage {
  id: string;
  url: string;
  name: string;
  size: number;
  uploadedAt: string;
}

const IMG_STORAGE = 'mingyue_bg_images';
const ZONE_STORAGE = 'mingyue_bg_zones';

const PAGE_ZONES: { key: string; label: string; description: string }[] = [
  { key: 'dashboard-hero', label: '首页 Hero 区域', description: '欢迎页顶部主视觉背景' },
  { key: 'dashboard-stats', label: '首页统计栏', description: '数据统计横条背景' },
  { key: 'dashboard-resource', label: '首页资源板块', description: '海量学术资源深色区域' },
  { key: 'dashboard-team', label: '首页战队板块', description: '协作无间浅色区域' },
  { key: 'resources-hero', label: '资源列表页 Hero', description: '全部资源页面顶部' },
  { key: 'team-hero', label: '战队详情页 Hero', description: '战队详情页顶部横幅' },
];

function loadStoredImages(): UploadedImage[] {
  try {
    return JSON.parse(localStorage.getItem(IMG_STORAGE) || '[]');
  } catch { return []; }
}
function saveStoredImages(imgs: UploadedImage[]) {
  localStorage.setItem(IMG_STORAGE, JSON.stringify(imgs));
}

function loadZoneMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ZONE_STORAGE) || '{}');
  } catch { return {}; }
}
function saveZoneMap(map: Record<string, string>) {
  localStorage.setItem(ZONE_STORAGE, JSON.stringify(map));
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function ImageManagementPage() {
  const [images, setImages] = useState<UploadedImage[]>(loadStoredImages);
  const [zoneMap, setZoneMap] = useState<Record<string, string>>(loadZoneMap);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<UploadedImage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UploadedImage | null>(null);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'gallery' | 'assign'>('gallery');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveStoredImages(images); }, [images]);
  useEffect(() => { saveZoneMap(zoneMap); }, [zoneMap]);

  const doUpload = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await client.post('/resources/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      let raw = res.data?.url || res.data?.file_path || res.data?.path || (typeof res.data === 'string' ? res.data : '');
      if (!raw) throw new Error('服务器未返回图片地址');
      // Normalize URL: backend returns "temp/xxx.jpg", nginx serves at /uploads/
      raw = String(raw);
      if (!raw.startsWith('http') && !raw.startsWith('/')) {
        raw = '/uploads/' + raw;
      }
      const url = raw;
      const img: UploadedImage = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        url: String(url),
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };
      setImages((prev) => [img, ...prev]);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || err?.message || '上传失败，请重试';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files).forEach(doUpload);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const copyUrl = async (img: UploadedImage) => {
    try {
      await navigator.clipboard.writeText(img.url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = img.url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopyId(img.id);
    setTimeout(() => setCopyId(null), 1800);
  };

  const deleteImg = (img: UploadedImage) => {
    setImages((prev) => prev.filter((i) => i.id !== img.id));
    setZoneMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k] === img.url) delete next[k]; });
      return next;
    });
    setDeleteTarget(null);
  };

  const assignZone = (zoneKey: string, url: string) => {
    setZoneMap((prev) => ({ ...prev, [zoneKey]: url }));
  };

  const clearZone = (zoneKey: string) => {
    setZoneMap((prev) => {
      const next = { ...prev };
      delete next[zoneKey];
      return next;
    });
  };

  const assignedCount = Object.values(zoneMap).filter(Boolean).length;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {/* Banner */}
      <div style={{ background: '#ffffff', padding: '44px 36px 36px', borderBottom: '1px solid #e0e0e0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 className="typography-display-lg text-shadow-soft" style={{ margin: '0 0 8px 0', color: '#1d1d1f' }}>
              图片素材管理
            </h1>
            <p style={{ fontSize: 17, color: '#7a7a7a', margin: 0 }}>
              上传图片素材，并指定各页面的背景配图
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#7a7a7a' }}>
              已配置 {assignedCount}/{PAGE_ZONES.length} 个区域
            </span>
            <button
              onClick={() => { fileRef.current?.click(); }}
              style={pillPrimary}
              disabled={uploading}
            >
              {uploading ? '上传中...' : '上传图片'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid #e0e0e0',
          marginBottom: 28, position: 'sticky', top: 44, zIndex: 100,
          background: 'rgba(245,245,247,0.85)', backdropFilter: 'blur(12px)',
        }}>
          {[
            { key: 'gallery' as const, label: '图片库' },
            { key: 'assign' as const, label: '区域配置' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '14px 28px', fontSize: 16, fontWeight: activeTab === t.key ? 600 : 400,
                color: activeTab === t.key ? '#1d1d1f' : '#7a7a7a',
                borderBottom: activeTab === t.key ? '2px solid #0066cc' : '2px solid transparent',
                background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1,
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Error banner */}
        <AnimatePresence>
          {uploadError && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={errBanner}>
              <span>{uploadError}</span>
              <button onClick={() => setUploadError(null)} style={dismissBtn}>×</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Gallery Tab ─── */}
        {activeTab === 'gallery' && (
          <>
            {/* Drop Zone */}
            <motion.div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#0066cc' : '#e0e0e0'}`,
                borderRadius: 18, padding: '36px 24px', textAlign: 'center',
                cursor: 'pointer', marginBottom: 28,
                background: dragOver ? 'rgba(0,102,204,0.04)' : '#fafafc',
                transition: 'all 0.2s ease',
              }}
            >
              {uploading ? (
                <div>
                  <div style={spinner} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  <p style={{ fontSize: 15, color: '#7a7a7a', marginTop: 12 }}>正在上传...</p>
                </div>
              ) : (
                <div>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(0,102,204,0.08)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0066cc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p style={{ fontSize: 17, fontWeight: 500, color: '#1d1d1f', marginBottom: 4 }}>
                    拖拽图片到此处上传
                  </p>
                  <p style={{ fontSize: 13, color: '#7a7a7a' }}>
                    或点击选择 · JPG / PNG / WebP / SVG
                  </p>
                </div>
              )}
            </motion.div>

            {/* Image Grid */}
            {images.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c0c0c0" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <p style={{ fontSize: 17, color: '#7a7a7a', margin: 0 }}>暂无图片，请上传</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20, paddingBottom: 40 }}>
                <AnimatePresence>
                  {images.map((img) => (
                    <motion.div
                      key={img.id}
                      layout
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.25 }}
                      className="glass-card"
                      style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                    >
                      {/* Thumbnail */}
                      <div
                        onClick={() => setPreviewImg(img)}
                        style={{
                          width: '100%', height: 170, cursor: 'zoom-in',
                          background: `url(${img.url}) center/cover no-repeat`,
                          borderBottom: '1px solid #e0e0e0',
                          position: 'relative',
                        }}
                      >
                        <div style={{
                          position: 'absolute', inset: 0,
                          background: 'transparent', transition: 'background 0.2s',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.12)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff"
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                            style={{ opacity: 0, transition: 'opacity 0.2s', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
                            className="img-zoom-icon">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                          </svg>
                          <style>{`.img-zoom-icon { opacity: 0; } *:hover > .img-zoom-icon { opacity: 1; }`}</style>
                        </div>
                      </div>

                      {/* Info */}
                      <div style={{ padding: '12px 16px', flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1d1d1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={img.name}>
                          {img.name}
                        </div>
                        <div style={{ fontSize: 12, color: '#7a7a7a', marginTop: 4, display: 'flex', gap: 12 }}>
                          <span>{fmtSize(img.size)}</span>
                          <span>{new Date(img.uploadedAt).toLocaleDateString('zh-CN')}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', borderTop: '1px solid #e0e0e0' }}>
                        <button onClick={() => copyUrl(img)}
                          style={copyId === img.id ? {...actBtn, color: '#059669'} : actBtn}>
                          {copyId === img.id ? '已复制 ✓' : '复制链接'}
                        </button>
                        <div style={{ width: 1, background: '#e0e0e0' }} />
                        <button onClick={() => setDeleteTarget(img)} style={{ ...actBtn, color: '#dc2626' }}>
                          删除
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {images.length > 0 && (
              <div style={{ padding: '10px 14px', marginBottom: 32, background: '#f5f5f7', borderRadius: 12, fontSize: 13, color: '#7a7a7a', textAlign: 'center' }}>
                共 {images.length} 张 · {fmtSize(images.reduce((s, i) => s + i.size, 0))}
              </div>
            )}
          </>
        )}

        {/* ─── Assign Tab ─── */}
        {activeTab === 'assign' && (
          <div style={{ paddingBottom: 60 }}>
            <p style={{ fontSize: 15, color: '#7a7a7a', margin: '0 0 24px 0' }}>
              为页面各区域指定背景图片。未指定时使用默认设计背景。
            </p>

            {images.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '48px', borderRadius: 18,
                border: '1px solid #f0d8a0', background: '#fffdf0',
              }}>
                <p style={{ fontSize: 15, color: '#ad8b00', margin: 0 }}>
                  请先在"图片库"中上传图片，再进行区域配置
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {PAGE_ZONES.map((zone) => {
                  const currentUrl = zoneMap[zone.key];
                  const currentImg = images.find((i) => i.url === currentUrl);
                  return (
                    <motion.div
                      key={zone.key}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-card"
                      style={{ padding: '20px 24px', display: 'flex', alignItems: 'flex-start', gap: 20 }}
                    >
                      {/* Current preview or placeholder */}
                      <div style={{
                        width: 100, height: 64, borderRadius: 10, flexShrink: 0,
                        background: currentImg
                          ? `url(${currentImg.url}) center/cover no-repeat`
                          : 'linear-gradient(135deg, #e8e8ed 0%, #f5f5f7 100%)',
                        border: currentImg ? 'none' : '1px dashed #c0c0c0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden',
                      }}>
                        {!currentImg && (
                          <span style={{ fontSize: 11, color: '#999' }}>默认</span>
                        )}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 17, fontWeight: 600, color: '#1d1d1f', marginBottom: 4 }}>
                          {zone.label}
                        </div>
                        <div style={{ fontSize: 13, color: '#7a7a7a', marginBottom: 10 }}>
                          {zone.description}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          {/* Image selector: show small thumbnails */}
                          {images.slice(0, 8).map((img) => (
                            <div
                              key={img.id}
                              onClick={() => assignZone(zone.key, img.url)}
                              title={img.name}
                              style={{
                                width: 48, height: 48, borderRadius: 8, cursor: 'pointer',
                                background: `url(${img.url}) center/cover no-repeat`,
                                border: currentUrl === img.url ? '2px solid #0066cc' : '2px solid #e0e0e0',
                                flexShrink: 0, transition: 'border-color 0.15s, transform 0.15s',
                                transform: currentUrl === img.url ? 'scale(1.08)' : 'scale(1)',
                              }}
                            />
                          ))}
                          {images.length > 8 && (
                            <span style={{ fontSize: 12, color: '#7a7a7a' }}>+{images.length - 8} 更多</span>
                          )}
                          {currentUrl && (
                            <button onClick={() => clearZone(zone.key)}
                              style={{
                                marginLeft: 8, padding: '4px 12px', borderRadius: 9999,
                                border: '1px solid #dc2626', background: 'transparent',
                                color: '#dc2626', fontSize: 12, cursor: 'pointer',
                                fontFamily: 'inherit', whiteSpace: 'nowrap',
                              }}>
                              恢复默认
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewImg && (
          <div style={overlay} onClick={() => setPreviewImg(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
              style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.35)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <img src={previewImg.url} alt={previewImg.name}
                style={{ maxWidth: '100%', maxHeight: '82vh', display: 'block' }} />
              <div style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(12px)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff', fontSize: 13 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 16 }}>
                  {previewImg.name} · {fmtSize(previewImg.size)}
                </span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => copyUrl(previewImg)} style={pvBtn}>{copyId === previewImg.id ? '已复制' : '复制链接'}</button>
                  <button onClick={() => setPreviewImg(null)} style={pvClose}>关闭</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteTarget && (
          <div style={overlay} onClick={() => setDeleteTarget(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25 }}
              style={modalBox}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={modalTitle}>确认删除</h2>
              <p style={{ fontSize: 15, color: '#1d1d1f', margin: '0 0 20px 0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                确定要删除 "{deleteTarget.name}" 吗？此操作仅移除本地上传记录，不影响服务器上已引用的文件。
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button onClick={() => setDeleteTarget(null)} style={pillSecondary}>取消</button>
                <button onClick={() => deleteImg(deleteTarget)} style={pillDanger}>删除</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── shared styles ── */

const pillPrimary: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 9999, border: 'none',
  background: '#0066cc', color: '#fff',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const pillSecondary: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 9999,
  border: '1px solid #7a7a7a', background: 'transparent', color: '#7a7a7a',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const pillDanger: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 9999, border: 'none',
  background: '#dc2626', color: '#fff',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const actBtn: React.CSSProperties = {
  flex: 1, padding: '10px 0', border: 'none', background: 'transparent',
  color: '#0066cc', fontSize: 12, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif', transition: 'color 0.15s',
};

const spinner: React.CSSProperties = {
  width: 28, height: 28, border: '3px solid #e0e0e0',
  borderTopColor: '#0066cc', borderRadius: '50%',
  animation: 'spin 0.8s linear infinite', margin: '0 auto',
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
};

const modalBox: React.CSSProperties = {
  background: '#fff', borderRadius: 18, padding: '28px 30px',
  width: '90%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
};

const modalTitle: React.CSSProperties = {
  margin: '0 0 20px 0', fontSize: 21, fontWeight: 600, color: '#1d1d1f',
  fontFamily: '"SF Pro Display", system-ui, -apple-system, sans-serif',
};

const errBanner: React.CSSProperties = {
  padding: '12px 16px', marginBottom: 20, borderRadius: 12,
  background: 'rgba(220,38,38,0.06)', color: '#dc2626', fontSize: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};

const dismissBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#dc2626', fontSize: 22,
  cursor: 'pointer', padding: '0 4px', lineHeight: 1,
};

const pvBtn: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 9999,
  border: '1px solid rgba(255,255,255,0.4)', background: 'transparent',
  color: '#fff', fontSize: 12, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const pvClose: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 9999,
  border: 'none', background: 'rgba(255,255,255,0.2)',
  color: '#fff', fontSize: 12, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};
