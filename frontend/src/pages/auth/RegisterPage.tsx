import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authApi } from '../../api/auth';

const cardStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.08)',
  backdropFilter: 'blur(22px) saturate(180%)',
  WebkitBackdropFilter: 'blur(22px) saturate(180%)',
  borderRadius: 28,
  border: '1px solid rgba(255, 255, 255, 0.12)',
  padding: '32px',
  boxShadow: '0 24px 72px rgba(3, 8, 20, 0.34)',
};

const logoWrapperStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-start',
  marginBottom: 24,
};

const logoStyle: React.CSSProperties = {
  width: 54,
  height: 54,
  borderRadius: 18,
  background: 'linear-gradient(135deg, #4f8cff 0%, #22d3ee 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#ffffff',
  fontSize: 24,
  fontWeight: 700,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  boxShadow: '0 16px 32px rgba(79, 140, 255, 0.28)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 48,
  borderRadius: 16,
  border: '1px solid rgba(255, 255, 255, 0.12)',
  padding: '0 18px',
  fontSize: 15,
  fontFamily: 'inherit',
  color: '#eef2ff',
  outline: 'none',
  boxSizing: 'border-box',
  background: 'rgba(8, 15, 30, 0.58)',
  transition: 'border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast)',
};

const inputGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
};

const codeBtnStyle: React.CSSProperties = {
  height: 48,
  borderRadius: 16,
  border: '1px solid rgba(79, 140, 255, 0.22)',
  background: 'rgba(79, 140, 255, 0.08)',
  color: '#dbeafe',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '0 16px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  fontFamily: 'inherit',
  transition: 'opacity var(--transition-fast), transform var(--transition-fast), background var(--transition-fast)',
};

const submitBtnStyle: React.CSSProperties = {
  width: '100%',
  height: 48,
  borderRadius: 16,
  border: 'none',
  background: 'linear-gradient(135deg, #4f8cff 0%, #22d3ee 100%)',
  color: '#ffffff',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'transform var(--transition-fast), opacity var(--transition-fast), box-shadow var(--transition-fast)',
  boxShadow: '0 18px 32px rgba(79, 140, 255, 0.26)',
};

const errorStyle: React.CSSProperties = {
  background: 'rgba(239, 68, 68, 0.12)',
  border: '1px solid rgba(248, 113, 113, 0.24)',
  borderRadius: 14,
  color: '#fecaca',
  padding: '10px 14px',
  fontSize: 14,
  marginBottom: 20,
  fontFamily: 'inherit',
};

const successStyle: React.CSSProperties = {
  background: 'rgba(34, 197, 94, 0.12)',
  border: '1px solid rgba(74, 222, 128, 0.24)',
  borderRadius: 14,
  color: '#bbf7d0',
  padding: '10px 14px',
  fontSize: 14,
  marginBottom: 20,
  fontFamily: 'inherit',
};

const formGroupStyle: React.CSSProperties = {
  marginBottom: 14,
};

export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: '',
    display_name: '',
    real_name: '',
    email: '',
    phone: '',
    password: '',
    code: '',
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setError('');
    setSuccess('');
  };

  const handleSendCode = async () => {
    if (!form.phone) {
      setError('请先输入手机号');
      return;
    }
    setError('');
    setSendingCode(true);
    try {
      await authApi.sendCode(form.phone, 'register');
      setCodeSent(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || '验证码发送失败';
      setError(msg);
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Basic validation
    const missing = (
      ['username', 'display_name', 'real_name', 'email', 'phone', 'password', 'code'] as const
    ).filter((k) => !form[k]);
    if (missing.length > 0) {
      setError('请填写所有必填字段');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.register({
        username: form.username,
        display_name: form.display_name,
        real_name: form.real_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        code: form.code,
      });
      setSuccess('注册成功！即将跳转到登录页面...');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || '注册失败，请重试';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const inputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--color-primary)';
  };
  const inputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'var(--color-hairline)';
  };

  const fields: { key: keyof typeof form; label: string; type: string; placeholder: string }[] = [
    { key: 'username', label: '用户名', type: 'text', placeholder: '用户名' },
    { key: 'display_name', label: '显示名称', type: 'text', placeholder: '显示名称' },
    { key: 'real_name', label: '真实姓名', type: 'text', placeholder: '真实姓名' },
    { key: 'email', label: '邮箱', type: 'email', placeholder: '邮箱' },
    { key: 'password', label: '密码', type: 'password', placeholder: '密码' },
  ];

  return (
    <motion.div
      style={cardStyle}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: 9999, border: '1px solid rgba(255, 255, 255, 0.12)', background: 'rgba(255, 255, 255, 0.06)', color: 'rgba(226, 232, 240, 0.76)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          Onboarding
        </div>

        {/* Logo */}
        <div style={logoWrapperStyle}>
          <div style={logoStyle}>明</div>
        </div>

        {/* Title */}
        <h1
          className="typography-display-lg"
          style={{ textAlign: 'left', marginBottom: 12, fontSize: 32, color: '#f8fafc' }}
        >
          注册明月学术平台
        </h1>
        <p className="typography-caption" style={{ color: 'rgba(226, 232, 240, 0.70)', marginBottom: 28, lineHeight: 1.6 }}>
          通过验证码完成入驻，注册流程保持简洁但视觉更克制。
        </p>
      </div>

      {/* Error / Success messages */}
      {error && <div style={errorStyle}>{error}</div>}
      {success && <div style={successStyle}>{success}</div>}

      <form onSubmit={handleSubmit}>
        {/* Text fields */}
        {fields.map(({ key, placeholder, type }) => (
          <div key={key} style={formGroupStyle}>
            <input
              type={type}
              placeholder={placeholder}
              value={form[key]}
              onChange={updateField(key)}
              onFocus={inputFocus}
              onBlur={inputBlur}
              style={inputStyle}
            />
          </div>
        ))}

        {/* Phone + Code */}
        <div style={formGroupStyle}>
          <div style={inputGroupStyle}>
            <input
              type="tel"
              placeholder="手机号"
              value={form.phone}
              onChange={updateField('phone')}
              onFocus={inputFocus}
              onBlur={inputBlur}
              style={inputStyle}
            />
            <button
              type="button"
              disabled={sendingCode}
              onClick={handleSendCode}
              style={{
                ...codeBtnStyle,
                opacity: sendingCode ? 0.5 : 1,
              }}
            >
              {sendingCode ? '发送中...' : codeSent ? '重新发送' : '发送验证码'}
            </button>
          </div>
        </div>

        {/* Verification code */}
        <div style={formGroupStyle}>
          <input
            type="text"
            placeholder="验证码"
            value={form.code}
            onChange={updateField('code')}
            onFocus={inputFocus}
            onBlur={inputBlur}
            style={inputStyle}
          />
        </div>

        {/* Submit */}
        <div style={{ marginTop: 24 }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              ...submitBtnStyle,
              opacity: submitting ? 0.6 : 1,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!submitting) (e.target as HTMLButtonElement).style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.transform = 'scale(1)';
            }}
            onMouseDown={(e) => {
              if (!submitting) (e.target as HTMLButtonElement).style.transform = 'scale(0.98)';
            }}
            onMouseUp={(e) => {
              (e.target as HTMLButtonElement).style.transform = 'scale(1)';
            }}
          >
            {submitting ? '注册中...' : '注册'}
          </button>
        </div>
      </form>

      {/* Login link */}
      <p
        className="typography-caption"
        style={{ textAlign: 'center', marginTop: 24, color: 'rgba(226, 232, 240, 0.62)' }}
      >
        已有账号？{' '}
        <Link
          to="/login"
          style={{
            color: '#93c5fd',
            fontWeight: 600,
          }}
        >
          返回登录
        </Link>
      </p>
    </motion.div>
  );
}
