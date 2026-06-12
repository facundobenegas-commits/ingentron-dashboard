import React from 'react';

interface ConnectionAlertModalProps {
  /** HTML message (server list) — rendered via dangerouslySetInnerHTML as in the original */
  message: string;
  onAccept: () => void;
}

export const ConnectionAlertModal: React.FC<ConnectionAlertModalProps> = ({ message, onAccept }) => (
  <div id="connection-alert-modal" className="modal active" role="alertdialog" aria-modal="true" aria-label="Servidor Desconectado">
    <div className="modal-content glass-card" style={{ maxWidth: '450px', textAlign: 'center', padding: '32px', gap: '20px', alignItems: 'center' }}>
      <div style={{ fontSize: '52px', color: '#ff9f0a', marginBottom: '8px' }}>
        <i className="fas fa-exclamation-triangle"></i>
      </div>
      <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#fff' }}>Servidor Desconectado</h3>
      <p
        id="connection-alert-message"
        style={{ fontSize: '14.5px', opacity: 0.85, margin: 0, lineHeight: 1.6, color: '#f2f2f7' }}
        dangerouslySetInnerHTML={{ __html: message }}
      ></p>
      <button
        id="connection-alert-btn"
        className="glass-btn"
        onClick={onAccept}
        style={{ background: '#ff9f0a', border: 'none', borderRadius: '12px', padding: '12px 28px', color: '#000', fontWeight: 700, fontSize: '14px', cursor: 'pointer', marginTop: '8px', boxShadow: '0 4px 12px rgba(255, 159, 10, 0.25)' }}
      >
        Aceptar
      </button>
    </div>
  </div>
);
