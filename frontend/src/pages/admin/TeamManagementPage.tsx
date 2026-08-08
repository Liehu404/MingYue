import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { teamApi, type Team, type TeamMember } from '../../api/teams';
import { userApi, type User } from '../../api/users';
import { collegeApi, type College } from '../../api/colleges';

const ROLE_OPTIONS = [
  { label: '成员', value: 'member' },
  { label: '队长', value: 'leader' },
  { label: '副队长', value: 'co_leader' },
];

const ROLE_LABELS: Record<string, string> = {
  leader: '队长',
  co_leader: '副队长',
  member: '成员',
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  leader: { bg: 'rgba(255,149,0,0.08)', text: '#cc7000' },
  co_leader: { bg: 'rgba(0,102,204,0.08)', text: '#0066cc' },
  member: { bg: 'rgba(52,199,89,0.08)', text: '#248a3d' },
};

interface TeamForm {
  name: string;
  description: string;
  college_id: number | null;
  advisor_teacher_id: number | null;
}

const EMPTY_TEAM_FORM: TeamForm = {
  name: '', description: '', college_id: null, advisor_teacher_id: null,
};

export default function TeamManagementPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colleges, setColleges] = useState<College[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);

  // Team add/edit modal
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamForm, setTeamForm] = useState<TeamForm>(EMPTY_TEAM_FORM);
  const [teamSubmitting, setTeamSubmitting] = useState(false);
  const [teamFormError, setTeamFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);

  // Members modal
  const [membersTeam, setMembersTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Add member form
  const [addMemberMode, setAddMemberMode] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState<number | null>(null);
  const [newMemberRole, setNewMemberRole] = useState('member');
  const [newMemberParentId, setNewMemberParentId] = useState<number | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<User[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamsRes, collegesRes, teachersRes] = await Promise.all([
        teamApi.list(),
        collegeApi.list(),
        userApi.list({ role: 'advisor_teacher', is_active: true }),
      ]);
      setTeams(teamsRes.data || []);
      setColleges(collegesRes.data || []);
      setTeachers(teachersRes.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || '加载战队数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Team CRUD ──

  const openAddTeamModal = () => {
    setEditingTeam(null);
    setTeamForm(EMPTY_TEAM_FORM);
    setTeamFormError(null);
    setTeamModalOpen(true);
  };

  const openEditTeamModal = (team: Team) => {
    setEditingTeam(team);
    setTeamForm({
      name: team.name,
      description: team.description || '',
      college_id: team.college_id ?? null,
      advisor_teacher_id: team.advisor_teacher_id ?? null,
    });
    setTeamFormError(null);
    setTeamModalOpen(true);
  };

  const handleTeamSubmit = async () => {
    setTeamFormError(null);
    if (!teamForm.name.trim()) { setTeamFormError('请输入战队名称'); return; }
    setTeamSubmitting(true);
    try {
      const data: Record<string, unknown> = {
        name: teamForm.name.trim(),
        description: teamForm.description.trim(),
        college_id: teamForm.college_id,
        advisor_teacher_id: teamForm.advisor_teacher_id,
      };
      if (editingTeam) {
        await teamApi.update(editingTeam.id, data);
      } else {
        await teamApi.create(data);
      }
      setTeamModalOpen(false);
      await loadData();
    } catch (err: any) {
      setTeamFormError(err?.response?.data?.detail || err?.message || '操作失败');
    } finally {
      setTeamSubmitting(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!deleteTarget) return;
    try {
      await teamApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || '删除失败');
    }
  };

  // ── Members Modal ──

  const openMembersModal = async (team: Team) => {
    setMembersTeam(team);
    setMembers([]);
    setMembersLoading(true);
    setMembersError(null);
    setAddMemberMode(false);
    setAddMemberError(null);
    setNewMemberUserId(null);
    setNewMemberRole('member');
    setUserSearch('');
    setUserSearchResults([]);
    try {
      const res = await teamApi.members.list(team.id);
      setMembers(res.data || []);
    } catch (err: any) {
      setMembersError(err?.response?.data?.detail || '加载成员失败');
    } finally {
      setMembersLoading(false);
    }
  };

  const searchUsers = async (q: string) => {
    setUserSearch(q);
    if (q.length < 2) { setUserSearchResults([]); return; }
    setUserSearching(true);
    try {
      const res = await userApi.list({ search: q, is_active: true });
      setUserSearchResults(res.data || []);
    } catch {
      setUserSearchResults([]);
    } finally {
      setUserSearching(false);
    }
  };

  const handleAddMember = async () => {
    if (!membersTeam || !newMemberUserId) return;
    setAddMemberError(null);
    try {
      await teamApi.members.add(membersTeam.id, {
        user_id: newMemberUserId,
        team_role: newMemberRole,
        parent_member_id: newMemberParentId || undefined,
      });
      // Refresh members
      const res = await teamApi.members.list(membersTeam.id);
      setMembers(res.data || []);
      setAddMemberMode(false);
      setNewMemberUserId(null);
      setNewMemberRole('member');
      setUserSearch('');
      setUserSearchResults([]);
    } catch (err: any) {
      setAddMemberError(err?.response?.data?.detail || '添加成员失败');
    }
  };

  const handleRemoveMember = async (userId: number) => {
    if (!membersTeam) return;
    try {
      await teamApi.members.remove(membersTeam.id, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err: any) {
      alert(err?.response?.data?.detail || '移除成员失败');
    }
  };

  const getCollegeName = (collegeId: number | null): string => {
    if (!collegeId) return '-';
    return colleges.find((c) => c.id === collegeId)?.name ?? '-';
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
        padding: '56px 36px 76px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
      }}>
        <div className="bg-mesh-dark" />
        <div className="bg-dots" />
        <div className="shimmer-line" />
        <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{
              fontFamily: '"SF Pro Display", system-ui, -apple-system, sans-serif',
              fontSize: 40, fontWeight: 600, lineHeight: 1.10, color: '#ffffff', margin: 0,
              position: 'relative', zIndex: 1,
            }}>
              战队管理
            </h1>
            <p style={{ fontSize: 17, color: 'rgba(226, 232, 240, 0.72)', letterSpacing: '-0.022em', margin: '10px 0 0 0', position: 'relative', zIndex: 1 }}>
              管理平台所有战队及其成员
            </p>
          </div>
          <button onClick={openAddTeamModal} style={{ ...pillBtnPrimary, position: 'relative', zIndex: 1 }}>
            创建战队
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1180, margin: '-32px auto 0', padding: '0 24px 36px', position: 'relative', zIndex: 1 }}>
        <div className="glass-card" style={{ overflowX: 'auto', borderRadius: '24px', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <thead>
              <tr>
                <th style={thStyle}>战队名称</th>
                <th style={thStyle}>学院</th>
                <th style={thStyle}>创建时间</th>
                <th style={{ ...thStyle, width: 220 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ padding: 60, textAlign: 'center' }}>
                    <div style={spinnerStyle} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={4} style={{ padding: 60, textAlign: 'center' }}>
                    <p style={{ color: '#dc2626', fontSize: 14, margin: '0 0 12px 0' }}>{error}</p>
                    <button onClick={loadData} style={pillBtnPrimary}>重试</button>
                  </td>
                </tr>
              ) : teams.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 60, textAlign: 'center' }}>
                    <p style={{ color: '#7a7a7a', fontSize: 15, margin: 0 }}>暂无战队数据</p>
                  </td>
                </tr>
              ) : (
                teams.map((t) => (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    style={tableRowStyle}
                  >
                    <td style={tdStyle}>{t.name}</td>
                    <td style={tdStyle}>{getCollegeName(t.college_id)}</td>
                    <td style={tdStyle}>{t.created_at ? new Date(t.created_at).toLocaleDateString('zh-CN') : '-'}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => openMembersModal(t)} style={actionBtn('#5856d6', true)}>成员</button>
                        <button onClick={() => openEditTeamModal(t)} style={actionBtn('#0066cc', true)}>编辑</button>
                        <button onClick={() => setDeleteTarget(t)} style={actionBtn('#dc2626', true)}>删除</button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Team Add/Edit Modal ── */}
      <AnimatePresence>
        {teamModalOpen && (
          <div style={overlayStyle} onClick={() => setTeamModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25 }}
              style={modalStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={modalTitleStyle}>
                {editingTeam ? '编辑战队' : '创建战队'}
              </h2>

              {teamFormError && <div style={errorBoxStyle}>{teamFormError}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>名称 *</label>
                  <input style={inputStyle} value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} placeholder="请输入战队名称" />
                </div>
                <div>
                  <label style={labelStyle}>描述</label>
                  <textarea
                    style={{ ...inputStyle, height: 100, padding: '12px 16px', borderRadius: 16, resize: 'vertical' }}
                    value={teamForm.description}
                    onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })}
                    placeholder="请输入战队描述"
                  />
                </div>
                <div>
                  <label style={labelStyle}>所属学院</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={teamForm.college_id ?? ''} onChange={(e) => setTeamForm({ ...teamForm, college_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">不限</option>
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>指导教师</label>
                  <select style={{ ...inputStyle, cursor: 'pointer' }} value={teamForm.advisor_teacher_id ?? ''} onChange={(e) => setTeamForm({ ...teamForm, advisor_teacher_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">不限</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.display_name || t.username}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button onClick={() => setTeamModalOpen(false)} style={pillBtnSecondary}>取消</button>
                <button onClick={handleTeamSubmit} disabled={teamSubmitting} style={pillBtnPrimary}>
                  {teamSubmitting ? '提交中...' : editingTeam ? '保存' : '创建'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation Modal ── */}
      <AnimatePresence>
        {deleteTarget && (
          <div style={overlayStyle} onClick={() => setDeleteTarget(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25 }}
              style={modalStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={modalTitleStyle}>确认删除</h2>
              <p style={{ fontSize: 15, color: '#1d1d1f', margin: '0 0 20px 0', fontFamily: 'system-ui, sans-serif' }}>
                确定要删除战队 "{deleteTarget.name}" 吗？此操作不可撤销。
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button onClick={() => setDeleteTarget(null)} style={pillBtnSecondary}>取消</button>
                <button onClick={handleDeleteTeam} style={pillBtnDanger}>删除</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Members Sub-Modal ── */}
      <AnimatePresence>
        {membersTeam && (
          <div style={overlayStyle} onClick={() => setMembersTeam(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.25 }}
              style={{ ...modalStyle, maxWidth: 580 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ ...modalTitleStyle, margin: 0 }}>
                  {membersTeam.name} - 成员
                </h2>
                <button
                  onClick={() => {
                    setAddMemberMode(!addMemberMode);
                    setAddMemberError(null);
                    setUserSearch('');
                    setUserSearchResults([]);
                    setNewMemberUserId(null);
                  }}
                  style={actionBtn(addMemberMode ? '#7a7a7a' : '#0066cc', !addMemberMode)}
                >
                  {addMemberMode ? '取消' : '+ 添加成员'}
                </button>
              </div>

              {/* Add member form */}
              <AnimatePresence>
                {addMemberMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: 'hidden', marginBottom: 16 }}
                  >
                    <div style={{
                      background: '#f5f5f7', borderRadius: 12, padding: 14,
                      display: 'flex', flexDirection: 'column', gap: 10,
                    }}>
                      {addMemberError && <div style={errorBoxStyle}>{addMemberError}</div>}
                      <div style={{ position: 'relative' }}>
                        <input
                          style={{ ...inputStyle, height: 40 }}
                          value={userSearch}
                          onChange={(e) => searchUsers(e.target.value)}
                          placeholder="搜索用户 (输入至少2个字符)"
                        />
                        {userSearching && (
                          <div style={{ position: 'absolute', right: 12, top: 10 }}>
                            <div style={{ width: 16, height: 16, border: '2px solid #e0e0e0', borderTopColor: '#0066cc', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          </div>
                        )}
                      </div>
                      {userSearchResults.length > 0 && (
                        <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: 10, background: '#fff' }}>
                          {userSearchResults.map((u) => (
                            <div
                              key={u.id}
                              onClick={() => { setNewMemberUserId(u.id); setUserSearch(u.display_name || u.username); setUserSearchResults([]); }}
                              style={{
                                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                                borderBottom: '1px solid #f0f0f0',
                                background: newMemberUserId === u.id ? 'rgba(0,102,204,0.06)' : undefined,
                                fontFamily: 'system-ui, sans-serif',
                              }}
                            >
                              {u.display_name || u.username} ({u.username})
                            </div>
                          ))}
                        </div>
                      )}
                      <div>
                        <label style={{ ...labelStyle, fontSize: 12 }}>上级成员</label>
                        <select
                          style={{ ...inputStyle, height: 40, cursor: 'pointer' }}
                          value={newMemberParentId ?? ''}
                          onChange={(e) => setNewMemberParentId(e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">无 (顶级成员)</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.user?.display_name || m.user?.username || `UID ${m.user_id}`}
                              {m.position_title ? ` - ${m.position_title}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <select
                          style={{ ...inputStyle, height: 40, width: 120, cursor: 'pointer' }}
                          value={newMemberRole}
                          onChange={(e) => setNewMemberRole(e.target.value)}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        <button onClick={handleAddMember} disabled={!newMemberUserId} style={{
                          ...pillBtnPrimary, opacity: newMemberUserId ? 1 : 0.5,
                          padding: '7px 18px', fontSize: 13,
                        }}>
                          添加
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Member list */}
              {membersLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={spinnerStyle} />
                </div>
              ) : membersError ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <p style={{ color: '#dc2626', fontSize: 14, margin: 0 }}>{membersError}</p>
                </div>
              ) : members.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <p style={{ color: '#7a7a7a', fontSize: 14, margin: 0 }}>暂无成员</p>
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, fontSize: 12 }}>用户</th>
                        <th style={{ ...thStyle, fontSize: 12 }}>角色</th>
                        <th style={{ ...thStyle, fontSize: 12, width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => {
                        const roleColor = ROLE_COLORS[m.team_role] || ROLE_COLORS.member;
                        return (
                          <tr key={m.id} style={tableRowStyle}>
                            <td style={{ ...tdStyle, fontSize: 13 }}>
                              {m.user?.display_name || m.user?.username || `UID ${m.user_id}`}
                            </td>
                            <td style={{ ...tdStyle, fontSize: 13 }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
                                fontSize: 11, fontWeight: 500,
                                background: roleColor.bg, color: roleColor.text,
                              }}>
                                {ROLE_LABELS[m.team_role] || m.team_role}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, fontSize: 13 }}>
                              <button
                                onClick={() => handleRemoveMember(m.user_id)}
                                style={actionBtn('#dc2626', true)}
                              >
                                移除
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                <button onClick={() => setMembersTeam(null)} style={pillBtnSecondary}>关闭</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Shared Styles ── */

const pillBtnPrimary: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 9999, border: 'none',
  background: '#0066cc', color: '#ffffff',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const pillBtnSecondary: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 9999, border: '1px solid #7a7a7a',
  background: 'transparent', color: '#7a7a7a',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const pillBtnDanger: React.CSSProperties = {
  padding: '9px 22px', borderRadius: 9999, border: 'none',
  background: '#dc2626', color: '#ffffff',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const actionBtn = (color: string, outlined: boolean): React.CSSProperties => ({
  padding: '4px 14px', borderRadius: 9999,
  border: `1px solid ${color}`,
  background: outlined ? 'transparent' : color,
  color: outlined ? color : '#ffffff',
  fontSize: 12, fontWeight: 500, cursor: 'pointer',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
});

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 14px',
  fontSize: 13, fontWeight: 600, color: '#7a7a7a',
  borderBottom: '1px solid #e0e0e0',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px', fontSize: 14, color: '#1d1d1f',
  borderBottom: '1px solid #f0f0f0',
  fontFamily: 'system-ui, -apple-system, sans-serif', whiteSpace: 'nowrap',
};

const tableRowStyle: React.CSSProperties = { transition: 'background 0.1s' };

const spinnerStyle: React.CSSProperties = {
  width: 28, height: 28, border: '3px solid #e0e0e0',
  borderTopColor: '#0066cc', borderRadius: '50%',
  animation: 'spin 0.8s linear infinite', margin: '0 auto',
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 2000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
};

const modalStyle: React.CSSProperties = {
  background: '#ffffff', borderRadius: 18, padding: '28px 30px',
  width: '90%', maxWidth: 480,
  boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
};

const modalTitleStyle: React.CSSProperties = {
  margin: '0 0 20px 0', fontSize: 21, fontWeight: 600,
  color: '#1d1d1f',
  fontFamily: '"SF Pro Display", system-ui, -apple-system, sans-serif',
};

const errorBoxStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 10,
  background: 'rgba(220,38,38,0.06)', color: '#dc2626',
  fontSize: 13, marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 500,
  color: '#1d1d1f', marginBottom: 5,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 16px',
  borderRadius: 9999, border: '1px solid #e0e0e0',
  fontSize: 14, fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#1d1d1f', outline: 'none', background: '#ffffff',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
};
