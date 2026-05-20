// Global State
let globalData = [];
let availableWeeks = new Set();
let currentWeekFilter = '';
let currentOriginFilter = '';
let currentStatusFilter = '';
let currentSituacionFilter = '';
let statusChart = null;
let trendChart = null;

// DOM Elements
const dashboardView = document.getElementById('dashboard-view');
const viewTitle = document.getElementById('view-title');
const weekSelectorContainer = document.getElementById('week-selector-container');
const weekSelect = document.getElementById('week-select');
const originSelect = document.getElementById('origin-select');
const statusSelect = document.getElementById('status-select');
const situacionSelect = document.getElementById('situacion-select');
const filtersContainer = document.getElementById('filters-container');
const searchInput = document.getElementById('search-client');
const loadingIndicator = document.getElementById('processing-overlay');

// Auto Load Data on Startup
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/excel');
        if (!response.ok) throw new Error('No se pudo cargar el archivo del servidor.');
        const data = await response.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        
        processWorkbook(workbook);
        
        loadingIndicator.classList.remove('show');
        dashboardView.style.display = 'block';
        filtersContainer.style.display = 'flex';
        
    } catch (error) {
        console.error(error);
        loadingIndicator.querySelector('span').innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error al cargar datos: ${error.message}`;
        loadingIndicator.querySelector('span').style.color = 'var(--danger-color)';
        loadingIndicator.querySelector('.processing-spinner').style.display = 'none';
    }
});

function cleanClientCode(code) {
    if (!code) return '';
    code = String(code).trim();
    code = code.replace(/[\.,]0+$/, '');
    if (/^\d+([\.,]\d+)+$/.test(code)) {
        code = code.replace(/[\.,]/g, '');
    }
    return code;
}

// Excel Parsing Logic
function processWorkbook(workbook) {
    globalData = [];
    availableWeeks = new Set();
    
    // Process SALDOS AGUAS
    if (workbook.Sheets['SALDOS AGUAS']) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets['SALDOS AGUAS'], { header: 1 });
        parseStandardSheet(rows, 'SALDOS AGUAS', 'Aguas');
    }
    
    // Process SALLIQUELO
    if (workbook.Sheets['SALLIQUELO']) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets['SALLIQUELO'], { header: 1 });
        parseStandardSheet(rows, 'SALLIQUELO', 'Salliquelo');
    }
    
    // Process TRENQUE LAUQUEN
    if (workbook.Sheets['TRENQUE LAUQUEN']) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets['TRENQUE LAUQUEN'], { header: 1 });
        parseStandardSheet(rows, 'TRENQUE LAUQUEN', 'Trenque Lauquen');
    }
    
    // Process SALDOS NUEVO (Complex format)
    if (workbook.Sheets['SALDOS NUEVO']) {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets['SALDOS NUEVO'], { header: 1 });
        parseSaldosNuevo(rows, 'PepsiCo');
    }

    populateFilters();
}

function parseStandardSheet(rows, sheetName, originName) {
    // Attempt to find headers dynamically or fallback to heuristics
    let headerRowIndex = -1;
    let colMap = { client: -1, amount: -1, week: -1, invoice: -1, date: -1, dueDate: -1, situacion: -1 };
    
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i];
        if (!row || row.length < 5) continue;
        
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('comprobante') && (rowStr.includes('cliente') || rowStr.includes('razon social') || rowStr.includes('cta cte'))) {
            headerRowIndex = i;
            
            // Map columns
            row.forEach((cell, index) => {
                if (!cell) return;
                const h = String(cell).toLowerCase().trim();
                if (h.includes('razon social') || h === 'cliente' || h === 'cta cte') colMap.client = index;
                if (h === 'importe' || h === 'debe' || h === 'saldo') colMap.amount = index;
                if (h.includes('semana')) colMap.week = index;
                if (h === 'comprobante') colMap.invoice = index;
                if (h === 'fecha' || h === 'fecha mov.') colMap.date = index;
                if (h === 'vencimiento' || h === 'fechavenc') colMap.dueDate = index;
                if (h.includes('situacion') || h.includes('situación')) colMap.situacion = index;
            });
            break;
        }
    }
    
    // Fallbacks if mapping failed but we know standard positions
    if (colMap.client === -1 && sheetName === 'TRENQUE LAUQUEN') colMap.client = 3; // Razon Social
    if (colMap.amount === -1 && sheetName === 'TRENQUE LAUQUEN') colMap.amount = 8; // Importe
    if (colMap.week === -1 && sheetName === 'TRENQUE LAUQUEN') colMap.week = 10; // SEMANA ANALISIS is often K (index 10)
    
    if (headerRowIndex === -1) headerRowIndex = 0; // Default to start parsing
    
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        // Use maps or defaults
        let clientName = colMap.client > -1 ? row[colMap.client] : (sheetName === 'SALLIQUELO' ? row[1] : row[1]);
        let amount = colMap.amount > -1 ? row[colMap.amount] : row[7];
        let week = colMap.week > -1 ? row[colMap.week] : row[row.length - 1]; // Assume week is last if not found
        let invoice = colMap.invoice > -1 ? row[colMap.invoice] : row[3];
        let date = colMap.date > -1 ? row[colMap.date] : row[2];
        let dueDate = colMap.dueDate > -1 ? row[colMap.dueDate] : row[4];
        
        // Clean up
        if (!clientName || typeof clientName !== 'string' || clientName.trim() === '') continue;
        if (!amount || isNaN(parseFloat(String(amount).replace(',','.')))) continue;
        
        amount = parseFloat(String(amount).replace(',','.'));
        if (amount === 0) continue; // Skip zero balances
        
        week = week ? String(week).trim() : 'Sin Semana';
        availableWeeks.add(week);
        
        let clientCode = '';
        if (sheetName === 'SALDOS AGUAS' || sheetName === 'SALLIQUELO') {
            clientCode = row[0] !== undefined ? String(row[0]) : '';
        } else if (sheetName === 'TRENQUE LAUQUEN') {
            clientCode = row[2] !== undefined ? String(row[2]) : '';
        }
        
        let situacion = colMap.situacion > -1 && row[colMap.situacion] !== undefined ? String(row[colMap.situacion]).trim() : 'Sin Especificar';
        if (!situacion) situacion = 'Sin Especificar';
        
        globalData.push({
            origin: originName,
            client: String(clientName).trim(),
            clientCode: cleanClientCode(clientCode),
            amount: amount,
            week: week,
            invoice: invoice || 'N/A',
            date: date || 'N/A',
            dueDate: dueDate || 'N/A',
            situacion: situacion
        });
    }
}

function parseSaldosNuevo(rows, originName) {
    // Highly unstructured. Usually client name is in col 1 (index 1) and amount in col 7 or 8.
    // We look for rows that look like invoice rows or balance rows.
    let currentClient = "Desconocido";
    let currentClientCode = "";
    let currentWeek = "Sin Semana";
    
    let situacionCol = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        if (!rows[i]) continue;
        rows[i].forEach((cell, index) => {
            if (cell) {
                const h = String(cell).toLowerCase().trim();
                if (h.includes('situacion') || h.includes('situación')) {
                    situacionCol = index;
                }
            }
        });
        if (situacionCol > -1) break;
    }
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        
        // Detect client row: typically has an ID in index 0 and Name in index 1, but no amount in index 7/8
        if (row[0] && row[1] && typeof row[1] === 'string' && row[1].length > 5 && !row[2]) {
            // Might be a client header row
            if (isNaN(parseFloat(String(row[1])))) {
                currentClient = row[1];
                currentClientCode = row[0] !== undefined ? String(row[0]) : '';
            }
        }
        
        // Detect invoice row or total row
        // Usually, 'SEMANA ANALISIS' is near the end, index 11, 12 or 13.
        let amount = row[7] || row[8]; 
        let week = row[12] || row[13] || row[11];
        let dateVal = row[0] !== undefined ? row[0] : (row[1] !== undefined ? row[1] : 'N/A');
        let dueDateVal = row[2] !== undefined ? row[2] : (row[3] !== undefined ? row[3] : 'N/A');

        let invoice = row[4];
        
        if (amount !== undefined && !isNaN(parseFloat(String(amount).replace(',','.')))) {
            let parsedAmount = parseFloat(String(amount).replace(',','.'));
            
            // Validate invoice to exclude subtotals
            let invoiceStr = String(invoice || '').trim();
            let isLikelyInvoice = invoiceStr.length > 3 && /\d/.test(invoiceStr);
            
            if (parsedAmount !== 0 && isLikelyInvoice) {
                let w = week ? String(week).trim() : currentWeek;
                if (w.includes("AL") || w.includes("SEMANA")) currentWeek = w;
                
                availableWeeks.add(currentWeek);
                
                let situacionVal = (situacionCol > -1 && row[situacionCol] !== undefined) ? String(row[situacionCol]).trim() : 'Sin Especificar';
                if (!situacionVal) situacionVal = 'Sin Especificar';
                
                globalData.push({
                    origin: originName,
                    client: String(currentClient).trim(),
                    clientCode: cleanClientCode(currentClientCode),
                    amount: parsedAmount,
                    week: currentWeek,
                    invoice: invoiceStr,
                    date: dateVal,
                    dueDate: dueDateVal,
                    situacion: situacionVal
                });
            }
        }
    }
}

// UI Updating
function populateFilters() {
    originSelect.innerHTML = '<option value="">Todas las unidades</option>';
    
    const origins = new Set(globalData.map(item => item.origin));
    Array.from(origins).sort().forEach(origin => {
        if(origin) {
            const option = document.createElement('option');
            option.value = origin;
            option.textContent = origin;
            originSelect.appendChild(option);
        }
    });

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
    const originEl = document.getElementById('origin-select');
    const weekEl = document.getElementById('week-select');
    const statusEl = document.getElementById('status-select');
    const situacionEl = document.getElementById('situacion-select');
    
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
    syncMacSelect('origin-select');
    syncMacSelect('status-select');
    syncMacSelect('situacion-select');
}

function updateWeekSelectorForCurrentOrigin() {
    const weekEl = document.getElementById('week-select');
    weekEl.innerHTML = '';
    
    let weeksForOrigin = new Set();
    globalData.forEach(item => {
        if (currentOriginFilter === '' || item.origin === currentOriginFilter) {
            weeksForOrigin.add(item.week);
        }
    });
    
    const sortedWeeks = Array.from(weeksForOrigin).sort();
    
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
    
    weekEl.value = 'LATEST';
    currentWeekFilter = 'LATEST';
    
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
searchInput.addEventListener('input', () => {
    clearTimeout(_dashboardDebounce);
    _dashboardDebounce = setTimeout(() => updateDashboard(), 120);
});

function updateDashboard() {
    // Cancel any pending debounced call
    clearTimeout(_dashboardDebounce);
    performDashboardUpdate();
}

function performDashboardUpdate() {
    const searchTerm = searchInput.value.toLowerCase();
    
    // Filter Data
    const filteredData = globalData.filter(item => {
        const matchOrigin = currentOriginFilter === '' || item.origin === currentOriginFilter;
        
        let matchWeek = false;
        if (currentWeekFilter === 'LATEST') {
            const originWeeks = Array.from(new Set(globalData.filter(d => d.origin === item.origin).map(d => d.week))).sort();
            const latestForThisOrigin = originWeeks[originWeeks.length - 1];
            matchWeek = item.week === latestForThisOrigin;
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
            clientData.clientCodesByOrigin[item.origin] = item.clientCode;
        }
        
        totalBalance += item.amount;
    });
    
    let aggregatedClients = Array.from(clientsMap.values());
    
    let okCount = 0;
    let vencidoCount = 0;
    let criticoCount = 0;
    
    aggregatedClients.forEach(client => {
        const status = getClientMostCriticalStatus(client.invoices).text;
        if (status === 'OK') okCount++;
        else if (status === 'Vencido') vencidoCount++;
        else if (status === 'Más de 30 días') criticoCount++;
    });
    
    updateStatusPieChart(okCount, vencidoCount, criticoCount);
    
    // Group weekly balances for the trend chart depending on selected origin
    const dataForOrigin = globalData.filter(item => currentOriginFilter === '' || item.origin === currentOriginFilter);
    const weeklyBalances = {};
    dataForOrigin.forEach(item => {
        const w = item.week || 'Sin Semana';
        if (!weeklyBalances[w]) weeklyBalances[w] = 0;
        weeklyBalances[w] += item.amount;
    });
    
    // Sort weeks chronologically
    const weeksArray = Array.from(new Set(dataForOrigin.map(item => item.week || 'Sin Semana'))).sort();
    const cleanWeeksArray = weeksArray.filter(w => w && w !== 'undefined' && w !== 'Sin Semana');
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
            const code = client.clientCodesByOrigin[org];
            codesHtml = `<span class="client-code-badge"><i class="fas fa-tag"></i> ${org}: ${code}</span>`;
        } else if (originsWithCodes.length > 1) {
            const codesList = [];
            originsWithCodes.forEach(org => {
                const code = client.clientCodesByOrigin[org];
                codesList.push(`<span class="client-code-badge"><i class="fas fa-tag"></i> ${org}: ${code}</span>`);
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
            <td><span class="badge ${status.class}" style="font-size: 11px; padding: 4px 10px; font-weight: 600; display: inline-block;">${status.text}</span></td>
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

window.showInvoices = function(clientName) {
    currentModalClient = clientName;
    // Filter invoices for this client with current dashboard filters
    const invoices = globalData.filter(item => {
        if (item.client !== clientName) return false;
        
        // Apply global origin filter if any
        if (currentOriginFilter !== '' && item.origin !== currentOriginFilter) return false;
        
        if (currentWeekFilter === 'LATEST') {
            const originWeeks = Array.from(new Set(globalData.filter(d => d.origin === item.origin).map(d => d.week))).sort();
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
            codesByOrigin[inv.origin] = inv.clientCode;
        }
    });
    
    const codesEl = document.getElementById('modal-client-codes');
    if (codesEl) {
        codesEl.innerHTML = '';
        const originsWithCodes = Object.keys(codesByOrigin);
        if (originsWithCodes.length === 1) {
            const org = originsWithCodes[0];
            const code = codesByOrigin[org];
            codesEl.innerHTML = `<span class="client-code-badge"><i class="fas fa-tag"></i> ${org}: ${code}</span>`;
        } else if (originsWithCodes.length > 1) {
            originsWithCodes.forEach(org => {
                const code = codesByOrigin[org];
                const badge = document.createElement('span');
                badge.className = 'client-code-badge';
                badge.innerHTML = `<i class="fas fa-tag"></i> ${org}: ${code}`;
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
        
        const status = getDueDateStatus(inv.dueDate, inv.date);
        
        tr.innerHTML = `
            <td>${inv.invoice} <span class="badge ${getOriginColorClass(inv.origin)}" style="font-size: 10px; padding: 2px 8px; margin-left: 8px; display: inline-block;">${inv.origin}</span></td>
            <td>${formatDate(inv.date)}</td>
            <td><span class="badge ${status.class}" style="font-size: 10px; padding: 4px 10px; font-weight: 600; display: inline-block;">${status.text}</span></td>
            <td class="text-right font-medium">${formatCurrency(inv.amount)}</td>
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

function getDueDateStatus(dueDateExcel, dateExcel) {
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
        return { text: 'OK', class: 'bg-green' };
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
        const status = getDueDateStatus(inv.dueDate, inv.date);
        let severity = 0;
        if (status.text === 'OK') severity = 1;
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
                <div class="chart-legend-item" style="cursor: pointer;" onclick="document.getElementById('status-select').value='OK'; document.getElementById('status-select').dispatchEvent(new Event('change'));">
                    <div class="legend-left">
                        <div class="legend-color-pill" style="background: #34d399; box-shadow: 0 0 10px rgba(52, 211, 153, 0.4);"></div>
                        <span class="legend-label">OK</span>
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
            labels: ['OK', 'Vencido', 'Más de 30 días'],
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
            maintainAspectRatio: false,
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
    sidebarToggleBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('main-content');
        if (sidebar && mainContent) {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        }
    });
}

