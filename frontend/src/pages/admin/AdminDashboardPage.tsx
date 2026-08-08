import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { statsApi } from '../../api/resources';
import { userApi } from '../../api/users';
import { teamApi } from '../../api/teams';

interface OverviewStats {
  total_users: number;
  total_teams: number;
  total_resources: number;
  pending_resources: number;
}

interface StatsCard {
  label: string;
  value: number;
  color: string;
  bg: string;
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<StatsCard[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, pendingUsersRes, teamsRes] = await Promise.all([
        statsApi.overview(),
        userApi.list({ is_active: false }),
        teamApi.list(),
      ]);

      const overview: OverviewStats = overviewRes.data;
      const pendingUsers = pendingUsersRes.data || [];

      // Count total join requests across all teams
      let joinRequestsCount = 0;
      try {
        const teams = teamsRes.data || [];
        const joinRequestsPromises = teams.map((t: { id: number }) =>
          teamApi.joinRequests.list(t.id).catch(() => ({ data: [] }))
        );
        const joinResults = await Promise.all(joinRequestsPromises);
        joinRequestsCount = joinResults.reduce(
          (sum, r) => sum + (Array.isArray(r.data) ? r.data.length : 0),
          0
        );
      } catch {
        joinRequestsCount = 0;
      }

      setCards([
        { label: '总用户数', value: overview.total_users ?? 0, color: '#0066cc', bg: 'rgba(0,102,204,0.08)' },
        { label: '总战队数', value: overview.total_teams ?? 0, color: '#5856d6', bg: 'rgba(88,86,214,0.08)' },
        { label: '总资源数', value: overview.total_resources ?? 0, color: '#ff9500', bg: 'rgba(255,149,0,0.08)' },
        { label: '待审核资源', value: overview.pending_resources ?? 0, color: '#ff3b30', bg: 'rgba(255,59,48,0.08)' },
        { label: '待审核用户', value: pendingUsers.length, color: '#ffcc00', bg: 'rgba(255,204,0,0.10)' },
        { label: '待处理加队申请', value: joinRequestsCount, color: '#34c759', bg: 'rgba(52,199,89,0.08)' },
      ]);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.07 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.21, 0.47, 0.32, 0.98] } },
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
        padding: '56px 36px 80px',
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
            fontSize: 40,
            fontWeight: 600,
            lineHeight: 1.10,
            color: '#ffffff',
            margin: 0,
            position: 'relative',
            zIndex: 1,
          }}>
            管理仪表盘
          </h1>
          <p style={{
            fontSize: 17,
            color: 'rgba(226, 232, 240, 0.72)',
            letterSpacing: '-0.022em',
            margin: '10px 0 0 0',
            position: 'relative',
            zIndex: 1,
          }}>
            平台核心数据概览
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1180, margin: '-32px auto 0', padding: '0 24px 36px', position: 'relative', zIndex: 1 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
            <div style={{
              width: 32, height: 32, border: '3px solid #e0e0e0',
              borderTopColor: '#0066cc', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{
            textAlign: 'center', padding: 60, color: '#dc2626',
            fontSize: 15, fontFamily: 'system-ui, sans-serif',
          }}>
            <p>{error}</p>
            <button
              onClick={loadStats}
              style={{
                marginTop: 16, padding: '9px 22px', borderRadius: 9999,
                border: '1px solid #0066cc', background: '#0066cc', color: '#fff',
                fontSize: 14, cursor: 'pointer',
              }}
            >
              重试
            </button>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 20,
            }}
          >
            {cards.map((card) => (
              <motion.div
                key={card.label}
                variants={itemVariants}
                style={{
                  background: 'rgba(255, 255, 255, 0.78)',
                  backdropFilter: 'blur(22px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(22px) saturate(180%)',
                  borderRadius: 24,
                  padding: '28px 24px',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  boxShadow: '0 18px 48px rgba(6, 11, 24, 0.08)',
                }}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: 18,
                  background: `linear-gradient(135deg, ${card.color} 0%, rgba(34, 211, 238, 0.9) 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 14px 30px rgba(79, 140, 255, 0.24)',
                }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#ffffff' }}>
                    {card.value}
                  </span>
                </div>
                <div>
                  <p style={{
                    margin: 0, fontSize: 14, color: 'var(--color-ink-muted-48)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    letterSpacing: '-0.01em',
                  }}>
                    {card.label}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
