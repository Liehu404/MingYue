import { useState, useEffect } from 'react';
import { teamApi, type DecorationSettings } from '../../api/teams';

interface Props {
  teamId: number;
  currentDecoration?: DecorationSettings;
  onSaved: () => void;
}

const FONT_OPTIONS = [
  { value: 'sf-pro', label: 'SF Pro (系统默认)' },
  { value: 'serif', label: '宋体 / 衬线' },
  { value: 'mono', label: '等宽字体' },
  { value: 'rounded', label: '圆体' },
] as const;

const PATTERN_OPTIONS = [
  { value: 'none', label: '无' },
  { value: 'dots', label: '点阵' },
  { value: 'grid', label: '网格' },
  { value: 'mesh-light', label: '浅色渐变' },
  { value: 'mesh-dark', label: '深色渐变' },
  { value: 'radial-glow', label: '径向光晕' },
] as const;

const GLASS_OPTIONS = [
  { value: 'medium', label: '中等 (默认)' },
  { value: 'light', label: '轻量' },
  { value: 'heavy', label: '厚重' },
] as const;

const SHADOW_OPTIONS = [
  { value: 'soft', label: '柔和 (默认)' },
  { value: 'elevated', label: '立体' },
  { value: 'glow', label: '发光' },
  { value: 'none', label: '无阴影' },
] as const;

export default function TeamDecorationPanel({ teamId, currentDecoration, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DecorationSettings>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(currentDecoration || {});
  }, [currentDecoration, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await teamApi.decoration.update(teamId, form);
      onSaved();
      setOpen(false);
    } catch (e: any) {
      alert(e?.response?.data?.detail || e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: keyof DecorationSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value || undefined }));
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="button-secondary-pill"
        style={{ padding: '8px 18px', fontSize: '14px' }}
      >
        装饰设置
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            style={{
              background: 'var(--color-canvas)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-product)',
              width: '520px',
              maxHeight: '85vh',
              overflow: 'auto',
              padding: '32px',
            }}
          >
            <h2 className="typography-tagline" style={{ marginBottom: '24px' }}>
              装饰设置
            </h2>

            {/* Hero background URL */}
            <Field label="Hero 背景图 URL">
              <input
                type="text"
                value={form.hero_bg_url || ''}
                onChange={(e) => update('hero_bg_url', e.target.value)}
                placeholder="输入图片URL，留空使用默认"
                style={inputStyle}
              />
            </Field>

            {/* Accent color + Section bg color */}
            <div style={{ display: 'flex', gap: '16px' }}>
              <Field label="主题色" flex>
                <input
                  type="color"
                  value={form.accent_color || '#0066cc'}
                  onChange={(e) => update('accent_color', e.target.value)}
                  style={{ width: '40px', height: '40px', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: '2px' }}
                />
              </Field>
              <Field label="卡片背景色" flex>
                <input
                  type="color"
                  value={form.section_bg_color || '#ffffff'}
                  onChange={(e) => update('section_bg_color', e.target.value)}
                  style={{ width: '40px', height: '40px', border: '1px solid var(--color-hairline)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: '2px' }}
                />
              </Field>
            </div>

            {/* Font family */}
            <Field label="字体">
              <select
                value={form.font_family || 'sf-pro'}
                onChange={(e) => update('font_family', e.target.value)}
                style={selectStyle}
              >
                {FONT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            {/* Background pattern */}
            <Field label="背景纹理">
              <RadioGroup
                options={PATTERN_OPTIONS}
                selected={form.bg_pattern || 'none'}
                onChange={(v) => update('bg_pattern', v)}
              />
            </Field>

            {/* Glass intensity */}
            <Field label="玻璃效果">
              <RadioGroup
                options={GLASS_OPTIONS}
                selected={form.glass_intensity || 'medium'}
                onChange={(v) => update('glass_intensity', v)}
              />
            </Field>

            {/* Text shadow */}
            <Field label="文字阴影">
              <RadioGroup
                options={SHADOW_OPTIONS}
                selected={form.text_shadow || 'soft'}
                onChange={(v) => update('text_shadow', v)}
              />
            </Field>

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

/* ── Small helpers ── */

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <div style={{ marginBottom: '18px', flex: flex ? 1 : undefined }}>
      <div className="typography-caption-strong" style={{ marginBottom: '6px', color: 'var(--color-ink-muted-80)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function RadioGroup({
  options,
  selected,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
      {options.map((o) => (
        <label
          key={o.value}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-pill)',
            border: selected === o.value ? '1.5px solid var(--color-primary)' : '1px solid var(--color-hairline)',
            background: selected === o.value ? 'rgba(0,102,204,0.06)' : 'var(--color-canvas)',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--color-ink)',
            transition: 'border-color var(--transition-fast), background var(--transition-fast)',
            fontFamily: 'inherit',
          }}
        >
          <input
            type="radio"
            name={options[0]?.value}
            value={o.value}
            checked={selected === o.value}
            onChange={() => onChange(o.value)}
            style={{ accentColor: 'var(--color-primary)', margin: 0 }}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '14px',
  border: '1px solid var(--color-hairline)',
  borderRadius: 'var(--radius-sm)',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  background: 'var(--color-canvas)',
  cursor: 'pointer',
};
