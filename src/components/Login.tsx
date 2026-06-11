import React, { useState } from 'react';

interface LoginProps {
  onLoginSuccess: (user: any, token: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Registration fields
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError('Por favor, ingrese su usuario.');
      return;
    }

    if (password.length < 5) {
      setError('La contraseña debe tener al menos 5 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/beta/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: trimmedUsername,
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ocurrió un error al iniciar sesión.');
      }

      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      setError(err.message || 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegSuccess('');

    const trimmedFirst = regFirstName.trim();
    const trimmedLast = regLastName.trim();
    const trimmedUser = regUsername.trim();

    if (!trimmedFirst || !trimmedLast || !trimmedUser || !regPassword) {
      setError('Todos los campos son requeridos.');
      return;
    }

    if (regPassword.length < 5) {
      setError('La contraseña debe tener al menos 5 caracteres.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/beta/api/registration-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: trimmedFirst,
          lastName: trimmedLast,
          username: trimmedUser,
          password: regPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ocurrió un error al enviar la solicitud.');
      }

      setRegSuccess(data.message || 'Solicitud enviada correctamente.');
      setRegFirstName('');
      setRegLastName('');
      setRegUsername('');
      setRegPassword('');
      setRegConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setError('');
    setRegSuccess('');
  };

  const inputGroupStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px' };
  const labelStyle: React.CSSProperties = { color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' };
  const inputWrapStyle: React.CSSProperties = { position: 'relative' };
  const iconStyle: React.CSSProperties = { position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '14px' };
  const inputStyle: React.CSSProperties = { width: '100%', paddingLeft: '44px', fontSize: '14px', height: '48px', boxSizing: 'border-box' };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#040406',
      backgroundImage: `
        radial-gradient(circle at 10% 20%, rgba(10, 132, 255, 0.15) 0%, transparent 45%),
        radial-gradient(circle at 90% 80%, rgba(191, 90, 242, 0.15) 0%, transparent 45%)
      `,
      backgroundAttachment: 'fixed',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: mode === 'register' ? '480px' : '420px',
        padding: '40px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
        animation: 'fadeIn 0.5s ease',
        background: 'rgba(20, 20, 25, 0.45)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        transition: 'max-width 0.3s ease'
      }}>
        {/* Header/Logos */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="logo-badge" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '4px 10px', borderRadius: '8px' }}>
              <img src="/beta/logo_ingentron.png" alt="Ingentron" style={{ maxHeight: '20px', width: 'auto' }} />
            </div>
            <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)' }}></div>
            <div className="logo-badge" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '4px 10px', borderRadius: '8px' }}>
              <img src="/beta/logo_gruya.jpg" alt="Gruya" style={{ maxHeight: '20px', width: 'auto' }} />
            </div>
          </div>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="beta-badge" style={{ fontSize: '11px', padding: '3px 8px' }}>Beta</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>
              {mode === 'login' ? 'Iniciar Sesión' : 'Solicitar Acceso'}
            </span>
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: '6px' }}>
            {mode === 'login' ? 'Ingresar al Sistema' : 'Solicitar Acceso'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.4' }}>
            {mode === 'login'
              ? 'Introduce tus credenciales para acceder al panel administrativo.'
              : 'Completá tus datos para enviar una solicitud de acceso. Un administrador la revisará.'}
          </p>
        </div>

        {/* SUCCESS MESSAGE (registration) */}
        {regSuccess && (
          <div style={{
            width: '100%',
            background: 'rgba(48, 209, 88, 0.1)',
            border: '1px solid rgba(48, 209, 88, 0.25)',
            padding: '16px 20px',
            borderRadius: '12px',
            color: 'var(--success-color)',
            fontSize: '13px',
            lineHeight: '1.5',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            boxSizing: 'border-box'
          }}>
            <i className="fas fa-check-circle" style={{ flexShrink: 0, marginTop: '2px', fontSize: '16px' }}></i>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>¡Solicitud enviada!</div>
              <div>{regSuccess}</div>
            </div>
          </div>
        )}

        {/* LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={inputGroupStyle}>
              <label htmlFor="login-username" style={labelStyle}>Usuario</label>
              <div style={inputWrapStyle}>
                <i className="fas fa-user" style={iconStyle}></i>
                <input
                  id="login-username"
                  type="text"
                  className="glass-input"
                  style={inputStyle}
                  placeholder="Nombre de usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div style={inputGroupStyle}>
              <label htmlFor="login-password" style={labelStyle}>Contraseña</label>
              <div style={inputWrapStyle}>
                <i className="fas fa-lock" style={iconStyle}></i>
                <input
                  id="login-password"
                  type="password"
                  className="glass-input"
                  style={inputStyle}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(255, 69, 58, 0.1)',
                border: '1px solid rgba(255, 69, 58, 0.25)',
                padding: '12px 16px',
                borderRadius: '10px',
                color: 'var(--danger-color)',
                fontSize: '13px',
                lineHeight: '1.4',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <i className="fas fa-exclamation-circle" style={{ flexShrink: 0 }}></i>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{
                width: '100%',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                fontSize: '15px',
                fontWeight: 600,
                marginTop: '6px',
                borderRadius: '12px'
              }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <i className="fas fa-circle-notch fa-spin"></i>
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <span>Ingresar</span>
                  <i className="fas fa-arrow-right"></i>
                </>
              )}
            </button>
          </form>
        )}

        {/* REGISTRATION FORM */}
        {mode === 'register' && !regSuccess && (
          <form onSubmit={handleRegister} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={inputGroupStyle}>
                <label htmlFor="reg-firstname" style={labelStyle}>Nombre</label>
                <div style={inputWrapStyle}>
                  <i className="fas fa-user" style={iconStyle}></i>
                  <input
                    id="reg-firstname"
                    type="text"
                    className="glass-input"
                    style={inputStyle}
                    placeholder="Juan"
                    value={regFirstName}
                    onChange={(e) => setRegFirstName(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
              <div style={inputGroupStyle}>
                <label htmlFor="reg-lastname" style={labelStyle}>Apellido</label>
                <div style={inputWrapStyle}>
                  <i className="fas fa-user" style={iconStyle}></i>
                  <input
                    id="reg-lastname"
                    type="text"
                    className="glass-input"
                    style={inputStyle}
                    placeholder="Pérez"
                    value={regLastName}
                    onChange={(e) => setRegLastName(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div style={inputGroupStyle}>
              <label htmlFor="reg-username" style={labelStyle}>Nombre de Usuario</label>
              <div style={inputWrapStyle}>
                <i className="fas fa-at" style={iconStyle}></i>
                <input
                  id="reg-username"
                  type="text"
                  className="glass-input"
                  style={inputStyle}
                  placeholder="juanperez"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  disabled={loading}
                />
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '2px' }}>
                No diferencia entre mayúsculas y minúsculas
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={inputGroupStyle}>
                <label htmlFor="reg-password" style={labelStyle}>Contraseña</label>
                <div style={inputWrapStyle}>
                  <i className="fas fa-lock" style={iconStyle}></i>
                  <input
                    id="reg-password"
                    type="password"
                    className="glass-input"
                    style={inputStyle}
                    placeholder="••••••••"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '2px' }}>
                  Mínimo 5 caracteres
                </span>
              </div>
              <div style={inputGroupStyle}>
                <label htmlFor="reg-confirm-password" style={labelStyle}>Confirmar</label>
                <div style={inputWrapStyle}>
                  <i className="fas fa-lock" style={iconStyle}></i>
                  <input
                    id="reg-confirm-password"
                    type="password"
                    className="glass-input"
                    style={inputStyle}
                    placeholder="••••••••"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div style={{
                background: 'rgba(255, 69, 58, 0.1)',
                border: '1px solid rgba(255, 69, 58, 0.25)',
                padding: '12px 16px',
                borderRadius: '10px',
                color: 'var(--danger-color)',
                fontSize: '13px',
                lineHeight: '1.4',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <i className="fas fa-exclamation-circle" style={{ flexShrink: 0 }}></i>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{
                width: '100%',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                fontSize: '15px',
                fontWeight: 600,
                marginTop: '6px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(48, 209, 88, 0.8), rgba(10, 132, 255, 0.8))'
              }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <i className="fas fa-circle-notch fa-spin"></i>
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-paper-plane"></i>
                  <span>Enviar Solicitud</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Mode toggle link */}
        <div style={{ 
          width: '100%', 
          textAlign: 'center', 
          borderTop: '1px solid rgba(255, 255, 255, 0.06)', 
          paddingTop: '20px' 
        }}>
          {mode === 'login' ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              ¿No tenés cuenta?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                  padding: 0
                }}
              >
                Solicitar acceso
              </button>
            </p>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              ¿Ya tenés cuenta?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                  padding: 0
                }}
              >
                Iniciar sesión
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
