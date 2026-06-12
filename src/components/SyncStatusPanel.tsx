import React from 'react';
import { SyncStatus } from '../types';

interface SyncStatusPanelProps {
  syncStatus: SyncStatus;
  isExpanded: boolean;
  hasOffline: boolean;
  isOffline: (key: string) => boolean;
  onClick: () => void;
}

const SERVERS: { key: keyof SyncStatus; dot: string; label: string }[] = [
  { key: 'Aguas', dot: 'aguas', label: 'Calvo (Aguas)' },
  { key: 'PepsiCo', dot: 'pepsico', label: 'Gescom (PepsiCo)' },
  { key: 'Serenisima', dot: 'serenisima', label: 'Calvo (La Serenísima)' },
  { key: 'Salliquelo', dot: 'salliquelo', label: 'Calvo (Salliqueló)' },
  { key: 'Trenque Lauquen', dot: 'trenque', label: 'Gescom (T. Lauquen)' },
  { key: 'Digip', dot: 'digip', label: 'Digip WMS (Stock)' },
];

const formatSyncDate = (isoStr: string | null) => {
  if (!isoStr) return 'Sin conexión!';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return 'Sin conexión!';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
};

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', whiteSpace: 'nowrap' };

export const SyncStatusPanel: React.FC<SyncStatusPanelProps> = ({ syncStatus, isExpanded, hasOffline, isOffline, onClick }) => (
  <div
    id="sync-status-panel"
    className={`glass-card ${isExpanded ? 'expanded' : ''} ${hasOffline ? 'has-offline' : ''}`}
    onClick={onClick}
  >
    <div style={{ fontWeight: 600, opacity: 0.5, textTransform: 'uppercase', fontSize: '7px', letterSpacing: '0.5px', marginBottom: '1px' }}>ÚLTIMA SINCRONIZACIÓN</div>
    {SERVERS.map(({ key, dot, label }) => (
      <div key={key} style={rowStyle}>
        <span className={`status-dot status-dot-${dot} ${isOffline(key) ? 'offline' : ''}`}></span>
        <span style={{ opacity: 0.85 }}>{label}: <span style={{ fontWeight: 500 }}>{formatSyncDate(syncStatus[key])}</span></span>
      </div>
    ))}
  </div>
);
