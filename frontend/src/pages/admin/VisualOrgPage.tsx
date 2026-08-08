import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { teamApi, type Team } from '../../api/teams';
import { collegeApi, type College } from '../../api/colleges';
import MemberTreeNode, { buildTree } from '../../components/org/MemberTreeNode';

export default function VisualOrgPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedTeams, setExpandedTeams] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const [teamsRes, collegesRes] = await Promise.all([
          teamApi.list(),
          collegeApi.list(),
        ]);
        setTeams(teamsRes.data || []);
        setColleges(collegesRes.data || []);
        // Expand all teams by default
        const ids = (teamsRes.data || []).map((t) => t.id);
        setExpandedTeams(new Set(ids));
      } catch (e: any) {
        setError(e?.response?.data?.detail || e?.message || '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const collegeMap = useMemo(() => {
    const map = new Map<number, College>();
    colleges.forEach((c) => map.set(c.id, c));
    return map;
  }, [colleges]);

  const filteredTeams = useMemo(() => {
    if (!search.trim()) return teams;
    const q = search.toLowerCase();
    return teams.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, search]);

  // Group teams by college
  const grouped = useMemo(() => {
    const map = new Map<number, Team[]>();
    filteredTeams.forEach((t) => {
      const list = map.get(t.college_id) || [];
      list.push(t);
      map.set(t.college_id, list);
    });
    return map;
  }, [filteredTeams]);

  const toggleTeam = (id: number) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div style={{ background: 'var(--color-parchment)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)' }}>加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: 'var(--color-parchment)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="typography-body" style={{ color: '#cc0000' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-parchment)', minHeight: '100vh', width: '100%' }}>
      {/* Banner */}
      <section className="product-tile-dark" style={{ paddingTop: '56px', paddingBottom: '36px', position: 'relative', overflow: 'hidden', isolation: 'isolate' }}>
        <div className="bg-mesh-dark" />
        <div className="bg-dots" />
        <div className="shimmer-line" />
        <div className="tile-content" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <h1 className="typography-display-lg text-shadow-elevated" style={{ marginBottom: '8px', color: '#ffffff' }}>
            组织架构
          </h1>
          <p className="typography-lead" style={{ color: 'rgba(226, 232, 240, 0.72)', maxWidth: '500px', margin: '0 auto' }}>
            战队成员层级关系一览
          </p>
        </div>
      </section>

      {/* Search bar */}
      <section style={{ maxWidth: '980px', margin: '0 auto', padding: '24px var(--spacing-lg)' }}>
        <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-muted-48)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索战队..."
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: '17px',
              background: 'transparent', fontFamily: 'inherit', color: 'var(--color-ink)',
            }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-muted-48)', fontSize: '18px',
            }}>
              ✕
            </button>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
          <StatChip label="战队总数" value={filteredTeams.length} />
          <StatChip label="总成员数" value={filteredTeams.reduce((s, t) => s + (t.members?.length || 0), 0)} />
          <StatChip label="学院数" value={grouped.size} />
        </div>
      </section>

      {/* Tree content */}
      <section style={{ maxWidth: '980px', margin: '0 auto', padding: '0 var(--spacing-lg) 80px' }}>
        {filteredTeams.length === 0 ? (
          <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
            <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)' }}>
              {search ? '未找到匹配的战队' : '暂无战队数据'}
            </p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([collegeId, collegeTeams]) => {
            const college = collegeMap.get(collegeId);
            return (
              <div key={collegeId} style={{ marginBottom: '32px' }}>
                {/* College header */}
                <h2 className="typography-tagline" style={{
                  marginBottom: '16px', color: 'var(--color-ink)',
                  paddingLeft: '4px',
                }}>
                  {college?.name || `学院 #${collegeId}`}
                </h2>

                {/* Teams under this college */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {collegeTeams.map((team) => {
                    const members = team.members || [];
                    const tree = buildTree(members);
                    const isExpanded = expandedTeams.has(team.id);

                    return (
                      <motion.div
                        key={team.id}
                        className="glass-card"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        style={{ overflow: 'hidden' }}
                      >
                        {/* Team header bar */}
                        <div
                          onClick={() => toggleTeam(team.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '12px',
                            padding: '16px 20px', cursor: 'pointer',
                            borderBottom: isExpanded ? '1px solid var(--color-hairline)' : 'none',
                          }}
                        >
                          <motion.span
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ fontSize: '12px', color: 'var(--color-ink-muted-48)' }}
                          >
                            ▶
                          </motion.span>
                          <span className="typography-body-strong" style={{ flex: 1 }}>{team.name}</span>
                          <span className="typography-caption" style={{ color: 'var(--color-ink-muted-48)' }}>
                            {members.length} 人
                          </span>
                          {team.category && (
                            <span style={{
                              fontSize: '12px', fontWeight: 500,
                              padding: '2px 10px', borderRadius: 'var(--radius-pill)',
                              background: 'var(--color-surface-chip)',
                              color: 'var(--color-ink-muted-80)',
                            }}>
                              {team.category}
                            </span>
                          )}
                        </div>

                        {/* Member tree */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.25 }}
                            >
                              <div style={{ padding: '12px 20px 20px' }}>
                                {tree.length === 0 ? (
                                  <p className="typography-caption" style={{ color: 'var(--color-ink-muted-48)', textAlign: 'center', padding: '20px 0' }}>
                                    暂无成员
                                  </p>
                                ) : (
                                  tree.map((node, i) => (
                                    <MemberTreeNode
                                      key={node.id}
                                      node={node}
                                      depth={0}
                                      isLast={i === tree.length - 1}
                                    />
                                  ))
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card" style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span className="typography-display-md" style={{ fontSize: '22px', color: 'var(--color-primary)' }}>
        {value}
      </span>
      <span className="typography-caption" style={{ color: 'var(--color-ink-muted-48)' }}>
        {label}
      </span>
    </div>
  );
}
