import React from 'react';

type ModuleKey = 'dashboard' | 'stockExpiration' | 'usersManagement';
type ViewKey = 'dashboard' | 'stock-expiration' | 'users-management';

interface HomeViewProps {
  logoIngentronSrc: string;
  logoGruyaSrc: string;
  isModuleVisible: (module: ModuleKey) => boolean;
  navigateToModule: (view: ViewKey) => void;
}

interface ModuleCardConfig {
  module: ModuleKey;
  view: ViewKey;
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}

const MODULES: ModuleCardConfig[] = [
  {
    module: 'dashboard', view: 'dashboard', icon: 'fa-wallet',
    iconBg: 'rgba(59, 130, 246, 0.12)', iconColor: '#3b82f6',
    title: 'Cuentas Corrientes',
    description: 'Monitoreo de saldos de clientes, facturas pendientes y evolución histórica de deudas.',
  },
  {
    module: 'stockExpiration', view: 'stock-expiration', icon: 'fa-boxes',
    iconBg: 'rgba(139, 92, 246, 0.12)', iconColor: '#8b5cf6',
    title: 'Control de Vencimientos',
    description: 'Gestión de caducidad de artículos sincronizada con DIGIP WMS.',
  },
  {
    module: 'usersManagement', view: 'users-management', icon: 'fa-users-cog',
    iconBg: 'rgba(191, 90, 242, 0.12)', iconColor: 'var(--purple-color)',
    title: 'Administrar Usuarios',
    description: 'Controlar perfiles, contraseñas y permisos del personal.',
  },
];

const cardStyle: React.CSSProperties = { padding: '32px', borderRadius: '20px', cursor: 'pointer', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(255, 255, 255, 0.02)', minHeight: '220px' };

export const HomeView: React.FC<HomeViewProps> = ({ logoIngentronSrc, logoGruyaSrc, isModuleVisible, navigateToModule }) => {
  const visibleModules = MODULES.filter(m => isModuleVisible(m.module));

  return (
    <div id="home-view" className="view-section" style={{ display: 'flex', minHeight: 'calc(100vh - 100px)', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '1000px', width: '100%', margin: 'auto', padding: '20px' }}>
        <div className="home-logos-container" style={{ display: 'flex', alignItems: 'center', gap: '20px', justifyContent: 'center', marginBottom: '56px', flexDirection: 'column' }}>
          <div className="home-logos-row" style={{ display: 'flex', alignItems: 'center', gap: '20px', justifyContent: 'center' }}>
            <div className="glowing-logo-badge brand-ingentron">
              <div className="glowing-logo-badge-inner">
                <img src={logoIngentronSrc} alt="Ingentron" id="home-logo-ingentron" style={{ maxHeight: '44px', width: 'auto', objectFit: 'contain' }} />
              </div>
            </div>
            <div className="logo-separator" style={{ width: '1px', height: '36px', background: 'rgba(255,255,255,0.15)' }}></div>
            <div className="glowing-logo-badge brand-gruya">
              <div className="glowing-logo-badge-inner">
                <img src={logoGruyaSrc} alt="Gruya" id="home-logo-gruya" style={{ maxHeight: '44px', width: 'auto', objectFit: 'contain' }} />
              </div>
            </div>
          </div>
          <span className="beta-badge" style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '10px' }}>Versión Beta</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 340px))', gap: '24px', justifyContent: 'center', maxWidth: '720px', margin: '0 auto' }}>
          {visibleModules.map(m => (
            <div key={m.module} className="module-card glass-card" onClick={() => navigateToModule(m.view)} style={cardStyle}>
              <div className="module-icon-container" style={{ width: '56px', height: '56px', borderRadius: '14px', background: m.iconBg, color: m.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                <i className={`fas ${m.icon}`}></i>
              </div>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>{m.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>{m.description}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: m.iconColor, marginTop: 'auto' }}>
                <span>Acceder</span> <i className="fas fa-chevron-right" style={{ fontSize: '10px' }}></i>
              </div>
            </div>
          ))}

          {visibleModules.length === 0 && (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center', gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <i className="fas fa-user-lock" style={{ fontSize: '48px', color: 'var(--danger-color)', marginBottom: '10px' }}></i>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#fff' }}>Acceso Restringido</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '400px', lineHeight: 1.5 }}>No tienes permisos habilitados para acceder a ningún módulo del sistema. Por favor, contacta a un administrador.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
