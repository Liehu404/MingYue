import { useState, useEffect, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { teamApi, type Team } from '../../api/teams';
import { useAuth } from '../../contexts/AuthContext';

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] } },
};

export default function TeamListPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', category: '', tags: '' });
  const [creating, setCreating] = useState(false);

  const canCreate = user && (user.role === 'super_admin' || user.role === 'advisor');

  const loadTeams = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await teamApi.list();
      setTeams(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || '加载战队列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTeams(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    try {
      setCreating(true);
      await teamApi.create({
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        category: createForm.category.trim(),
        tags: createForm.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .join(','),
      });
      setShowCreate(false);
      setCreateForm({ name: '', description: '', category: '', tags: '' });
      await loadTeams();
    } catch (err: any) {
      alert(err?.response?.data?.message || '创建战队失败');
    } finally {
      setCreating(false);
    }
  };

  const memberCount = (t: Team) => t.members?.length ?? 0;

  const tagsArray = (t: Team) =>
    t.tags
      ? t.tags.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

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
            <h1 className="typography-display-lg" style={{ marginBottom: '12px' }}>
              战队
            </h1>
            <p className="typography-lead" style={{ color: 'var(--color-ink-muted-48)', maxWidth: '600px', margin: '0 auto' }}>
              加入一个学术战队，与志同道合的伙伴协作共进。发现项目、分享资源、共同成长。
            </p>
          </motion.div>

          {canCreate && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              style={{ marginTop: '32px' }}
            >
              <button
                onClick={() => setShowCreate(true)}
                className="button-primary"
              >
                创建战队
              </button>
            </motion.div>
          )}
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: '0 0 80px 0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)' }}>
              加载中...
            </p>
          </div>
        ) : error ? (
          <div className="tile-content">
            <div
              style={{
                background: 'var(--color-canvas)',
                borderRadius: 'var(--radius-lg)',
                padding: '48px',
                textAlign: 'center',
                border: '1px solid var(--color-hairline)',
              }}
            >
              <p className="typography-body" style={{ color: '#cc0000', marginBottom: '16px' }}>
                {error}
              </p>
              <button onClick={loadTeams} className="button-primary">
                重试
              </button>
            </div>
          </div>
        ) : teams.length === 0 ? (
          <div className="tile-content">
            <div
              style={{
                background: 'var(--color-canvas)',
                borderRadius: 'var(--radius-lg)',
                padding: '64px 48px',
                textAlign: 'center',
                border: '1px solid var(--color-hairline)',
              }}
            >
              <h2 className="typography-display-md" style={{ marginBottom: '12px', color: 'var(--color-ink-muted-48)' }}>
                暂无战队
              </h2>
              <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)', marginBottom: '24px' }}>
                目前还没有创建任何战队。{canCreate ? '点击下方按钮创建第一个战队。' : '请等待管理员创建战队。'}
              </p>
              {canCreate && (
                <button onClick={() => setShowCreate(true)} className="button-primary">
                  创建第一个战队
                </button>
              )}
            </div>
          </div>
        ) : (
          <motion.div
            className="store-utility-grid"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            style={{ paddingTop: '8px' }}
          >
            {teams.map((team) => (
              <motion.div key={team.id} variants={fadeInUp}>
                <Link to={`/teams/${team.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                  <div className="store-utility-card">
                    {/* Category tag */}
                    {team.category && (
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--color-primary)',
                          marginBottom: '10px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        {team.category}
                      </div>
                    )}

                    {/* Team name */}
                    <h3
                      className="typography-body-strong"
                      style={{ fontSize: '21px', marginBottom: '8px' }}
                    >
                      {team.name}
                    </h3>

                    {/* Description */}
                    <p
                      className="typography-caption"
                      style={{
                        color: 'var(--color-ink-muted-48)',
                        marginBottom: '16px',
                        minHeight: '40px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {team.description || '暂无简介'}
                    </p>

                    {/* Tags */}
                    {tagsArray(team).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                        {tagsArray(team).slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-block',
                              padding: '3px 10px',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: 'var(--color-ink-muted-80)',
                              background: 'var(--color-surface-chip)',
                              borderRadius: 'var(--radius-pill)',
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                        {tagsArray(team).length > 4 && (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 10px',
                              fontSize: '12px',
                              color: 'var(--color-ink-muted-48)',
                            }}
                          >
                            +{tagsArray(team).length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Member count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--color-primary)',
                        }}
                      />
                      <span className="typography-caption" style={{ color: 'var(--color-ink-muted-48)' }}>
                        {memberCount(team)} 名成员
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>

      {/* Create Team Modal */}
      {showCreate && (
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
          onClick={() => setShowCreate(false)}
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
              maxWidth: '480px',
              boxShadow: 'var(--shadow-product)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="typography-tagline" style={{ marginBottom: '24px' }}>
              创建战队
            </h2>
            <form onSubmit={handleCreate}>
              <div style={{ marginBottom: '16px' }}>
                <label
                  className="typography-caption-strong"
                  style={{ display: 'block', marginBottom: '6px', color: 'var(--color-ink)' }}
                >
                  战队名称
                </label>
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="输入战队名称"
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
                  简介
                </label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="简要描述战队的方向与目标"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '17px',
                    border: '1px solid var(--color-hairline)',
                    borderRadius: 'var(--radius-sm)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    background: 'var(--color-surface-pearl)',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  className="typography-caption-strong"
                  style={{ display: 'block', marginBottom: '6px', color: 'var(--color-ink)' }}
                >
                  类别
                </label>
                <input
                  value={createForm.category}
                  onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                  placeholder="例如: 计算机科学、数学建模"
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
                  标签（用逗号分隔）
                </label>
                <input
                  value={createForm.tags}
                  onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })}
                  placeholder="例如: 机器学习, 系统设计, CS"
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
                  onClick={() => setShowCreate(false)}
                  className="button-secondary-pill"
                >
                  取消
                </button>
                <button type="submit" className="button-primary" disabled={creating}>
                  {creating ? '创建中...' : '创建战队'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
