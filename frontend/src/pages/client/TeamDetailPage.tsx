import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'react-router-dom';
import { teamApi, type Team, type TeamMember, type Notice, type DecorationSettings } from '../../api/teams';
import { resourceApi, type Resource } from '../../api/resources';
import { useAuth } from '../../contexts/AuthContext';
import { usePageBackground } from '../../hooks/usePageBackground';
import TeamDecorationPanel from '../../components/team/TeamDecorationPanel';
import TeamRoleEditor from '../../components/team/TeamRoleEditor';
import EditableMemberTree from '../../components/org/EditableMemberTree';

const ROLE_COLORS: Record<string, string> = {
  captain: '#faad14',
  pm: '#722ed1',
  tech_lead: '#2f54eb',
  student: '#52c41a',
};
const ROLE_LABELS: Record<string, string> = {
  captain: '队长',
  pm: '项管',
  tech_lead: '技术组长',
  student: '成员',
};
const DEFAULT_ROLE_COLOR = '#52c41a';

const TAB_KEYS = ['members', 'notices', 'resources'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  members: '成员',
  notices: '公告',
  resources: '资源',
};

function decorationToStyle(d: DecorationSettings | undefined) {
  const style: Record<string, string> = {};
  if (!d) return style;
  if (d.accent_color) style['--color-primary'] = d.accent_color;
  if (d.section_bg_color) style['--color-canvas'] = d.section_bg_color;
  if (d.font_family) {
    const fontMap: Record<string, string> = {
      'sf-pro': '"SF Pro Display", "SF Pro Text", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      serif: 'Georgia, "Noto Serif SC", "Songti SC", serif',
      mono: '"SF Mono", "JetBrains Mono", "Fira Code", monospace',
      rounded: '"SF Pro Rounded", system-ui, -apple-system, sans-serif',
    };
    style.fontFamily = fontMap[d.font_family] || fontMap['sf-pro'];
  }
  return style;
}

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const globalHeroBg = usePageBackground('team-hero');
  const teamId = Number(id);

  // Team data
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Members
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Notices
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', is_pinned: false });
  const [creatingNotice, setCreatingNotice] = useState(false);

  // Resources
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<TabKey>('members');

  // View mode for members: list or tree
  const [memberViewMode, setMemberViewMode] = useState<'tree' | 'list'>('tree');

  // Manage members
  const [showManageModal, setShowManageModal] = useState(false);
  const [manageMode, setManageMode] = useState<'add' | null>(null);
  const [addMemberForm, setAddMemberForm] = useState({ user_id: '', team_role: 'student', tech_partition_id: '' });
  const [addingMember, setAddingMember] = useState(false);

  // Join
  const [joining, setJoining] = useState(false);
  const [joinMessage, setJoinMessage] = useState('');

  const storedMembership = user?.team_memberships?.find((m) => m.team_id === teamId);
  const inLoadedMembers = user ? members.some((m) => m.user_id === user.id) : false;
  const isMember = Boolean(storedMembership) || inLoadedMembers;
  const memberRole =
    storedMembership?.team_role ??
    members.find((m) => m.user_id === user?.id)?.team_role;
  const canManage =
    user?.role === 'super_admin' ||
    user?.role === 'advisor_teacher' ||
    memberRole === 'captain' ||
    memberRole === 'pm';
  const canCreateNotice = canManage;

  // Dynamic role display
  function getRoleDisplay(roleKey: string): { label: string; color: string } {
    const custom = team?.role_definitions?.[roleKey];
    if (custom) return custom;
    return ROLE_LABELS[roleKey] ? { label: ROLE_LABELS[roleKey], color: ROLE_COLORS[roleKey] || DEFAULT_ROLE_COLOR } : { label: roleKey, color: '#8e8e93' };
  }

  // Reparent handler (tree drag-and-drop)
  const handleReparent = async (memberId: number, newParentId: number | null) => {
    setMembers((prev) => {
      const member = prev.find((m) => m.user_id === memberId);
      if (!member) return prev;
      return prev.map((m) =>
        m.user_id === memberId ? { ...m, parent_member_id: newParentId } : m
      );
    });
    try {
      await teamApi.members.update(teamId, memberId, { parent_member_id: newParentId });
    } catch (err: any) {
      await loadMembers();
      alert(err?.response?.data?.detail || '移动失败');
    }
  };

  // Role change handler
  const handleRoleChange = async (userId: number, newRole: string) => {
    setMembers((prev) => {
      const member = prev.find((m) => m.user_id === userId);
      if (!member) return prev;
      return prev.map((m) =>
        m.user_id === userId ? { ...m, team_role: newRole } : m
      );
    });
    try {
      await teamApi.members.update(teamId, userId, { team_role: newRole });
    } catch (err: any) {
      await loadMembers();
      alert(err?.response?.data?.detail || '更改角色失败');
    }
  };

  // Remove member (from tree)
  const handleRemoveMemberTree = async (userId: number) => {
    try {
      await teamApi.members.remove(teamId, userId);
      await loadMembers();
    } catch (err: any) {
      alert(err?.response?.data?.detail || '移除成员失败');
    }
  };

  // Load team
  const loadTeam = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await teamApi.get(teamId);
      setTeam(res.data);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setError('战队不存在');
      } else {
        setError(err?.response?.data?.message || '加载战队信息失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      setMembersLoading(true);
      const res = await teamApi.members.list(teamId);
      setMembers(res.data || []);
    } catch {
      // silent
    } finally {
      setMembersLoading(false);
    }
  };

  const loadNotices = async () => {
    try {
      setNoticesLoading(true);
      const res = await teamApi.notices.list(teamId);
      setNotices(res.data || []);
    } catch {
      // silent
    } finally {
      setNoticesLoading(false);
    }
  };

  const loadResources = async () => {
    try {
      setResourcesLoading(true);
      const res = await resourceApi.list({ team_id: teamId });
      setResources(res.data || []);
    } catch {
      // silent
    } finally {
      setResourcesLoading(false);
    }
  };

  useEffect(() => {
    loadTeam();
  }, [teamId]);

  useEffect(() => {
    if (!team) return;
    if (activeTab === 'members') loadMembers();
    else if (activeTab === 'notices') loadNotices();
    else if (activeTab === 'resources') loadResources();
  }, [activeTab, team]);

  // Join
  const handleJoin = async () => {
    try {
      setJoining(true);
      await teamApi.joinRequests.create(teamId, joinMessage || '申请加入战队');
      alert('申请已提交，请等待审核。');
      setJoinMessage('');
    } catch (err: any) {
      alert(err?.response?.data?.message || '申请失败');
    } finally {
      setJoining(false);
    }
  };

  // Create notice
  const handleCreateNotice = async (e: FormEvent) => {
    e.preventDefault();
    if (!noticeForm.title.trim() || !noticeForm.content.trim()) return;
    try {
      setCreatingNotice(true);
      await teamApi.notices.create(teamId, {
        title: noticeForm.title.trim(),
        content: noticeForm.content.trim(),
        is_pinned: noticeForm.is_pinned,
      });
      setShowNoticeForm(false);
      setNoticeForm({ title: '', content: '', is_pinned: false });
      await loadNotices();
    } catch (err: any) {
      alert(err?.response?.data?.message || '发布公告失败');
    } finally {
      setCreatingNotice(false);
    }
  };

  // Add member
  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!addMemberForm.user_id.trim()) return;
    try {
      setAddingMember(true);
      const payload: Record<string, unknown> = {
        user_id: Number(addMemberForm.user_id),
        team_role: addMemberForm.team_role,
      };
      if (addMemberForm.tech_partition_id.trim()) {
        payload.tech_partition_id = Number(addMemberForm.tech_partition_id);
      }
      await teamApi.members.add(teamId, payload);
      setShowManageModal(false);
      setManageMode(null);
      setAddMemberForm({ user_id: '', team_role: '成员', tech_partition_id: '' });
      await loadMembers();
    } catch (err: any) {
      alert(err?.response?.data?.message || '添加成员失败');
    } finally {
      setAddingMember(false);
    }
  };

  // Remove member
  const handleRemoveMember = async (userId: number, displayName: string) => {
    if (!window.confirm(`确定要移除成员 ${displayName} 吗？`)) return;
    try {
      await teamApi.members.remove(teamId, userId);
      await loadMembers();
    } catch (err: any) {
      alert(err?.response?.data?.message || '移除成员失败');
    }
  };

  const tagsArray = team?.tags
    ? team.tags.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const pinnedNotices = notices.filter((n) => n.is_pinned);
  const normalNotices = notices.filter((n) => !n.is_pinned);

  const resourceTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      document: '文档',
      video: '视频',
      image: '图片',
      link: '链接',
      other: '其他',
    };
    return map[type] || type;
  };

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

  if (error || !team) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ background: 'var(--color-parchment)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2 className="typography-display-md" style={{ marginBottom: '12px', color: 'var(--color-ink-muted-48)' }}>
            {error || '战队未找到'}
          </h2>
          <button onClick={loadTeam} className="button-primary">重试</button>
        </div>
      </motion.div>
    );
  }

  const heroBg = team?.decoration?.hero_bg_url || globalHeroBg;
  const textShadowClass =
    team?.decoration?.text_shadow === 'elevated' ? 'text-shadow-elevated' :
    team?.decoration?.text_shadow === 'glow' ? 'text-glow' :
    team?.decoration?.text_shadow === 'none' ? '' :
    'text-shadow-soft';
  const bgPatternClass =
    team?.decoration?.bg_pattern === 'dots' ? 'bg-dots' :
    team?.decoration?.bg_pattern === 'grid' ? 'bg-grid-subtle' :
    team?.decoration?.bg_pattern === 'mesh-light' ? 'bg-mesh-light' :
    team?.decoration?.bg_pattern === 'mesh-dark' ? 'bg-mesh-dark' :
    'bg-dots';
  const glassIntensity = team?.decoration?.glass_intensity || 'medium';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      style={{ background: 'var(--color-parchment)', minHeight: '100vh', width: '100%' }}
    >
      <div style={decorationToStyle(team?.decoration) as React.CSSProperties} data-glass-intensity={glassIntensity}>
      {/* Banner */}
      <section className="product-tile-light" style={{
        background: heroBg ? `url(${heroBg}) center/cover no-repeat` : undefined,
        paddingTop: '48px', paddingBottom: '32px', position: 'relative', overflow: 'hidden',
        isolation: 'isolate',
      }}>
        {/* Overlay for custom hero images to ensure text readability */}
        {heroBg && heroBg !== globalHeroBg && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.82) 100%)',
            zIndex: 0,
          }} />
        )}
        {bgPatternClass && <div className={bgPatternClass} />}
        {team?.decoration?.bg_pattern === 'radial-glow' && (
          <div style={{
            position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
            width: 500, height: 500,
            background: `radial-gradient(circle, ${team.decoration.accent_color || 'rgba(0,102,204,0.04)'}22 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />
        )}
        {!team?.decoration?.bg_pattern && (
          <div style={{
            position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
            width: 500, height: 500,
            background: 'radial-gradient(circle, rgba(0,102,204,0.04) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
        )}
        <div className="tile-content" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
          >
            {team.category && (
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'block',
                  marginBottom: '8px',
                }}
              >
                {team.category}
              </span>
            )}
            <h1 className={`typography-display-lg ${textShadowClass}`} style={{ marginBottom: '12px' }}>
              {team.name}
            </h1>
            <p className="typography-lead" style={{ color: 'var(--color-ink-muted-48)', maxWidth: '600px', margin: '0 auto' }}>
              {team.description || '暂无简介'}
            </p>

            {tagsArray.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
                {tagsArray.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: 'var(--color-ink-muted-80)',
                      background: 'var(--color-surface-chip)',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Stats Row */}
      <section style={{ maxWidth: '980px', margin: '0 auto', padding: '0 var(--spacing-lg) 24px' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="glass-card"
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '48px',
            padding: '24px 32px',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div className="typography-display-md" style={{ fontSize: '28px' }}>
              {members.length}
            </div>
            <div className="typography-caption" style={{ color: 'var(--color-ink-muted-48)' }}>
              成员
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="typography-display-md" style={{ fontSize: '28px' }}>
              {resources.length}
            </div>
            <div className="typography-caption" style={{ color: 'var(--color-ink-muted-48)' }}>
              资源
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="typography-display-md" style={{ fontSize: '28px' }}>
              {notices.length}
            </div>
            <div className="typography-caption" style={{ color: 'var(--color-ink-muted-48)' }}>
              公告
            </div>
          </div>
        </motion.div>
      </section>

      {/* Tabs + Content */}
      <section style={{ maxWidth: '980px', margin: '0 auto', padding: '0 var(--spacing-lg) 80px' }}>
        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            gap: '0',
            borderBottom: '1px solid var(--color-hairline)',
            marginBottom: '24px',
          }}
        >
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: '12px 24px',
                fontSize: '17px',
                fontWeight: activeTab === key ? 600 : 400,
                color: activeTab === key ? 'var(--color-ink)' : 'var(--color-ink-muted-48)',
                borderBottom: activeTab === key ? '2px solid var(--color-primary)' : '2px solid transparent',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                transition: 'color var(--transition-fast), border-color var(--transition-fast)',
                fontFamily: 'inherit',
                marginBottom: '-1px',
              }}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {/* ===== Members Tab ===== */}
            {activeTab === 'members' && (
              <div>
                {!isMember && user && (
                  <div
                    className="glass-card"
                    style={{
                      padding: '20px 24px',
                      marginBottom: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <span className="typography-body" style={{ color: 'var(--color-ink-muted-80)' }}>
                      你还不是该战队的成员
                    </span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        value={joinMessage}
                        onChange={(e) => setJoinMessage(e.target.value)}
                        placeholder="附言（可选）"
                        style={{
                          padding: '8px 12px',
                          fontSize: '14px',
                          border: '1px solid var(--color-hairline)',
                          borderRadius: 'var(--radius-sm)',
                          outline: 'none',
                          fontFamily: 'inherit',
                          width: '180px',
                        }}
                      />
                      <button onClick={handleJoin} className="button-primary" style={{ padding: '8px 18px', fontSize: '14px' }} disabled={joining}>
                        {joining ? '提交中...' : '申请加入'}
                      </button>
                    </div>
                  </div>
                )}

                {canManage && (
                  <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      onClick={() => { setManageMode('add'); setShowManageModal(true); }}
                      className="button-secondary-pill"
                      style={{ padding: '8px 18px', fontSize: '14px' }}
                    >
                      添加成员
                    </button>
                    <TeamRoleEditor
                      teamId={teamId}
                      currentRoles={team?.role_definitions}
                      onSaved={loadTeam}
                    />
                    <TeamDecorationPanel
                      teamId={teamId}
                      currentDecoration={team?.decoration}
                      onSaved={loadTeam}
                    />
                    {/* View toggle */}
                    <div style={{
                      display: 'flex', borderRadius: 'var(--radius-pill)',
                      border: '1px solid var(--color-hairline)', overflow: 'hidden',
                      marginLeft: 'auto',
                    }}>
                      <button
                        onClick={() => setMemberViewMode('tree')}
                        style={{
                          padding: '6px 14px', fontSize: '13px', fontWeight: memberViewMode === 'tree' ? 600 : 400,
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          background: memberViewMode === 'tree' ? 'var(--color-primary)' : 'transparent',
                          color: memberViewMode === 'tree' ? '#fff' : 'var(--color-ink-muted-48)',
                          transition: 'all 0.15s',
                        }}
                      >
                        树形视图
                      </button>
                      <button
                        onClick={() => setMemberViewMode('list')}
                        style={{
                          padding: '6px 14px', fontSize: '13px', fontWeight: memberViewMode === 'list' ? 600 : 400,
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          background: memberViewMode === 'list' ? 'var(--color-primary)' : 'transparent',
                          color: memberViewMode === 'list' ? '#fff' : 'var(--color-ink-muted-48)',
                          transition: 'all 0.15s',
                        }}
                      >
                        列表视图
                      </button>
                    </div>
                  </div>
                )}

                {/* View toggle for non-managers */}
                {!canManage && (
                  <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                      display: 'flex', borderRadius: 'var(--radius-pill)',
                      border: '1px solid var(--color-hairline)', overflow: 'hidden',
                    }}>
                      <button
                        onClick={() => setMemberViewMode('tree')}
                        style={{
                          padding: '6px 14px', fontSize: '13px', fontWeight: memberViewMode === 'tree' ? 600 : 400,
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          background: memberViewMode === 'tree' ? 'var(--color-primary)' : 'transparent',
                          color: memberViewMode === 'tree' ? '#fff' : 'var(--color-ink-muted-48)',
                          transition: 'all 0.15s',
                        }}
                      >
                        树形视图
                      </button>
                      <button
                        onClick={() => setMemberViewMode('list')}
                        style={{
                          padding: '6px 14px', fontSize: '13px', fontWeight: memberViewMode === 'list' ? 600 : 400,
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          background: memberViewMode === 'list' ? 'var(--color-primary)' : 'transparent',
                          color: memberViewMode === 'list' ? '#fff' : 'var(--color-ink-muted-48)',
                          transition: 'all 0.15s',
                        }}
                      >
                        列表视图
                      </button>
                    </div>
                  </div>
                )}

                {membersLoading ? (
                  <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)', textAlign: 'center', padding: '40px 0' }}>
                    加载中...
                  </p>
                ) : members.length === 0 ? (
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
                      暂无成员
                    </p>
                  </div>
                ) : memberViewMode === 'tree' ? (
                  <div style={{
                    background: 'var(--color-canvas)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '20px 24px',
                    border: '1px solid var(--color-hairline)',
                  }}>
                    <EditableMemberTree
                      members={members}
                      roleDefinitions={team?.role_definitions || {}}
                      canEdit={canManage}
                      onReparent={handleReparent}
                      onRoleChange={handleRoleChange}
                      onRemove={handleRemoveMemberTree}
                    />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {members.map((m) => {
                      const roleKey = m.team_role || 'student';
                      const rd = getRoleDisplay(roleKey);
                      const displayName = m.user?.display_name || m.user?.username || `用户#${m.user_id}`;
                      const isSelf = m.user_id === user?.id;

                      return (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="glass-card"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div
                              style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: 'var(--radius-full)',
                                background: rd.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontSize: '16px',
                                fontWeight: 600,
                                flexShrink: 0,
                              }}
                            >
                              {displayName.charAt(0)}
                            </div>

                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="typography-body-strong">{displayName}</span>
                                {isSelf && (
                                  <span style={{ fontSize: '12px', color: 'var(--color-ink-muted-48)' }}>(我)</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 10px',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    color: rd.color,
                                    background: `${rd.color}18`,
                                    borderRadius: 'var(--radius-pill)',
                                  }}
                                >
                                  {rd.label}
                                </span>
                                {m.tech_partition_id && (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      padding: '2px 10px',
                                      fontSize: '12px',
                                      color: 'var(--color-ink-muted-48)',
                                      background: 'var(--color-surface-chip)',
                                      borderRadius: 'var(--radius-pill)',
                                    }}
                                  >
                                    分区 #{m.tech_partition_id}
                                  </span>
                                )}
                                {m.position_title && (
                                  <span style={{ fontSize: '12px', color: 'var(--color-ink-muted-48)' }}>
                                    {m.position_title}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {canManage && !isSelf && (
                            <button
                              onClick={() => handleRemoveMember(m.user_id, displayName)}
                              style={{
                                padding: '6px 14px',
                                fontSize: '13px',
                                color: '#cc0000',
                                background: 'transparent',
                                border: '1px solid #cc0000',
                                borderRadius: 'var(--radius-pill)',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              移除
                            </button>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ===== Notices Tab ===== */}
            {activeTab === 'notices' && (
              <div>
                {canCreateNotice && (
                  <div style={{ marginBottom: '20px' }}>
                    <button
                      onClick={() => setShowNoticeForm(true)}
                      className="button-secondary-pill"
                      style={{ padding: '8px 18px', fontSize: '14px' }}
                    >
                      发布公告
                    </button>
                  </div>
                )}

                {noticesLoading ? (
                  <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)', textAlign: 'center', padding: '40px 0' }}>
                    加载中...
                  </p>
                ) : notices.length === 0 ? (
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
                      暂无公告
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Pinned notices */}
                    {pinnedNotices.map((n) => (
                      <motion.div
                        key={n.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                          padding: '20px 24px',
                          background: '#fffbe6',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid #ffe58f',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', color: '#ad8b00', fontWeight: 600 }}>置顶</span>
                          <h3 className="typography-body-strong">{n.title}</h3>
                        </div>
                        <p className="typography-caption" style={{ color: 'var(--color-ink-muted-80)', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                          {n.content}
                        </p>
                        <span className="typography-caption" style={{ color: 'var(--color-ink-muted-48)', fontSize: '12px' }}>
                          {n.created_at ? new Date(n.created_at).toLocaleDateString('zh-CN') : ''}
                        </span>
                      </motion.div>
                    ))}

                    {/* Normal notices */}
                    {normalNotices.map((n) => (
                      <motion.div
                        key={n.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                          padding: '20px 24px',
                          background: 'var(--color-canvas)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--color-hairline)',
                        }}
                      >
                        <h3 className="typography-body-strong" style={{ marginBottom: '8px' }}>{n.title}</h3>
                        <p className="typography-caption" style={{ color: 'var(--color-ink-muted-80)', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                          {n.content}
                        </p>
                        <span className="typography-caption" style={{ color: 'var(--color-ink-muted-48)', fontSize: '12px' }}>
                          {n.created_at ? new Date(n.created_at).toLocaleDateString('zh-CN') : ''}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ===== Resources Tab ===== */}
            {activeTab === 'resources' && (
              <div>
                {resourcesLoading ? (
                  <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)', textAlign: 'center', padding: '40px 0' }}>
                    加载中...
                  </p>
                ) : resources.length === 0 ? (
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
                      暂无资源
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: '20px',
                    }}
                  >
                    {resources.map((r) => (
                      <motion.div
                        key={r.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card"
                        style={{
                          padding: '20px',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-soft)';
                          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                          (e.currentTarget as HTMLElement).style.transform = 'none';
                        }}
                        onClick={() => {
                          window.location.href = `/resources/${r.id}`;
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                          {resourceTypeLabel(r.resource_type)}
                        </div>
                        <h3 className="typography-body-strong" style={{ fontSize: '17px', marginBottom: '8px' }}>
                          {r.title}
                        </h3>
                        <p
                          className="typography-caption"
                          style={{
                            color: 'var(--color-ink-muted-48)',
                            marginBottom: '12px',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {r.description || '暂无简介'}
                        </p>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--color-ink-muted-48)' }}>
                          {r.like_count > 0 && <span>{r.like_count} 赞</span>}
                          {r.comment_count > 0 && <span>{r.comment_count} 评论</span>}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Create Notice Modal */}
      {showNoticeForm && (
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
          onClick={() => setShowNoticeForm(false)}
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
              maxWidth: '520px',
              boxShadow: 'var(--shadow-product)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="typography-tagline" style={{ marginBottom: '24px' }}>发布公告</h2>
            <form onSubmit={handleCreateNotice}>
              <div style={{ marginBottom: '16px' }}>
                <label className="typography-caption-strong" style={{ display: 'block', marginBottom: '6px' }}>
                  标题
                </label>
                <input
                  value={noticeForm.title}
                  onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                  placeholder="公告标题"
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
                <label className="typography-caption-strong" style={{ display: 'block', marginBottom: '6px' }}>
                  内容
                </label>
                <textarea
                  value={noticeForm.content}
                  onChange={(e) => setNoticeForm({ ...noticeForm, content: e.target.value })}
                  placeholder="公告内容"
                  required
                  rows={5}
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
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={noticeForm.is_pinned}
                    onChange={(e) => setNoticeForm({ ...noticeForm, is_pinned: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span className="typography-caption">置顶公告</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowNoticeForm(false)} className="button-secondary-pill">
                  取消
                </button>
                <button type="submit" className="button-primary" disabled={creatingNotice}>
                  {creatingNotice ? '发布中...' : '发布'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Manage Members Modal */}
      {showManageModal && manageMode === 'add' && (
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
          onClick={() => { setShowManageModal(false); setManageMode(null); }}
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
              maxWidth: '440px',
              boxShadow: 'var(--shadow-product)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="typography-tagline" style={{ marginBottom: '24px' }}>添加成员</h2>
            <form onSubmit={handleAddMember}>
              <div style={{ marginBottom: '16px' }}>
                <label className="typography-caption-strong" style={{ display: 'block', marginBottom: '6px' }}>
                  用户 ID
                </label>
                <input
                  value={addMemberForm.user_id}
                  onChange={(e) => setAddMemberForm({ ...addMemberForm, user_id: e.target.value })}
                  placeholder="输入用户 ID"
                  required
                  type="number"
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
                <label className="typography-caption-strong" style={{ display: 'block', marginBottom: '6px' }}>
                  角色
                </label>
                <select
                  value={addMemberForm.team_role}
                  onChange={(e) => setAddMemberForm({ ...addMemberForm, team_role: e.target.value })}
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
                >
                  <option value="student">成员</option>
                  <option value="captain">队长</option>
                  <option value="pm">项管</option>
                  <option value="tech_lead">技术组长</option>
                </select>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label className="typography-caption-strong" style={{ display: 'block', marginBottom: '6px' }}>
                  技术分区 ID（可选）
                </label>
                <input
                  value={addMemberForm.tech_partition_id}
                  onChange={(e) => setAddMemberForm({ ...addMemberForm, tech_partition_id: e.target.value })}
                  placeholder="留空则不分配"
                  type="number"
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
                  onClick={() => { setShowManageModal(false); setManageMode(null); }}
                  className="button-secondary-pill"
                >
                  取消
                </button>
                <button type="submit" className="button-primary" disabled={addingMember}>
                  {addingMember ? '添加中...' : '添加'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      </div>
    </motion.div>
  );
}
