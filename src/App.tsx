import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Saldo, StockItem, SyncStatus } from './types';

Chart.register(...registerables);

// Blacklisted accounts to hide when checked
const ACCOUNTS_TO_HIDE = new Set([
  '524', '20116', '2110', '17', '1593', '1840', '1707', '1722', '1708', 
  '1804', '1815', '841', '1698', '2671', '2698', '882', '20214', '20667', '172',
  '206', '3367'
]);

const NORMALIZED_ACCOUNTS_TO_HIDE = new Set(
  Array.from(ACCOUNTS_TO_HIDE).map(code => String(code).trim().replace(/^0+/, ''))
);

const empresaToOrigins: Record<string, string[]> = {
  'Ingentron': ['Aguas', 'PepsiCo'],
  'Gruya': ['Trenque Lauquen', 'Salliquelo']
};

export default function App() {
  // Navigation Routing
  const [currentView, setCurrentView] = useState<'home' | 'dashboard' | 'stock-expiration'>('home');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Data State
  const [globalData, setGlobalData] = useState<Saldo[]>([]);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [stockHistory, setStockHistory] = useState<Record<string, StockItem[]>>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    Aguas: null,
    PepsiCo: null,
    'Trenque Lauquen': null,
    Salliquelo: null,
    Digip: null
  });
  const [isCuentasCorrientesLoading, setIsCuentasCorrientesLoading] = useState(false);
  const [isStockLoading, setIsStockLoading] = useState(false);
  const [isRealStockLoaded, setIsRealStockLoaded] = useState(false);

  // Filters state (Cuentas Corrientes)
  const [empresaFilter, setEmpresaFilter] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [weekFilter, setWeekFilter] = useState('Tiempo Real');
  const [statusFilter, setStatusFilter] = useState('');
  const [hideCompensar, setHideCompensar] = useState(true);
  const [searchClient, setSearchClient] = useState('');

  // Filters state (Stock Expirations)
  const [searchStock, setSearchStock] = useState('');
  const [hideExpiredStock, setHideExpiredStock] = useState(true);

  // Stock table sorting state
  const [stockSortColumn, setStockSortColumn] = useState('restante');
  const [stockSortDirection, setStockSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedStockRows, setExpandedStockRows] = useState<Set<string>>(new Set());

  // Modal State
  const [isModalActive, setIsModalActive] = useState(false);
  const [modalClient, setModalClient] = useState('');
  const [modalInvoices, setModalInvoices] = useState<Saldo[]>([]);
  const [modalOriginFilter, setModalOriginFilter] = useState('ALL');

  // Connection alert modal
  const [connectionAlertActive, setConnectionAlertActive] = useState(false);
  const [connectionAlertMessage, setConnectionAlertMessage] = useState('');
  const acknowledgedOfflineServers = useRef<Set<string>>(new Set());

  // Logos base64 objects processed
  const logoIngentronObj = useRef<{ dark: string; light: string; width: number; height: number } | null>(null);
  const logoGruyaObj = useRef<{ dark: string; light: string; width: number; height: number } | null>(null);
  const [logoIngentronSrc, setLogoIngentronSrc] = useState('/logo_ingentron.png');
  const [logoGruyaSrc, setLogoGruyaSrc] = useState('/logo_gruya.jpg');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isSyncPanelExpanded, setIsSyncPanelExpanded] = useState(false);

  // Chart refs
  const statusChartRef = useRef<Chart | null>(null);
  const trendChartRef = useRef<Chart | null>(null);
  const stockRiskChartRef = useRef<Chart | null>(null);
  const stockTimelineChartRef = useRef<Chart | null>(null);

  // Canvas elements
  const statusCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const trendCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stockRiskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stockTimelineCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Dropdowns active states (custom select replacement)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Back to top visible state
  const [backToTopVisible, setBackToTopVisible] = useState(false);

  // --- SPA ROUTING HANDLER ---
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.includes('/CuentasCorrientes')) {
        setCurrentView('dashboard');
      } else if (path.includes('/ControlVencimientos')) {
        setCurrentView('stock-expiration');
      } else {
        setCurrentView('home');
      }
      setShowMobileFilters(false);
    };
    window.addEventListener('popstate', handlePopState);
    handlePopState();
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToModule = (view: 'home' | 'dashboard' | 'stock-expiration') => {
    let path = '/';
    if (view === 'dashboard') path = '/CuentasCorrientes';
    else if (view === 'stock-expiration') path = '/ControlVencimientos';
    window.history.pushState({ module: view }, '', path);
    setCurrentView(view);
    setShowMobileFilters(false);
  };

  // --- SYNC STATUS PANEL AUTO-COLLAPSE & TOGGLE LOGIC ---
  const autoCollapseTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (currentView !== 'home') {
      setIsSyncPanelExpanded(true);
      if (autoCollapseTimeoutRef.current) {
        clearTimeout(autoCollapseTimeoutRef.current);
      }
      autoCollapseTimeoutRef.current = setTimeout(() => {
        setIsSyncPanelExpanded(false);
      }, 3000);
    } else {
      setIsSyncPanelExpanded(false);
    }
    return () => {
      if (autoCollapseTimeoutRef.current) {
        clearTimeout(autoCollapseTimeoutRef.current);
      }
    };
  }, [currentView]);

  const handleSyncPanelClick = () => {
    if (autoCollapseTimeoutRef.current) {
      clearTimeout(autoCollapseTimeoutRef.current);
      autoCollapseTimeoutRef.current = null;
    }
    setIsSyncPanelExpanded(prev => !prev);
  };

  // --- LOGO PROCESSING ---
  useEffect(() => {
    const processLogo = (imgSrc: string, isGruya: boolean, callback: (res: any) => void) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imgSrc;
      img.onload = () => {
        const canvasDark = document.createElement('canvas');
        canvasDark.width = img.width;
        canvasDark.height = img.height;
        const ctxDark = canvasDark.getContext('2d');
        const canvasLight = document.createElement('canvas');
        canvasLight.width = img.width;
        canvasLight.height = img.height;
        const ctxLight = canvasLight.getContext('2d');

        if (!ctxDark || !ctxLight) {
          callback({ dark: imgSrc, light: imgSrc, width: 100, height: 30 });
          return;
        }

        ctxDark.drawImage(img, 0, 0);
        ctxLight.drawImage(img, 0, 0);

        try {
          const imgDataDark = ctxDark.getImageData(0, 0, canvasDark.width, canvasDark.height);
          const dataDark = imgDataDark.data;
          const imgDataLight = ctxLight.getImageData(0, 0, canvasLight.width, canvasLight.height);
          const dataLight = imgDataLight.data;

          for (let i = 0; i < dataDark.length; i += 4) {
            const r = dataDark[i];
            const g = dataDark[i + 1];
            const b = dataDark[i + 2];
            const a = dataDark[i + 3];

            if (a === 0) continue;

            const isWhite = (r > 215 && g > 215 && b > 215) || 
                            (r > 200 && g > 200 && b > 200 && Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15);

            if (isWhite) {
              dataDark[i + 3] = 0;
              dataLight[i + 3] = 0;
            } else {
              if (isGruya) {
                const isOrange = r > 180 && g > 100 && b < 80;
                if (!isOrange) {
                  const brightness = (r + g + b) / 3;
                  if (brightness < 160) {
                    dataDark[i] = 240;
                    dataDark[i + 1] = 244;
                    dataDark[i + 2] = 255;
                  }
                }
              } else {
                const isRed = r > 150 && g < 80 && b < 80;
                if (!isRed) {
                  dataDark[i] = 240;
                  dataDark[i + 1] = 244;
                  dataDark[i + 2] = 255;
                }
              }
            }
          }
          ctxDark.putImageData(imgDataDark, 0, 0);
          ctxLight.putImageData(imgDataLight, 0, 0);

          let minX = canvasDark.width;
          let minY = canvasDark.height;
          let maxX = 0;
          let maxY = 0;
          let hasVisiblePixels = false;
          const finalDataDark = ctxDark.getImageData(0, 0, canvasDark.width, canvasDark.height).data;

          for (let y = 0; y < canvasDark.height; y++) {
            for (let x = 0; x < canvasDark.width; x++) {
              const idx = (y * canvasDark.width + x) * 4;
              if (finalDataDark[idx + 3] > 0) {
                hasVisiblePixels = true;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }

          let finalCanvasDark = canvasDark;
          let finalCanvasLight = canvasLight;
          let finalWidth = img.width;
          let finalHeight = img.height;

          if (hasVisiblePixels) {
            const padding = 2;
            minX = Math.max(0, minX - padding);
            minY = Math.max(0, minY - padding);
            maxX = Math.min(canvasDark.width - 1, maxX + padding);
            maxY = Math.min(canvasDark.height - 1, maxY + padding);

            const croppedWidth = maxX - minX + 1;
            const croppedHeight = maxY - minY + 1;

            const croppedCanvasDark = document.createElement('canvas');
            croppedCanvasDark.width = croppedWidth;
            croppedCanvasDark.height = croppedHeight;
            const croppedCtxDark = croppedCanvasDark.getContext('2d');

            const croppedCanvasLight = document.createElement('canvas');
            croppedCanvasLight.width = croppedWidth;
            croppedCanvasLight.height = croppedHeight;
            const croppedCtxLight = croppedCanvasLight.getContext('2d');

            if (croppedCtxDark && croppedCtxLight) {
              croppedCtxDark.drawImage(canvasDark, minX, minY, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);
              croppedCtxLight.drawImage(canvasLight, minX, minY, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);
              finalCanvasDark = croppedCanvasDark;
              finalCanvasLight = croppedCanvasLight;
              finalWidth = croppedWidth;
              finalHeight = croppedHeight;
            }
          }

          callback({
            dark: finalCanvasDark.toDataURL('image/png'),
            light: finalCanvasLight.toDataURL('image/png'),
            width: finalWidth,
            height: finalHeight
          });
        } catch (e) {
          console.error("Error processing logo canvas:", e);
          callback({ dark: imgSrc, light: imgSrc, width: img.width, height: img.height });
        }
      };
      img.onerror = () => {
        callback({ dark: imgSrc, light: imgSrc, width: 100, height: 30 });
      };
    };

    processLogo('/logo_ingentron.png', false, (res) => {
      logoIngentronObj.current = res;
      setLogoIngentronSrc(res.dark);
    });
    processLogo('/logo_gruya.jpg', true, (res) => {
      logoGruyaObj.current = res;
      setLogoGruyaSrc(res.dark);
    });
  }, []);

  // --- PERSISTENT AUTO-REFRESH & SYNC STATUS MONITOR ---
  useEffect(() => {
    // Scroll event listener
    const handleScroll = () => {
      setBackToTopVisible(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);

    // Initial load
    loadSyncStatus();

    // Auto-refresh loops
    const syncInterval = setInterval(loadSyncStatus, 30000);
    const dataInterval = setInterval(() => {
      if (currentView === 'dashboard') {
        loadCuentasCorrientesData(true, true);
      } else if (currentView === 'stock-expiration') {
        loadStockData(true, true);
      }
    }, 60000);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearInterval(syncInterval);
      clearInterval(dataInterval);
    };
  }, [currentView]);

  // Load Cuentas Corrientes Data dynamically on switching to it
  useEffect(() => {
    if (currentView === 'dashboard') {
      loadCuentasCorrientesData();
    } else if (currentView === 'stock-expiration') {
      loadStockData();
    }
  }, [currentView]);

  // Clean dropdowns when clicking anywhere
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveDropdown(null);
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // --- DATA LOADING ENGINES ---
  const loadCuentasCorrientesData = async (force = false, silent = false) => {
    if (globalData.length > 0 && !force) return;
    if (!silent) setIsCuentasCorrientesLoading(true);

    try {
      const response = await fetch('/api/saldos');
      if (!response.ok) throw new Error('No se pudo cargar la información de saldos desde el servidor.');
      const data = await response.json();
      setGlobalData(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setIsCuentasCorrientesLoading(false);
    }
  };

  const loadStockData = async (force = false, silent = false) => {
    if (isRealStockLoaded && !force) return;
    if (!silent) setIsStockLoading(true);

    try {
      const response = await fetch('/api/stock');
      if (response.ok) {
        const data = await response.json();
        let rawList: StockItem[] = [];
        let historyObj: Record<string, StockItem[]> = {};

        if (Array.isArray(data)) {
          rawList = data;
        } else if (data && Array.isArray(data.current)) {
          rawList = data.current;
          historyObj = data.history || {};
        }

        if (rawList.length > 0) {
          const groupedMap = new Map<string, StockItem>();
          rawList.forEach((item: any) => {
            const codigo = String(item.codigo || item.ean || '').trim();
            const producto = String(item.producto || item.descripcion || 'Sin Nombre').trim();
            const categoria = String(item.categoria || 'Almacén').trim();
            const lote = String(item.lote || 'S/L').trim();
            const fechaVencimiento = String(item.fechaVencimiento || item.vencimiento || '').trim();
            const cantidad = parseFloat(item.cantidad || 0);

            const key = `${codigo}_${lote}_${fechaVencimiento}`;
            if (groupedMap.has(key)) {
              const prev = groupedMap.get(key)!;
              prev.cantidad += cantidad;
            } else {
              groupedMap.set(key, { codigo, producto, categoria, lote, cantidad, fechaVencimiento });
            }
          });

          setStockData(Array.from(groupedMap.values()));
          setStockHistory(historyObj);
          setIsRealStockLoaded(true);
        }
      }
    } catch (e) {
      console.error("Error loading stock data:", e);
    } finally {
      setIsStockLoading(false);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const res = await fetch('/api/sync-status');
      if (!res.ok) return;
      const status = await res.json();
      setSyncStatus(status);

      // Offline detection logic
      const serverNames: Record<string, string> = {
        'Aguas': 'Calvo (Aguas)',
        'PepsiCo': 'Gescom (PepsiCo)',
        'Salliquelo': 'Calvo (Salliqueló)',
        'Trenque Lauquen': 'Gescom (T. Lauquen)',
        'Digip': 'Digip WMS (Stock)'
      };

      const isServerOffline = (lastSync: string | null) => {
        if (!lastSync) return true;
        const diff = Date.now() - new Date(lastSync).getTime();
        return diff > 5 * 60 * 1000; // 5 minutes inactivity
      };

      const offlineServers: string[] = [];
      Object.entries(serverNames).forEach(([key, displayName]) => {
        const syncTime = key === 'Trenque Lauquen' ? status['Trenque Lauquen'] : status[key];
        if (isServerOffline(syncTime)) {
          offlineServers.push(displayName);
        }
      });

      // Show alert if Caídos and dashboard active
      if (currentView === 'dashboard' && offlineServers.length > 0) {
        const unseenOffline = Object.keys(serverNames).filter(
          k => isServerOffline(k === 'Trenque Lauquen' ? status['Trenque Lauquen'] : status[k]) && !acknowledgedOfflineServers.current.has(k)
        );

        if (unseenOffline.length > 0) {
          const listStr = offlineServers.map(n => `<strong style="color: #ff9f0a;">${n}</strong>`).join(', ');
          setConnectionAlertMessage(`Se ha perdido la conexión con: ${listStr}.<br/><br/>Por favor, revisar el estado del servidor local y el sincronizador.`);
          setConnectionAlertActive(true);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const closeConnectionAlert = () => {
    setConnectionAlertActive(false);
    // Add current offline servers to acknowledged
    const offlineList = ['Aguas', 'PepsiCo', 'Salliquelo', 'Trenque Lauquen', 'Digip'];
    offlineList.forEach(k => {
      const val = k === 'Trenque Lauquen' ? syncStatus['Trenque Lauquen'] : (syncStatus as any)[k];
      const isOffline = !val || (Date.now() - new Date(val).getTime() > 5 * 60 * 1000);
      if (isOffline) {
        acknowledgedOfflineServers.current.add(k);
      }
    });
  };

  // Helper date parsing and formatting
  const parseWeekEndDate = (weekStr: string) => {
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

  const formatDate = (excelDate: any) => {
    if (!excelDate || excelDate === 'N/A') return 'N/A';
    if (typeof excelDate === 'string') return excelDate;
    if (typeof excelDate === 'number') {
      const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
      return date.toLocaleDateString('es-AR');
    }
    return excelDate;
  };

  const parseExcelDate = (excelDate: any): Date | null => {
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

  const getDueDateStatus = (dueDateExcel: any, dateExcel: any, amount: number) => {
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

  const getClientMostCriticalStatus = (invoices: Saldo[]) => {
    if (!invoices || invoices.length === 0) {
      return { text: 'N/A', class: 'bg-dark' };
    }

    let maxSeverity = 0;
    let mostCritical = { text: 'N/A', class: 'bg-dark' };

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

  const shouldHideAccount = (clientCode: string, invoice: string) => {
    if (!hideCompensar) return false;
    if (invoice && String(invoice).trim().toUpperCase().startsWith('RPX')) {
      return true;
    }
    if (!clientCode) return false;
    const normalized = String(clientCode).trim().replace(/^0+/, '');
    return NORMALIZED_ACCOUNTS_TO_HIDE.has(normalized);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatAbbreviatedCurrency = (value: number) => {
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

  // --- FILTERED DATA MEMOIZATIONS ---

  // Available weeks dynamically calculated
  const availableWeeks = useMemo(() => {
    const weeks = new Set<string>();
    globalData.forEach(item => {
      if (shouldHideAccount(item.clientCode, item.invoice)) return;
      if (empresaFilter !== '') {
        const allowed = empresaToOrigins[empresaFilter] || [];
        if (!allowed.includes(item.origin)) return;
      }
      if (originFilter !== '' && item.origin !== originFilter) return;

      if (item.week && item.week !== 'undefined') {
        weeks.add(item.week);
      }
    });
    return Array.from(weeks).sort((a, b) => parseWeekEndDate(a).getTime() - parseWeekEndDate(b).getTime());
  }, [globalData, empresaFilter, originFilter, hideCompensar]);

  // Adjust selected week filter if not present in available options anymore
  useEffect(() => {
    if (availableWeeks.length > 0) {
      const hasCurrent = availableWeeks.includes(weekFilter);
      if (!hasCurrent) {
        if (availableWeeks.includes('Tiempo Real')) {
          setWeekFilter('Tiempo Real');
        } else {
          setWeekFilter(availableWeeks[0]);
        }
      }
    }
  }, [availableWeeks, weekFilter]);

  // Calculate Cuentas Corrientes Consolidate List
  const filteredCtaCteClients = useMemo(() => {
    const searchTerm = searchClient.toLowerCase();

    // Find latest week across applicable data
    let resolvedLatestWeek = '';
    const weeksSet = new Set<string>();
    globalData.forEach(item => {
      if (shouldHideAccount(item.clientCode, item.invoice)) return;
      if (empresaFilter !== '') {
        const allowed = empresaToOrigins[empresaFilter] || [];
        if (!allowed.includes(item.origin)) return;
      }
      if (originFilter !== '' && item.origin !== originFilter) return;
      if (item.week && item.week !== 'undefined' && item.week !== 'Tiempo Real') {
        weeksSet.add(item.week);
      }
    });
    const sorted = Array.from(weeksSet).sort((a, b) => parseWeekEndDate(a).getTime() - parseWeekEndDate(b).getTime());
    resolvedLatestWeek = sorted[sorted.length - 1] || '';

    // Filter raw data
    const filteredRaw = globalData.filter(item => {
      if (shouldHideAccount(item.clientCode, item.invoice)) return false;

      // Filter by Empresa
      if (empresaFilter !== '') {
        const allowed = empresaToOrigins[empresaFilter] || [];
        if (!allowed.includes(item.origin)) return false;
      }

      // Filter by Origin
      if (originFilter !== '' && item.origin !== originFilter) return false;

      // Filter by Week
      if (weekFilter === 'LATEST') {
        if (item.week !== resolvedLatestWeek) return false;
      } else if (weekFilter !== '' && item.week !== weekFilter) {
        return false;
      }

      // Filter by Search
      const matchSearch = item.client.toLowerCase().includes(searchTerm) ||
                          item.origin.toLowerCase().includes(searchTerm) ||
                          (item.clientCode && item.clientCode.toLowerCase().includes(searchTerm));
      return matchSearch;
    });

    // Aggregate by Client Name
    const clientMap = new Map<string, {
      client: string;
      origins: Set<string>;
      clientCodesByOrigin: Record<string, Set<string>>;
      totalAmount: number;
      invoices: Saldo[];
    }>();

    filteredRaw.forEach(item => {
      const key = item.client;
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          client: item.client,
          origins: new Set(),
          clientCodesByOrigin: {},
          totalAmount: 0,
          invoices: []
        });
      }

      const clientAggr = clientMap.get(key)!;
      clientAggr.origins.add(item.origin);
      clientAggr.totalAmount += item.amount;
      clientAggr.invoices.push(item);

      if (item.clientCode && item.clientCode !== 'N/A') {
        if (!clientAggr.clientCodesByOrigin[item.origin]) {
          clientAggr.clientCodesByOrigin[item.origin] = new Set();
        }
        clientAggr.clientCodesByOrigin[item.origin].add(item.clientCode);
      }
    });

    let aggregated = Array.from(clientMap.values());

    // Apply Status Filter
    if (statusFilter !== '') {
      aggregated = aggregated.filter(client => {
        const status = getClientMostCriticalStatus(client.invoices);
        return status.text === statusFilter;
      });
    }

    // Sort by total amount descending
    return aggregated.sort((a, b) => b.totalAmount - a.totalAmount);
  }, [globalData, empresaFilter, originFilter, weekFilter, statusFilter, hideCompensar, searchClient]);

  // Overall KPIs calculations
  const totalOutstandingBalance = useMemo(() => {
    return filteredCtaCteClients.reduce((acc, c) => acc + c.totalAmount, 0);
  }, [filteredCtaCteClients]);

  const totalOutstandingInvoices = useMemo(() => {
    return filteredCtaCteClients.reduce((acc, c) => acc + c.invoices.length, 0);
  }, [filteredCtaCteClients]);

  // --- CHART RENDERING LOGIC ---
  useEffect(() => {
    if (currentView !== 'dashboard' || !statusCanvasRef.current || filteredCtaCteClients.length === 0) return;

    // Calculate distributions
    let okCount = 0;
    let vencidoCount = 0;
    let criticoCount = 0;

    filteredCtaCteClients.forEach(client => {
      const status = getClientMostCriticalStatus(client.invoices).text;
      if (status === 'No vencido') okCount++;
      else if (status === 'Vencido') vencidoCount++;
      else if (status === 'Más de 30 días') criticoCount++;
    });

    const total = okCount + vencidoCount + criticoCount;

    if (statusChartRef.current) {
      const chart = statusChartRef.current;
      if (total === 0) {
        chart.data.labels = ['Sin datos'];
        chart.data.datasets[0].data = [1];
        chart.data.datasets[0].backgroundColor = ['rgba(255, 255, 255, 0.05)'];
        chart.data.datasets[0].borderColor = ['rgba(255, 255, 255, 0.05)'];
        chart.data.datasets[0].borderWidth = 0;
      } else {
        chart.data.labels = ['No vencido', 'Vencido', 'Más de 30 días'];
        chart.data.datasets[0].data = [okCount, vencidoCount, criticoCount];
        chart.data.datasets[0].backgroundColor = [
          'rgba(52, 211, 153, 0.65)',
          'rgba(251, 191, 36, 0.65)',
          'rgba(248, 113, 113, 0.65)'
        ];
        chart.data.datasets[0].borderColor = [
          'rgba(52, 211, 153, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(248, 113, 113, 0.8)'
        ];
        chart.data.datasets[0].borderWidth = 1.5;
      }
      chart.update('none');
    } else {
      statusChartRef.current = new Chart(statusCanvasRef.current, {
        type: 'doughnut',
        data: {
          labels: ['No vencido', 'Vencido', 'Más de 30 días'],
          datasets: [{
            data: [okCount, vencidoCount, criticoCount],
            backgroundColor: [
              'rgba(52, 211, 153, 0.65)',
              'rgba(251, 191, 36, 0.65)',
              'rgba(248, 113, 113, 0.65)'
            ],
            borderColor: [
              'rgba(52, 211, 153, 0.8)',
              'rgba(251, 191, 36, 0.8)',
              'rgba(248, 113, 113, 0.8)'
            ],
            borderWidth: 1.5,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          resizeDelay: 150,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(20, 20, 22, 0.9)',
              titleColor: '#fff',
              bodyColor: '#ccc',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 10,
              cornerRadius: 8,
              displayColors: true,
              callbacks: {
                label: function(context) {
                  const value = context.raw as number;
                  const percent = Math.round((value / total) * 100);
                  return ` ${context.label}: ${value} clientes (${percent}%)`;
                }
              }
            }
          },
          cutout: '70%',
          animation: {
            animateScale: true,
            animateRotate: true
          }
        }
      });
    }
  }, [filteredCtaCteClients, currentView]);

  // Trend Chart rendering
  useEffect(() => {
    if (currentView !== 'dashboard' || !trendCanvasRef.current || globalData.length === 0) return;

    // Group weekly balances for trend chart depending on selected origin/empresa filters
    const trendFilteredData = globalData.filter(item => {
      if (shouldHideAccount(item.clientCode, item.invoice)) return false;
      if (empresaFilter !== '') {
        const allowed = empresaToOrigins[empresaFilter] || [];
        if (!allowed.includes(item.origin)) return false;
      }
      return originFilter === '' || item.origin === originFilter;
    });

    const weeklyBalances: Record<string, number> = {};
    trendFilteredData.forEach(item => {
      const w = item.week || 'Sin Semana';
      if (!weeklyBalances[w]) weeklyBalances[w] = 0;
      weeklyBalances[w] += item.amount;
    });

    const uniqueWeeks = Array.from(new Set(trendFilteredData.map(item => item.week || 'Sin Semana')));
    const cleanWeeks = uniqueWeeks
      .filter(w => w && w !== 'undefined' && w !== 'Sin Semana')
      .sort((a, b) => parseWeekEndDate(a).getTime() - parseWeekEndDate(b).getTime());

    const balances = cleanWeeks.map(w => weeklyBalances[w] || 0);

    if (trendChartRef.current) {
      const chart = trendChartRef.current;
      chart.data.labels = cleanWeeks;
      chart.data.datasets[0].data = balances;
      chart.data.datasets[1].data = balances;
      chart.update('none');
    } else {
      const canvasCtx = trendCanvasRef.current.getContext('2d');
      let gradient = 'rgba(58, 134, 255, 0.2)';
      if (canvasCtx) {
        const grad = canvasCtx.createLinearGradient(0, 0, 0, 300);
        grad.addColorStop(0, 'rgba(58, 134, 255, 0.45)');
        grad.addColorStop(1, 'rgba(58, 134, 255, 0.01)');
        gradient = grad as any;
      }

      trendChartRef.current = new Chart(trendCanvasRef.current, {
        type: 'line',
        data: {
          labels: cleanWeeks,
          datasets: [
            {
              label: 'Saldo de la Semana',
              data: balances,
              type: 'line',
              backgroundColor: gradient,
              borderColor: 'rgba(58, 134, 255, 0.85)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: 4,
              pointBackgroundColor: 'rgba(58, 134, 255, 1)',
              pointBorderColor: '#ffffff',
              pointBorderWidth: 1.5,
              order: 2
            },
            {
              label: 'Tendencia',
              data: balances,
              type: 'line',
              borderColor: '#ff007f', // Glowing magenta line
              borderWidth: 3,
              pointBackgroundColor: '#ffffff',
              pointBorderColor: '#ff007f',
              pointBorderWidth: 2,
              pointRadius: 5,
              pointHoverRadius: 7,
              tension: 0.4,
              fill: false,
              order: 1
            }
          ]
        },
        options: {
          responsive: true,
          resizeDelay: 150,
          maintainAspectRatio: false,
          layout: {
            padding: { left: 40, right: 20, top: 20, bottom: 0 }
          },
          plugins: {
            legend: {
              display: true,
              labels: {
                color: 'rgba(255, 255, 255, 0.8)',
                font: { family: 'Inter', size: 12 }
              }
            },
            tooltip: {
              backgroundColor: 'rgba(20, 20, 22, 0.95)',
              titleColor: '#fff',
              bodyColor: '#ccc',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 8,
              callbacks: {
                label: function(context) {
                  return ` ${context.dataset.label}: ${formatCurrency(context.raw as number)}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: {
                color: 'rgba(255, 255, 255, 0.6)',
                font: { family: 'Inter', size: 11 },
                maxRotation: 45,
                minRotation: 0,
                autoSkip: true,
                callback: function(value, index) {
                  const label = this.chart.data.labels[value as number] as string;
                  if (label && label.startsWith('Del ')) {
                    const match = label.match(/Del\s+(\d{2})\/(\d{2})(?:\/\d{4})?\s+al\s+(\d{2})\/(\d{2})/i);
                    if (match) {
                      return `${match[1]}/${match[2]} - ${match[3]}/${match[4]}`;
                    }
                  }
                  return label;
                }
              }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              grace: '10%',
              ticks: {
                color: 'rgba(255, 255, 255, 0.6)',
                font: { family: 'Inter', size: 11 },
                callback: function(value) {
                  return formatAbbreviatedCurrency(value as number);
                }
              }
            }
          }
        }
      });
    }
  }, [globalData, empresaFilter, originFilter, currentView]);

  // Cleanup charts on unmount/route change
  useEffect(() => {
    return () => {
      if (statusChartRef.current) {
        statusChartRef.current.destroy();
        statusChartRef.current = null;
      }
      if (trendChartRef.current) {
        trendChartRef.current.destroy();
        trendChartRef.current = null;
      }
    };
  }, [currentView]);

  // --- STOCK MODULE LOGIC ---
  const getDaysRemaining = (expiryStr: string) => {
    const localDate = new Date(new Date().getTime() - 3 * 3600 * 1000); // UTC-3
    const todayStr = localDate.toISOString().split('T')[0];
    const today = new Date(todayStr + "T00:00:00");
    const expiry = new Date(expiryStr + "T00:00:00");
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getStockStatus = (days: number) => {
    if (days <= 0) return { text: 'VENCIDO', class: 'badge-expired' };
    if (days <= 30) return { text: 'ALERTA CRÍTICA', class: 'badge-critical' };
    if (days <= 90) return { text: 'PRÓXIMO', class: 'badge-upcoming' };
    return { text: 'EN REGLA', class: 'badge-ok' };
  };

  const formatDateToES = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0].slice(2, 4)}`;
  };

  // Stock variation calculation engines
  const yesterdayQtyMapMemo = useMemo(() => {
    if (!stockHistory || Object.keys(stockHistory).length === 0) return { date: '', map: new Map<string, number>() };
    const availableDates = Object.keys(stockHistory).sort();
    if (availableDates.length === 0) return { date: '', map: new Map<string, number>() };

    const localDate = new Date(new Date().getTime() - 3 * 3600 * 1000);
    const todayStr = localDate.toISOString().split('T')[0];

    let prevDate = '';
    for (let i = availableDates.length - 1; i >= 0; i--) {
      if (availableDates[i] < todayStr) {
        prevDate = availableDates[i];
        break;
      }
    }
    if (!prevDate) prevDate = availableDates[0];

    const yesterdayData = stockHistory[prevDate] || [];
    const qMap = new Map<string, number>();
    yesterdayData.forEach(yItem => {
      const yKey = `${String(yItem.codigo || (yItem as any).ean || '').trim()}_${String(yItem.fechaVencimiento || (yItem as any).vencimiento || '').trim()}`;
      const currentQty = qMap.get(yKey) || 0;
      qMap.set(yKey, currentQty + parseFloat(String(yItem.cantidad || 0)));
    });

    return { date: prevDate, map: qMap };
  }, [stockHistory]);

  const todayQtyMapMemo = useMemo(() => {
    const qMap = new Map<string, number>();
    stockData.forEach(tItem => {
      const tKey = `${String(tItem.codigo).trim()}_${String(tItem.fechaVencimiento).trim()}`;
      const currentQty = qMap.get(tKey) || 0;
      qMap.set(tKey, currentQty + parseFloat(String(tItem.cantidad || 0)));
    });
    return qMap;
  }, [stockData]);

  const getStockVariationValue = (item: StockItem) => {
    const key = `${String(item.codigo).trim()}_${String(item.fechaVencimiento).trim()}`;
    const yesterdayTotal = yesterdayQtyMapMemo.map.get(key);
    if (yesterdayTotal === undefined) {
      return todayQtyMapMemo.get(key) || 0; // treat as current if new
    }
    const todayTotal = todayQtyMapMemo.get(key) || 0;
    return todayTotal - yesterdayTotal;
  };

  const getStockVariationBadge = (item: StockItem) => {
    const key = `${String(item.codigo).trim()}_${String(item.fechaVencimiento).trim()}`;
    const yesterdayTotal = yesterdayQtyMapMemo.map.get(key);

    if (yesterdayTotal === undefined) {
      return (
        <span style={{ fontSize: '10px', color: '#60a5fa', background: 'rgba(96, 165, 250, 0.15)', border: '1px solid rgba(96, 165, 250, 0.25)', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
          <i className="fas fa-plus-circle"></i> Nuevo
        </span>
      );
    }

    const todayTotal = todayQtyMapMemo.get(key) || 0;
    const variation = todayTotal - yesterdayTotal;

    if (variation > 0) {
      return (
        <span className="badge badge-ok" style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
          <i className="fas fa-arrow-up"></i> +{variation}
        </span>
      );
    } else if (variation < 0) {
      return (
        <span className="badge badge-expired" style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
          <i className="fas fa-arrow-down"></i> {variation}
        </span>
      );
    } else {
      return (
        <span className="badge" style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'rgba(255, 255, 255, 0.4)', padding: '2px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
          <i className="fas fa-minus"></i> Sin cambios
        </span>
      );
    }
  };

  const getStockVariationText = (item: StockItem) => {
    const key = `${String(item.codigo).trim()}_${String(item.fechaVencimiento).trim()}`;
    const yesterdayTotal = yesterdayQtyMapMemo.map.get(key);
    if (yesterdayTotal === undefined) return 'Nuevo';

    const todayTotal = todayQtyMapMemo.get(key) || 0;
    const variation = todayTotal - yesterdayTotal;

    if (variation > 0) return `+${variation}`;
    if (variation < 0) return `${variation}`;
    return 'Sin cambios';
  };

  // Filter and Sort Stock items
  const filteredStock = useMemo(() => {
    const searchVal = searchStock.toLowerCase();
    let result = stockData.filter(item => {
      const days = getDaysRemaining(item.fechaVencimiento);
      const matchSearch = item.producto.toLowerCase().includes(searchVal) ||
                          item.codigo.includes(searchVal) ||
                          (item.categoria && item.categoria.toLowerCase().includes(searchVal));

      let matchExpired = true;
      if (hideExpiredStock) {
        matchExpired = days > 0;
      }
      return matchSearch && matchExpired;
    });

    // Sort stock
    result.sort((a, b) => {
      let valA: any, valB: any;
      switch (stockSortColumn) {
        case 'codigo':
          valA = a.codigo || '';
          valB = b.codigo || '';
          return stockSortDirection === 'asc'
            ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
            : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
        case 'producto':
          valA = (a.producto || '').toLowerCase();
          valB = (b.producto || '').toLowerCase();
          return stockSortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'cantidad':
          valA = a.cantidad;
          valB = b.cantidad;
          break;
        case 'variacion':
          valA = getStockVariationValue(a);
          valB = getStockVariationValue(b);
          break;
        case 'vencimiento':
          valA = a.fechaVencimiento ? new Date(a.fechaVencimiento).getTime() : 0;
          valB = b.fechaVencimiento ? new Date(b.fechaVencimiento).getTime() : 0;
          break;
        case 'restante':
        default:
          valA = getDaysRemaining(a.fechaVencimiento);
          valB = getDaysRemaining(b.fechaVencimiento);
          break;
      }

      if (valA < valB) return stockSortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return stockSortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [stockData, searchStock, hideExpiredStock, stockSortColumn, stockSortDirection, yesterdayQtyMapMemo, todayQtyMapMemo]);

  // Stock KPIs
  const stockKPIs = useMemo(() => {
    let expired = 0;
    let critical = 0;
    let ok = 0;

    stockData.forEach(item => {
      const days = getDaysRemaining(item.fechaVencimiento);
      if (days <= 0) expired++;
      else if (days <= 30) critical++;
      else ok++;
    });

    return { total: stockData.length, expired, critical, ok };
  }, [stockData]);

  // Stock charts rendering
  useEffect(() => {
    if (currentView !== 'stock-expiration' || stockData.length === 0) return;

    let expired = 0;
    let critical = 0;
    let upcoming = 0;
    let ok = 0;

    stockData.forEach(item => {
      const days = getDaysRemaining(item.fechaVencimiento);
      if (days <= 0) expired++;
      else if (days <= 30) critical++;
      else if (days <= 90) upcoming++;
      else ok++;
    });

    // 1. Doughnut Chart: Risk Distribution
    if (stockRiskCanvasRef.current) {
      if (stockRiskChartRef.current) {
        stockRiskChartRef.current.data.datasets[0].data = [expired, critical, upcoming, ok];
        stockRiskChartRef.current.update('none');
      } else {
        stockRiskChartRef.current = new Chart(stockRiskCanvasRef.current, {
          type: 'doughnut',
          data: {
            labels: ['Vencido', 'Alerta Crítica', 'Próximo', 'En Regla'],
            datasets: [{
              data: [expired, critical, upcoming, ok],
              backgroundColor: ['#f87171', '#fbbf24', '#60a5fa', '#34d399'],
              borderColor: 'rgba(10, 10, 12, 0.6)',
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right',
                labels: {
                  color: 'rgba(255, 255, 255, 0.7)',
                  font: { size: 10, family: 'Inter' }
                }
              }
            },
            cutout: '70%'
          }
        });
      }
    }

    // 2. Bar Chart: Timeline by Month
    if (stockTimelineCanvasRef.current) {
      const monthsGroup: Record<string, number> = {};
      stockData.forEach(item => {
        const parts = item.fechaVencimiento.split('-');
        const yearMonth = `${parts[0]}-${parts[1]}`;
        if (!monthsGroup[yearMonth]) monthsGroup[yearMonth] = 0;
        monthsGroup[yearMonth] += item.cantidad;
      });

      const sortedMonths = Object.keys(monthsGroup).sort();
      const monthLabels = sortedMonths.map(ym => {
        const parts = ym.split('-');
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${months[parseInt(parts[1]) - 1]} '${parts[0].slice(2, 4)}`;
      });
      const timelineData = sortedMonths.map(ym => monthsGroup[ym]);

      if (stockTimelineChartRef.current) {
        stockTimelineChartRef.current.data.labels = monthLabels;
        stockTimelineChartRef.current.data.datasets[0].data = timelineData;
        stockTimelineChartRef.current.update('none');
      } else {
        stockTimelineChartRef.current = new Chart(stockTimelineCanvasRef.current, {
          type: 'bar',
          data: {
            labels: monthLabels,
            datasets: [{
              label: 'Unidades a vencer',
              data: timelineData,
              backgroundColor: 'rgba(10, 132, 255, 0.3)',
              borderColor: '#0a84ff',
              borderWidth: 1.5,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: {
                  color: 'rgba(255, 255, 255, 0.6)',
                  font: { size: 10, family: 'Inter' }
                }
              },
              x: {
                grid: { display: false },
                ticks: {
                  color: 'rgba(255, 255, 255, 0.6)',
                  font: { size: 10, family: 'Inter' }
                }
              }
            }
          }
        });
      }
    }
  }, [stockData, currentView]);

  // Clean stock charts on unmount/route change
  useEffect(() => {
    return () => {
      if (stockRiskChartRef.current) {
        stockRiskChartRef.current.destroy();
        stockRiskChartRef.current = null;
      }
      if (stockTimelineChartRef.current) {
        stockTimelineChartRef.current.destroy();
        stockTimelineChartRef.current = null;
      }
    };
  }, [currentView]);

  const toggleStockSort = (col: string) => {
    if (stockSortColumn === col) {
      setStockSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setStockSortColumn(col);
      setStockSortDirection('asc');
    }
  };

  const getStockDailyVariations = (item: StockItem) => {
    const dates: string[] = [];
    const localDate = new Date(new Date().getTime() - 3 * 3600 * 1000); // Argentina UTC-3

    for (let i = 7; i >= 0; i--) {
      const d = new Date(localDate.getTime() - i * 24 * 3600 * 1000);
      dates.push(d.toISOString().split('T')[0]);
    }

    const key = `${String(item.codigo).trim()}_${String(item.fechaVencimiento).trim()}`;
    let lastKnownQty = 0;
    let hasAnyPastRecord = false;

    if (stockHistory) {
      const sortedHistoryDates = Object.keys(stockHistory).sort();
      for (let i = sortedHistoryDates.length - 1; i >= 0; i--) {
        const histDate = sortedHistoryDates[i];
        if (histDate < dates[0]) {
          const histData = stockHistory[histDate] || [];
          const found = histData.find((hItem: any) => {
            const hKey = `${String(hItem.codigo || hItem.ean || '').trim()}_${String(hItem.fechaVencimiento || hItem.vencimiento || '').trim()}`;
            return hKey === key;
          });
          if (found) {
            lastKnownQty = parseFloat(String(found.cantidad || 0));
            hasAnyPastRecord = true;
            break;
          }
        }
      }
    }

    const dailyQtys = dates.map(dateStr => {
      let qty = 0;
      let hasRecord = false;
      let dayHasSnapshot = false;
      const localToday = new Date(new Date().getTime() - 3 * 3600 * 1000).toISOString().split('T')[0];

      if (dateStr === localToday) {
        dayHasSnapshot = true;
        stockData.forEach(tItem => {
          const tKey = `${String(tItem.codigo).trim()}_${String(tItem.fechaVencimiento).trim()}`;
          if (tKey === key) {
            qty += parseFloat(String(tItem.cantidad || 0));
            hasRecord = true;
          }
        });
      } else if (stockHistory) {
        if (stockHistory[dateStr]) {
          dayHasSnapshot = true;
          stockHistory[dateStr].forEach((hItem: any) => {
            const hKey = `${String(hItem.codigo || hItem.ean || '').trim()}_${String(hItem.fechaVencimiento || hItem.vencimiento || '').trim()}`;
            if (hKey === key) {
              qty += parseFloat(String(hItem.cantidad || 0));
              hasRecord = true;
            }
          });
        }
      }

      if (!dayHasSnapshot && hasAnyPastRecord) {
        qty = lastKnownQty;
        hasRecord = true;
      } else if (dayHasSnapshot) {
        lastKnownQty = qty;
        if (hasRecord) {
          hasAnyPastRecord = true;
        }
      }

      return { dateStr, qty, hasRecord, dayHasSnapshot };
    });

    let hasSeenBefore = hasAnyPastRecord;
    const variations = [];
    for (let i = 1; i < dailyQtys.length; i++) {
      const day = dailyQtys[i];
      const prevDay = dailyQtys[i - 1];
      const parts = day.dateStr.split('-');
      const label = `${parts[2]}/${parts[1]}`;

      let variationText = '';
      let variationClass = '';

      const localToday = new Date(new Date().getTime() - 3 * 3600 * 1000).toISOString().split('T')[0];
      const isToday = (day.dateStr === localToday);

      const calculateNormalDiff = () => {
        if (!day.hasRecord && !prevDay.hasRecord) {
          variationText = '-';
          variationClass = 'neutral';
        } else if (!prevDay.hasRecord && day.hasRecord) {
          if (!hasSeenBefore) {
            variationText = 'Nuevo';
            variationClass = 'new';
          } else {
            const diff = day.qty;
            variationText = `+${diff}`;
            variationClass = 'positive';
          }
        } else {
          const diff = day.qty - prevDay.qty;
          if (diff > 0) {
            variationText = `+${diff}`;
            variationClass = 'positive';
          } else if (diff < 0) {
            variationText = `${diff}`;
            variationClass = 'negative';
          } else {
            variationText = 'Sin cambios';
            variationClass = 'neutral';
          }
        }
      };

      if (isToday) {
        let todaySnapshotQty: number | null = null;
        if (stockHistory && stockHistory[localToday]) {
          stockHistory[localToday].forEach((hItem: any) => {
            const hKey = `${String(hItem.codigo || hItem.ean || '').trim()}_${String(hItem.fechaVencimiento || hItem.vencimiento || '').trim()}`;
            if (hKey === key) {
              todaySnapshotQty = (todaySnapshotQty || 0) + parseFloat(String(hItem.cantidad || 0));
            }
          });
        }

        if (todaySnapshotQty !== null) {
          const diff = day.qty - todaySnapshotQty;
          if (diff > 0) {
            variationText = `+${diff}`;
            variationClass = 'positive';
          } else if (diff < 0) {
            variationText = `${diff}`;
            variationClass = 'negative';
          } else {
            variationText = 'Sin cambios';
            variationClass = 'neutral';
          }
        } else {
          calculateNormalDiff();
        }
      } else {
        calculateNormalDiff();
      }

      if (day.hasRecord && day.qty > 0) hasSeenBefore = true;
      if (prevDay.hasRecord && prevDay.qty > 0) hasSeenBefore = true;

      variations.push({
        label,
        text: variationText,
        class: variationClass,
        qty: day.qty
      });
    }

    return variations;
  };

  const toggleStockRowExpanded = (id: string) => {
    const next = new Set(expandedStockRows);
    if (next.has(id)) next.delete(id);
    else {
      // Accordion: close other ones
      next.clear();
      next.add(id);
    }
    setExpandedStockRows(next);
  };

  // --- EXCEL & PDF EXPORTS ---
  const downloadClientPDF = () => {
    const activeOrigin = modalOriginFilter;
    const getInvoiceDateValue = (excelDate: any) => {
      const parsed = parseExcelDate(excelDate);
      return parsed ? parsed.getTime() : 0;
    };

    const invoicesToExport = (activeOrigin === 'ALL'
      ? modalInvoices
      : modalInvoices.filter(inv => inv.origin === activeOrigin)
    ).slice().sort((a, b) => getInvoiceDateValue(a.date) - getInvoiceDateValue(b.date));

    if (invoicesToExport.length === 0) {
      alert("No hay facturas pendientes en el filtro seleccionado para exportar.");
      return;
    }

    let totalAmount = 0;
    const clientCodesSet = new Set<string>();

    const formatCompanyName = (name: string) => {
      if (name === 'Aguas' || name === 'PepsiCo' || name === 'Ingentron' || name === 'Ingentron S.R.L.') {
        return 'Ingentron S.R.L.';
      }
      if (name === 'Trenque Lauquen' || name === 'Salliquelo' || name === 'Gruya' || name === 'Gruya S.R.L.') {
        return 'Gruya S.R.L.';
      }
      return name;
    };

    const formatOriginName = (name: string) => {
      if (name === 'Salliquelo') return 'Salliqueló';
      if (name === 'Trenque Lauquen') return 'Trenque Lauquen';
      return name;
    };

    invoicesToExport.forEach(inv => {
      totalAmount += inv.amount;
      if (inv.clientCode && inv.clientCode !== 'N/A') {
        clientCodesSet.add(`${formatOriginName(inv.origin)}: ${inv.clientCode}`);
      }
    });

    const clientCodes = Array.from(clientCodesSet);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Page decoration header
    doc.setFillColor(11, 26, 48);
    doc.rect(0, 0, 210, 8, 'F');

    // Corporate Header Logos drawing
    let logoDrawn = false;
    let currentX = 15;

    if (logoIngentronObj.current?.light && logoGruyaObj.current?.light) {
      try {
        const ingHeight = 8;
        const ingWidth = ingHeight * (logoIngentronObj.current.width / logoIngentronObj.current.height);
        doc.addImage(logoIngentronObj.current.light, 'PNG', currentX, 17, ingWidth, ingHeight);
        currentX += ingWidth + 4;

        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.25);
        doc.line(currentX, 16, currentX, 26);
        currentX += 4;

        const gruHeight = 8;
        const gruWidth = gruHeight * (logoGruyaObj.current.width / logoGruyaObj.current.height);
        doc.addImage(logoGruyaObj.current.light, 'PNG', currentX, 17, gruWidth, gruHeight);
        logoDrawn = true;
      } catch (err) {
        console.error("Error drawing logos in PDF:", err);
      }
    }

    if (!logoDrawn) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(11, 26, 48);
      doc.text('INGENTRON S.R.L. / GRUYA S.R.L.', 15, 24);
    }

    // Title & Metadata
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(10, 132, 255);
    doc.text('RESUMEN DE CUENTA', 195, 24, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const dateFormatted = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    doc.text(`Emisión: ${dateFormatted}`, 195, 29, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(15, 38, 195, 38);

    // Info card
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(241, 245, 249);
    doc.roundedRect(15, 43, 180, 20, 3, 3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(11, 26, 48);
    doc.text('CLIENTE:', 20, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(modalClient, 42, 50);

    doc.setFont('helvetica', 'bold');
    doc.text('CÓDIGO:', 20, 56);
    doc.setFont('helvetica', 'normal');
    const codeText = clientCodes.length > 0 ? clientCodes.join(' | ') : 'N/A';
    doc.text(codeText, 42, 56);

    // Balance highlight box
    doc.setFillColor(235, 245, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(130, 45, 60, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(10, 132, 255);
    doc.text('SALDO TOTAL PENDIENTE', 160, 49.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(11, 26, 48);
    doc.text(formatCurrency(totalAmount), 160, 56.5, { align: 'center' });

    // Table mapping
    const tableBody = invoicesToExport.map(inv => {
      const status = getDueDateStatus(inv.dueDate, inv.date, inv.amount);
      const originalAmt = inv.originalAmount ?? inv.amount;
      const paidAmt = inv.paidAmount ?? 0;
      return [
        inv.invoice || 'N/A',
        formatCompanyName(inv.origin) || 'N/A',
        formatDate(inv.date),
        status.text || 'N/A',
        formatCurrency(originalAmt),
        formatCurrency(paidAmt),
        formatCurrency(inv.amount)
      ];
    });

    autoTable(doc, {
      head: [['Comprobante', 'Empresa', 'Fecha', 'Estado', 'Importe', 'Canceló', 'Pendiente']],
      body: tableBody,
      startY: 68,
      theme: 'striped',
      headStyles: {
        fillColor: [11, 26, 48],
        textColor: [255, 255, 255],
        fontSize: 8.0,
        fontStyle: 'bold',
        halign: 'left',
        valign: 'middle'
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 26 },
        2: { cellWidth: 21 },
        3: { cellWidth: 31 },
        4: { cellWidth: 26, halign: 'right' },
        5: { cellWidth: 26, halign: 'right' },
        6: { cellWidth: 30, halign: 'right' }
      },
      didParseCell: function(data) {
        if (data.section === 'head' && (data.column.index === 4 || data.column.index === 5 || data.column.index === 6)) {
          data.cell.styles.halign = 'right';
        }
        if (data.section === 'body' && data.column.index === 3) {
          const val = data.cell.raw;
          if (val === 'Vencido') {
            data.cell.styles.textColor = [220, 100, 0];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'Más de 30 días') {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'No vencido') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'Saldo a favor') {
            data.cell.styles.textColor = [10, 132, 255];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      bodyStyles: {
        fontSize: 7.6,
        textColor: [30, 41, 59],
        cellPadding: 2.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: 10, right: 10, top: 15, bottom: 22 },
      styles: {
        font: 'helvetica',
        lineColor: [241, 245, 249],
        lineWidth: 0.3,
        overflow: 'hidden'
      }
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(241, 245, 249);
      doc.setLineWidth(0.4);
      doc.line(15, 280, 195, 280);
      doc.setFont('helvetica', 'normal');
      doc.text(`Página ${i} de ${totalPages}`, 195, 285, { align: 'right' });
    }

    const cleanClientName = modalClient.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`Resumen_Cuenta_${cleanClientName}.pdf`);
  };

  const exportStockToPDF = (event: React.MouseEvent) => {
    event.preventDefault();
    const dataToExport = filteredStock;
    if (dataToExport.length === 0) {
      alert("No hay datos de stock disponibles para exportar.");
      return;
    }

    const doc = new jsPDF();
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Reporte de Vencimientos de Stock - Ingentron", 14, 20);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    const dateStr = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR');
    doc.text(`Generado el: ${dateStr} | Total de registros: ${dataToExport.length}`, 14, 27);

    const tableColumns = ["Código Artículo", "Producto", "Cantidad", "Variación", "Vencimiento", "Restante"];
    const tableRows = dataToExport.map(item => {
      const days = getDaysRemaining(item.fechaVencimiento);
      let daysText = '';
      if (days < 0) daysText = `Venció hace ${Math.abs(days)}d`;
      else if (days === 0) daysText = 'Vence Hoy';
      else daysText = `${days}d restante${days > 1 ? 's' : ''}`;

      return [
        item.codigo,
        item.producto,
        `${item.cantidad} un.`,
        getStockVariationText(item),
        formatDateToES(item.fechaVencimiento),
        daysText
      ];
    });

    autoTable(doc, {
      head: [tableColumns],
      body: tableRows,
      startY: 34,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 70 },
        2: { cellWidth: 20 },
        3: { cellWidth: 20 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 }
      }
    });

    doc.save(`Reporte_Vencimientos_Stock_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportStockToExcel = (event: React.MouseEvent) => {
    event.preventDefault();
    const dataToExport = filteredStock;
    if (dataToExport.length === 0) {
      alert("No hay datos de stock disponibles para exportar.");
      return;
    }

    const rows = dataToExport.map(item => {
      const days = getDaysRemaining(item.fechaVencimiento);
      let daysText = '';
      if (days < 0) daysText = `Venció hace ${Math.abs(days)}d`;
      else if (days === 0) daysText = 'Vence Hoy';
      else daysText = `${days}d restante${days > 1 ? 's' : ''}`;

      return {
        "Código Artículo": item.codigo,
        "Producto": item.producto,
        "Cantidad": item.cantidad,
        "Variación (24h)": getStockVariationText(item),
        "Vencimiento": formatDateToES(item.fechaVencimiento),
        "Días Restantes": days,
        "Restante Detalle": daysText
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vencimientos Stock");

    worksheet['!cols'] = [
      { wch: 16 },
      { wch: 50 },
      { wch: 12 },
      { wch: 16 },
      { wch: 15 },
      { wch: 15 },
      { wch: 22 }
    ];

    XLSX.writeFile(workbook, `Reporte_Vencimientos_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const showInvoices = (clientName: string) => {
    setModalClient(clientName);

    // Filter client invoices matching global filters
    const invoices = globalData.filter(item => {
      if (item.client !== clientName) return false;
      if (shouldHideAccount(item.clientCode, item.invoice)) return false;

      // Apply global origin filter
      if (originFilter !== '' && item.origin !== originFilter) return false;

      // Apply week filter
      if (weekFilter === 'LATEST') {
        const originWeeksSet = new Set(globalData.filter(d => {
          if (shouldHideAccount(d.clientCode, d.invoice)) return false;
          return d.origin === item.origin;
        }).map(d => d.week));
        const originWeeks = Array.from(originWeeksSet).sort((a, b) => parseWeekEndDate(a).getTime() - parseWeekEndDate(b).getTime());
        const latestForThisOrigin = originWeeks[originWeeks.length - 1];
        return item.week === latestForThisOrigin;
      }
      return weekFilter === '' || item.week === weekFilter;
    });

    setModalInvoices(invoices);
    setModalOriginFilter('ALL');
    setIsModalActive(true);
  };

  const getOriginColorClass = (origin: string) => {
    if (origin === 'Aguas') return 'bg-blue text-white';
    if (origin === 'Salliquelo') return 'bg-purple text-white';
    if (origin === 'Trenque Lauquen') return 'bg-green text-white';
    if (origin === 'PepsiCo') return 'bg-red text-white';
    return 'bg-accent text-white';
  };

  // Dynamic dropdown list elements
  const dropdownWeekOptions = useMemo(() => {
    const options = [...availableWeeks];
    return options;
  }, [availableWeeks]);

  const originOptions = useMemo(() => {
    const allOrigins = new Set(globalData.map(item => item.origin));
    let filteredOrigins: string[];

    if (empresaFilter !== '') {
      filteredOrigins = empresaToOrigins[empresaFilter] || [];
    } else {
      const union = new Set([...Object.values(empresaToOrigins).flat(), ...allOrigins]);
      filteredOrigins = Array.from(union).sort();
    }
    return filteredOrigins.filter(Boolean);
  }, [globalData, empresaFilter]);

  // Handle changes in filters to update active selections
  useEffect(() => {
    setOriginFilter('');
  }, [empresaFilter]);

  // Modal values aggregated
  const modalAggregatedInvoices = useMemo(() => {
    const getInvoiceDateValue = (excelDate: any) => {
      const parsed = parseExcelDate(excelDate);
      return parsed ? parsed.getTime() : 0;
    };

    return (modalOriginFilter === 'ALL'
      ? modalInvoices
      : modalInvoices.filter(inv => inv.origin === modalOriginFilter)
    ).slice().sort((a, b) => getInvoiceDateValue(a.date) - getInvoiceDateValue(b.date));
  }, [modalInvoices, modalOriginFilter]);

  const modalTotalAmount = useMemo(() => {
    return modalAggregatedInvoices.reduce((acc, inv) => acc + inv.amount, 0);
  }, [modalAggregatedInvoices]);

  const modalClientCodes = useMemo(() => {
    const codesByOrigin: Record<string, Set<string>> = {};
    modalInvoices.forEach(inv => {
      if (inv.clientCode && inv.clientCode !== 'N/A') {
        if (!codesByOrigin[inv.origin]) {
          codesByOrigin[inv.origin] = new Set();
        }
        codesByOrigin[inv.origin].add(inv.clientCode);
      }
    });
    return codesByOrigin;
  }, [modalInvoices]);

  const modalOriginsList = useMemo(() => {
    return Array.from(new Set(modalInvoices.map(inv => inv.origin))).sort();
  }, [modalInvoices]);

  // Sync statuses offline server highlights
  const isSyncServerOffline = (key: string) => {
    const val = key === 'Trenque Lauquen' ? syncStatus['Trenque Lauquen'] : (syncStatus as any)[key];
    if (!val) return true;
    const diff = Date.now() - new Date(val).getTime();
    return diff > 5 * 60 * 1000;
  };

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

  const syncPanelHasOffline = useMemo(() => {
    const serverKeys = ['Aguas', 'PepsiCo', 'Salliquelo', 'Trenque Lauquen', 'Digip'];
    return serverKeys.some(k => isSyncServerOffline(k));
  }, [syncStatus]);

  return (
    <div className={`app-container ${currentView === 'home' ? 'route-home' : ''}`}>
      
      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`} id="sidebar" style={currentView === 'home' ? { display: 'none' } : undefined}>
        <div 
          className="logo-container" 
          onClick={() => navigateToModule('home')} 
          style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', height: 'var(--header-height)', borderBottom: '1px solid var(--surface-border)', padding: '0 16px', cursor: 'pointer' }}
        >
          <div className="logo-badge" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '32px' }}>
            <img src={logoIngentronSrc} alt="Ingentron S.R.L." style={{ maxHeight: '20px', width: 'auto', objectFit: 'contain' }} />
          </div>
          <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)' }}></div>
          <div className="logo-badge" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '32px' }}>
            <img src={logoGruyaSrc} alt="Gruya S.R.L." style={{ maxHeight: '20px', width: 'auto', objectFit: 'contain' }} />
          </div>
        </div>
        <nav className="nav-menu">
          <div className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => { navigateToModule('dashboard'); setIsSidebarCollapsed(true); }}>
            <i className="fas fa-wallet"></i> <span>Cuentas Corrientes</span>
          </div>
          <div className={`nav-item ${currentView === 'stock-expiration' ? 'active' : ''}`} onClick={() => { navigateToModule('stock-expiration'); setIsSidebarCollapsed(true); }}>
            <i className="fas fa-boxes"></i> <span>Vencimientos Stock</span>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${isSidebarCollapsed ? 'expanded' : ''}`} id="main-content" style={currentView === 'home' ? { marginLeft: '0', maxWidth: '100%', width: '100%', padding: '20px' } : undefined}>
        
        {/* Mobile top bar */}
        <div className="mobile-top-bar" style={currentView === 'home' ? { display: 'none' } : undefined}>
          <button 
            id="mobile-menu-toggle" 
            className="btn-icon hamburger-btn" 
            onClick={() => setIsSidebarCollapsed(prev => !prev)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '4px' }}
          >
            <span className="bar"></span>
            <span className="bar"></span>
            <span className="bar"></span>
          </button>
          <div className="mobile-bar-logos" onClick={() => navigateToModule('home')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="logo-badge" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '32px' }}>
              <img src={logoIngentronSrc} alt="Ingentron S.R.L." style={{ maxHeight: '20px', width: 'auto', objectFit: 'contain' }} />
            </div>
            <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)' }}></div>
            <div className="logo-badge" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '32px' }}>
              <img src={logoGruyaSrc} alt="Gruya S.R.L." style={{ maxHeight: '20px', width: 'auto', objectFit: 'contain' }} />
            </div>
          </div>
          <div style={{ width: '40px' }}></div>
        </div>

        {/* Top Header */}
        <header className="top-header" style={currentView === 'home' ? { display: 'none' } : undefined}>
          <div className="header-title" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              id="sidebar-toggle" 
              className="btn-icon hamburger-btn" 
              onClick={() => setIsSidebarCollapsed(prev => !prev)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '4px' }}
            >
              <span className="bar"></span>
              <span className="bar"></span>
              <span className="bar"></span>
            </button>
            <div className="header-logo-container" onClick={() => navigateToModule('home')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="logo-badge" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '32px' }}>
                <img src={logoIngentronSrc} alt="Ingentron" style={{ maxHeight: '20px', width: 'auto', objectFit: 'contain' }} />
              </div>
              <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)' }}></div>
              <div className="logo-badge" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '32px' }}>
                <img src={logoGruyaSrc} alt="Gruya" style={{ maxHeight: '20px', width: 'auto', objectFit: 'contain' }} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2>{currentView === 'dashboard' ? 'Cuentas Corrientes' : 'Vencimientos de Stock'}</h2>
              </div>
              <p>{currentView === 'dashboard' ? 'Resumen de cuentas corrientes' : 'Módulo de control de caducidades'}</p>
            </div>
          </div>

          <div className="header-actions">
            {currentView === 'dashboard' && (
              <>
                <button 
                  id="mobile-filter-toggle" 
                  className={`mobile-filter-toggle-btn ${showMobileFilters ? 'active' : ''}`}
                  onClick={() => setShowMobileFilters(prev => !prev)}
                >
                  <i className={showMobileFilters ? "fas fa-chevron-up" : "fas fa-filter"}></i>
                  <span>{showMobileFilters ? 'Ocultar Filtros' : 'Mostrar Filtros'}</span>
                </button>
                <div className={`selector-group ${showMobileFilters ? 'show-mobile' : ''}`} id="filters-container">
                
                {/* Empresa Filter Custom Dropdown */}
                <div className="empresa-selector-container">
                  <label htmlFor="empresa-select"><i className="fas fa-industry"></i> Empresa:</label>
                  <div className="mac-select-wrapper" onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'empresa' ? null : 'empresa'); }}>
                    <button type="button" className={`mac-select-trigger ${activeDropdown === 'empresa' ? 'active' : ''}`}>
                      <span className="mac-select-value">{empresaFilter === '' ? 'Todas las empresas' : empresaFilter}</span>
                      <i className="fas fa-chevron-down mac-select-arrow"></i>
                    </button>
                    {activeDropdown === 'empresa' && (
                      <div className="mac-select-dropdown show">
                        <div className={`mac-select-option ${empresaFilter === '' ? 'selected' : ''}`} onClick={() => setEmpresaFilter('')}>Todas las empresas</div>
                        <div className={`mac-select-option ${empresaFilter === 'Ingentron' ? 'selected' : ''}`} onClick={() => setEmpresaFilter('Ingentron')}>Ingentron</div>
                        <div className={`mac-select-option ${empresaFilter === 'Gruya' ? 'selected' : ''}`} onClick={() => setEmpresaFilter('Gruya')}>Gruya</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Origin Filter Custom Dropdown */}
                <div className="origin-selector-container">
                  <label htmlFor="origin-select"><i className="fas fa-building"></i> Unidad:</label>
                  <div className="mac-select-wrapper" onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'origin' ? null : 'origin'); }}>
                    <button type="button" className={`mac-select-trigger ${activeDropdown === 'origin' ? 'active' : ''}`}>
                      <span className="mac-select-value">{originFilter === '' ? 'Todas las unidades' : originFilter}</span>
                      <i className="fas fa-chevron-down mac-select-arrow"></i>
                    </button>
                    {activeDropdown === 'origin' && (
                      <div className="mac-select-dropdown show">
                        <div className={`mac-select-option ${originFilter === '' ? 'selected' : ''}`} onClick={() => setOriginFilter('')}>Todas las unidades</div>
                        {originOptions.map(org => (
                          <div key={org} className={`mac-select-option ${originFilter === org ? 'selected' : ''}`} onClick={() => setOriginFilter(org)}>{org}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Week Filter Custom Dropdown */}
                <div className="week-selector-container">
                  <label htmlFor="week-select"><i className="fas fa-calendar-week"></i> Semana:</label>
                  <div className="mac-select-wrapper" onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'week' ? null : 'week'); }}>
                    <button type="button" className={`mac-select-trigger ${activeDropdown === 'week' ? 'active' : ''}`}>
                      <span className="mac-select-value">{weekFilter === 'LATEST' ? 'LATEST' : weekFilter}</span>
                      <i className="fas fa-chevron-down mac-select-arrow"></i>
                    </button>
                    {activeDropdown === 'week' && (
                      <div className="mac-select-dropdown show">
                        <div className={`mac-select-option ${weekFilter === 'LATEST' ? 'selected' : ''}`} onClick={() => setWeekFilter('LATEST')}>LATEST</div>
                        {dropdownWeekOptions.map(week => (
                          <div key={week} className={`mac-select-option ${weekFilter === week ? 'selected' : ''}`} onClick={() => setWeekFilter(week)}>{week}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Filter Custom Dropdown */}
                <div className="status-selector-container" id="status-selector-container">
                  <label htmlFor="status-select"><i className="fas fa-exclamation-circle"></i> Estado:</label>
                  <div className="mac-select-wrapper" onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'status' ? null : 'status'); }}>
                    <button type="button" className={`mac-select-trigger ${activeDropdown === 'status' ? 'active' : ''}`}>
                      <span className="mac-select-value">{statusFilter === '' ? 'Todos los estados' : statusFilter}</span>
                      <i className="fas fa-chevron-down mac-select-arrow"></i>
                    </button>
                    {activeDropdown === 'status' && (
                      <div className="mac-select-dropdown show">
                        <div className={`mac-select-option ${statusFilter === '' ? 'selected' : ''}`} onClick={() => setStatusFilter('')}>Todos los estados</div>
                        <div className={`mac-select-option ${statusFilter === 'No vencido' ? 'selected' : ''}`} onClick={() => setStatusFilter('No vencido')}>No vencido</div>
                        <div className={`mac-select-option ${statusFilter === 'Vencido' ? 'selected' : ''}`} onClick={() => setStatusFilter('Vencido')}>Vencido</div>
                        <div className={`mac-select-option ${statusFilter === 'Más de 30 días' ? 'selected' : ''}`} onClick={() => setStatusFilter('Más de 30 días')}>Más de 30 días</div>
                      </div>
                    )}
                  </div>
                  <div className="compensar-checkbox-wrapper">
                    <label>
                      <input type="checkbox" id="hide-compensar-checkbox" checked={hideCompensar} onChange={(e) => setHideCompensar(e.target.checked)} />
                      Ocultar cuentas a compensar
                    </label>
                  </div>
              </div>
            </div>
          </>
        )}
        </div>
        </header>

        <div className="content-area">
          
          {/* HOME VIEW */}
          {currentView === 'home' && (
            <div id="home-view" className="view-section" style={{ display: 'flex', minHeight: 'calc(100vh - 100px)', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
              <div style={{ maxWidth: '1000px', width: '100%', margin: 'auto', padding: '20px' }}>
                <div className="home-logos-container" style={{ display: 'flex', alignItems: 'center', gap: '20px', justifyContent: 'center', marginBottom: '56px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 340px))', gap: '24px', justifyContent: 'center', maxWidth: '720px', margin: '0 auto' }}>
                  
                  {/* Card: Cuentas Corrientes */}
                  <div 
                    className="module-card glass-card" 
                    onClick={() => navigateToModule('dashboard')} 
                    style={{ padding: '32px', borderRadius: '20px', cursor: 'pointer', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(255, 255, 255, 0.02)', minHeight: '220px' }}
                  >
                    <div className="module-icon-container" style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifySpace: 'center', justifyContent: 'center', fontSize: '24px' }}>
                      <i className="fas fa-wallet"></i>
                    </div>
                    <div>
                      <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>Cuentas Corrientes</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>Monitoreo de saldos de clientes, facturas pendientes y evolución histórica de deudas.</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#3b82f6', marginTop: 'auto' }}>
                      <span>Acceder</span> <i className="fas fa-chevron-right" style={{ fontSize: '10px' }}></i>
                    </div>
                  </div>

                  {/* Card: Control de Vencimientos */}
                  <div 
                    className="module-card glass-card" 
                    onClick={() => navigateToModule('stock-expiration')} 
                    style={{ padding: '32px', borderRadius: '20px', cursor: 'pointer', border: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '20px', background: 'rgba(255, 255, 255, 0.02)', minHeight: '220px' }}
                  >
                    <div className="module-icon-container" style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
                      <i className="fas fa-boxes"></i>
                    </div>
                    <div>
                      <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>Control de Vencimientos</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>Gestión de caducidad de artículos sincronizada con DIGIP WMS.</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#8b5cf6', marginTop: 'auto' }}>
                      <span>Acceder</span> <i className="fas fa-chevron-right" style={{ fontSize: '10px' }}></i>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* DASHBOARD VIEW (Cuentas Corrientes) */}
          {currentView === 'dashboard' && (
            <div id="dashboard-view" className="view-section">
              
              {/* KPI Cards */}
              <div className="kpi-grid">
                <div className="kpi-card glass-card">
                  <div className="kpi-icon blue"><i className="fas fa-wallet"></i></div>
                  <div className="kpi-info">
                    <h4>Saldo Total</h4>
                    <h2>{formatCurrency(totalOutstandingBalance)}</h2>
                  </div>
                </div>
                <div className="kpi-card glass-card">
                  <div className="kpi-icon green"><i className="fas fa-users"></i></div>
                  <div className="kpi-info">
                    <h4>Clientes con Deuda</h4>
                    <h2>{filteredCtaCteClients.length}</h2>
                  </div>
                </div>
                <div className="kpi-card glass-card">
                  <div className="kpi-icon purple"><i className="fas fa-file-invoice-dollar"></i></div>
                  <div className="kpi-info">
                    <h4>Facturas Pendientes</h4>
                    <h2>{totalOutstandingInvoices}</h2>
                  </div>
                </div>
              </div>

              {/* Trend Chart Area (Middle) */}
              <div className="trend-section glass-card mt-4">
                <div className="section-header">
                  <h3><i className="fas fa-chart-line"></i> Evolución de Saldos por Semana</h3>
                </div>
                <div className="trend-chart-container" style={{ position: 'relative', height: '300px', marginTop: '15px' }}>
                  <canvas ref={trendCanvasRef} id="trend-bar-chart"></canvas>
                </div>
              </div>

              {/* Layout grid */}
              <div className="dashboard-grid mt-4">
                
                {/* Client List (Left) */}
                <div className="data-section glass-card" style={{ marginTop: 0 }}>
                  <div className="section-header">
                    <h3><i className="fas fa-list"></i> Detalle por Cliente</h3>
                    <div className="search-box">
                      <i className="fas fa-search"></i>
                      <input 
                        type="text" 
                        id="search-client" 
                        placeholder="Buscar cliente..." 
                        className="glass-input"
                        value={searchClient}
                        onChange={(e) => setSearchClient(e.target.value)}
                      />
                      {searchClient && (
                        <button type="button" className="clear-search-btn" style={{ display: 'flex' }} onClick={() => setSearchClient('')} title="Limpiar búsqueda">
                          <i className="fas fa-times"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="table-container">
                    <table className="data-table" id="clients-table">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Origen</th>
                          <th className="text-center">Estado</th>
                          <th className="text-right">Saldo Total</th>
                          <th className="text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCtaCteClients.length === 0 ? (
                          <tr><td colSpan={5} className="text-center" style={{ opacity: 0.5, padding: '30px' }}>No se encontraron registros</td></tr>
                        ) : (
                          filteredCtaCteClients.map(client => {
                            const status = getClientMostCriticalStatus(client.invoices);
                            const originsArray = Array.from(client.origins).sort();
                            const originsWithCodes = Object.keys(client.clientCodesByOrigin);
                            
                            return (
                              <tr key={client.client}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{client.client}</span>
                                    {originsWithCodes.map(org => {
                                      const codes = Array.from(client.clientCodesByOrigin[org]).join(' | ');
                                      return (
                                        <span key={org} className="client-code-badge"><i className="fas fa-tag"></i> {org}: {codes}</span>
                                      );
                                    })}
                                  </div>
                                </td>
                                <td>
                                  {originsArray.map(org => (
                                    <span key={org} className={`badge ${getOriginColorClass(org)}`} style={{ marginRight: '4px', display: 'inline-block' }}>{org}</span>
                                  ))}
                                </td>
                                <td className="text-center">
                                  <span className={`badge ${status.class}`} style={{ fontSize: '11px', padding: '4px 10px', fontWeight: 600, display: 'inline-flex', minWidth: '90px', textAlign: 'center', justifyContent: 'center' }}>{status.text}</span>
                                </td>
                                <td className="text-right font-medium">{formatCurrency(client.totalAmount)}</td>
                                <td className="text-center">
                                  <button className="btn-icon" title="Ver Facturas" onClick={() => showInvoices(client.client)}>
                                    <i className="fas fa-eye"></i>
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Status Doughnut Chart (Right) */}
                <div className="chart-section glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div className="section-header" style={{ position: 'relative' }}>
                    <h3><i className="fas fa-chart-pie"></i> Estado de Cuentas</h3>
                    {statusFilter !== '' && (
                      <button id="reset-status-filter" title="Ver todos los estados" onClick={() => setStatusFilter('')} style={{
                        position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)',
                        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: '13px', transition: 'all 0.25s ease', opacity: 1, pointerEvents: 'auto'
                      }}>
                        <i className="fas fa-rotate-left"></i>
                      </button>
                    )}
                  </div>
                  <div className="chart-container-wrapper" style={{ position: 'relative', height: '240px', margin: '15px 0', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <canvas ref={statusCanvasRef} id="status-pie-chart" style={{ maxHeight: '240px', maxWidth: '240px' }}></canvas>
                  </div>
                  <div id="chart-legend" className="chart-legend-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 5px 0 5px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    {filteredCtaCteClients.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', padding: '15px', fontSize: '13px' }}>No hay datos disponibles.</div>
                    ) : (
                      (() => {
                        let ok = 0, vencido = 0, critico = 0;
                        filteredCtaCteClients.forEach(c => {
                          const s = getClientMostCriticalStatus(c.invoices).text;
                          if (s === 'No vencido') ok++;
                          else if (s === 'Vencido') vencido++;
                          else if (s === 'Más de 30 días') critico++;
                        });
                        const tot = ok + vencido + critico;
                        const okP = tot > 0 ? Math.round((ok / tot) * 100) : 0;
                        const venP = tot > 0 ? Math.round((vencido / tot) * 100) : 0;
                        const criP = tot > 0 ? Math.round((critico / tot) * 100) : 0;
                        return (
                          <>
                            <div className="chart-legend-item" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('No vencido')}>
                              <div className="legend-left">
                                <div className="legend-color-pill" style={{ background: '#34d399', boxShadow: '0 0 10px rgba(52, 211, 153, 0.4)' }}></div>
                                <span className="legend-label">No vencido</span>
                              </div>
                              <div className="legend-right">
                                <span className="legend-count">{ok} cl.</span>
                                <span className="legend-percent ok">{okP}%</span>
                              </div>
                            </div>
                            <div className="chart-legend-item" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('Vencido')}>
                              <div className="legend-left">
                                <div className="legend-color-pill" style={{ background: '#fbbf24', boxShadow: '0 0 10px rgba(251, 191, 36, 0.4)' }}></div>
                                <span className="legend-label">Vencido</span>
                              </div>
                              <div className="legend-right">
                                <span className="legend-count">{vencido} cl.</span>
                                <span className="legend-percent vencido">{venP}%</span>
                              </div>
                            </div>
                            <div className="chart-legend-item" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('Más de 30 días')}>
                              <div className="legend-left">
                                <div className="legend-color-pill" style={{ background: '#f87171', boxShadow: '0 0 10px rgba(248, 113, 113, 0.4)' }}></div>
                                <span className="legend-label">Más de 30 días</span>
                              </div>
                              <div className="legend-right">
                                <span className="legend-count">{critico} cl.</span>
                                <span className="legend-percent critico">{criP}%</span>
                              </div>
                            </div>
                          </>
                        );
                      })()
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* STOCK EXPIRATION VIEW */}
          {currentView === 'stock-expiration' && (
            <div id="stock-expiration-view" className="view-section">
              
              {/* Table section */}
              <div className="table-section glass-card" style={{ padding: '24px' }}>
                <div className="table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-color)' }}>Control de Lotes y Caducidades</h3>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      id="search-stock" 
                      className="glass-input" 
                      placeholder="Buscar producto..." 
                      style={{ maxWidth: '200px', fontSize: '13px', padding: '6px 12px', borderRadius: '8px' }}
                      value={searchStock}
                      onChange={(e) => setSearchStock(e.target.value)}
                    />
                    
                    {/* Export Dropdown */}
                    <div className="dropdown" style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'export' ? null : 'export'); }}>
                      <button type="button" id="download-stock-btn" className="glass-btn" style={{ fontSize: '13px', padding: '6px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff', height: '34px' }}>
                        <i className="fas fa-download"></i> <span>Exportar</span> <i className="fas fa-chevron-down" style={{ fontSize: '10px' }}></i>
                      </button>
                      {activeDropdown === 'export' && (
                        <div id="download-dropdown" className="dropdown-content glass-card" style={{ display: 'block', position: 'absolute', right: 0, top: '110%', minWidth: '160px', zIndex: 1000, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(25, 28, 36, 0.95)', backdropFilter: 'blur(10px)' }}>
                          <a href="#" onClick={exportStockToPDF} style={{ color: '#fff', padding: '10px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px 8px 0 0' }}><i className="fas fa-file-pdf" style={{ color: '#ff453a' }}></i> Descargar PDF</a>
                          <a href="#" onClick={exportStockToExcel} style={{ color: '#fff', padding: '10px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', borderRadius: '0 0 8px 8px' }}><i className="fas fa-file-excel" style={{ color: '#30d158' }}></i> Descargar Excel</a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-10px', marginBottom: '15px' }}>
                  <div className="premium-checkbox-wrapper">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                      <input type="checkbox" id="hide-expired-checkbox" checked={hideExpiredStock} onChange={(e) => setHideExpiredStock(e.target.checked)} style={{ cursor: 'pointer' }} />
                      Ocultar vencidos
                    </label>
                  </div>
                </div>

                <div className="table-container" style={{ overflowX: 'auto' }}>
                  <table className="data-table" id="stock-table">
                    <thead>
                      <tr>
                        <th onClick={() => toggleStockSort('codigo')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Código Artículo {stockSortColumn === 'codigo' ? (stockSortDirection === 'asc' ? <i className="fas fa-sort-up"></i> : <i className="fas fa-sort-down"></i>) : <i className="fas fa-sort"></i>}
                        </th>
                        <th onClick={() => toggleStockSort('producto')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Producto {stockSortColumn === 'producto' ? (stockSortDirection === 'asc' ? <i className="fas fa-sort-up"></i> : <i className="fas fa-sort-down"></i>) : <i className="fas fa-sort"></i>}
                        </th>
                        <th onClick={() => toggleStockSort('cantidad')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Cantidad {stockSortColumn === 'cantidad' ? (stockSortDirection === 'asc' ? <i className="fas fa-sort-up"></i> : <i className="fas fa-sort-down"></i>) : <i className="fas fa-sort"></i>}
                        </th>
                        <th onClick={() => toggleStockSort('variacion')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Variación (24h) {stockSortColumn === 'variacion' ? (stockSortDirection === 'asc' ? <i className="fas fa-sort-up"></i> : <i className="fas fa-sort-down"></i>) : <i className="fas fa-sort"></i>}
                        </th>
                        <th onClick={() => toggleStockSort('vencimiento')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Vencimiento {stockSortColumn === 'vencimiento' ? (stockSortDirection === 'asc' ? <i className="fas fa-sort-up"></i> : <i className="fas fa-sort-down"></i>) : <i className="fas fa-sort"></i>}
                        </th>
                        <th onClick={() => toggleStockSort('restante')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Restante {stockSortColumn === 'restante' ? (stockSortDirection === 'asc' ? <i className="fas fa-sort-up"></i> : <i className="fas fa-sort-down"></i>) : <i className="fas fa-sort"></i>}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center" style={{ opacity: 0.5, padding: '30px' }}>
                            {isRealStockLoaded
                              ? "No se encontraron lotes con los filtros seleccionados"
                              : "No hay datos de stock sincronizados. Esperando primera ejecución del sincronizador local..."}
                          </td>
                        </tr>
                      ) : (
                        filteredStock.map(item => {
                          const days = getDaysRemaining(item.fechaVencimiento);
                          const isExpanded = expandedStockRows.has(`${item.codigo}_${item.lote}_${item.fechaVencimiento}`);
                          let daysText = '';
                          if (days < 0) daysText = `Venció hace ${Math.abs(days)}d`;
                          else if (days === 0) daysText = 'Vence Hoy';
                          else daysText = `${days}d restante${days > 1 ? 's' : ''}`;

                          const id = `${item.codigo}_${item.lote}_${item.fechaVencimiento}`;

                          return (
                            <React.Fragment key={id}>
                              <tr 
                                className={`stock-main-row ${isExpanded ? 'expanded-main' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => toggleStockRowExpanded(id)}
                              >
                                <td><code style={{ fontSize: '11px', opacity: 0.85 }}>{item.codigo}</code></td>
                                <td><div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.producto}</div></td>
                                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.cantidad} un.</td>
                                <td>{getStockVariationBadge(item)}</td>
                                <td>{formatDateToES(item.fechaVencimiento)}</td>
                                <td style={{ fontWeight: 600, color: days <= 30 ? '#f87171' : 'inherit' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', width: '100%' }}>
                                    <span>{daysText}</span>
                                    <i className="fas fa-chevron-down toggle-icon" style={{ transition: 'transform 0.3s', opacity: 0.5, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}></i>
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="stock-detail-row" style={{ display: 'table-row', background: 'rgba(255, 255, 255, 0.005)' }}>
                                  <td colSpan={6} style={{ padding: 0, borderTop: 'none' }}>
                                    <div className="detail-wrapper" style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--accent-color)' }}>
                                        <i className="fas fa-history"></i> Historial de Variación Diaria (Últimos 7 días)
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' }}>
                                        {getStockDailyVariations(item).map(v => {
                                          let badgeStyle = {};
                                          if (v.class === 'positive') badgeStyle = { background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.25)' };
                                          else if (v.class === 'negative') badgeStyle = { background: 'rgba(248, 113, 113, 0.15)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.25)' };
                                          else if (v.class === 'new') badgeStyle = { background: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.25)' };
                                          else badgeStyle = { background: 'rgba(255, 255, 255, 0.05)', color: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' };

                                          return (
                                            <div key={v.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '12px', minWidth: '76px', flex: '1', boxSizing: 'border-box' }}>
                                              <div style={{ fontSize: '13px', opacity: 0.95, fontWeight: 600, color: '#ffffff' }}>{v.label}</div>
                                              <div style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', textAlign: 'center', width: '100%', boxSizing: 'border-box', display: 'block', ...badgeStyle }}>{v.text}</div>
                                              <div style={{ fontSize: '12px', opacity: 0.85, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>{v.qty} un.</div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>
      </main>

      {/* Modal for Invoice Details */}
      {isModalActive && (
        <div id="invoice-modal" className="modal active" onClick={() => setIsModalActive(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ alignItems: 'flex-start' }}>
              <div className="modal-header-info" style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <h3 id="modal-client-name" style={{ fontSize: '1.5rem', margin: 0 }}>{modalClient}</h3>
                  <div id="modal-client-codes" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {Object.entries(modalClientCodes).map(([org, codeSet]) => {
                      const codes = Array.from(codeSet).join(' | ');
                      return (
                        <span key={org} className="client-code-badge"><i className="fas fa-tag"></i> {org}: {codes}</span>
                      );
                    })}
                  </div>
                </div>
                
                {/* Modal filters */}
                <div id="modal-origin-filters" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {modalOriginsList.length > 1 && (
                    <button 
                      className={`modal-filter-btn bg-dark ${modalOriginFilter === 'ALL' ? 'active' : ''}`}
                      onClick={() => setModalOriginFilter('ALL')}
                    >
                      Todo
                    </button>
                  )}
                  {modalOriginsList.map(org => (
                    <button 
                      key={org}
                      className={`modal-filter-btn ${getOriginColorClass(org)} ${modalOriginFilter === org ? 'active' : ''}`}
                      onClick={() => setModalOriginFilter(org)}
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
                  onClick={downloadClientPDF}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(10, 132, 255, 0.12)', border: '1px solid rgba(10, 132, 255, 0.3)', borderRadius: '12px', padding: '12px 18px', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', height: '52px' }}
                >
                  <i className="fas fa-file-pdf" style={{ color: '#ff453a', fontSize: '14px' }}></i> Descargar PDF
                </button>
                <div className="glass-card" style={{ padding: '12px 24px', textAlign: 'right', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '11px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Total Seleccionado</div>
                  <div id="modal-total-amount" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-color)', margin: 0, lineHeight: 1 }}>{formatCurrency(modalTotalAmount)}</div>
                </div>
              </div>
              <span className="close-modal" onClick={() => setIsModalActive(false)}>&times;</span>
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
                    {modalAggregatedInvoices.map((inv, index) => {
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
      )}

      {/* Modal for Connection Alert */}
      {connectionAlertActive && (
        <div id="connection-alert-modal" className="modal active">
          <div className="modal-content glass-card" style={{ maxWidth: '450px', textAlign: 'center', padding: '32px', gap: '20px', alignItems: 'center' }}>
            <div style={{ fontSize: '52px', color: '#ff9f0a', marginBottom: '8px' }}>
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#fff' }}>Servidor Desconectado</h3>
            <p id="connection-alert-message" style={{ fontSize: '14.5px', opacity: 0.85, margin: 0, lineHeight: 1.6, color: '#f2f2f7' }} dangerouslySetInnerHTML={{ __html: connectionAlertMessage }}></p>
            <button 
              id="connection-alert-btn" 
              className="glass-btn" 
              onClick={closeConnectionAlert}
              style={{ background: '#ff9f0a', border: 'none', borderRadius: '12px', padding: '12px 28px', color: '#000', fontWeight: 700, fontSize: '14px', cursor: 'pointer', marginTop: '8px', boxShadow: '0 4px 12px rgba(255, 159, 10, 0.25)' }}
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

      {/* Sync Status Panel */}
      {currentView !== 'home' && (
        <div 
          id="sync-status-panel" 
          className={`glass-card ${isSyncPanelExpanded ? 'expanded' : ''} ${syncPanelHasOffline ? 'has-offline' : ''}`}
          onClick={handleSyncPanelClick}
        >
          <div style={{ fontWeight: 600, opacity: 0.5, textTransform: 'uppercase', fontSize: '7px', letterSpacing: '0.5px', marginBottom: '1px' }}>ÚLTIMA SINCRONIZACIÓN</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
            <span className={`status-dot status-dot-aguas ${isSyncServerOffline('Aguas') ? 'offline' : ''}`}></span>
            <span style={{ opacity: 0.85 }}>Calvo (Aguas): <span style={{ fontWeight: 500 }}>{formatSyncDate(syncStatus.Aguas)}</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
            <span className={`status-dot status-dot-pepsico ${isSyncServerOffline('PepsiCo') ? 'offline' : ''}`}></span>
            <span style={{ opacity: 0.85 }}>Gescom (PepsiCo): <span style={{ fontWeight: 500 }}>{formatSyncDate(syncStatus.PepsiCo)}</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
            <span className={`status-dot status-dot-salliquelo ${isSyncServerOffline('Salliquelo') ? 'offline' : ''}`}></span>
            <span style={{ opacity: 0.85 }}>Calvo (Salliqueló): <span style={{ fontWeight: 500 }}>{formatSyncDate(syncStatus.Salliquelo)}</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
            <span className={`status-dot status-dot-trenque ${isSyncServerOffline('Trenque Lauquen') ? 'offline' : ''}`}></span>
            <span style={{ opacity: 0.85 }}>Gescom (T. Lauquen): <span style={{ fontWeight: 500 }}>{formatSyncDate(syncStatus['Trenque Lauquen'])}</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
            <span className={`status-dot status-dot-digip ${isSyncServerOffline('Digip') ? 'offline' : ''}`}></span>
            <span style={{ opacity: 0.85 }}>Digip WMS (Stock): <span style={{ fontWeight: 500 }}>{formatSyncDate(syncStatus.Digip)}</span></span>
          </div>
        </div>
      )}

      {/* Back to top button */}
      <button 
        id="back-to-top" 
        className={`back-to-top ${backToTopVisible ? 'show' : ''}`} 
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} 
        title="Volver al inicio"
      >
        <i className="fas fa-arrow-up"></i>
      </button>

      {/* Processing Overlays */}
      {((currentView === 'dashboard' && isCuentasCorrientesLoading) || (currentView === 'stock-expiration' && isStockLoading)) && (
        <div id="processing-overlay" className="processing-overlay show">
          <div className="processing-card glass-card">
            <i className="fas fa-spinner fa-spin processing-spinner"></i>
            <span>Cargando datos...</span>
          </div>
        </div>
      )}

    </div>
  );
}
