import { Saldo } from '../types';

// Pure formatting / date / status helpers shared across the app.
// (Extracted from App.tsx — no component state involved.)

export const parseWeekEndDate = (weekStr: string): Date => {
  if (!weekStr) return new Date(0);
  if (weekStr === 'Tiempo Real') return new Date(8640000000000000);
  const parts = weekStr.split(' al ');
  let dateStr = parts.length === 2 ? parts[1] : weekStr;
  dateStr = dateStr.replace(/^[Dd]el\s+/, '').replace(/^[Aa][Ll]\s+/, '').replace(/^SEMANA\s+/, '').trim();
  const dateParts = dateStr.split('/');
  if (dateParts.length === 3) {
    let y = parseInt(dateParts[2]);
    if (y < 100) y += 2000;
    return new Date(y, parseInt(dateParts[1]) - 1, parseInt(dateParts[0]));
  }
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) return new Date(parsed);
  return new Date(0);
};

export const formatDate = (excelDate: any): any => {
  if (!excelDate || excelDate === 'N/A') return 'N/A';
  if (typeof excelDate === 'string') return excelDate;
  if (typeof excelDate === 'number') {
    const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    return date.toLocaleDateString('es-AR');
  }
  return excelDate;
};

export const parseExcelDate = (excelDate: any): Date | null => {
  if (!excelDate || excelDate === 'N/A') return null;
  if (typeof excelDate === 'number') {
    return new Date(Math.round((excelDate - 25569) * 86400 * 1000));
  }
  if (typeof excelDate === 'string') {
    const parts = excelDate.trim().split('/');
    if (parts.length === 3) {
      let day = parseInt(parts[0], 10);
      let month = parseInt(parts[1], 10) - 1;
      let year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    }
  }
  const d = new Date(excelDate);
  return isNaN(d.getTime()) ? null : d;
};

export interface StatusBadge {
  text: string;
  class: string;
}

export const getDueDateStatus = (dueDateExcel: any, dateExcel: any, _amount: number): StatusBadge => {
  let parsedDate = parseExcelDate(dateExcel);
  if (!parsedDate) {
    parsedDate = parseExcelDate(dueDateExcel);
  }
  if (!parsedDate) {
    return { text: 'N/A', class: 'bg-dark' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsedDate.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - parsedDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 7) {
    return { text: 'No vencido', class: 'bg-green' };
  } else if (diffDays >= 8 && diffDays <= 30) {
    return { text: 'Vencido', class: 'bg-accent' };
  } else {
    return { text: 'Más de 30 días', class: 'bg-red' };
  }
};

export const getClientMostCriticalStatus = (invoices: Saldo[]): StatusBadge => {
  if (!invoices || invoices.length === 0) {
    return { text: 'N/A', class: 'bg-dark' };
  }

  let maxSeverity = 0;
  let mostCritical: StatusBadge = { text: 'N/A', class: 'bg-dark' };

  invoices.forEach(inv => {
    const status = getDueDateStatus(inv.dueDate, inv.date, inv.amount);
    let severity = 0;
    if (status.text === 'No vencido') severity = 1;
    else if (status.text === 'Vencido') severity = 2;
    else if (status.text === 'Más de 30 días') severity = 3;

    if (severity > maxSeverity) {
      maxSeverity = severity;
      mostCritical = status;
    }
  });

  return mostCritical;
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2
  }).format(value);
};

export const formatAbbreviatedCurrency = (value: number): string => {
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  let formatted = '';

  if (absValue >= 1e6) {
    formatted = new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }).format(absValue / 1e6) + 'M';
  } else if (absValue >= 1e3) {
    formatted = new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }).format(absValue / 1e3) + 'K';
  } else {
    formatted = new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(absValue);
  }
  return (isNegative ? '-$ ' : '$ ') + formatted;
};

export const getDaysRemaining = (expiryStr: string): number => {
  const localDate = new Date(new Date().getTime() - 3 * 3600 * 1000); // UTC-3
  const todayStr = localDate.toISOString().split('T')[0];
  const today = new Date(todayStr + 'T00:00:00');
  const expiry = new Date(expiryStr + 'T00:00:00');
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const getStockStatus = (days: number): StatusBadge => {
  if (days <= 0) return { text: 'VENCIDO', class: 'badge-expired' };
  if (days <= 30) return { text: 'ALERTA CRÍTICA', class: 'badge-critical' };
  if (days <= 90) return { text: 'PRÓXIMO', class: 'badge-upcoming' };
  return { text: 'EN REGLA', class: 'badge-ok' };
};

export const formatDateToES = (dateStr: string): string => {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2, 4)}`;
};

export const getOriginColorClass = (origin: string): string => {
  if (origin === 'Aguas') return 'bg-blue text-white';
  if (origin === 'Salliquelo') return 'bg-purple text-white';
  if (origin === 'Trenque Lauquen') return 'bg-green text-white';
  if (origin === 'PepsiCo') return 'bg-red text-white';
  if (origin === 'Serenisima') return 'bg-pink text-white';
  return 'bg-accent text-white';
};
