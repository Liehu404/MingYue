import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { resourceApi } from '../../api/resources';
import { teamApi, type Team } from '../../api/teams';
import { partitionApi, type Partition } from '../../api/partitions';
import { useAuth } from '../../contexts/AuthContext';

type ResourceType = 'video' | 'image' | 'document' | 'table' | 'link';
type Visibility = 'public' | 'team_only';

const RESOURCE_TYPES: { value: ResourceType; label: string; icon: string }[] = [
  { value: 'video', label: '视频', icon: 'M17.25 16.25h-10.5a2.25 2.25 0 01-2.25-2.25v-7.5A2.25 2.25 0 016.75 4.25h10.5a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25zm-8.625-2.25l4.875-3.375-4.875-3.375v6.75z' },
  { value: 'image', label: '图片', icon: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z' },
  { value: 'document', label: '文档', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z' },
  { value: 'table', label: '表格', icon: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5a1.125 1.125 0 001.125-1.125m-8.625 0V5.25m0 13.125h17.25m-17.25 0a1.125 1.125 0 001.125 1.125M16.5 19.5h4.125m0 0A1.125 1.125 0 0021.75 18.375M21.75 13.5V5.25m0 13.125h-5.25m5.25 0a1.125 1.125 0 01-1.125 1.125M3.375 5.25a1.125 1.125 0 011.125-1.125h15a1.125 1.125 0 011.125 1.125M3.375 5.25h4.5A1.125 1.125 0 019 6.375v1.5m0 0a1.125 1.125 0 001.125 1.125h3.75A1.125 1.125 0 0015 7.875v-1.5a1.125 1.125 0 00-1.125-1.125h-3.75A1.125 1.125 0 009 6.375v1.5zm-7.5 12.375h17.25' },
  { value: 'link', label: '链接', icon: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244' },
];

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

export default function UploadPage() {
  const navigate = useNavigate();
  useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('document');
  const [teamId, setTeamId] = useState<number | ''>('');
  const [partitionId, setPartitionId] = useState<number | ''>('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [externalUrl, setExternalUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [flatPartitions, setFlatPartitions] = useState<{ id: number; name: string; depth: number }[]>([]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [, setUploadProgress] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [teamsRes, treeRes] = await Promise.all([
          teamApi.list(),
          partitionApi.tree(),
        ]);
        setTeams(teamsRes.data);
        setFlatPartitions(flattenPartitions(treeRes.data));
      } catch {
        setError('加载表单数据失败，请刷新重试');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) { setError('请输入资源标题'); return; }
    if (!teamId) { setError('请选择所属团队'); return; }
    if (resourceType !== 'link' && !selectedFile) { setError('请选择上传文件'); return; }
    if (resourceType === 'link' && !externalUrl.trim()) { setError('请输入外部链接地址'); return; }

    setSubmitting(true);
    try {
      let filePath = '';
      if (resourceType !== 'link' && selectedFile) {
        setUploading(true);
        const uploadRes = await resourceApi.upload(selectedFile);
        setUploading(false);
        filePath = uploadRes.data.file_path || uploadRes.data.path || '';
      }

      const createRes = await resourceApi.create({
        title: title.trim(),
        description: description.trim(),
        resource_type: resourceType,
        team_id: teamId,
        partition_id: partitionId || null,
        visibility,
        file_path: filePath || undefined,
        external_url: resourceType === 'link' ? externalUrl.trim() : undefined,
      });

      setCreatedId(createRes.data.id);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '上传失败，请重试');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!createdId) return;
    try {
      await resourceApi.submit(createdId);
      navigate('/my-resources');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '提交审核失败');
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setResourceType('document');
    setTeamId('');
    setPartitionId('');
    setVisibility('public');
    setExternalUrl('');
    setSelectedFile(null);
    setSuccess(false);
    setCreatedId(null);
    setError('');
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div style={{ background: 'var(--color-parchment)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
        >
          <div style={{
            width: '36px', height: '36px', borderRadius: '50%',
            border: '3px solid var(--color-hairline)',
            borderTopColor: 'var(--color-primary)',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p className="typography-caption" style={{ color: 'var(--color-ink-muted-48)' }}>加载中...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-parchment)', minHeight: '100vh', paddingBottom: '80px' }}>
      {/* Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #07111e 0%, #0f172a 55%, #111827 100%)',
        padding: '56px 36px 44px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
      }}>
        <div className="bg-mesh-dark" />
        <div className="bg-dots" />
        <div className="shimmer-line" />
        <div style={{ maxWidth: '980px', margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 style={{
              fontFamily: "'SF Pro Display', system-ui, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
              fontSize: '40px', fontWeight: 600, lineHeight: 1.1, letterSpacing: 0,
              marginBottom: '8px', color: '#ffffff', position: 'relative', zIndex: 1,
            }}>
              上传资源
            </h1>
            <p style={{
              fontFamily: "'SF Pro Text', system-ui, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
              fontSize: '21px', fontWeight: 400, lineHeight: 1.19, letterSpacing: '0.231px',
              color: 'rgba(226, 232, 240, 0.74)',
              position: 'relative',
              zIndex: 1,
            }}>
              分享你的学术资料
            </p>
          </motion.div>
        </div>
      </div>

      {/* Form */}
      <div style={{ maxWidth: '980px', margin: '40px auto 0', padding: '0 24px' }}>
        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              style={{
                background: 'rgba(255, 255, 255, 0.78)',
                backdropFilter: 'blur(22px) saturate(180%)',
                WebkitBackdropFilter: 'blur(22px) saturate(180%)',
                borderRadius: '24px',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                padding: '48px 36px', textAlign: 'center',
                boxShadow: '0 24px 64px rgba(6, 11, 24, 0.10)',
              }}
            >
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 style={{
                fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
                fontSize: '28px', fontWeight: 600, lineHeight: 1.14, letterSpacing: '0.196px',
                marginBottom: '12px', color: 'var(--color-ink)',
              }}>
                资源上传成功
              </h2>
              <p style={{
                fontSize: '17px', lineHeight: 1.47, color: 'var(--color-ink-muted-48)',
                marginBottom: '32px',
              }}>
                你的资源已保存为草稿。提交审核后将对所有人可见。
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSubmitForReview}
                  style={{
                    background: 'var(--color-primary)', color: '#fff', border: 'none',
                    borderRadius: '9999px', padding: '12px 28px', fontSize: '17px', fontWeight: 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  提交审核
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={resetForm}
                  style={{
                    background: 'transparent', color: 'var(--color-primary)',
                    border: '1px solid var(--color-primary)', borderRadius: '9999px',
                    padding: '12px 28px', fontSize: '17px', fontWeight: 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  继续上传
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate('/my-resources')}
                  style={{
                    background: 'transparent', color: 'var(--color-ink-muted-48)',
                    border: 'none', borderRadius: '9999px',
                    padding: '12px 28px', fontSize: '17px', fontWeight: 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  查看我的资源
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              onSubmit={handleSubmit}
              style={{
                background: 'rgba(255, 255, 255, 0.78)',
                backdropFilter: 'blur(22px) saturate(180%)',
                WebkitBackdropFilter: 'blur(22px) saturate(180%)',
                borderRadius: '24px',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                padding: '36px',
                boxShadow: '0 24px 64px rgba(6, 11, 24, 0.10)',
              }}
            >
              {/* Title */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)',
                  marginBottom: '8px', letterSpacing: '-0.224px',
                }}>
                  资源标题
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="输入资源标题，例如：高等数学期末复习笔记"
                  style={{
                    width: '100%', padding: '12px 16px', fontSize: '17px', fontWeight: 400,
                    fontFamily: 'inherit', color: 'var(--color-ink)',
                    border: '1px solid var(--color-hairline)', borderRadius: '11px',
                    background: 'var(--color-canvas)', outline: 'none',
                    letterSpacing: '-0.374px', lineHeight: 1.47,
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--color-primary)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--color-hairline)'; }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)',
                  marginBottom: '8px', letterSpacing: '-0.224px',
                }}>
                  资源描述
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="详细描述资源内容，帮助其他用户了解"
                  rows={4}
                  style={{
                    width: '100%', padding: '12px 16px', fontSize: '17px', fontWeight: 400,
                    fontFamily: 'inherit', color: 'var(--color-ink)',
                    border: '1px solid var(--color-hairline)', borderRadius: '11px',
                    background: 'var(--color-canvas)', outline: 'none', resize: 'vertical',
                    letterSpacing: '-0.374px', lineHeight: 1.47, minHeight: '100px',
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--color-primary)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--color-hairline)'; }}
                />
              </div>

              {/* Resource Type */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)',
                  marginBottom: '12px', letterSpacing: '-0.224px',
                }}>
                  资源类型
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {RESOURCE_TYPES.map(t => (
                    <motion.button
                      key={t.value}
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setResourceType(t.value)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '10px 20px', borderRadius: '9999px', border: '1px solid',
                        borderColor: resourceType === t.value ? 'var(--color-primary)' : 'var(--color-hairline)',
                        background: resourceType === t.value ? 'var(--color-primary)' : 'transparent',
                        color: resourceType === t.value ? '#fff' : 'var(--color-ink)',
                        fontSize: '15px', fontWeight: 400, cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'all 0.2s ease',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d={t.icon} />
                      </svg>
                      {t.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Team & Partition Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                {/* Team Selector */}
                <div>
                  <label style={{
                    display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)',
                    marginBottom: '8px', letterSpacing: '-0.224px',
                  }}>
                    所属团队
                  </label>
                  <select
                    value={teamId}
                    onChange={e => setTeamId(e.target.value ? Number(e.target.value) : '')}
                    style={{
                      width: '100%', padding: '12px 16px', fontSize: '17px', fontWeight: 400,
                      fontFamily: 'inherit', color: 'var(--color-ink)',
                      border: '1px solid var(--color-hairline)', borderRadius: '11px',
                      background: 'var(--color-canvas)', outline: 'none', cursor: 'pointer',
                      appearance: 'none', WebkitAppearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5l5 5 5-5' stroke='%237a7a7a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center',
                      paddingRight: '40px',
                    }}
                  >
                    <option value="">选择团队</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Partition Selector */}
                <div>
                  <label style={{
                    display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)',
                    marginBottom: '8px', letterSpacing: '-0.224px',
                  }}>
                    所属分区
                  </label>
                  <select
                    value={partitionId}
                    onChange={e => setPartitionId(e.target.value ? Number(e.target.value) : '')}
                    style={{
                      width: '100%', padding: '12px 16px', fontSize: '17px', fontWeight: 400,
                      fontFamily: 'inherit', color: 'var(--color-ink)',
                      border: '1px solid var(--color-hairline)', borderRadius: '11px',
                      background: 'var(--color-canvas)', outline: 'none', cursor: 'pointer',
                      appearance: 'none', WebkitAppearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5l5 5 5-5' stroke='%237a7a7a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center',
                      paddingRight: '40px',
                    }}
                  >
                    <option value="">不选择分区（可选）</option>
                    {flatPartitions.map(p => (
                      <option key={p.id} value={p.id}>
                        {'  '.repeat(p.depth)}{p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Visibility Toggle */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)',
                  marginBottom: '12px', letterSpacing: '-0.224px',
                }}>
                  可见范围
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { value: 'public' as Visibility, label: '公开', desc: '所有人可见' },
                    { value: 'team_only' as Visibility, label: '仅团队', desc: '仅团队成员可见' },
                  ].map(opt => (
                    <motion.button
                      key={opt.value}
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setVisibility(opt.value)}
                      style={{
                        flex: 1, padding: '14px 20px', borderRadius: '11px',
                        border: '1px solid',
                        borderColor: visibility === opt.value ? 'var(--color-primary)' : 'var(--color-hairline)',
                        background: visibility === opt.value ? 'rgba(0,102,204,0.05)' : 'var(--color-canvas)',
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{
                        fontSize: '15px', fontWeight: 600, color: visibility === opt.value ? 'var(--color-primary)' : 'var(--color-ink)',
                        marginBottom: '2px',
                      }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--color-ink-muted-48)' }}>
                        {opt.desc}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* File Upload or External URL */}
              {resourceType === 'link' ? (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)',
                    marginBottom: '8px', letterSpacing: '-0.224px',
                  }}>
                    外部链接
                  </label>
                  <input
                    type="url"
                    value={externalUrl}
                    onChange={e => setExternalUrl(e.target.value)}
                    placeholder="https://example.com/resource"
                    style={{
                      width: '100%', padding: '12px 16px', fontSize: '17px', fontWeight: 400,
                      fontFamily: 'inherit', color: 'var(--color-ink)',
                      border: '1px solid var(--color-hairline)', borderRadius: '11px',
                      background: 'var(--color-canvas)', outline: 'none',
                      letterSpacing: '-0.374px', lineHeight: 1.47,
                      transition: 'border-color 0.15s ease',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--color-primary)'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--color-hairline)'; }}
                  />
                </div>
              ) : (
                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)',
                    marginBottom: '8px', letterSpacing: '-0.224px',
                  }}>
                    上传文件
                  </label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      height: '200px', borderRadius: '11px',
                      border: `2px dashed ${isDragging ? 'var(--color-primary)' : 'var(--color-hairline)'}`,
                      background: isDragging ? 'rgba(0,102,204,0.04)' : 'var(--color-surface-pearl)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                    />
                    {selectedFile ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{ textAlign: 'center' }}
                      >
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)"
                          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                          style={{ marginBottom: '12px' }}>
                          <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--color-ink)', marginBottom: '4px' }}>
                          {selectedFile.name}
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--color-ink-muted-48)' }}>
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={e => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                          style={{
                            marginTop: '12px', background: 'transparent', border: 'none',
                            color: 'var(--color-ink-muted-48)', fontSize: '13px', cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          移除文件
                        </motion.button>
                      </motion.div>
                    ) : (
                      <>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted-48)"
                          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                          style={{ marginBottom: '12px' }}>
                          <path d="M12 5v14m-7-7h14" />
                        </svg>
                        <p style={{ fontSize: '15px', color: 'var(--color-ink-muted-48)', marginBottom: '4px' }}>
                          拖拽文件到此处或点击选择
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--color-ink-muted-48)' }}>
                          支持 PDF、Word、PPT、图片、视频等格式
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{
                      background: '#fef2f2', border: '1px solid #fecaca',
                      borderRadius: '11px', padding: '12px 16px', marginBottom: '24px',
                      color: '#dc2626', fontSize: '14px',
                    }}
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Upload Progress */}
              <AnimatePresence>
                {uploading && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ marginBottom: '24px' }}
                  >
                    <div style={{
                      height: '4px', background: 'var(--color-hairline)',
                      borderRadius: '2px', overflow: 'hidden',
                    }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '60%' }}
                        transition={{ duration: 0.6, repeat: Infinity, repeatType: 'mirror' }}
                        style={{
                          height: '100%', background: 'var(--color-primary)',
                          borderRadius: '2px',
                        }}
                      />
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--color-ink-muted-48)', marginTop: '8px', textAlign: 'center' }}>
                      正在上传文件...
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit Button */}
              <motion.button
                type="submit"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                disabled={submitting}
                style={{
                  width: '100%', padding: '14px 24px', borderRadius: '9999px',
                  border: 'none', background: 'var(--color-primary)', color: '#fff',
                  fontSize: '17px', fontWeight: 400, fontFamily: 'inherit',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.7 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                {submitting ? '上传中...' : '上传资源'}
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
