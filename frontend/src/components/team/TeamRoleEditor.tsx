import { useState, useEffect } from 'react';
import { teamApi, type RoleDefinition } from '../../api/teams';

interface Props {
  teamId: number;
  currentRoles?: Record<string, RoleDefinition>;
  onSaved: () => void;
}

const SYSTEM_ROLES = [
  { key: 'captain', defaultLabel: '队长', defaultColor: '#faad14' },
  { key: 'pm', defaultLabel: '项管', defaultColor: '#722ed1' },
  { key: 'tech_lead', defaultLabel: '技术组长', defaultColor: '#2f54eb' },
  { key: 'student', defaultLabel: '成员', defaultColor: '#52c41a' },
] as const;

export default function TeamRoleEditor({ teamId, currentRoles, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, RoleDefinition>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init: Record<string, RoleDefinition> = {};
    SYSTEM_ROLES.forEach((r) => {
      const existing = currentRoles?.[r.key];
      init[r.key] = existing
        ? { ...existing }
        : { label: r.defaultLabel, color: r.defaultColor };
    });
    setForm(init);
  }, [currentRoles, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await teamApi.roles.update(teamId, form);
      onSaved();
      setOpen(false);
    } catch (e: any) {
      alert(e?.response?.data?.detail || e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const updateRole = (key: string, field: 'label' | 'color', value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="button-secondary-pill"
        style={{ padding: '8px 18px', fontSize: '14px' }}
      >
        角色定义
      </button>

      {open && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{
            background: 'var(--color-canvas)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-product)',
            width: '560px', maxHeight: '85vh', overflow: 'auto',
            padding: '32px',
          }}>
            <h2 className="typography-tagline" style={{ marginBottom: '24px' }}>
              角色定义
            </h2>
            <p className="typography-caption" style={{ color: 'var(--color-ink-muted-48)', marginBottom: '24px', marginTop: '-16px' }}>
              自定义四个系统角色的显示名称和颜色，设置后将在战队页面和组织架构中生效。
            </p>

            {SYSTEM_ROLES.map((role) => {
              const def = form[role.key];
              if (!def) return null;
              return (
                <div key={role.key} style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '14px 16px', marginBottom: '12px',
                  background: 'var(--color-parchment)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  {/* System role key (read-only) */}
                  <span style={{
                    fontSize: '12px', fontWeight: 600, color: 'var(--color-ink-muted-48)',
                    width: '64px', flexShrink: 0, fontFamily: 'monospace',
                  }}>
                    {role.key}
                  </span>

                  {/* Label input */}
                  <input
                    type="text"
                    value={def.label}
                    onChange={(e) => updateRole(role.key, 'label', e.target.value)}
                    style={{
                      flex: 1, padding: '7px 12px', fontSize: '14px',
                      border: '1px solid var(--color-hairline)',
                      borderRadius: 'var(--radius-sm)',
                      outline: 'none', fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                    placeholder="显示名称"
                  />

                  {/* Color picker */}
                  <input
                    type="color"
                    value={def.color}
                    onChange={(e) => updateRole(role.key, 'color', e.target.value)}
                    style={{
                      width: '36px', height: '36px',
                      border: '1px solid var(--color-hairline)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', padding: '2px', flexShrink: 0,
                    }}
                  />

                  {/* Live preview badge */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '4px 12px', borderRadius: 'var(--radius-pill)',
                    fontSize: '12px', fontWeight: 600,
                    background: `${def.color}18`, color: def.color,
                    whiteSpace: 'nowrap', flexShrink: 0, minWidth: '60px',
                    justifyContent: 'center',
                  }}>
                    {def.label}
                  </span>
                </div>
              );
            })}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '28px' }}>
              <button onClick={() => setOpen(false)} className="button-secondary-pill" style={{ padding: '8px 20px', fontSize: '14px' }}>
                取消
              </button>
              <button onClick={handleSave} className="button-primary" style={{ padding: '8px 20px', fontSize: '14px' }} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
