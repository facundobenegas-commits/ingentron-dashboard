import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
// jsPDF, jspdf-autotable y xlsx se cargan con import() dinámico dentro de las
// funciones de exportación para mantenerlos fuera del bundle inicial (solo se
// usan al descargar un PDF/Excel).
import { Saldo, StockItem, SyncStatus, User } from './types';
import {
  parseWeekEndDate,
  formatDate,
  parseExcelDate,
  getDueDateStatus,
  getClientMostCriticalStatus,
  formatCurrency,
  formatAbbreviatedCurrency,
  getDaysRemaining,
  formatDateToES,
  getOriginColorClass,
} from './utils/format';
import { Login } from './components/Login';
import { UserManagement } from './components/UserManagement';
import { MacSelect } from './components/MacSelect';
import { SyncStatusPanel } from './components/SyncStatusPanel';
import { ConnectionAlertModal } from './components/ConnectionAlertModal';
import { HomeView } from './components/HomeView';
import { InvoiceModal } from './components/InvoiceModal';

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
  'Ingentron': ['Aguas', 'PepsiCo', 'Serenisima'],
  'Gruya': ['Trenque Lauquen', 'Salliquelo']
};

export default function App() {
  // Navigation Routing
  const [currentView, setCurrentView] = useState<'home' | 'dashboard' | 'stock-expiration' | 'users-management'>('home');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // User Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>('');
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('ingentron_token');
    const savedUser = localStorage.getItem('ingentron_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('ingentron_token');
        localStorage.removeItem('ingentron_user');
      }
    }
    setIsSessionLoading(false);
  }, []);

  const handleLoginSuccess = (user: User, sessionToken: string) => {
    setCurrentUser(user);
    setToken(sessionToken);
    localStorage.setItem('ingentron_token', sessionToken);
    localStorage.setItem('ingentron_user', JSON.stringify(user));
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/beta/api/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (e) {
        console.error("Error calling logout endpoint:", e);
      }
    }
    setCurrentUser(null);
    setToken('');
    localStorage.removeItem('ingentron_token');
    localStorage.removeItem('ingentron_user');
    navigateToModule('home');
  };

  // Called when the server rejects our token (401/403), e.g. after a redeploy/restart
  // wiped the in-memory sessions. Clears the stale session so the app shows the Login
  // screen instead of an empty dashboard with everything "disconnected".
  const handleSessionExpired = () => {
    setCurrentUser(null);
    setToken('');
    localStorage.removeItem('ingentron_token');
    localStorage.removeItem('ingentron_user');
  };

  const isModuleVisible = (module: 'dashboard' | 'stockExpiration' | 'usersManagement') => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return currentUser.permissions[module]?.visible || false;
  };

  // Data State
  const [globalData, setGlobalData] = useState<Saldo[]>([]);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [stockHistory, setStockHistory] = useState<Record<string, StockItem[]>>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    Aguas: null,
    PepsiCo: null,
    Serenisima: null,
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
  const [logoIngentronSrc, setLogoIngentronSrc] = useState(`${import.meta.env.BASE_URL}logo_ingentron.png`);
  const [logoGruyaSrc, setLogoGruyaSrc] = useState(`${import.meta.env.BASE_URL}logo_gruya.jpg`);
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
      } else if (path.includes('/Configuracion')) {
        setCurrentView('users-management');
      } else {
        setCurrentView('home');
      }
      setShowMobileFilters(false);
    };
    window.addEventListener('popstate', handlePopState);
    handlePopState();
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToModule = (view: 'home' | 'dashboard' | 'stock-expiration' | 'users-management') => {
    // Prefix routes with the app base (e.g. '/beta/') so deep links survive a reload:
    // in production server.js serves index.html for any '/beta/*' path, but redirects
    // non-prefixed paths back to the home view.
    const base = import.meta.env.BASE_URL; // '/beta/'
    let path = base;
    if (view === 'dashboard') path = `${base}CuentasCorrientes`;
    else if (view === 'stock-expiration') path = `${base}ControlVencimientos`;
    else if (view === 'users-management') path = `${base}Configuracion`;
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

    processLogo(`${import.meta.env.BASE_URL}logo_ingentron.png`, false, (res) => {
      logoIngentronObj.current = res;
      setLogoIngentronSrc(res.dark);
    });
    processLogo(`${import.meta.env.BASE_URL}logo_gruya.jpg`, true, (res) => {
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
  }, [currentView, token]);

  // Load Cuentas Corrientes Data dynamically on switching to it
  useEffect(() => {
    if (currentView === 'dashboard') {
      loadCuentasCorrientesData();
    } else if (currentView === 'stock-expiration') {
      loadStockData();
    }
    // token included so a deep-link reload (where the session token is restored
    // asynchronously) re-triggers the data load once the token is available.
  }, [currentView, token]);

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
    if (!token) return;
    if (globalData.length > 0 && !force) return;
    if (!silent) setIsCuentasCorrientesLoading(true);

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/saldos`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.status === 401 || response.status === 403) { handleSessionExpired(); return; }
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
    if (!token) return;
    if (isRealStockLoaded && !force) return;
    if (!silent) setIsStockLoading(true);

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/stock`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.status === 401 || response.status === 403) { handleSessionExpired(); return; }
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
    if (!token) return;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/sync-status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 401 || res.status === 403) { handleSessionExpired(); return; }
      if (!res.ok) return;
      const status = await res.json();
      setSyncStatus(status);

      // Offline detection logic
      const serverNames: Record<string, string> = {
        'Aguas': 'Calvo (Aguas)',
        'PepsiCo': 'Gescom (PepsiCo)',
        'Serenisima': 'Calvo (La Serenísima)',
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
    const offlineList = ['Aguas', 'PepsiCo', 'Serenisima', 'Salliquelo', 'Trenque Lauquen', 'Digip'];
    offlineList.forEach(k => {
      const val = k === 'Trenque Lauquen' ? syncStatus['Trenque Lauquen'] : (syncStatus as any)[k];
      const isOffline = !val || (Date.now() - new Date(val).getTime() > 5 * 60 * 1000);
      if (isOffline) {
        acknowledgedOfflineServers.current.add(k);
      }
    });
  };

  // --- ACCESSIBILITY: close overlays with the Escape key ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (connectionAlertActive) {
        closeConnectionAlert();
      } else if (isModalActive) {
        setIsModalActive(false);
      } else if (activeDropdown) {
        setActiveDropdown(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [connectionAlertActive, isModalActive, activeDropdown]);

  // Date parsing, formatting and status helpers live in ./utils/format (pure functions).

  const shouldHideAccount = (clientCode: string, invoice: string, origin?: string) => {
    if (!hideCompensar) return false;
    if (invoice && String(invoice).trim().toUpperCase().startsWith('RPX')) {
      return true;
    }
    if (!clientCode) return false;
    const normalized = String(clientCode).trim().replace(/^0+/, '');
    if (origin === 'Serenisima' && ['90028', '90016', '3000'].includes(normalized)) {
      return true;
    }
    return NORMALIZED_ACCOUNTS_TO_HIDE.has(normalized);
  };

  // --- FILTERED DATA MEMOIZATIONS ---

  // Available weeks dynamically calculated
  const availableWeeks = useMemo(() => {
    const weeks = new Set<string>();
    globalData.forEach(item => {
      if (shouldHideAccount(item.clientCode, item.invoice, item.origin)) return;
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
      if (shouldHideAccount(item.clientCode, item.invoice, item.origin)) return;
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
      if (shouldHideAccount(item.clientCode, item.invoice, item.origin)) return false;

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
      if (shouldHideAccount(item.clientCode, item.invoice, item.origin)) return false;
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
  // getDaysRemaining, getStockStatus and formatDateToES live in ./utils/format.

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
  const downloadClientPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
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
      if (name === 'Aguas' || name === 'PepsiCo' || name === 'Serenisima' || name === 'Ingentron' || name === 'Ingentron S.R.L.') {
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
      if (name === 'Serenisima') return 'La Serenísima';
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

  const exportStockToPDF = async (event: React.MouseEvent) => {
    event.preventDefault();
    const dataToExport = filteredStock;
    if (dataToExport.length === 0) {
      alert("No hay datos de stock disponibles para exportar.");
      return;
    }

    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
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

  const exportStockToExcel = async (event: React.MouseEvent) => {
    event.preventDefault();
    const dataToExport = filteredStock;
    if (dataToExport.length === 0) {
      alert("No hay datos de stock disponibles para exportar.");
      return;
    }

    const XLSX = await import('xlsx');
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
      if (shouldHideAccount(item.clientCode, item.invoice, item.origin)) return false;

      // Apply global origin filter
      if (originFilter !== '' && item.origin !== originFilter) return false;

      // Apply week filter
      if (weekFilter === 'LATEST') {
        const originWeeksSet = new Set(globalData.filter(d => {
          if (shouldHideAccount(d.clientCode, d.invoice, d.origin)) return false;
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

  const syncPanelHasOffline = useMemo(() => {
    const serverKeys = ['Aguas', 'PepsiCo', 'Serenisima', 'Salliquelo', 'Trenque Lauquen', 'Digip'];
    return serverKeys.some(k => isSyncServerOffline(k));
  }, [syncStatus]);

  if (isSessionLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#040406', color: 'var(--text-secondary)' }}>
        <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '32px', color: 'var(--accent-color)' }}></i>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

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
          <span className="beta-badge">Beta</span>
        </div>
        <nav className="nav-menu">
          {isModuleVisible('dashboard') && (
            <div className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => { navigateToModule('dashboard'); setIsSidebarCollapsed(true); }}>
              <i className="fas fa-wallet"></i> <span>Cuentas Corrientes</span>
            </div>
          )}
          {isModuleVisible('stockExpiration') && (
            <div className={`nav-item ${currentView === 'stock-expiration' ? 'active' : ''}`} onClick={() => { navigateToModule('stock-expiration'); setIsSidebarCollapsed(true); }}>
              <i className="fas fa-boxes"></i> <span>Vencimientos Stock</span>
            </div>
          )}
          {isModuleVisible('usersManagement') && (
            <div className={`nav-item ${currentView === 'users-management' ? 'active' : ''}`} onClick={() => { navigateToModule('users-management'); setIsSidebarCollapsed(true); }}>
              <i className="fas fa-users-cog"></i> <span>Configuración</span>
            </div>
          )}
          <div style={{ flex: 1 }}></div>
          <div className="nav-item stable-link" onClick={() => window.location.href = '/'}>
            <i className="fas fa-rocket"></i> <span>Versión Estable</span>
          </div>
          <div className="nav-item" onClick={handleLogout} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px', color: 'var(--danger-color)', cursor: 'pointer' }}>
            <i className="fas fa-sign-out-alt"></i> <span>Cerrar Sesión</span>
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
            aria-label="Alternar menú lateral"
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
            <span className="beta-badge">Beta</span>
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
              aria-label="Alternar menú lateral"
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
              <span className="beta-badge">Beta</span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2>
                  {currentView === 'dashboard'
                    ? 'Cuentas Corrientes'
                    : currentView === 'users-management'
                    ? 'Configuración de Usuarios'
                    : 'Vencimientos de Stock'}
                </h2>
              </div>
              <p>
                {currentView === 'dashboard'
                  ? 'Resumen de cuentas corrientes'
                  : currentView === 'users-management'
                  ? 'Administración de accesos y perfiles'
                  : 'Módulo de control de caducidades'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {currentUser && (
              <div className="user-profile-badge" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="user-profile-text" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{currentUser.displayName}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{currentUser.role === 'admin' ? 'Administrador' : 'Operador'}</span>
                </div>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent-color), var(--purple-color))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: '13px', border: '1px solid rgba(255, 255, 255, 0.15)'
                }}>
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
              </div>
            )}

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
                  <MacSelect
                    id="empresa-select"
                    label="Empresa"
                    value={empresaFilter}
                    options={[
                      { value: '', label: 'Todas las empresas' },
                      { value: 'Ingentron', label: 'Ingentron' },
                      { value: 'Gruya', label: 'Gruya' },
                    ]}
                    isOpen={activeDropdown === 'empresa'}
                    onToggle={() => setActiveDropdown(activeDropdown === 'empresa' ? null : 'empresa')}
                    onSelect={setEmpresaFilter}
                  />
                </div>

                {/* Origin Filter Custom Dropdown */}
                <div className="origin-selector-container">
                  <label htmlFor="origin-select"><i className="fas fa-building"></i> Unidad:</label>
                  <MacSelect
                    id="origin-select"
                    label="Unidad"
                    value={originFilter}
                    options={[
                      { value: '', label: 'Todas las unidades' },
                      ...originOptions.map(org => ({ value: org, label: org })),
                    ]}
                    isOpen={activeDropdown === 'origin'}
                    onToggle={() => setActiveDropdown(activeDropdown === 'origin' ? null : 'origin')}
                    onSelect={setOriginFilter}
                  />
                </div>

                {/* Week Filter Custom Dropdown */}
                <div className="week-selector-container">
                  <label htmlFor="week-select"><i className="fas fa-calendar-week"></i> Semana:</label>
                  <MacSelect
                    id="week-select"
                    label="Semana"
                    value={weekFilter}
                    options={[
                      { value: 'LATEST', label: 'LATEST' },
                      ...dropdownWeekOptions.map(week => ({ value: week, label: week })),
                    ]}
                    isOpen={activeDropdown === 'week'}
                    onToggle={() => setActiveDropdown(activeDropdown === 'week' ? null : 'week')}
                    onSelect={setWeekFilter}
                  />
                </div>

                {/* Status Filter Custom Dropdown */}
                <div className="status-selector-container" id="status-selector-container">
                  <label htmlFor="status-select"><i className="fas fa-exclamation-circle"></i> Estado:</label>
                  <MacSelect
                    id="status-select"
                    label="Estado"
                    value={statusFilter}
                    options={[
                      { value: '', label: 'Todos los estados' },
                      { value: 'No vencido', label: 'No vencido' },
                      { value: 'Vencido', label: 'Vencido' },
                      { value: 'Más de 30 días', label: 'Más de 30 días' },
                    ]}
                    isOpen={activeDropdown === 'status'}
                    onToggle={() => setActiveDropdown(activeDropdown === 'status' ? null : 'status')}
                    onSelect={setStatusFilter}
                  />
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
        </div>
        </header>

        <div className="content-area">
          
          {/* HOME VIEW */}
          {currentView === 'home' && (
            <HomeView
              logoIngentronSrc={logoIngentronSrc}
              logoGruyaSrc={logoGruyaSrc}
              isModuleVisible={isModuleVisible}
              navigateToModule={navigateToModule}
            />
          )}

          {/* CONFIGURACIÓN DE USUARIOS VIEW */}
          {currentView === 'users-management' && isModuleVisible('usersManagement') && (
            <div id="users-management-view" className="view-section">
              <UserManagement token={token} currentUser={currentUser} />
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
                                      <div className="daily-history-list" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' }}>
                                        {getStockDailyVariations(item).map(v => {
                                          let badgeStyle = {};
                                          if (v.class === 'positive') badgeStyle = { background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.25)' };
                                          else if (v.class === 'negative') badgeStyle = { background: 'rgba(248, 113, 113, 0.15)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.25)' };
                                          else if (v.class === 'new') badgeStyle = { background: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.25)' };
                                          else badgeStyle = { background: 'rgba(255, 255, 255, 0.05)', color: 'rgba(255, 255, 255, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)' };

                                          return (
                                            <div key={v.label} className="daily-history-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '12px 14px', borderRadius: '12px', minWidth: '76px', flex: '1', boxSizing: 'border-box' }}>
                                              <div style={{ fontSize: '13px', opacity: 0.95, fontWeight: 600, color: '#ffffff' }}>{v.label}</div>
                                              <div className="daily-history-badge" style={{ fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', textAlign: 'center', width: '100%', boxSizing: 'border-box', display: 'block', ...badgeStyle }}>{v.text}</div>
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
        <InvoiceModal
          client={modalClient}
          clientCodes={modalClientCodes}
          originsList={modalOriginsList}
          originFilter={modalOriginFilter}
          onOriginFilterChange={setModalOriginFilter}
          invoices={modalAggregatedInvoices}
          totalAmount={modalTotalAmount}
          onClose={() => setIsModalActive(false)}
          onDownloadPDF={downloadClientPDF}
        />
      )}

      {/* Modal for Connection Alert */}
      {connectionAlertActive && (
        <ConnectionAlertModal message={connectionAlertMessage} onAccept={closeConnectionAlert} />
      )}

      {/* Sync Status Panel */}
      {currentView !== 'home' && (
        <SyncStatusPanel
          syncStatus={syncStatus}
          isExpanded={isSyncPanelExpanded}
          hasOffline={syncPanelHasOffline}
          isOffline={isSyncServerOffline}
          onClick={handleSyncPanelClick}
        />
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
