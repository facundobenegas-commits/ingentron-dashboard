import React from 'react';
import { Saldo } from '../types';
import { formatCurrency, formatDate, getDueDateStatus, getOriginColorClass } from '../utils/format';

interface InvoiceModalProps {
  client: string;
  clientCodes: Record<string, Set<string>>;
  originsList: string[];
  originFilter: string;
  onOriginFilterChange: (value: string) => void;
  invoices: Saldo[];
  totalAmount: number;
  onClose: () => void;
  onDownloadPDF: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  client, clientCodes, originsList, originFilter, onOriginFilterChange, invoices, totalAmount, onClose, onDownloadPDF,
}) => (
  <div id="invoice-modal" className="modal active" role="dialog" aria-modal="true" aria-labelledby="modal-client-name" onClick={onClose}>
    <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header" style={{ alignItems: 'flex-start' }}>
        <div className="modal-header-info" style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3 id="modal-client-name" style={{ fontSize: '1.5rem', margin: 0 }}>{client}</h3>
            <div id="modal-client-codes" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {Object.entries(clientCodes).map(([org, codeSet]) => {
                const codes = Array.from(codeSet).join(' | ');
                return (
                  <span key={org} className="client-code-badge"><i className="fas fa-tag"></i> {org}: {codes}</span>
                );
              })}
            </div>
          </div>

          {/* Modal filters */}
          <div id="modal-origin-filters" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {originsList.length > 1 && (
              <button
                className={`modal-filter-btn bg-dark ${originFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => onOriginFilterChange('ALL')}
              >
                Todo
              </button>
            )}
            {originsList.map(org => (
              <button
                key={org}
                className={`modal-filter-btn ${getOriginColorClass(org)} ${originFilter === org ? 'active' : ''}`}
                onClick={() => onOriginFilterChange(org)}
              >
                {org}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginRight: '20px' }}>
          <button
            id="modal-download-pdf-btn"
            className="glass-btn"
            onClick={onDownloadPDF}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(10, 132, 255, 0.12)', border: '1px solid rgba(10, 132, 255, 0.3)', borderRadius: '12px', padding: '12px 18px', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', height: '52px' }}
          >
            <i className="fas fa-file-pdf" style={{ color: '#ff453a', fontSize: '14px' }}></i> Descargar PDF
          </button>
          <div className="glass-card" style={{ padding: '12px 24px', textAlign: 'right', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '11px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Total Seleccionado</div>
            <div id="modal-total-amount" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-color)', margin: 0, lineHeight: 1 }}>{formatCurrency(totalAmount)}</div>
          </div>
        </div>
        <span className="close-modal" onClick={onClose}>&times;</span>
      </div>

      <div className="modal-body">
        <div id="table-anim-wrapper" style={{ overflow: 'hidden' }}>
          <table className="invoice-table" id="invoices-table">
            <thead>
              <tr>
                <th><i className="fas fa-file-invoice" style={{ marginRight: '6px', color: 'var(--accent-color)', opacity: 0.9 }}></i>Comprobante</th>
                <th><i className="fas fa-calendar-alt" style={{ marginRight: '6px', color: '#bf5af2', opacity: 0.9 }}></i>Fecha</th>
                <th className="text-center"><i className="fas fa-info-circle" style={{ marginRight: '6px', color: '#64d2ff', opacity: 0.9 }}></i>Estado</th>
                <th className="text-right"><i className="fas fa-dollar-sign" style={{ marginRight: '4px', color: '#ffd60a', opacity: 0.9 }}></i>Importe</th>
                <th className="text-right"><i className="fas fa-check-circle" style={{ marginRight: '4px', color: '#30d158', opacity: 0.9 }}></i>Canceló</th>
                <th className="text-right"><i className="fas fa-exclamation-circle" style={{ marginRight: '4px', color: '#ff9f0a', opacity: 0.9 }}></i>Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, index) => {
                const status = getDueDateStatus(inv.dueDate, inv.date, inv.amount);
                const originalAmt = inv.originalAmount ?? inv.amount;
                const paidAmt = inv.paidAmount ?? 0;
                return (
                  <tr key={index} className="row-fade-in" style={{ animationDelay: `${Math.min(index * 0.03, 0.5)}s` }}>
                    <td style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', borderBottom: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{inv.invoice}</span>
                        {inv.clientCode && inv.clientCode !== 'N/A' && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>(Cód. {inv.clientCode})</span>}
                      </div>
                      <span className={`badge ${getOriginColorClass(inv.origin)}`} style={{ fontSize: '10px', padding: '2px 0', width: '60px', textAlign: 'center', display: 'inline-block', flexShrink: 0 }}>{inv.origin}</span>
                    </td>
                    <td>{formatDate(inv.date)}</td>
                    <td className="text-center">
                      <span className={`badge ${status.class}`} style={{ fontSize: '10px', padding: '4px 10px', fontWeight: 600, display: 'inline-flex', minWidth: '80px', textAlign: 'center', justifyContent: 'center' }}>{status.text}</span>
                    </td>
                    <td className="text-right font-medium" style={{ opacity: 0.8 }}>{formatCurrency(originalAmt)}</td>
                    <td className="text-right font-medium" style={{ color: '#30d158', opacity: 0.95 }}>{formatCurrency(paidAmt)}</td>
                    <td className="text-right font-medium" style={{ color: 'var(--accent-color)' }}>{formatCurrency(inv.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);
