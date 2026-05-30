// Global State
let globalData = [];
let availableWeeks = new Set();
let currentEmpresaFilter = '';
let currentWeekFilter = '';
let currentOriginFilter = '';
let currentStatusFilter = '';
let currentSituacionFilter = '';
let statusChart = null;
let trendChart = null;

// Empresa → Unidades mapping
const empresaToOrigins = {
    'Ingentron': ['Aguas', 'PepsiCo'],
    'Gruya': ['Trenque Lauquen', 'Salliquelo']
};

// Helper robusto para ordenar fechas de cortes semanales cronológicamente
function parseWeekEndDate(weekStr) {
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
}

// DOM Elements
const dashboardView = document.getElementById('dashboard-view');
const viewTitle = document.getElementById('view-title');
const weekSelectorContainer = document.getElementById('week-selector-container');
const weekSelect = document.getElementById('week-select');
const empresaSelect = document.getElementById('empresa-select');
const originSelect = document.getElementById('origin-select');
const statusSelect = document.getElementById('status-select');
const situacionSelect = document.getElementById('situacion-select');
const filtersContainer = document.getElementById('filters-container');
const searchInput = document.getElementById('search-client');
const loadingIndicator = document.getElementById('processing-overlay');

// Corporate Logo Assets (Processed)
window.logoIngentronObj = null;
window.logoGruyaObj = null;

function processLogo(imgSrc, isGruya, callback) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgSrc;
    img.onload = function() {
        const canvasDark = document.createElement('canvas');
        canvasDark.width = img.width;
        canvasDark.height = img.height;
        const ctxDark = canvasDark.getContext('2d');
        ctxDark.drawImage(img, 0, 0);
        
        const canvasLight = document.createElement('canvas');
        canvasLight.width = img.width;
        canvasLight.height = img.height;
        const ctxLight = canvasLight.getContext('2d');
        ctxLight.drawImage(img, 0, 0);
        
        try {
            const imgDataDark = ctxDark.getImageData(0, 0, canvasDark.width, canvasDark.height);
            const dataDark = imgDataDark.data;
            
            const imgDataLight = ctxLight.getImageData(0, 0, canvasLight.width, canvasLight.height);
            const dataLight = imgDataLight.data;
            
            for (let i = 0; i < dataDark.length; i += 4) {
                const r = dataDark[i];
                const g = dataDark[i+1];
                const b = dataDark[i+2];
                const a = dataDark[i+3];
                
                if (a === 0) continue;
                
                // Identify white or near-white background pixels
                const isWhite = (r > 215 && g > 215 && b > 215) || 
                                (r > 200 && g > 200 && b > 200 && Math.abs(r-g) < 15 && Math.abs(g-b) < 15 && Math.abs(r-b) < 15);
                
                if (isWhite) {
                    dataDark[i+3] = 0;
                    dataLight[i+3] = 0;
                } else {
                    // Dark theme adjustments
                    if (isGruya) {
                        const isOrange = r > 180 && g > 100 && b < 80;
                        if (!isOrange) {
                            const brightness = (r + g + b) / 3;
                            if (brightness < 160) {
                                dataDark[i] = 240;
                                dataDark[i+1] = 244;
                                dataDark[i+2] = 255;
                            }
                        }
                    } else {
                        const isRed = r > 150 && g < 80 && b < 80;
                        if (!isRed) {
                            dataDark[i] = 240;
                            dataDark[i+1] = 244;
                            dataDark[i+2] = 255;
                        }
                    }
                }
            }
            ctxDark.putImageData(imgDataDark, 0, 0);
            ctxLight.putImageData(imgDataLight, 0, 0);
            
            callback({
                dark: canvasDark.toDataURL('image/png'),
                light: canvasLight.toDataURL('image/png'),
                width: img.width,
                height: img.height
            });
        } catch (e) {
            console.error("Error processing images on canvas:", e);
            callback({
                dark: imgSrc,
                light: imgSrc,
                width: img.width,
                height: img.height
            });
        }
    };
    img.onerror = function() {
        console.error("Failed to load logo image:", imgSrc);
        callback({
            dark: imgSrc,
            light: imgSrc,
            width: 100,
            height: 30
        });
    };
}

// Auto Load Data on Startup
document.addEventListener('DOMContentLoaded', async () => {
    // Consultar estado de sincronización inicial
    loadSyncStatus();

    // Process logos for both themes
    processLogo('../logo_ingentron.png', false, (res) => {
        window.logoIngentronObj = res;
        const sidebarImg = document.getElementById('sidebar-logo-ingentron');
        const headerImg = document.getElementById('header-logo-ingentron');
        const homeImg = document.getElementById('home-logo-ingentron');
        if (sidebarImg) sidebarImg.src = res.dark;
        if (headerImg) headerImg.src = res.dark;
        if (homeImg) homeImg.src = res.dark;
    });

    processLogo('../logo_gruya.jpg', true, (res) => {
        window.logoGruyaObj = res;
        const sidebarImg = document.getElementById('sidebar-logo-gruya');
        const headerImg = document.getElementById('header-logo-gruya');
        const homeImg = document.getElementById('home-logo-gruya');
        if (sidebarImg) sidebarImg.src = res.dark;
        if (headerImg) headerImg.src = res.dark;
        if (homeImg) homeImg.src = res.dark;
    });
    try {
        const response = await fetch('/api/saldos');
        if (!response.ok) throw new Error('No se pudo cargar la información de saldos desde el servidor.');
        globalData = await response.json();
        
        // Populate availableWeeks based on globalData
        availableWeeks = new Set();
        globalData.forEach(item => {
            if (item.week) {
                availableWeeks.add(item.week);
            }
        });
        
        populateFilters();
        
        loadingIndicator.classList.remove('show');
        applyRouteFromLocation();
        
    } catch (error) {
        console.error(error);
        loadingIndicator.querySelector('span').innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error al cargar datos: ${error.message}`;
        loadingIndicator.querySelector('span').style.color = 'var(--danger-color)';
        loadingIndicator.querySelector('.processing-spinner').style.display = 'none';
    }
});

// UI Updating
function updateOriginOptionsForEmpresa() {
    const oSelect = document.getElementById('origin-select');
    oSelect.innerHTML = '<option value="">Todas las unidades</option>';
    
    const allOrigins = new Set(globalData.map(item => item.origin));
    let filteredOrigins;
    
    if (currentEmpresaFilter !== '') {
        const allowed = empresaToOrigins[currentEmpresaFilter] || [];
        filteredOrigins = Array.from(allOrigins).filter(o => allowed.includes(o)).sort();
    } else {
        filteredOrigins = Array.from(allOrigins).sort();
    }
    
    filteredOrigins.forEach(origin => {
        if (origin) {
            const option = document.createElement('option');
            option.value = origin;
            option.textContent = origin;
            oSelect.appendChild(option);
        }
    });
    
    oSelect.value = currentOriginFilter;
}

function populateFilters() {
    // Populate Origin select based on empresa filter
    updateOriginOptionsForEmpresa();


    // Populate Situación select options dynamically!
    const situSelect = document.getElementById('situacion-select');
    situSelect.innerHTML = '<option value="">Todas las situaciones</option>';
    const situaciones = new Set();
    globalData.forEach(item => {
        if (item.situacion && item.situacion !== 'Sin Especificar') {
            situaciones.add(item.situacion);
        }
    });
    if (globalData.some(item => item.situacion === 'Sin Especificar')) {
        situaciones.add('Sin Especificar');
    }
    Array.from(situaciones).sort().forEach(situ => {
        const option = document.createElement('option');
        option.value = situ;
        option.textContent = situ;
        situSelect.appendChild(option);
    });
    
    // Clone nodes to remove old event listeners safely if this is called multiple times
    const empresaSelectEl = document.getElementById('empresa-select');
    const newEmpresaSelect = empresaSelectEl.cloneNode(true);
    empresaSelectEl.parentNode.replaceChild(newEmpresaSelect, empresaSelectEl);

    const newOriginSelect = originSelect.cloneNode(true);
    originSelect.parentNode.replaceChild(newOriginSelect, originSelect);
    const newWeekSelect = weekSelect.cloneNode(true);
    weekSelect.parentNode.replaceChild(newWeekSelect, weekSelect);
    
    const statusSelect = document.getElementById('status-select');
    const newStatusSelect = statusSelect.cloneNode(true);
    statusSelect.parentNode.replaceChild(newStatusSelect, statusSelect);

    const situacionSelectEl = document.getElementById('situacion-select');
    const newSituacionSelect = situacionSelectEl.cloneNode(true);
    situacionSelectEl.parentNode.replaceChild(newSituacionSelect, situacionSelectEl);
    
    // Re-assign references
    const empresaEl = document.getElementById('empresa-select');
    const originEl = document.getElementById('origin-select');
    const weekEl = document.getElementById('week-select');
    const statusEl = document.getElementById('status-select');
    const situacionEl = document.getElementById('situacion-select');

    empresaEl.addEventListener('change', (e) => {
        currentEmpresaFilter = e.target.value;
        currentOriginFilter = ''; // reset origin when empresa changes
        updateOriginOptionsForEmpresa();
        const oEl = document.getElementById('origin-select');
        if (oEl._macRebuild) {
            oEl._macRebuild();
            syncMacSelect('origin-select');
        } else {
            syncMacSelect('origin-select');
        }
        updateWeekSelectorForCurrentOrigin();
    });
    
    originEl.addEventListener('change', (e) => {
        currentOriginFilter = e.target.value;
        updateWeekSelectorForCurrentOrigin();
    });
    
    weekEl.addEventListener('change', (e) => {
        currentWeekFilter = e.target.value;
        updateDashboard();
    });
    
    statusEl.addEventListener('change', (e) => {
        currentStatusFilter = e.target.value;
        updateDashboard();
    });

    situacionEl.addEventListener('change', (e) => {
        currentSituacionFilter = e.target.value;
        updateDashboard();
    });
    
    updateWeekSelectorForCurrentOrigin();
    syncMacSelect('empresa-select');
    syncMacSelect('origin-select');
    syncMacSelect('status-select');
    syncMacSelect('situacion-select');
}

function updateWeekSelectorForCurrentOrigin() {
    const weekEl = document.getElementById('week-select');
    weekEl.innerHTML = '';
    
    let weeksForOrigin = new Set();
    globalData.forEach(item => {
        // Respect empresa filter
        if (currentEmpresaFilter !== '') {
            const allowedOrigins = empresaToOrigins[currentEmpresaFilter] || [];
            if (!allowedOrigins.includes(item.origin)) return;
        }
        if (currentOriginFilter === '' || item.origin === currentOriginFilter) {
            if (item.week && typeof item.week === 'string') {
                weeksForOrigin.add(item.week);
            }
        }
    });
    
    const sortedWeeks = Array.from(weeksForOrigin).sort((a, b) => parseWeekEndDate(a) - parseWeekEndDate(b));
    
    // Opción especial para mostrar la última semana automáticamente
    const latestOption = document.createElement('option');
    latestOption.value = 'LATEST';
    latestOption.textContent = 'Última semana (Automático)';
    weekEl.appendChild(latestOption);
    
    sortedWeeks.forEach(week => {
        if(week && week !== 'undefined') {
            const option = document.createElement('option');
            option.value = week;
            option.textContent = week;
            weekEl.appendChild(option);
        }
    });
    
    if (weeksForOrigin.has('Tiempo Real')) {
        weekEl.value = 'Tiempo Real';
        currentWeekFilter = 'Tiempo Real';
    } else {
        weekEl.value = 'LATEST';
        currentWeekFilter = 'LATEST';
    }
    
    // Rebuild or build the custom dropdown for the week select
    if (weekEl._macRebuild) {
        weekEl._macRebuild();         // Fast: just rebuild the list items
        syncMacSelect('week-select'); // Fast: update the displayed label
    } else {
        syncMacSelect('week-select'); // First call: builds the wrapper from scratch
    }
    
    updateDashboard();
}

let _dashboardDebounce = null;
const clearSearchBtn = document.getElementById('clear-search');

function toggleClearSearchBtn() {
    if (clearSearchBtn) {
        clearSearchBtn.style.display = searchInput.value ? 'flex' : 'none';
    }
}

searchInput.addEventListener('input', () => {
    toggleClearSearchBtn();
    clearTimeout(_dashboardDebounce);
    _dashboardDebounce = setTimeout(() => updateDashboard(), 120);
});

if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        toggleClearSearchBtn();
        updateDashboard();
        searchInput.focus();
    });
}

const ACCOUNTS_TO_HIDE = new Set([
    '524', '20116', '2110', '17', '1593', '1840', '1707', '1722', '1708', 
    '1804', '1815', '841', '1698', '2671', '2698', '882', '20214', '20667', '172',
    '206', '3367'
]);

// Pre-normalize the blacklisted accounts for fast, robust lookup (removes leading zeros and spaces)
const NORMALIZED_ACCOUNTS_TO_HIDE = new Set(
    Array.from(ACCOUNTS_TO_HIDE).map(code => String(code).trim().replace(/^0+/, ''))
);

function shouldHideAccount(clientCode, invoice) {
    const checkbox = document.getElementById('hide-compensar-checkbox');
    const isChecked = checkbox ? checkbox.checked : true;
    if (!isChecked) return false;

    // Ocultar si el comprobante comienza con "RPX" (ej: "RPX 0001-00001234")
    if (invoice && String(invoice).trim().toUpperCase().startsWith('RPX')) {
        return true;
    }

    if (!clientCode) return false;
    
    // Normalize input clientCode: convert to string, trim, and remove any leading zeros
    const normalized = String(clientCode).trim().replace(/^0+/, '');
    return NORMALIZED_ACCOUNTS_TO_HIDE.has(normalized);
}

const hideCompensarCheckbox = document.getElementById('hide-compensar-checkbox');
if (hideCompensarCheckbox) {
    hideCompensarCheckbox.addEventListener('change', () => {
        updateDashboard();
    });
}

function updateDashboard() {
    // Cancel any pending debounced call
    clearTimeout(_dashboardDebounce);
    performDashboardUpdate();
}

function performDashboardUpdate() {
    const searchTerm = searchInput.value.toLowerCase();
    
    // Pre-compute the single "latest" week across applicable data
    // so that LATEST always equals manually selecting the last week
    let resolvedLatestWeek = '';
    if (currentWeekFilter === 'LATEST') {
        const applicableWeeks = new Set();
        globalData.forEach(item => {
            if (shouldHideAccount(item.clientCode, item.invoice)) return;
            if (currentEmpresaFilter !== '') {
                const allowed = empresaToOrigins[currentEmpresaFilter] || [];
                if (!allowed.includes(item.origin)) return;
            }
            if (currentOriginFilter !== '' && item.origin !== currentOriginFilter) return;
            if (item.week && item.week !== 'undefined' && typeof item.week === 'string' && item.week !== 'Tiempo Real') {
                applicableWeeks.add(item.week);
            }
        });
        const sorted = Array.from(applicableWeeks).sort((a, b) => parseWeekEndDate(a) - parseWeekEndDate(b));
        resolvedLatestWeek = sorted[sorted.length - 1] || '';
    }

    // Filter Data
    const filteredData = globalData.filter(item => {
        if (shouldHideAccount(item.clientCode, item.invoice)) return false;
        
        // Empresa filter
        if (currentEmpresaFilter !== '') {
            const allowedOrigins = empresaToOrigins[currentEmpresaFilter] || [];
            if (!allowedOrigins.includes(item.origin)) return false;
        }

        const matchOrigin = currentOriginFilter === '' || item.origin === currentOriginFilter;
        
        let matchWeek = false;
        if (currentWeekFilter === 'LATEST') {
            matchWeek = item.week === resolvedLatestWeek;
        } else {
            matchWeek = currentWeekFilter === '' || item.week === currentWeekFilter;
        }
        
        const matchSearch = item.client.toLowerCase().includes(searchTerm) || 
                            item.origin.toLowerCase().includes(searchTerm) ||
                            (item.clientCode && item.clientCode.toLowerCase().includes(searchTerm));
        return matchWeek && matchOrigin && matchSearch;
    });
    
    // Aggregate by Client
    const clientsMap = new Map();
    let totalBalance = 0;
    
    filteredData.forEach(item => {
        const key = item.client;
        if (!clientsMap.has(key)) {
            clientsMap.set(key, {
                client: item.client,
                origins: new Set(),
                clientCodesByOrigin: {},
                totalAmount: 0,
                invoices: []
            });
        }
        
        const clientData = clientsMap.get(key);
        clientData.origins.add(item.origin);
        clientData.totalAmount += item.amount;
        clientData.invoices.push(item);
        
        if (item.clientCode && item.clientCode !== 'N/A') {
            if (!clientData.clientCodesByOrigin[item.origin]) {
                clientData.clientCodesByOrigin[item.origin] = new Set();
            }
            clientData.clientCodesByOrigin[item.origin].add(item.clientCode);
        }
        
        totalBalance += item.amount;
    });
    
    let aggregatedClients = Array.from(clientsMap.values());
    
    let okCount = 0;
    let vencidoCount = 0;
    let criticoCount = 0;
    
    aggregatedClients.forEach(client => {
        const status = getClientMostCriticalStatus(client.invoices).text;
        if (status === 'No vencido') okCount++;
        else if (status === 'Vencido') vencidoCount++;
        else if (status === 'Más de 30 días') criticoCount++;
    });
    
    updateStatusPieChart(okCount, vencidoCount, criticoCount);
    
    // Group weekly balances for the trend chart depending on selected origin
    const dataForOrigin = globalData.filter(item => {
        if (shouldHideAccount(item.clientCode, item.invoice)) return false;
        if (currentEmpresaFilter !== '') {
            const allowedOrigins = empresaToOrigins[currentEmpresaFilter] || [];
            if (!allowedOrigins.includes(item.origin)) return false;
        }
        return currentOriginFilter === '' || item.origin === currentOriginFilter;
    });
    const weeklyBalances = {};
    dataForOrigin.forEach(item => {
        const w = item.week || 'Sin Semana';
        if (!weeklyBalances[w]) weeklyBalances[w] = 0;
        weeklyBalances[w] += item.amount;
    });
    
    // Sort weeks chronologically
    const weeksArray = Array.from(new Set(dataForOrigin.map(item => item.week || 'Sin Semana')));
    const cleanWeeksArray = weeksArray
        .filter(w => w && w !== 'undefined' && w !== 'Sin Semana')
        .sort((a, b) => parseWeekEndDate(a) - parseWeekEndDate(b));
        
    const balancesArray = cleanWeeksArray.map(week => weeklyBalances[week] || 0);
    
    updateTrendChart(cleanWeeksArray, balancesArray);
    
    if (currentStatusFilter !== '') {
        aggregatedClients = aggregatedClients.filter(client => {
            const status = getClientMostCriticalStatus(client.invoices);
            return status.text === currentStatusFilter;
        });
    }
    
    if (currentSituacionFilter !== '') {
        aggregatedClients = aggregatedClients.filter(client => {
            return client.invoices.some(inv => inv.situacion === currentSituacionFilter);
        });
    }

    // Show/hide the reset button depending on whether a status filter is active
    const resetBtn = document.getElementById('reset-status-filter');
    if (resetBtn) {
        const isFiltered = currentStatusFilter !== '';
        resetBtn.style.opacity = isFiltered ? '1' : '0';
        resetBtn.style.pointerEvents = isFiltered ? 'auto' : 'none';
    }
    
    // Sort by amount descending
    aggregatedClients.sort((a, b) => b.totalAmount - a.totalAmount);
    
    let displayTotalBalance = 0;
    let displayInvoicesCount = 0;
    aggregatedClients.forEach(client => {
        displayTotalBalance += client.totalAmount;
        displayInvoicesCount += client.invoices.length;
    });
    
    // Update KPIs
    document.getElementById('kpi-total').textContent = formatCurrency(displayTotalBalance);
    document.getElementById('kpi-clients').textContent = aggregatedClients.length;
    document.getElementById('kpi-invoices').textContent = displayInvoicesCount;
    
    // Render Table
    const tbody = document.getElementById('clients-tbody');
    tbody.innerHTML = '';
    
    aggregatedClients.forEach(client => {
        const tr = document.createElement('tr');
        
        const originsArray = Array.from(client.origins).sort();
        let originsHtml = '';
        originsArray.forEach(org => {
            originsHtml += `<span class="badge ${getOriginColorClass(org)}" style="margin-right: 4px; display: inline-block;">${org}</span>`;
        });
        
        const originsWithCodes = Object.keys(client.clientCodesByOrigin);
        let codesHtml = '';
        if (originsWithCodes.length === 1) {
            const org = originsWithCodes[0];
            const codes = Array.from(client.clientCodesByOrigin[org]).join(' | ');
            codesHtml = `<span class="client-code-badge"><i class="fas fa-tag"></i> ${org}: ${codes}</span>`;
        } else if (originsWithCodes.length > 1) {
            const codesList = [];
            originsWithCodes.forEach(org => {
                const codes = Array.from(client.clientCodesByOrigin[org]).join(' | ');
                codesList.push(`<span class="client-code-badge"><i class="fas fa-tag"></i> ${org}: ${codes}</span>`);
            });
            codesHtml = codesList.join(' ');
        }
        
        const status = getClientMostCriticalStatus(client.invoices);
        
        const uniqueSituaciones = Array.from(new Set(client.invoices.map(inv => inv.situacion || 'Sin Especificar')));
        let situacionHtml = '';
        uniqueSituaciones.forEach(situ => {
            if (situ && situ !== 'Sin Especificar') {
                situacionHtml += `<span class="badge badge-outline" style="margin-right: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.9); font-size: 11px; padding: 4px 10px; font-weight: 600; display: inline-block; white-space: nowrap;"><i class="fas fa-info-circle" style="font-size: 10px; opacity: 0.8; margin-right: 4px;"></i>${situ}</span>`;
            }
        });
        if (!situacionHtml) {
            situacionHtml = `<span class="badge badge-outline" style="margin-right: 4px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02); color: rgba(255,255,255,0.5); font-size: 11px; padding: 4px 10px; font-weight: 600; display: inline-block; white-space: nowrap;">Sin Especificar</span>`;
        }
        
        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-weight: 700; font-size: 15px; color: var(--text-primary);">${client.client}</span>
                    ${codesHtml ? `<div style="display: inline-flex; gap: 6px; flex-wrap: wrap; align-items: center;">${codesHtml}</div>` : ''}
                </div>
            </td>
            <td>${originsHtml}</td>
            <td class="text-center"><span class="badge ${status.class}" style="font-size: 11px; padding: 4px 10px; font-weight: 600; display: inline-flex; min-width: 90px; text-align: center; justify-content: center;">${status.text}</span></td>
            <td>${situacionHtml}</td>
            <td class="text-right font-medium">${formatCurrency(client.totalAmount)}</td>
            <td class="text-center">
                <button class="btn-icon" title="Ver Facturas" onclick="showInvoices('${escapeHtml(client.client)}')">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.resetStatusFilter = function() {
    currentStatusFilter = '';
    const statusEl = document.getElementById('status-select');
    if (statusEl) {
        statusEl.value = '';
        syncMacSelect('status-select');
    }
    updateDashboard();
};

function getOriginColorClass(origin) {
    if (origin === 'Aguas') return 'bg-blue text-white';
    if (origin === 'Salliquelo') return 'bg-purple text-white';
    if (origin === 'Trenque Lauquen') return 'bg-green text-white';
    if (origin === 'PepsiCo') return 'bg-red text-white';
    return 'bg-accent text-white';
}

function formatCurrency(value) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
    }).format(value);
}

function escapeHtml(unsafe) {
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Modal Logic
const modal = document.getElementById('invoice-modal');
const closeModal = document.querySelector('.close-modal');

closeModal.addEventListener('click', () => {
    modal.classList.remove('active');
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.remove('active');
    }
});

let currentModalInvoices = [];
let currentModalClient = '';
let currentModalOriginFilter = 'ALL';

const downloadPdfBtn = document.getElementById('modal-download-pdf-btn');
if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener('click', () => {
        downloadClientPDF();
    });
}

window.showInvoices = function(clientName) {
    currentModalClient = clientName;
    // Filter invoices for this client with current dashboard filters
    const invoices = globalData.filter(item => {
        if (item.client !== clientName) return false;
        if (shouldHideAccount(item.clientCode, item.invoice)) return false;
        
        // Apply global origin filter if any
        if (currentOriginFilter !== '' && item.origin !== currentOriginFilter) return false;
        
        if (currentWeekFilter === 'LATEST') {
            const originWeeks = Array.from(new Set(globalData.filter(d => {
                if (shouldHideAccount(d.clientCode, d.invoice)) return false;
                return d.origin === item.origin;
            }).map(d => d.week))).sort();
            const latestForThisOrigin = originWeeks[originWeeks.length - 1];
            return item.week === latestForThisOrigin;
        }
        
        return currentWeekFilter === '' || item.week === currentWeekFilter;
    });
    
    currentModalInvoices = invoices;
    document.getElementById('modal-client-name').textContent = clientName;
    
    // Extract and render client situations in modal header
    const uniqueSituaciones = Array.from(new Set(invoices.map(inv => inv.situacion || 'Sin Especificar')));
    const modalSituacionEl = document.getElementById('modal-client-situacion');
    if (modalSituacionEl) {
        modalSituacionEl.innerHTML = '';
        uniqueSituaciones.forEach(situ => {
            if (situ && situ !== 'Sin Especificar') {
                const badge = document.createElement('span');
                badge.className = 'client-code-badge';
                badge.style.background = 'rgba(255, 255, 255, 0.08)';
                badge.style.border = '1px solid rgba(255, 255, 255, 0.15)';
                badge.innerHTML = `<i class="fas fa-info-circle"></i> ${situ}`;
                modalSituacionEl.appendChild(badge);
            }
        });
    }
    
    // Extract and render client codes in modal header
    const codesByOrigin = {};
    invoices.forEach(inv => {
        if (inv.clientCode && inv.clientCode !== 'N/A') {
            if (!codesByOrigin[inv.origin]) {
                codesByOrigin[inv.origin] = new Set();
            }
            codesByOrigin[inv.origin].add(inv.clientCode);
        }
    });
    
    const codesEl = document.getElementById('modal-client-codes');
    if (codesEl) {
        codesEl.innerHTML = '';
        const originsWithCodes = Object.keys(codesByOrigin);
        if (originsWithCodes.length === 1) {
            const org = originsWithCodes[0];
            const codes = Array.from(codesByOrigin[org]).join(' | ');
            codesEl.innerHTML = `<span class="client-code-badge"><i class="fas fa-tag"></i> ${org}: ${codes}</span>`;
        } else if (originsWithCodes.length > 1) {
            originsWithCodes.forEach(org => {
                const codes = Array.from(codesByOrigin[org]).join(' | ');
                const badge = document.createElement('span');
                badge.className = 'client-code-badge';
                badge.innerHTML = `<i class="fas fa-tag"></i> ${org}: ${codes}`;
                codesEl.appendChild(badge);
            });
        }
    }
    
    // Populate modal filters
    const origins = Array.from(new Set(invoices.map(inv => inv.origin))).sort();
    const filterContainer = document.getElementById('modal-origin-filters');
    filterContainer.innerHTML = '';
    
    if (origins.length > 1) {
        const btnAll = document.createElement('button');
        btnAll.textContent = 'Todo';
        btnAll.className = 'modal-filter-btn bg-dark active';
        btnAll.dataset.origin = 'ALL';
        btnAll.onclick = () => {
            updateActiveModalBtn('ALL');
            renderModalInvoices('ALL');
        };
        filterContainer.appendChild(btnAll);
        
        origins.forEach(org => {
            const btn = document.createElement('button');
            btn.textContent = org;
            btn.className = `modal-filter-btn ${getOriginColorClass(org)}`;
            btn.dataset.origin = org;
            btn.onclick = () => {
                updateActiveModalBtn(org);
                renderModalInvoices(org);
            };
            filterContainer.appendChild(btn);
        });
        renderModalInvoices('ALL', false);
    } else if (origins.length === 1) {
        const org = origins[0];
        const btn = document.createElement('button');
        btn.textContent = org;
        btn.className = `modal-filter-btn ${getOriginColorClass(org)} active`;
        btn.dataset.origin = org;
        btn.onclick = () => {
            updateActiveModalBtn(org);
            renderModalInvoices(org);
        };
        filterContainer.appendChild(btn);
        renderModalInvoices(org, false);
    } else {
        renderModalInvoices('ALL', false);
    }
    
    modal.classList.add('active');
};

function updateActiveModalBtn(activeOrigin) {
    const btns = document.querySelectorAll('.modal-filter-btn');
    btns.forEach(btn => {
        if (btn.dataset.origin === activeOrigin) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function renderModalInvoices(originFilter, animate = true) {
    currentModalOriginFilter = originFilter;
    const tbody = document.getElementById('invoices-tbody');
    const animWrapper = document.getElementById('table-anim-wrapper');
    
    const startHeight = animWrapper ? animWrapper.offsetHeight : 0;
    if (animWrapper && animate) {
        animWrapper.style.transition = 'none';
        animWrapper.style.height = startHeight + 'px';
    }
    
    tbody.innerHTML = '';
    
    // Helper to parse dates reliably for chronological sorting
    const getInvoiceDateValue = (excelDate) => {
        const parsed = parseExcelDate(excelDate);
        return parsed ? parsed.getTime() : 0;
    };

    const invoicesToRender = (originFilter === 'ALL' 
        ? currentModalInvoices 
        : currentModalInvoices.filter(inv => inv.origin === originFilter)
    ).slice().sort((a, b) => getInvoiceDateValue(a.date) - getInvoiceDateValue(b.date));
        
    let filterTotal = 0;
        
    invoicesToRender.forEach((inv, index) => {
        filterTotal += inv.amount;
        const tr = document.createElement('tr');
        if (animate) {
            tr.className = 'row-fade-in';
            tr.style.animationDelay = `${Math.min(index * 0.03, 0.5)}s`;
        }
        
        const status = getDueDateStatus(inv.dueDate, inv.date, inv.amount);
        const originalAmt = (inv.originalAmount !== undefined && !isNaN(inv.originalAmount)) ? inv.originalAmount : inv.amount;
        const paidAmt = (inv.paidAmount !== undefined && !isNaN(inv.paidAmount)) ? inv.paidAmount : 0;
        tr.innerHTML = `
            <td style="display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: none;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>${inv.invoice}</span>
                    ${inv.clientCode && inv.clientCode !== 'N/A' ? `<span style="font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 500;">(Cód. ${inv.clientCode})</span>` : ''}
                </div>
                <span class="badge ${getOriginColorClass(inv.origin)}" style="font-size: 10px; padding: 2px 0; width: 60px; text-align: center; display: inline-block; flex-shrink: 0;">${inv.origin}</span>
            </td>
            <td>${formatDate(inv.date)}</td>
            <td class="text-center"><span class="badge ${status.class}" style="font-size: 10px; padding: 4px 10px; font-weight: 600; display: inline-flex; min-width: 80px; text-align: center; justify-content: center;">${status.text}</span></td>
            <td class="text-right font-medium" style="opacity: 0.8;">${formatCurrency(originalAmt)}</td>
            <td class="text-right font-medium" style="color: #30d158; opacity: 0.95;">${formatCurrency(paidAmt)}</td>
            <td class="text-right font-medium" style="color: var(--accent-color);">${formatCurrency(inv.amount)}</td>
        `;
        tbody.appendChild(tr);
    });
    
    const totalEl = document.getElementById('modal-total-amount');
    if (totalEl) totalEl.textContent = formatCurrency(filterTotal);
    
    if (animWrapper && animate) {
        animWrapper.style.height = 'auto';
        const endHeight = animWrapper.offsetHeight;
        animWrapper.style.height = startHeight + 'px';
        
        void animWrapper.offsetHeight; // Force reflow
        
        animWrapper.style.transition = 'height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
        animWrapper.style.height = endHeight + 'px';
        
        setTimeout(() => {
            animWrapper.style.transition = '';
            animWrapper.style.height = 'auto';
        }, 400);
    }
}

function downloadClientPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("La librería de generación de PDF no se ha cargado correctamente. Por favor, revise su conexión a internet e intente nuevamente.");
        return;
    }

    const activeOrigin = currentModalOriginFilter || 'ALL';
    
    // Parse helper
    const getInvoiceDateValue = (excelDate) => {
        const parsed = parseExcelDate(excelDate);
        return parsed ? parsed.getTime() : 0;
    };

    // Filter and sort invoices to match the active screen view
    const invoicesToExport = (activeOrigin === 'ALL'
        ? currentModalInvoices
        : currentModalInvoices.filter(inv => inv.origin === activeOrigin)
    ).slice().sort((a, b) => getInvoiceDateValue(a.date) - getInvoiceDateValue(b.date));

    if (invoicesToExport.length === 0) {
        alert("No hay facturas pendientes en el filtro seleccionado para exportar.");
        return;
    }

    // Compute sums and unique lists
    let totalAmount = 0;
    const clientCodesSet = new Set();

    const formatCompanyName = (name) => {
        if (name === 'Aguas' || name === 'PepsiCo' || name === 'Ingentron' || name === 'Ingentron S.R.L.') {
            return 'Ingentron S.R.L.';
        }
        if (name === 'Trenque Lauquen' || name === 'Salliquelo' || name === 'Gruya' || name === 'Gruya S.R.L.') {
            return 'Gruya S.R.L.';
        }
        return name;
    };

    const formatOriginName = (name) => {
        if (name === 'Salliquelo') return 'Salliqueló';
        if (name === 'Trenque Lauquen') return 'Trenque Lauquen';
        if (name === 'Aguas') return 'Aguas';
        if (name === 'PepsiCo') return 'PepsiCo';
        return name;
    };

    invoicesToExport.forEach(inv => {
        totalAmount += inv.amount;
        if (inv.clientCode && inv.clientCode !== 'N/A') {
            clientCodesSet.add(`${formatOriginName(inv.origin)}: ${inv.clientCode}`);
        }
    });

    const clientCodes = Array.from(clientCodesSet);

    // Initialize document
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    // Page decoration and Header Bar
    doc.setFillColor(11, 26, 48); // Deep blue (#0B1A30)
    doc.rect(0, 0, 210, 8, 'F');

    // Corporate Header Title (Logos side-by-side with fallback)
    let logoDrawn = false;
    let currentX = 15;
    
    if (window.logoIngentronObj && window.logoIngentronObj.light && window.logoGruyaObj && window.logoGruyaObj.light) {
        try {
            // Draw Ingentron Logo
            const ingHeight = 8;
            const ingWidth = ingHeight * (window.logoIngentronObj.width / window.logoIngentronObj.height);
            doc.addImage(window.logoIngentronObj.light, 'PNG', currentX, 17, ingWidth, ingHeight);
            currentX += ingWidth + 4;
            
            // Draw Divider Line
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.25);
            doc.line(currentX, 16, currentX, 26);
            currentX += 4;
            
            // Draw Gruya Logo
            const gruHeight = 8;
            const gruWidth = gruHeight * (window.logoGruyaObj.width / window.logoGruyaObj.height);
            doc.addImage(window.logoGruyaObj.light, 'PNG', currentX, 17, gruWidth, gruHeight);
            logoDrawn = true;
        } catch (err) {
            console.error("Error drawing logos in PDF:", err);
        }
    }
    
    if (!logoDrawn) {
        // Fallback to text if logos could not be drawn
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(11, 26, 48);
        doc.text('INGENTRON S.R.L. / GRUYA S.R.L.', 15, 24);
    }

    // Document Title & Metadata (Right side)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(10, 132, 255); // Accent blue (#0A84FF)
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

    // Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(15, 38, 195, 38);

    // Client Info Card Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(241, 245, 249);
    doc.roundedRect(15, 43, 180, 20, 3, 3, 'FD');

    // Client Info Labels and Values
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(11, 26, 48);
    doc.text('CLIENTE:', 20, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(currentModalClient, 42, 50);

    doc.setFont('helvetica', 'bold');
    doc.text('CÓDIGO:', 20, 56);
    doc.setFont('helvetica', 'normal');
    const codeText = clientCodes.length > 0 ? clientCodes.join(' | ') : 'N/A';
    doc.text(codeText, 42, 56);

    // Balance Card Box (Inside info box)
    doc.setFillColor(235, 245, 255); // Highlight blue accent bg
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

    // Table rows data
    const tableBody = invoicesToExport.map(inv => {
        const status = getDueDateStatus(inv.dueDate, inv.date, inv.amount);
        const originalAmt = (inv.originalAmount !== undefined && !isNaN(inv.originalAmount)) ? inv.originalAmount : inv.amount;
        const paidAmt = (inv.paidAmount !== undefined && !isNaN(inv.paidAmount)) ? inv.paidAmount : 0;
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

    // Add Invoices Table
    doc.autoTable({
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
                    data.cell.styles.textColor = [220, 100, 0]; // Amber-orange
                    data.cell.styles.fontStyle = 'bold';
                } else if (val === 'Más de 30 días') {
                    data.cell.styles.textColor = [220, 38, 38]; // Bold red
                    data.cell.styles.fontStyle = 'bold';
                } else if (val === 'No vencido') {
                    data.cell.styles.textColor = [22, 163, 74]; // Green
                    data.cell.styles.fontStyle = 'bold';
                } else if (val === 'Saldo a favor') {
                    data.cell.styles.textColor = [10, 132, 255]; // Accent blue
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

    // Write footer elements and page numbers
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        
        // Footer line
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.4);
        doc.line(15, 280, 195, 280);

        // Page numbers
        doc.setFont('helvetica', 'normal');
        doc.text(`Página ${i} de ${totalPages}`, 195, 285, { align: 'right' });
    }

    // Save File
    const cleanClientName = currentModalClient.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`Resumen_Cuenta_${cleanClientName}.pdf`);
}

function formatDate(excelDate) {
    if (!excelDate || excelDate === 'N/A') return 'N/A';
    
    // If it's already a string like "23/04/2026"
    if (typeof excelDate === 'string') return excelDate;
    
    // If it's an Excel serial date number
    if (typeof excelDate === 'number') {
        const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        return date.toLocaleDateString('es-AR');
    }
    
    return excelDate;
}

function parseExcelDate(excelDate) {
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
}

function getDueDateStatus(dueDateExcel, dateExcel, amount) {
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
    
    const diffTime = today - parsedDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 7) {
        return { text: 'No vencido', class: 'bg-green' };
    } else if (diffDays >= 8 && diffDays <= 30) {
        return { text: 'Vencido', class: 'bg-accent' };
    } else {
        return { text: 'Más de 30 días', class: 'bg-red' };
    }
}

function getClientMostCriticalStatus(invoices) {
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
}

// Additional minor CSS injections for JS logic
const style = document.createElement('style');
style.textContent = `
    .bg-blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .bg-green { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .bg-purple { background: rgba(139, 92, 246, 0.2); color: #a78bfa; }
    .bg-red { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .bg-accent { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .bg-dark { background: rgba(30, 41, 59, 0.6); color: #e2e8f0; border-color: rgba(255,255,255,0.2) !important; }
    .font-medium { font-weight: 600; }
    
    .modal-filter-btn {
        padding: 8px 18px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        opacity: 0.7;
    }
    .modal-filter-btn:hover {
        opacity: 1;
        transform: translateY(-2px) scale(1.04);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    }
    .modal-filter-btn.active {
        opacity: 1;
        border-color: rgba(255, 255, 255, 0.4);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transform: translateY(-1px);
    }
    
    .row-fade-in {
        animation: rowFadeIn 0.3s ease-out forwards;
        opacity: 0;
    }
    @keyframes rowFadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);

// Back to Top Button Logic
const backToTopBtn = document.getElementById('back-to-top');

window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        backToTopBtn.classList.add('show');
    } else {
        backToTopBtn.classList.remove('show');
    }
});

backToTopBtn.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// Custom macOS Select Dropdown Logic
// Builds the custom dropdown once; subsequent calls only update the displayed label.
function syncMacSelect(selectId) {
    const nativeSelect = document.getElementById(selectId);
    if (!nativeSelect) return;

    const existingWrapper = nativeSelect.nextElementSibling;

    // ── Fast-path: wrapper already exists, just refresh displayed value and options ──
    if (existingWrapper && existingWrapper.classList.contains('mac-select-wrapper')) {
        const trigger = existingWrapper.querySelector('.mac-select-trigger');
        const valueSpan = trigger && trigger.querySelector('.mac-select-value');
        const selectedOption = nativeSelect.options[nativeSelect.selectedIndex] || nativeSelect.options[0];
        if (valueSpan && selectedOption) {
            valueSpan.textContent = selectedOption.textContent;
        }
        // Refresh selected state on each option item
        const dropdown = existingWrapper.querySelector('.mac-select-dropdown');
        if (dropdown) {
            dropdown.querySelectorAll('.mac-select-option').forEach(div => {
                div.classList.toggle('selected', div.dataset.value === nativeSelect.value);
            });
        }
        return; // Done — no DOM rebuild needed
    }

    // ── First-time build ──
    nativeSelect.classList.add('glass-select-hidden');

    const wrapper = document.createElement('div');
    wrapper.className = 'mac-select-wrapper';
    nativeSelect.parentNode.insertBefore(wrapper, nativeSelect.nextSibling);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'mac-select-trigger';

    const selectedOption = nativeSelect.options[nativeSelect.selectedIndex] || nativeSelect.options[0];
    trigger.innerHTML = `
        <span class="mac-select-value">${selectedOption ? selectedOption.textContent : ''}</span>
        <i class="fas fa-chevron-down mac-select-arrow"></i>
    `;
    wrapper.appendChild(trigger);

    const dropdown = document.createElement('div');
    dropdown.className = 'mac-select-dropdown';
    wrapper.appendChild(dropdown);

    const buildOptions = () => {
        dropdown.innerHTML = '';
        Array.from(nativeSelect.options).forEach(opt => {
            const div = document.createElement('div');
            div.className = 'mac-select-option';
            if (opt.value === nativeSelect.value) div.classList.add('selected');
            div.textContent = opt.textContent;
            div.dataset.value = opt.value;
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                nativeSelect.value = opt.value;
                dropdown.classList.remove('show');
                trigger.classList.remove('active');
                // Update label directly — no full re-sync
                const valueSpan = trigger.querySelector('.mac-select-value');
                if (valueSpan) valueSpan.textContent = opt.textContent;
                dropdown.querySelectorAll('.mac-select-option').forEach(d => {
                    d.classList.toggle('selected', d.dataset.value === opt.value);
                });
                // Fire native change so app logic picks it up
                nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
            });
            dropdown.appendChild(div);
        });
    };
    buildOptions();

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.mac-select-dropdown').forEach(d => {
            if (d !== dropdown) d.classList.remove('show');
        });
        document.querySelectorAll('.mac-select-trigger').forEach(t => {
            if (t !== trigger) t.classList.remove('active');
        });
        dropdown.classList.toggle('show');
        trigger.classList.toggle('active');
    });

    // When native select options change externally (e.g. week list repopulated),
    // rebuild the custom list too.
    nativeSelect._macRebuild = buildOptions;
}

// Global click listener to close all dropdowns when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.mac-select-dropdown').forEach(d => d.classList.remove('show'));
    document.querySelectorAll('.mac-select-trigger').forEach(t => t.classList.remove('active'));
});


// Premium Liquid Glass Doughnut Chart Update
function updateStatusPieChart(ok, vencido, critico) {
    const ctx = document.getElementById('status-pie-chart');
    if (!ctx) return;
    
    const total = ok + vencido + critico;
    
    // Update legend
    const legendContainer = document.getElementById('chart-legend');
    if (legendContainer) {
        if (total === 0) {
            legendContainer.innerHTML = `
                <div style="text-align: center; color: rgba(255, 255, 255, 0.4); padding: 15px; font-size: 13px;">
                    No hay datos disponibles para esta selección.
                </div>
            `;
        } else {
            const okPercent = total > 0 ? Math.round((ok / total) * 100) : 0;
            const vencidoPercent = total > 0 ? Math.round((vencido / total) * 100) : 0;
            const criticoPercent = total > 0 ? Math.round((critico / total) * 100) : 0;
            
            legendContainer.innerHTML = `
                <div class="chart-legend-item" style="cursor: pointer;" onclick="document.getElementById('status-select').value='No vencido'; document.getElementById('status-select').dispatchEvent(new Event('change'));">
                    <div class="legend-left">
                        <div class="legend-color-pill" style="background: #34d399; box-shadow: 0 0 10px rgba(52, 211, 153, 0.4);"></div>
                        <span class="legend-label">No vencido</span>
                    </div>
                    <div class="legend-right">
                        <span class="legend-count">${ok} cl.</span>
                        <span class="legend-percent ok">${okPercent}%</span>
                    </div>
                </div>
                <div class="chart-legend-item" style="cursor: pointer;" onclick="document.getElementById('status-select').value='Vencido'; document.getElementById('status-select').dispatchEvent(new Event('change'));">
                    <div class="legend-left">
                        <div class="legend-color-pill" style="background: #fbbf24; box-shadow: 0 0 10px rgba(251, 191, 36, 0.4);"></div>
                        <span class="legend-label">Vencido</span>
                    </div>
                    <div class="legend-right">
                        <span class="legend-count">${vencido} cl.</span>
                        <span class="legend-percent vencido">${vencidoPercent}%</span>
                    </div>
                </div>
                <div class="chart-legend-item" style="cursor: pointer;" onclick="document.getElementById('status-select').value='Más de 30 días'; document.getElementById('status-select').dispatchEvent(new Event('change'));">
                    <div class="legend-left">
                        <div class="legend-color-pill" style="background: #f87171; box-shadow: 0 0 10px rgba(248, 113, 113, 0.4);"></div>
                        <span class="legend-label">Más de 30 días</span>
                    </div>
                    <div class="legend-right">
                        <span class="legend-count">${critico} cl.</span>
                        <span class="legend-percent critico">${criticoPercent}%</span>
                    </div>
                </div>
            `;
        }
    }
    
    // Destroy previous chart
    if (statusChart) {
        statusChart.destroy();
    }
    
    if (total === 0) {
        statusChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Sin datos'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['rgba(255, 255, 255, 0.05)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                resizeDelay: 150,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                cutout: '75%'
            }
        });
        return;
    }
    
    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['No vencido', 'Vencido', 'Más de 30 días'],
            datasets: [{
                data: [ok, vencido, critico],
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
                            const value = context.raw;
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

// Premium Weekly Balance Trend Combination Chart (Bar + Trend Line)
function updateTrendChart(weeks, balances) {
    const ctx = document.getElementById('trend-bar-chart');
    if (!ctx) return;
    
    if (trendChart) {
        trendChart.destroy();
    }
    
    if (weeks.length === 0) {
        return;
    }
    
    trendChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weeks,
            datasets: [
                {
                    label: 'Saldo de la Semana',
                    data: balances,
                    backgroundColor: 'rgba(58, 134, 255, 0.45)', // Cyan-blue glass bar
                    borderColor: 'rgba(58, 134, 255, 0.85)',
                    borderWidth: 1.5,
                    borderRadius: 8,
                    maxBarThickness: 120, // Keep bar sized nicely
                    barPercentage: 0.5,
                    categoryPercentage: 0.5,
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
                padding: {
                    left: 20,
                    right: 20,
                    top: 20,
                    bottom: 0
                }
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
                            return ` ${context.dataset.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: { family: 'Inter', size: 11 }
                    }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    grace: '10%', // Add 10% spacing at the top of the scale to prevent clipping
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: { family: 'Inter', size: 11 },
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}


// Sidebar Toggle Logic
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent immediate closing due to click events
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('main-content');
        if (sidebar && mainContent) {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        }
    });
}

// Close mobile sidebar drawer when clicking outside it
document.addEventListener('click', (event) => {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const isMobile = window.innerWidth <= 768; // Matching the detectMobile() helper
    
    if (isMobile && sidebar && !sidebar.classList.contains('collapsed')) {
        if (!sidebar.contains(event.target) && !toggleBtn.contains(event.target)) {
            sidebar.classList.add('collapsed');
            const mainContent = document.getElementById('main-content');
            if (mainContent) mainContent.classList.add('expanded');
        }
    }
});

// Mobile Filters Toggle Logic
const mobileFilterToggle = document.getElementById('mobile-filter-toggle');
if (mobileFilterToggle && filtersContainer) {
    mobileFilterToggle.addEventListener('click', () => {
        const isCollapsed = !filtersContainer.classList.contains('show-mobile');
        if (isCollapsed) {
            filtersContainer.classList.add('show-mobile');
            mobileFilterToggle.classList.add('active');
            mobileFilterToggle.querySelector('span').textContent = 'Ocultar Filtros';
            mobileFilterToggle.querySelector('i').className = 'fas fa-chevron-up';
        } else {
            filtersContainer.classList.remove('show-mobile');
            mobileFilterToggle.classList.remove('active');
            mobileFilterToggle.querySelector('span').textContent = 'Mostrar Filtros';
            mobileFilterToggle.querySelector('i').className = 'fas fa-filter';
        }
    });
}

// Close mobile sidebar drawer when selecting a navigation menu item
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        const isMobile = window.innerWidth <= 768;
        if (isMobile && sidebar && !sidebar.classList.contains('collapsed')) {
            sidebar.classList.add('collapsed');
            const mainContent = document.getElementById('main-content');
            if (mainContent) mainContent.classList.add('expanded');
        }
    });
});

// Mobile Device Detection & Adaptability
function detectMobile() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
        || (window.innerWidth <= 768);
    
    if (isMobile) {
        document.body.classList.add('is-mobile');
    } else {
        document.body.classList.remove('is-mobile');
    }
}
window.addEventListener('resize', detectMobile);
window.addEventListener('DOMContentLoaded', detectMobile);
detectMobile();

// Función para consultar e imprimir la fecha y hora de la última sincronización en tiempo real
async function loadSyncStatus() {
    try {
        const res = await fetch('/api/sync-status');
        if (!res.ok) return;
        const status = await res.json();
        
        const formatSyncDate = (isoStr) => {
            if (!isoStr) return 'Nunca';
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return 'Nunca';
            
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = String(d.getFullYear()).slice(-2);
            const hour = String(d.getHours()).padStart(2, '0');
            const minute = String(d.getMinutes()).padStart(2, '0');
            const second = String(d.getSeconds()).padStart(2, '0');
            
            return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
        };
        
        const aguasEl = document.getElementById('sync-time-aguas');
        const pepsicoEl = document.getElementById('sync-time-pepsico');
        const salliqueloEl = document.getElementById('sync-time-salliquelo');
        const trenqueEl = document.getElementById('sync-time-trenque');
        const digipEl = document.getElementById('sync-time-digip');
        
        if (aguasEl) aguasEl.textContent = formatSyncDate(status.Aguas);
        if (pepsicoEl) pepsicoEl.textContent = formatSyncDate(status.PepsiCo);
        if (salliqueloEl) salliqueloEl.textContent = formatSyncDate(status.Salliquelo);
        if (trenqueEl) trenqueEl.textContent = formatSyncDate(status['Trenque Lauquen']);
        if (digipEl) digipEl.textContent = formatSyncDate(status.Digip);
    } catch (e) {
        console.error("Error al cargar estado de sincronización:", e);
    }
}

// ═══════════════════════════════════════════════════════════════
// MÓDULO DE GESTIÓN DE VENCIMIENTOS DE STOCK (BETA)
// ═══════════════════════════════════════════════════════════════

// Modelo de datos de lotes de stock (Mock inicial que actúa como fallback)
const fallbackStockData = [
    { codigo: '7790060023124', producto: 'Queso Cremoso La Paulina', categoria: 'Lácteos', lote: 'L-260401', cantidad: 45, fechaVencimiento: '2026-04-15' }, // Vencido
    { codigo: '7790150003218', producto: 'Dulce de Leche Sancor 400g', categoria: 'Almacén', lote: 'L-260510', cantidad: 30, fechaVencimiento: '2026-05-12' }, // Vencido
    { codigo: '7790070012053', producto: 'Yogur Entero Vainilla La Serenísima', categoria: 'Lácteos', lote: 'L-260520', cantidad: 120, fechaVencimiento: '2026-06-10' }, // Crítico
    { codigo: '7790240000158', producto: 'Jamón Cocido Campo Austral', categoria: 'Fiambrería', lote: 'L-260525', cantidad: 15, fechaVencimiento: '2026-06-22' }, // Crítico
    { codigo: '7791290790124', producto: 'Leche Entera UAT La Serenísima 1L', categoria: 'Lácteos', lote: 'L-260528', cantidad: 200, fechaVencimiento: '2026-07-15' }, // Próximo
    { codigo: '7790010002131', producto: 'Fideos Tallarines Lucchetti 500g', categoria: 'Almacén', lote: 'L-260530', cantidad: 150, fechaVencimiento: '2026-08-20' }, // Próximo
    { codigo: '7790895000456', producto: 'Gaseosa Coca-Cola Original 2.25L', categoria: 'Bebidas', lote: 'L-260601', cantidad: 80, fechaVencimiento: '2026-09-30' }, // OK
    { codigo: '7790580402011', producto: 'Cerveza Quilmes Clásica Lata 473ml', categoria: 'Bebidas', lote: 'L-260603', cantidad: 240, fechaVencimiento: '2026-10-15' }, // OK
    { codigo: '7790040120150', producto: 'Galletitas Criollitas 3x100g', categoria: 'Almacén', lote: 'L-260605', cantidad: 95, fechaVencimiento: '2026-11-20' }, // OK
    { codigo: '7791122001541', producto: 'Manteca La Serenísima 200g', categoria: 'Lácteos', lote: 'L-260610', cantidad: 50, fechaVencimiento: '2026-06-18' } // Crítico
];

let stockData = [...fallbackStockData];
let stockHistory = {};
let isRealStockLoaded = false;

// Función asíncrona para cargar stock real del backend
async function loadRealStockData() {
    try {
        const response = await fetch('/api/stock');
        if (response.ok) {
            const data = await response.json();
            
            let rawList = [];
            if (Array.isArray(data)) {
                // Formato antiguo
                rawList = data;
                stockHistory = {};
            } else if (data && Array.isArray(data.current)) {
                // Nuevo formato estructurado con histórico
                rawList = data.current;
                stockHistory = data.history || {};
            }
            
            if (rawList.length > 0) {
                // Agrupar y normalizar registros por Código, Producto, Lote y Vencimiento
                const groupedMap = new Map();
                rawList.forEach(item => {
                    const codigo = String(item.codigo || item.ean || '').trim();
                    const producto = String(item.producto || item.descripcion || 'Sin Nombre').trim();
                    const categoria = String(item.categoria || 'Almacén').trim();
                    const lote = String(item.lote || 'S/L').trim();
                    const fechaVencimiento = String(item.fechaVencimiento || item.vencimiento || '').trim();
                    const cantidad = parseFloat(item.cantidad || 0);

                    // Clave compuesta única para la agrupación
                    const key = `${codigo}_${producto}_${lote}_${fechaVencimiento}`;
                    
                    if (groupedMap.has(key)) {
                        const existing = groupedMap.get(key);
                        existing.cantidad += cantidad;
                    } else {
                        groupedMap.set(key, {
                            codigo,
                            producto,
                            categoria,
                            lote,
                            cantidad,
                            fechaVencimiento
                        });
                    }
                });

                stockData = Array.from(groupedMap.values());
                isRealStockLoaded = true;
                console.log(`[Stock Engine] Poblado y agrupado con ${stockData.length} registros únicos reales de Digip WMS.`);
                return true;
            }
        }
    } catch (e) {
        console.error("[Stock Engine] Error consultando /api/stock, usando mock data:", e);
    }
    // Fallback si no hay datos o falló la conexión
    if (!isRealStockLoaded) {
        stockData = [...fallbackStockData];
        stockHistory = {};
    }
    return false;
}

// Helper para calcular la variación de cantidad respecto al snapshot anterior
function getStockVariation(item) {
    if (!stockHistory || Object.keys(stockHistory).length === 0) return '';
    
    // Obtener fechas disponibles en el histórico
    const availableDates = Object.keys(stockHistory).sort();
    if (availableDates.length === 0) return '';
    
    // Encontrar el último snapshot histórico anterior a la fecha de hoy ("2026-05-29")
    let prevDate = '';
    for (let i = availableDates.length - 1; i >= 0; i--) {
        if (availableDates[i] < '2026-05-29') {
            prevDate = availableDates[i];
            break;
        }
    }
    
    if (!prevDate) return '';
    
    const yesterdayData = stockHistory[prevDate] || [];
    const key = `${String(item.codigo).trim()}_${String(item.fechaVencimiento).trim()}`;
    
    // Cachear el mapa de cantidades del día anterior
    if (!window.yesterdayQtyMap || window.yesterdayQtyMapDate !== prevDate) {
        window.yesterdayQtyMap = new Map();
        yesterdayData.forEach(yItem => {
            const yKey = `${String(yItem.codigo || yItem.ean || '').trim()}_${String(yItem.fechaVencimiento || yItem.vencimiento || '').trim()}`;
            const currentQty = window.yesterdayQtyMap.get(yKey) || 0;
            window.yesterdayQtyMap.set(yKey, currentQty + parseFloat(yItem.cantidad || 0));
        });
        window.yesterdayQtyMapDate = prevDate;
    }
    
    // Cachear el mapa de cantidades de hoy agrupado por codigo+vencimiento para comparar correctamente
    if (!window.todayQtyMap) {
        window.todayQtyMap = new Map();
        stockData.forEach(tItem => {
            const tKey = `${String(tItem.codigo).trim()}_${String(tItem.fechaVencimiento).trim()}`;
            const currentQty = window.todayQtyMap.get(tKey) || 0;
            window.todayQtyMap.set(tKey, currentQty + parseFloat(tItem.cantidad || 0));
        });
    }
    
    const yesterdayTotal = window.yesterdayQtyMap.get(key);
    if (yesterdayTotal === undefined) {
        // Artículo nuevo
        return `<span style="font-size: 10px; color: #60a5fa; background: rgba(96, 165, 250, 0.15); border: 1px solid rgba(96, 165, 250, 0.25); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; font-weight: 500;"><i class="fas fa-plus-circle"></i> Nuevo</span>`;
    }
    
    const todayTotal = window.todayQtyMap.get(key) || 0;
    const variation = todayTotal - yesterdayTotal;
    
    if (variation > 0) {
        return `<span class="badge badge-ok" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; font-weight: 600;"><i class="fas fa-arrow-up"></i> +${variation}</span>`;
    } else if (variation < 0) {
        return `<span class="badge badge-expired" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; font-weight: 600;"><i class="fas fa-arrow-down"></i> ${variation}</span>`;
    } else {
        return `<span class="badge" style="font-size: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.4); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; font-weight: 500;"><i class="fas fa-minus"></i> Sin cambios</span>`;
    }
}

// Helper para calcular días restantes entre la fecha actual y la de vencimiento (Referencia: 29/05/2026)
function getDaysRemaining(expiryStr) {
    const today = new Date("2026-05-29T00:00:00");
    const expiry = new Date(expiryStr + "T00:00:00");
    const diffTime = expiry - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Clasificación de lotes por estado
function getStockStatus(days) {
    if (days <= 0) return { text: 'VENCIDO', class: 'badge-expired' };
    if (days <= 30) return { text: 'ALERTA CRÍTICA', class: 'badge-critical' };
    if (days <= 90) return { text: 'PRÓXIMO', class: 'badge-upcoming' };
    return { text: 'EN REGLA', class: 'badge-ok' };
}

// Formatear fecha AAAA-MM-DD a DD/MM/AA
function formatDateToES(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0].slice(2, 4)}`;
}

// Actualización de KPIs del módulo de stock
function updateStockKPIs() {
    let total = stockData.length;
    let expired = 0;
    let critical = 0;
    let ok = 0;
    
    stockData.forEach(item => {
        const days = getDaysRemaining(item.fechaVencimiento);
        if (days <= 0) expired++;
        else if (days <= 30) critical++;
        else ok++;
    });
    
    const kpiTotalEl = document.getElementById('stock-kpi-total');
    const kpiExpiredEl = document.getElementById('stock-kpi-expired');
    const kpiCriticalEl = document.getElementById('stock-kpi-critical');
    const kpiOkEl = document.getElementById('stock-kpi-ok');
    
    if (kpiTotalEl) kpiTotalEl.textContent = total;
    if (kpiExpiredEl) kpiExpiredEl.textContent = expired;
    if (kpiCriticalEl) kpiCriticalEl.textContent = critical;
    if (kpiOkEl) kpiOkEl.textContent = ok;
}

// Renderizado dinámico de la tabla de stock
function renderStockTable() {
    window.todayQtyMap = null; // Reiniciar mapa de hoy para recálculo dinámico en cada dibujado
    
    const tbody = document.getElementById('stock-table-body');
    if (!tbody) return;
    
    const searchVal = (document.getElementById('search-stock')?.value || '').toLowerCase();
    const statusVal = document.getElementById('filter-stock-status')?.value || '';
    
    tbody.innerHTML = '';
    
    let filtered = stockData.filter(item => {
        const days = getDaysRemaining(item.fechaVencimiento);
        
        // Filtro por buscador
        const matchSearch = item.producto.toLowerCase().includes(searchVal) || 
                            item.codigo.includes(searchVal) ||
                            item.categoria.toLowerCase().includes(searchVal);
                            
        // Filtro por select de estado
        let matchStatus = true;
        if (statusVal === 'VENCIDO') matchStatus = days <= 0;
        else if (statusVal === 'CRITICO') matchStatus = days > 0 && days <= 30;
        else if (statusVal === 'PROXIMO') matchStatus = days > 30 && days <= 90;
        else if (statusVal === 'OK') matchStatus = days > 90;
        
        return matchSearch && matchStatus;
    });
    
    window.currentFilteredStock = filtered;
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="opacity: 0.5; padding: 30px;">No se encontraron lotes con los filtros seleccionados</td></tr>`;
        return;
    }
    
    filtered.forEach(item => {
        const days = getDaysRemaining(item.fechaVencimiento);
        const statusObj = getStockStatus(days);
        
        let daysText = '';
        if (days < 0) daysText = `Venció hace ${Math.abs(days)}d`;
        else if (days === 0) daysText = 'Vence Hoy';
        else daysText = `${days}d restante${days > 1 ? 's' : ''}`;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code style="font-size: 11px; opacity: 0.85;">${item.codigo}</code></td>
            <td>
                <div style="font-weight: 600; color: var(--text-primary);">${item.producto}</div>
                <div style="font-size: 11px; opacity: 0.65; margin-top: 2px;">${item.categoria}</div>
            </td>
            <td>
                <div style="font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                    <span>${item.cantidad} un.</span>
                    ${getStockVariation(item)}
                </div>
            </td>
            <td>${formatDateToES(item.fechaVencimiento)}</td>
            <td style="font-weight: 600; color: ${days <= 30 ? '#f87171' : 'inherit'};">${daysText}</td>
            <td><span class="badge ${statusObj.class}">${statusObj.text}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Variables para los gráficos
let stockRiskChart = null;
let stockTimelineChart = null;

// Lógica de dibujo y actualización de gráficos
function updateStockCharts() {
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
    
    // 1. Gráfico de Dona: Distribución de Riesgo
    const canvasRisk = document.getElementById('stock-risk-chart');
    if (canvasRisk) {
        const ctxRisk = canvasRisk.getContext('2d');
        if (stockRiskChart) stockRiskChart.destroy();
        
        stockRiskChart = new Chart(ctxRisk, {
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
    
    // 2. Gráfico de Barras: Cronograma por Mes
    const canvasTimeline = document.getElementById('stock-timeline-chart');
    if (canvasTimeline) {
        const ctxTimeline = canvasTimeline.getContext('2d');
        if (stockTimelineChart) stockTimelineChart.destroy();
        
        const monthsGroup = {};
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
        
        stockTimelineChart = new Chart(ctxTimeline, {
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

// Acción interactiva: Retirar lote de stock
window.removeStockItem = function(codigo, lote) {
    stockData = stockData.filter(item => !(item.codigo === codigo && item.lote === lote));
    updateStockKPIs();
    renderStockTable();
    updateStockCharts();
};

// Controlador y ruteo de Vistas en el Frontend
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-menu .nav-item[data-view]');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const selectedView = item.getAttribute('data-view');
            
            // Si es móvil, colapsar el menú lateral (hamburguesa) al tocar un módulo
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                const sidebar = document.getElementById('sidebar');
                const mainContent = document.getElementById('main-content');
                if (sidebar) sidebar.classList.add('collapsed');
                if (mainContent) mainContent.classList.add('expanded');
            }
            
            if (selectedView === 'dashboard') {
                navigateToModule('CuentasCorrientes');
            } else if (selectedView === 'stock-expiration') {
                navigateToModule('ControlVencimientos');
            }
        });
    });
}

// Navegar a un módulo actualizando la URL y el historial de navegación (SPA)
window.navigateToModule = function(moduleName) {
    let path = '/beta/';
    if (moduleName === 'CuentasCorrientes') {
        path = '/beta/CuentasCorrientes';
    } else if (moduleName === 'ControlVencimientos') {
        path = '/beta/ControlVencimientos';
    }
    
    history.pushState({ module: moduleName }, '', path);
    applyRoute(moduleName);
};

// Aplicar visualmente la ruta activa (mostrar/ocultar vistas, filtros, cabeceras)
function applyRoute(moduleName) {
    const views = document.querySelectorAll('.view-section');
    const navItems = document.querySelectorAll('.nav-menu .nav-item[data-view]');
    const mobileFilterToggle = document.getElementById('mobile-filter-toggle');
    const filtersContainer = document.getElementById('filters-container');
    const titleEl = document.getElementById('view-title');
    const subtitleEl = document.getElementById('view-subtitle');
    
    // Ocultar todas las vistas
    views.forEach(v => v.style.display = 'none');
    
    // Quitar clase activa de todos los botones de navegación lateral
    navItems.forEach(nav => nav.classList.remove('active'));
    
    // Control dinámico de la cabecera, barra lateral y layout en Home
    const header = document.querySelector('.top-header');
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    
    if (moduleName === 'home') {
        if (header) header.style.setProperty('display', 'none', 'important');
        if (sidebar) sidebar.style.setProperty('display', 'none', 'important');
        if (mainContent) {
            mainContent.style.setProperty('margin-left', '0', 'important');
            mainContent.style.setProperty('max-width', '100%', 'important');
            mainContent.style.setProperty('width', '100%', 'important');
            mainContent.style.setProperty('padding', '20px', 'important');
        }
    } else {
        if (header) header.style.removeProperty('display');
        if (sidebar) sidebar.style.removeProperty('display');
        if (mainContent) {
            mainContent.style.removeProperty('margin-left');
            mainContent.style.removeProperty('max-width');
            mainContent.style.removeProperty('width');
            mainContent.style.removeProperty('padding');
        }
    }
    
    if (moduleName === 'CuentasCorrientes') {
        const targetView = document.getElementById('dashboard-view');
        if (targetView) targetView.style.display = 'block';
        
        const navItem = Array.from(navItems).find(n => n.getAttribute('data-view') === 'dashboard');
        if (navItem) navItem.classList.add('active');
        
        if (mobileFilterToggle) mobileFilterToggle.style.setProperty('display', '', 'important');
        if (filtersContainer) filtersContainer.style.setProperty('display', '', 'important');
        if (titleEl) titleEl.textContent = 'Dashboard';
        if (subtitleEl) subtitleEl.textContent = 'Resumen de cuentas corrientes';
        
    } else if (moduleName === 'ControlVencimientos') {
        const targetView = document.getElementById('stock-expiration-view');
        if (targetView) targetView.style.display = 'block';
        
        const navItem = Array.from(navItems).find(n => n.getAttribute('data-view') === 'stock-expiration');
        if (navItem) navItem.classList.add('active');
        
        if (mobileFilterToggle) mobileFilterToggle.style.setProperty('display', 'none', 'important');
        if (filtersContainer) filtersContainer.style.setProperty('display', 'none', 'important');
        if (titleEl) titleEl.textContent = 'Vencimientos de Stock';
        if (subtitleEl) subtitleEl.textContent = 'Módulo de control de caducidades';
        
        // Cargar datos de stock actualizados
        loadRealStockData().finally(() => {
            updateStockKPIs();
            renderStockTable();
            updateStockCharts();
        });
        
    } else {
        // Vista Home (Landing de Selección de Módulos)
        const targetView = document.getElementById('home-view');
        if (targetView) targetView.style.display = 'flex';
        
        if (mobileFilterToggle) mobileFilterToggle.style.setProperty('display', 'none', 'important');
        if (filtersContainer) filtersContainer.style.setProperty('display', 'none', 'important');
        if (titleEl) titleEl.textContent = 'Módulos Ingentron';
        if (subtitleEl) subtitleEl.textContent = 'Panel de selección de módulos';
    }
}

// Analizar la URL actual y aplicar la ruta correspondiente
function applyRouteFromLocation() {
    const path = window.location.pathname;
    if (path.includes('/CuentasCorrientes')) {
        applyRoute('CuentasCorrientes');
    } else if (path.includes('/ControlVencimientos')) {
        applyRoute('ControlVencimientos');
    } else {
        applyRoute('home');
    }
}

// Exportar listado de vencimientos de stock filtrado a PDF
window.exportStockToPDF = function(event) {
    if (event) event.preventDefault();
    const dataToExport = window.currentFilteredStock || stockData;
    if (dataToExport.length === 0) {
        alert("No hay datos de stock disponibles para exportar.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Título principal
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Reporte de Vencimientos de Stock - Ingentron", 14, 20);
    
    // Datos de creación y metadatos
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    const dateStr = new Date().toLocaleDateString('es-AR') + ' ' + new Date().toLocaleTimeString('es-AR');
    doc.text(`Generado el: ${dateStr} | Total de registros: ${dataToExport.length}`, 14, 27);
    
    // Configuración de tabla
    const tableColumns = ["Código Artículo", "Producto", "Categoría", "Cantidad", "Vencimiento", "Restante", "Estado"];
    const tableRows = dataToExport.map(item => {
        const days = getDaysRemaining(item.fechaVencimiento);
        const statusObj = getStockStatus(days);
        
        let daysText = '';
        if (days < 0) daysText = `Venció hace ${Math.abs(days)}d`;
        else if (days === 0) daysText = 'Vence Hoy';
        else daysText = `${days}d restante${days > 1 ? 's' : ''}`;
        
        return [
            item.codigo,
            item.producto,
            item.categoria,
            `${item.cantidad} un.`,
            formatDateToES(item.fechaVencimiento),
            daysText,
            statusObj.text
        ];
    });
    
    doc.autoTable({
        head: [tableColumns],
        body: tableRows,
        startY: 34,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] }, // Azul primario
        styles: { fontSize: 8 },
        columnStyles: {
            0: { cellWidth: 26 }, // Código artículo
            1: { cellWidth: 60 }  // Producto
        }
    });
    
    doc.save(`Reporte_Vencimientos_Stock_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// Exportar listado de vencimientos de stock filtrado a Excel (XLSX)
window.exportStockToExcel = function(event) {
    if (event) event.preventDefault();
    const dataToExport = window.currentFilteredStock || stockData;
    if (dataToExport.length === 0) {
        alert("No hay datos de stock disponibles para exportar.");
        return;
    }
    
    const rows = dataToExport.map(item => {
        const days = getDaysRemaining(item.fechaVencimiento);
        const statusObj = getStockStatus(days);
        
        let daysText = '';
        if (days < 0) daysText = `Venció hace ${Math.abs(days)}d`;
        else if (days === 0) daysText = 'Vence Hoy';
        else daysText = `${days}d restante${days > 1 ? 's' : ''}`;
        
        return {
            "Código Artículo": item.codigo,
            "Producto": item.producto,
            "Categoría": item.categoria,
            "Cantidad": item.cantidad,
            "Vencimiento": formatDateToES(item.fechaVencimiento),
            "Días Restantes": days,
            "Restante Detalle": daysText,
            "Estado": statusObj.text
        };
    });
    
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Vencimientos Stock");
    
    // Auto-ajustar anchos de columnas
    worksheet['!cols'] = [
        {wch: 16}, // Código
        {wch: 40}, // Producto
        {wch: 15}, // Categoría
        {wch: 10}, // Cantidad
        {wch: 12}, // Vencimiento
        {wch: 15}, // Días restantes
        {wch: 20}, // Restante Detalle
        {wch: 15}  // Estado
    ];
    
    XLSX.writeFile(workbook, `Reporte_Vencimientos_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// Iniciar eventos del buscador y select de stock al cargarse el documento
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    
    // Vincular logos superiores y laterales para que naveguen al Home
    const logoIds = ['sidebar-logo-ingentron', 'sidebar-logo-gruya', 'header-logo-ingentron', 'header-logo-gruya'];
    logoIds.forEach(id => {
        const logoEl = document.getElementById(id);
        if (logoEl) {
            logoEl.style.cursor = 'pointer';
            logoEl.addEventListener('click', () => {
                navigateToModule('home');
            });
        }
    });

    // Control del desplegable de exportación de stock
    const downloadBtn = document.getElementById('download-stock-btn');
    const downloadDropdown = document.getElementById('download-dropdown');
    if (downloadBtn && downloadDropdown) {
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const show = downloadDropdown.style.display === 'block';
            downloadDropdown.style.display = show ? 'none' : 'block';
        });
        document.addEventListener('click', () => {
            downloadDropdown.style.display = 'none';
        });
    }

    // Escuchar el evento popstate para soportar navegación del historial (atrás/adelante)
    window.addEventListener('popstate', () => {
        applyRouteFromLocation();
    });

    // Aplicar la ruta inicial según la URL del navegador al cargar la página
    applyRouteFromLocation();
    
    const searchStockEl = document.getElementById('search-stock');
    const filterStockStatusEl = document.getElementById('filter-stock-status');
    
    if (searchStockEl) searchStockEl.addEventListener('input', renderStockTable);
    if (filterStockStatusEl) filterStockStatusEl.addEventListener('change', renderStockTable);
});




