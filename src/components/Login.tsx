import React, { useState } from 'react';

interface LoginProps {
  onLoginSuccess: (user: any, token: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
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
        maxWidth: '420px',
        padding: '40px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
        animation: 'fadeIn 0.5s ease',
        background: 'rgba(20, 20, 25, 0.45)',
        border: '1px solid rgba(255, 255, 255, 0.08)'
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
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>Iniciar Sesión</span>
          </div>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', marginBottom: '6px' }}>Ingresar al Sistema</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.4' }}>
            Introduce tus credenciales para acceder al panel administrativo.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="login-username" style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Usuario
            </label>
            <div style={{ position: 'relative' }}>
              <i className="fas fa-user" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '14px' }}></i>
              <input
                id="login-username"
                type="text"
                className="glass-input"
                style={{ width: '100%', paddingLeft: '44px', fontSize: '14px', height: '48px', boxSizing: 'border-box' }}
                placeholder="Nombre de usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="login-password" style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <i className="fas fa-lock" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '14px' }}></i>
              <input
                id="login-password"
                type="password"
                className="glass-input"
                style={{ width: '100%', paddingLeft: '44px', fontSize: '14px', height: '48px', boxSizing: 'border-box' }}
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
      </div>
    </div>
  );
};
