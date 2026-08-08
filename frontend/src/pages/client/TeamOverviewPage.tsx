import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { teamApi, type TeamOverview } from '../../api/teams';

const ROLE_COLORS: Record<string, string> = {
  '队长': '#faad14',
  '项管': '#722ed1',
  '技术组长': '#2f54eb',
  '成员': '#52c41a',
};

const ROLE_LABELS: Record<string, string> = {
  '队长': '队长',
  '项管': '项管',
  '技术组长': '技术组长',
  '成员': '成员',
};

const ACCENT_COLORS = ['#0066cc', '#722ed1', '#2f54eb', '#faad14', '#52c41a', '#eb2f96', '#13c2c2', '#fa8c16'];

export default function TeamOverviewPage() {
  const [data, setData] = useState<TeamOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await teamApi.overview();
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || '加载总览数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const getAccentColor = (index: number) => ACCENT_COLORS[index % ACCENT_COLORS.length];

  const statCards = data
    ? [
        { label: '战队总数', value: data.total_teams, color: '#0066cc' },
        { label: '成员总数', value: data.total_members, color: '#722ed1' },
        { label: '资源总数', value: data.total_resources, color: '#2f54eb' },
        { label: '最近上传', value: data.recent_uploads, color: '#52c41a' },
      ]
    : [];

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ background: 'var(--color-parchment)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)' }}>加载中...</p>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ background: 'var(--color-parchment)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2 className="typography-display-md" style={{ marginBottom: '12px', color: 'var(--color-ink-muted-48)' }}>
            加载失败
          </h2>
          <p className="typography-body" style={{ color: '#cc0000', marginBottom: '16px' }}>{error}</p>
          <button onClick={load} className="button-primary">重试</button>
        </div>
      </motion.div>
    );
  }

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
              战队总览
            </h1>
            <p className="typography-lead" style={{ color: 'var(--color-ink-muted-48)', maxWidth: '600px', margin: '0 auto' }}>
              全面了解各战队的组成与活跃度，掌握平台学术协作的整体态势。
            </p>
          </motion.div>
        </div>
      </section>

      {/* Summary Stats */}
      <section style={{ maxWidth: '980px', margin: '0 auto', padding: '0 var(--spacing-lg) 48px' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
          }}
        >
          {statCards.map((stat) => (
            <div
              key={stat.label}
              style={{
                background: 'var(--color-canvas)',
                borderRadius: 'var(--radius-lg)',
                padding: '28px 24px',
                textAlign: 'center',
                border: '1px solid var(--color-hairline)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <div
                className="typography-hero-display"
                style={{
                  fontSize: '42px',
                  color: stat.color,
                  marginBottom: '8px',
                }}
              >
                {stat.value}
              </div>
              <div className="typography-caption" style={{ color: 'var(--color-ink-muted-48)' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Team Cards */}
      <section style={{ maxWidth: '980px', margin: '0 auto', padding: '0 var(--spacing-lg) 80px' }}>
        <h2 className="typography-display-md" style={{ marginBottom: '24px', fontSize: '28px' }}>
          各战队详情
        </h2>

        {!data || data.team_stats.length === 0 ? (
          <div
            style={{
              background: 'var(--color-canvas)',
              borderRadius: 'var(--radius-lg)',
              padding: '48px',
              textAlign: 'center',
              border: '1px solid var(--color-hairline)',
            }}
          >
            <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)' }}>
              暂无战队数据
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {data.team_stats.map((team, idx) => {
              const accentColor = getAccentColor(idx);
              const roleEntries = Object.entries(team.role_distribution || {})
                .filter(([, count]) => count > 0)
                .sort((a, b) => b[1] - a[1]);
              const maxRoleCount = roleEntries.length > 0 ? roleEntries[0][1] : 1;

              return (
                <motion.div
                  key={team.team_id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + idx * 0.06, duration: 0.4 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      background: 'var(--color-canvas)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--color-hairline)',
                      boxShadow: 'var(--shadow-soft)',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'box-shadow var(--transition-normal), transform var(--transition-normal)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 30px rgba(0,0,0,0.08)';
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-soft)';
                      (e.currentTarget as HTMLElement).style.transform = 'none';
                    }}
                    onClick={() => {
                      window.location.href = `/teams/${team.team_id}`;
                    }}
                  >
                    {/* Accent bar */}
                    <div
                      style={{
                        width: '5px',
                        flexShrink: 0,
                        background: accentColor,
                        borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)',
                      }}
                    />

                    {/* Content */}
                    <div style={{ flex: 1, padding: '24px' }}>
                      {/* Header row */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '16px',
                          flexWrap: 'wrap',
                          gap: '12px',
                        }}
                      >
                        <div>
                          <h3 className="typography-tagline" style={{ fontSize: '20px', marginBottom: '4px' }}>
                            {team.team_name}
                          </h3>
                          {team.category && (
                            <span className="typography-caption" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
                              {team.category}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '24px' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div className="typography-body-strong">{team.member_count}</div>
                            <div className="typography-caption" style={{ color: 'var(--color-ink-muted-48)', fontSize: '12px' }}>
                              成员
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div className="typography-body-strong">{team.total_uploads}</div>
                            <div className="typography-caption" style={{ color: 'var(--color-ink-muted-48)', fontSize: '12px' }}>
                              资源
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div className="typography-body-strong">{team.recent_notices}</div>
                            <div className="typography-caption" style={{ color: 'var(--color-ink-muted-48)', fontSize: '12px' }}>
                              公告
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      {team.description && (
                        <p
                          className="typography-caption"
                          style={{
                            color: 'var(--color-ink-muted-48)',
                            marginBottom: '16px',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {team.description}
                        </p>
                      )}

                      {/* Role distribution bars */}
                      {roleEntries.length > 0 && (
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {roleEntries.map(([role, count]) => (
                            <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div
                                style={{
                                  height: '6px',
                                  width: `${Math.max(12, (count / maxRoleCount) * 60)}px`,
                                  borderRadius: '3px',
                                  background: ROLE_COLORS[role] || '#52c41a',
                                }}
                              />
                              <span style={{ fontSize: '12px', color: 'var(--color-ink-muted-48)' }}>
                                {ROLE_LABELS[role] || role} {count}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Recent uploads */}
                      {team.recent_uploads > 0 && (
                        <div style={{ marginTop: '12px' }}>
                          <span className="typography-caption" style={{ color: 'var(--color-primary)', fontSize: '12px' }}>
                            最近 {team.recent_uploads} 次上传
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </motion.div>
  );
}
