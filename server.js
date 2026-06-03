const express = require('express');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const firebird = require('node-firebird');

const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : __dirname);
console.log(`[Persistence] Usando directorio de persistencia: ${DATA_DIR}`);

const app = express();

// Servir archivos estáticos del dashboard (index.html, styles.css, app.js)
app.use(express.static(__dirname));

// Opciones de conexión a Firebird de pruebas (Copia local actualizada hoy)
const dbOptions = {
    host: '127.0.0.1', // localhost para pruebas locales en esta PC
    port: 3050,
    database: 'C:/Users/Usuario/Desktop/Tomcat 9.0/1_ERP.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: true,
    connectTimeout: 2000 // Límite de 2 segundos en el driver
};

// Helper para ejecutar consultas Firebird con Promesas, desconexión automática y control de timeout estricto
function queryFirebird(sql) {
    return new Promise((resolve, reject) => {
        let finished = false;
        
        // Timeout de seguridad de 2 segundos para evitar que la petición quede colgada
        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                reject(new Error("Timeout al conectar/consultar la base de datos Firebird (límite de 2000ms superado)"));
            }
        }, 2000);

        firebird.attach(dbOptions, (err, db) => {
            if (finished) {
                if (db) {
                    try { db.detach(); } catch (e) {}
                }
                return;
            }
            
            if (err) {
                finished = true;
                clearTimeout(timer);
                return reject(err);
            }
            
            db.query(sql, (err, results) => {
                if (db) {
                    try { db.detach(); } catch (e) {}
                }
                
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                
                if (err) return reject(err);
                resolve(results);
            });
        });
    });
}

// Helpers para limpieza y formato de datos
function cleanClientCode(code) {
    if (!code) return '';
    code = String(code).trim();
    code = code.replace(/[\.,]0+$/, '');
    if (/^\d+([\.,]\d+)+$/.test(code)) {
        code = code.replace(/[\.,]/g, '');
    }
    return code;
}

function formatDate(date) {
    if (!date) return 'N/A';
    if (typeof date === 'string') return date;
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
}

// Funciones de parseo de planillas estáticas (para fallback y La Gruya)
function parseStandardSheet(rows, sheetName, originName) {
    let headerRowIndex = -1;
    let colMap = { client: -1, amount: -1, week: -1, invoice: -1, date: -1, dueDate: -1, situacion: -1 };
    
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i];
        if (!row || row.length < 5) continue;
        
        const rowStr = row.join(' ').toLowerCase();
        if (rowStr.includes('comprobante') && (rowStr.includes('cliente') || rowStr.includes('razon social') || rowStr.includes('cta cte'))) {
            headerRowIndex = i;
            
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
    
    if (colMap.client === -1 && sheetName === 'TRENQUE LAUQUEN') colMap.client = 3;
    if (colMap.amount === -1 && sheetName === 'TRENQUE LAUQUEN') colMap.amount = 8;
    if (colMap.week === -1 && sheetName === 'TRENQUE LAUQUEN') colMap.week = 10;
    
    if (headerRowIndex === -1) headerRowIndex = 0;
    
    const sheetData = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        let clientName = colMap.client > -1 ? row[colMap.client] : row[1];
        let amount = colMap.amount > -1 ? row[colMap.amount] : row[7];
        let week = colMap.week > -1 ? row[colMap.week] : row[row.length - 1];
        let invoice = colMap.invoice > -1 ? row[colMap.invoice] : row[3];
        let date = colMap.date > -1 ? row[colMap.date] : row[2];
        let dueDate = colMap.dueDate > -1 ? row[colMap.dueDate] : row[4];
        
        if (!clientName || typeof clientName !== 'string' || clientName.trim() === '') continue;
        if (!amount || isNaN(parseFloat(String(amount).replace(',','.')))) continue;
        
        amount = parseFloat(String(amount).replace(',','.'));
        if (amount === 0) continue;
        
        week = week ? String(week).trim() : 'Sin Semana';
        
        let clientCode = '';
        if (sheetName === 'SALDOS AGUAS' || sheetName === 'SALLIQUELO') {
            clientCode = row[0] !== undefined ? String(row[0]) : '';
        } else if (sheetName === 'TRENQUE LAUQUEN') {
            clientCode = row[2] !== undefined ? String(row[2]) : '';
        }
        
        let situacion = colMap.situacion > -1 && row[colMap.situacion] !== undefined ? String(row[colMap.situacion]).trim() : 'Sin Especificar';
        if (!situacion) situacion = 'Sin Especificar';
        
        sheetData.push({
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
    return sheetData;
}

function parseSaldosNuevo(rows, originName) {
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
    
    const sheetData = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;
        
        if (row[0] && row[1] && typeof row[1] === 'string' && row[1].length > 5 && !row[2]) {
            if (isNaN(parseFloat(String(row[1])))) {
                currentClient = row[1];
                currentClientCode = row[0] !== undefined ? String(row[0]) : '';
            }
        }
        
        let amount = row[7] || row[8]; 
        let week = row[12] || row[13] || row[11];
        let dateVal = row[0] !== undefined ? row[0] : (row[1] !== undefined ? row[1] : 'N/A');
        let dueDateVal = row[2] !== undefined ? row[2] : (row[3] !== undefined ? row[3] : 'N/A');
        let invoice = row[4];
        
        if (amount !== undefined && !isNaN(parseFloat(String(amount).replace(',','.')))) {
            let parsedAmount = parseFloat(String(amount).replace(',','.'));
            let invoiceStr = String(invoice || '').trim();
            let isLikelyInvoice = invoiceStr.length > 3 && /\d/.test(invoiceStr);
            
            if (parsedAmount !== 0 && isLikelyInvoice) {
                let w = week ? String(week).trim() : currentWeek;
                if (w.includes("AL") || w.includes("SEMANA")) currentWeek = w;
                
                let situacionVal = (situacionCol > -1 && row[situacionCol] !== undefined) ? String(row[situacionCol]).trim() : 'Sin Especificar';
                if (!situacionVal) situacionVal = 'Sin Especificar';
                
                sheetData.push({
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
    return sheetData;
}

// Endpoint para proveer el archivo Excel al frontend de forma segura (Compatible con versión estable)
app.get('/api/excel', (req, res) => {
    const excelPath = path.join(__dirname, 'QUERY.xlsx');
    res.sendFile(excelPath);
});

// --- SISTEMA DE SINCRONIZACIÓN SEGURO (BETA NUBE) ---
const SYNC_TOKEN = process.env.SYNC_TOKEN || "TokenIngentronSeguro2026";

// Endpoint POST seguro para recibir saldos procesados en tiempo real desde los sincronizadores locales
app.post('/api/update-saldos', express.json({ limit: '15mb' }), (req, res) => {
    const clientToken = req.headers['x-sync-token'];
    if (clientToken !== SYNC_TOKEN) {
        console.warn("[Sync] Intento de sincronización no autorizado.");
        return res.status(401).json({ error: "No autorizado" });
    }
    
    const payload = req.body;
    if (!Array.isArray(payload)) {
        return res.status(400).json({ error: "El payload debe ser un array de saldos." });
    }
    
    const syncOrigin = req.headers['x-sync-origin']; // Ej: 'Aguas' o 'PepsiCo'
    
    try {
        const cachePath = path.join(DATA_DIR, 'saldos_cache.json');
        let currentCache = [];
        if (fs.existsSync(cachePath)) {
            try {
                currentCache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) || [];
            } catch (err) {
                console.error("[Sync] Error leyendo caché anterior:", err.message);
            }
        }

        // Obtener los orígenes presentes en el nuevo payload recibido
        const incomingOrigins = [...new Set(payload.map(item => item.origin).filter(Boolean))];
        
        // Si viene el header 'x-sync-origin', lo usamos de prioridad para limpiar ese origen
        const originsToClear = incomingOrigins.length > 0 ? incomingOrigins : (syncOrigin ? [syncOrigin] : []);

        let updatedCache;
        if (originsToClear.length > 0) {
            // Filtrar y quitar de la caché anterior los registros de los orígenes actualizados
            const cleanCache = currentCache.filter(item => !originsToClear.includes(item.origin));
            // Unificar la caché con los nuevos datos
            updatedCache = [...cleanCache, ...payload];
        } else {
            // Fallback si no hay origen especificado
            updatedCache = payload;
        }
        
        fs.writeFileSync(cachePath, JSON.stringify(updatedCache));
        
        // Guardar la fecha y hora de la última sincronización exitosa por origen
        const statusPath = path.join(DATA_DIR, 'sync_status.json');
        let syncStatus = { Aguas: null, PepsiCo: null, 'Trenque Lauquen': null, Salliquelo: null, Digip: null };
        if (fs.existsSync(statusPath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
                syncStatus = { ...syncStatus, ...parsed };
            } catch (err) {}
        }
        
        const nowStr = new Date().toISOString();
        originsToClear.forEach(org => {
            syncStatus[org] = nowStr;
        });
        fs.writeFileSync(statusPath, JSON.stringify(syncStatus));

        console.log(`[Sync] Recibidos ${payload.length} saldos de [${originsToClear.join(', ')}]. Total caché consolidada: ${updatedCache.length} registros.`);
        res.json({ success: true, count: payload.length, total: updatedCache.length });
    } catch (err) {
        console.error("Error escribiendo archivo de caché de saldos:", err);
        res.status(500).json({ error: "Error interno al escribir caché de saldos." });
    }
});

// --- SISTEMA DE CONTROL DE VENCIMIENTOS DE STOCK (DIGIP WMS NUBE) ---

// Endpoint POST para recibir actualizaciones de stock desde el bot rpa
app.post('/api/update-stock', express.json({ limit: '15mb' }), (req, res) => {
    const clientToken = req.headers['x-sync-token'];
    if (clientToken !== SYNC_TOKEN) {
        console.warn("[Stock Sync] Intento de sincronización no autorizado.");
        return res.status(401).json({ error: "No autorizado" });
    }
    
    const payload = req.body;
    let currentData = [];
    let historyData = null;
    
    if (Array.isArray(payload)) {
        // Formato clásico retrocompatible
        currentData = payload;
    } else if (payload && Array.isArray(payload.current)) {
        // Nuevo formato robusto (snapshot actual + histórico)
        currentData = payload.current;
        historyData = payload.history;
    } else {
        return res.status(400).json({ error: "El payload de stock debe ser un array o un objeto estructurado {current, history}." });
    }
    
    try {
        const cachePath = path.join(DATA_DIR, 'stock_cache.json');
        fs.writeFileSync(cachePath, JSON.stringify(currentData));
        
        // Registrar hora de sinc de Digip
        const statusPath = path.join(DATA_DIR, 'sync_status.json');
        let syncStatus = { Aguas: null, PepsiCo: null, 'Trenque Lauquen': null, Salliquelo: null, Digip: null };
        if (fs.existsSync(statusPath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
                syncStatus = { ...syncStatus, ...parsed };
            } catch (err) {}
        }
        syncStatus.Digip = new Date().toISOString();
        fs.writeFileSync(statusPath, JSON.stringify(syncStatus));
        
        // --- GUARDAR EN HISTÓRICO DIARIO ---
        const historyPath = path.join(DATA_DIR, 'stock_history.json');
        let history = {};
        
        if (historyData) {
            // Si el sincronizador local envió el histórico completo, lo adoptamos directamente (resiliencia nube)
            history = historyData;
        } else {
            // Fallback: lo generamos en el servidor a partir del cache actual
            if (fs.existsSync(historyPath)) {
                try {
                    history = JSON.parse(fs.readFileSync(historyPath, 'utf8')) || {};
                } catch (err) {}
            }
            // Solo agregar al histórico de forma automática si es al final del día (ej. de 23:00 a 23:59 hs de Argentina)
            const localDate = new Date(new Date().getTime() - 3 * 3600 * 1000);
            const localHour = localDate.getHours();
            if (localHour >= 23) {
                const todayStr = localDate.toISOString().split('T')[0];
                history[todayStr] = currentData;
            }
        }
        
        // Mantener solo los últimos 15 días de capturas para optimizar disco
        const dates = Object.keys(history).sort();
        if (dates.length > 15) {
            const datesToRemove = dates.slice(0, dates.length - 15);
            for (const d of datesToRemove) {
                delete history[d];
            }
        }
        fs.writeFileSync(historyPath, JSON.stringify(history));
        
        console.log(`[Stock Sync] Recibidos ${currentData.length} lotes de stock de Digip WMS (Histórico: ${historyData ? 'Sincronizado' : 'Autogenerado'}).`);
        res.json({ success: true, count: currentData.length });
    } catch (err) {
        console.error("Error escribiendo archivo de caché de stock:", err);
        res.status(500).json({ error: "Error interno al escribir caché de stock." });
    }
});

// Endpoint GET para servir el stock consolidado (usado por el dashboard beta)
app.get('/api/stock', (req, res) => {
    const cachePath = path.join(DATA_DIR, 'stock_cache.json');
    const historyPath = path.join(DATA_DIR, 'stock_history.json');
    
    let current = [];
    let history = {};
    
    if (fs.existsSync(cachePath)) {
        try {
            current = JSON.parse(fs.readFileSync(cachePath, 'utf8')) || [];
        } catch (err) {
            console.error("Error leyendo caché de stock:", err.message);
        }
    }
    
    if (fs.existsSync(historyPath)) {
        try {
            history = JSON.parse(fs.readFileSync(historyPath, 'utf8')) || {};
        } catch (err) {
            console.error("Error leyendo histórico de stock:", err.message);
        }
    }
    
    res.json({ current, history });
});

// Endpoint para consultar el estado de la última sincronización de los servidores locales
app.get('/api/sync-status', (req, res) => {
    const statusPath = path.join(DATA_DIR, 'sync_status.json');
    let syncStatus = { Aguas: null, PepsiCo: null, 'Trenque Lauquen': null, Salliquelo: null, Digip: null };
    if (fs.existsSync(statusPath)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            syncStatus = { ...syncStatus, ...parsed };
        } catch (err) {}
    }
    res.json(syncStatus);
});

// Endpoint unificado y ultra-rápido en tiempo real (para versión Beta)
app.get('/api/saldos', async (req, res) => {
    // 0. Si existe el archivo caché sincronizado (ej. en Render), lo servimos instantáneamente
    const cachePath = path.join(DATA_DIR, 'saldos_cache.json');
    if (fs.existsSync(cachePath)) {
        try {
            const cacheContent = fs.readFileSync(cachePath, 'utf8');
            const parsedData = JSON.parse(cacheContent);
            if (parsedData && parsedData.length > 0) {
                console.log(`[Cache] Sirviendo ${parsedData.length} saldos sincronizados desde caché.`);
                return res.json(parsedData);
            }
        } catch (e) {
            console.error("[Cache] Error al leer caché de saldos, continuando de forma normal:", e);
        }
    }

    let globalData = [];
    

    
    // 2. Intentar consultar Aguas y PepsiCo desde Firebird en tiempo real
    let liveSuccess = false;
    try {
        const aguasQuery = `
        SELECT 
            p.NUMERO AS client_code,
            p.NOMBRE AS client_name,
            t.NOMBRE AS doc_type,
            ci.LETRA || ' ' || ci.NUMEROSERIE || '-' || ci.ALNUMERO AS doc_number,
            c.FECHA AS doc_date,
            c.FECHAVENCIMIENTO AS due_date,
            cp.IMPORTE AS total_amount,
            COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) AS paid_amount,
            cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) AS outstanding_balance
        FROM COMPROBANTE c
        JOIN COMPROBANTEIDENTIFICACION ci ON c.COMPROBANTEIDENTIFICACION_OID = ci.OID
        JOIN TIPOCOMPROBANTE t ON c.TIPOCOMPROBANTE_OID = t.OID
        JOIN CONTRAPARTIDA cp ON cp.COMPROBANTE_OID = c.OID AND cp.TIPOCONTRAPARTIDA_OID = 5
        JOIN CUENTACORRIENTE ct ON cp.CUENTACORRIENTE_OID = ct.OID
        JOIN PERSONA p ON ct.PROPIETARIO_OID = p.OID
        WHERE cp.IMPORTE > 0 
          AND p.dtype = 'Cliente'
          AND c.VISIBILIDAD = 0
          AND p.VISIBILIDAD = 0
          AND c.TIPOCOMPROBANTE_OID IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 43, 56)
          AND (cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0)) > 0.01
          AND c.TALONARIO_OID NOT IN (23, 24)
          AND ci.ALNUMERO > 0
          AND NOT (
            COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) = 0
            AND c.FECHA < DATEADD(-1 YEAR TO CURRENT_DATE)
          )
        `;
        
        const pepsiQuery = `
        SELECT 
            p.NUMERO AS client_code,
            p.NOMBRE AS client_name,
            t.NOMBRE AS doc_type,
            ci.LETRA || ' ' || ci.NUMEROSERIE || '-' || ci.ALNUMERO AS doc_number,
            c.FECHA AS doc_date,
            c.FECHAVENCIMIENTO AS due_date,
            cp.IMPORTE AS total_amount,
            COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) AS paid_amount,
            cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) AS outstanding_balance
        FROM COMPROBANTE c
        JOIN COMPROBANTEIDENTIFICACION ci ON c.COMPROBANTEIDENTIFICACION_OID = ci.OID
        JOIN TIPOCOMPROBANTE t ON c.TIPOCOMPROBANTE_OID = t.OID
        JOIN CONTRAPARTIDA cp ON cp.COMPROBANTE_OID = c.OID AND cp.TIPOCONTRAPARTIDA_OID = 5
        JOIN CUENTACORRIENTE ct ON cp.CUENTACORRIENTE_OID = ct.OID
        JOIN PERSONA p ON ct.PROPIETARIO_OID = p.OID
        WHERE cp.IMPORTE > 0 
          AND p.dtype = 'Cliente'
          AND c.VISIBILIDAD = 0
          AND p.VISIBILIDAD = 0
          AND c.TIPOCOMPROBANTE_OID IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 43, 56)
          AND (cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0)) > 0.01
          AND c.TALONARIO_OID IN (23, 24)
          AND ci.ALNUMERO > 0
          AND NOT (
            COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) = 0
            AND c.FECHA < DATEADD(-1 YEAR TO CURRENT_DATE)
          )
        `;
        
        console.log("Consultando base de datos Firebird local...");
        const [aguasRows, pepsiRows] = await Promise.all([
            queryFirebird(aguasQuery),
            queryFirebird(pepsiQuery)
        ]);
        
        const aguasMapped = aguasRows.map(row => ({
            origin: 'Aguas',
            client: String(row.client_name).trim(),
            clientCode: cleanClientCode(row.client_code),
            amount: parseFloat(row.outstanding_balance),
            originalAmount: parseFloat(row.total_amount),
            paidAmount: parseFloat(row.paid_amount),
            week: 'Tiempo Real',
            invoice: row.doc_number || 'N/A',
            date: formatDate(row.doc_date),
            dueDate: formatDate(row.due_date),
            situacion: 'PENDIENTE DE PAGO'
        }));
        
        const pepsiMapped = pepsiRows.map(row => ({
            origin: 'PepsiCo',
            client: String(row.client_name).trim(),
            clientCode: cleanClientCode(row.client_code),
            amount: parseFloat(row.outstanding_balance),
            originalAmount: parseFloat(row.total_amount),
            paidAmount: parseFloat(row.paid_amount),
            week: 'Tiempo Real',
            invoice: row.doc_number || 'N/A',
            date: formatDate(row.doc_date),
            dueDate: formatDate(row.due_date),
            situacion: 'PENDIENTE DE PAGO'
        }));
        
        globalData.push(...aguasMapped, ...pepsiMapped);
        liveSuccess = true;
        console.log(`Conexión Firebird exitosa: Cargados ${aguasMapped.length} saldos de Aguas y ${pepsiMapped.length} de PepsiCo.`);
    } catch (dbErr) {
        console.error("ADVERTENCIA: No se pudo conectar a la base de datos Firebird. Usando fallback de Excel:", dbErr.message);
    }
    

    
    res.json(globalData);
});

// Catch-all para la versión Beta para soportar SPA routing (HTML5 History API)
app.get(/^\/beta/, (req, res) => {
    res.sendFile(path.join(__dirname, 'beta', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 SERVIDOR INGENTRON INICIADO (BETA SQL ACTIVA)`);
    console.log(`======================================================`);
    console.log(`\nEl dashboard está disponible en tu computadora local en:`);
    console.log(`-> http://localhost:${PORT}`);
    console.log(`-> http://localhost:${PORT}/beta/ (Versión con Base de Datos SQL)`);
    console.log(`\nPara que otras computadoras lo vean, dales la IP de esta PC.`);
    console.log(`(Asegúrate de no cerrar esta ventana mientras quieras que el sistema funcione)`);
});
