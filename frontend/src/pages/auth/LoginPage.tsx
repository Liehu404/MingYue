import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
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

const dividerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  margin: '24px 0',
};

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: 'rgba(255, 255, 255, 0.10)',
  border: 'none',
};

const dividerTextStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'rgba(226, 232, 240, 0.60)',
  whiteSpace: 'nowrap',
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

const formGroupStyle: React.CSSProperties = {
  marginBottom: 14,
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSendCode = async () => {
    if (!phone) {
      setError('请先输入手机号');
      return;
    }
    setError('');
    setSendingCode(true);
    try {
      await authApi.sendCode(phone, 'login');
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

    // Determine login method based on which fields are filled
    const usePhoneLogin = phone && code;

    if (!usePhoneLogin && !username && !password) {
      setError('请填写手机号和验证码，或用户名和密码');
      return;
    }

    setSubmitting(true);
    try {
      const params: { username?: string; password?: string; phone?: string; code?: string } = {};
      if (usePhoneLogin) {
        params.phone = phone;
        params.code = code;
      } else {
        params.username = username;
        params.password = password;
      }
      await login(params);
      navigate('/', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message || '登录失败，请重试';
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

  return (
    <motion.div
      style={cardStyle}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'inline-flex', padding: '6px 12px', borderRadius: 9999, border: '1px solid rgba(255, 255, 255, 0.12)', background: 'rgba(255, 255, 255, 0.06)', color: 'rgba(226, 232, 240, 0.76)', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          Secure Access
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
          登录明月学术平台
        </h1>
        <p className="typography-caption" style={{ color: 'rgba(226, 232, 240, 0.70)', marginBottom: 28, lineHeight: 1.6 }}>
          支持手机号验证码与账号密码双通道登录。
        </p>
      </div>

      {/* Error / Success messages */}
      {error && <div style={errorStyle}>{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Phone + Verification Code */}
        <div style={formGroupStyle}>
          <div style={inputGroupStyle}>
            <input
              type="tel"
              placeholder="手机号"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(''); }}
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

        <div style={formGroupStyle}>
          <input
            type="text"
            placeholder="验证码"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(''); }}
            onFocus={inputFocus}
            onBlur={inputBlur}
            style={inputStyle}
          />
        </div>

        {/* OR Divider */}
        <div style={dividerRowStyle}>
          <hr style={dividerLineStyle} />
          <span style={dividerTextStyle}>或</span>
          <hr style={dividerLineStyle} />
        </div>

        {/* Username */}
        <div style={formGroupStyle}>
          <input
            type="text"
            placeholder="用户名"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(''); }}
            onFocus={inputFocus}
            onBlur={inputBlur}
            style={inputStyle}
          />
        </div>

        {/* Password */}
        <div style={formGroupStyle}>
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
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
            {submitting ? '登录中...' : '登录'}
          </button>
        </div>
      </form>

      {/* Register link */}
      <p
        className="typography-caption"
        style={{ textAlign: 'center', marginTop: 24, color: 'rgba(226, 232, 240, 0.62)' }}
      >
        还没有账号？{' '}
        <Link
          to="/register"
          style={{
            color: '#93c5fd',
            fontWeight: 600,
          }}
        >
          立即注册
        </Link>
      </p>
    </motion.div>
  );
}
