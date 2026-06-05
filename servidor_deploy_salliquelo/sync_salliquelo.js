const firebird = require('node-firebird');

// Opciones de conexión a Firebird locales (corriendo dentro del propio servidor de Salliqueló)
const dbOptions = {
    host: '127.0.0.1', // localhost en el servidor de Salliqueló
    port: 3050,
    database: 'C:/ERPCalvoyAsociados/Database/ERPDATABASE.FDB', // Ruta local
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: true,
    connectTimeout: 5000
};

// URL y Token del servidor en Render
const RENDER_SYNC_URL = 'https://ingentron.onrender.com/api/update-saldos';
const SYNC_TOKEN = process.env.SYNC_TOKEN || 'TokenIngentronSeguro2026';

// Helper para ejecutar consultas Firebird con Promesas
function queryFirebird(sql) {
    return new Promise((resolve, reject) => {
        firebird.attach(dbOptions, (err, db) => {
            if (err) return reject(err);
            db.query(sql, (err, results) => {
                db.detach();
                if (err) return reject(err);
                resolve(results);
            });
        });
    });
}

// Helpers de formateo
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

function formatDateForCutFirebird(yyyymmdd) {
    if (!yyyymmdd || yyyymmdd.length !== 10) return 'N/A';
    const parts = yyyymmdd.split('-');
    if (parts.length !== 3) return 'N/A';
    return `${parts[2]}/${parts[1]}/${parts[0].slice(2, 4)}`;
}

// Generación dinámica de cortes semanales (todos los miércoles a las 12:00hs desde el 01/04/2026)
function getWednesdayCuts() {
    const cuts = [];
    let current = new Date("2026-04-01T12:00:00");
    const now = new Date();
    
    const pad = (n) => String(n).padStart(2, '0');
    
    while (current <= now) {
        const startDate = new Date(current.getTime() - 7 * 24 * 60 * 60 * 1000);
        const label = `Del ${pad(startDate.getDate())}/${pad(startDate.getMonth() + 1)}/${startDate.getFullYear()} al ${pad(current.getDate())}/${pad(current.getMonth() + 1)}/${current.getFullYear()}`;
        
        const year = current.getFullYear();
        const month = pad(current.getMonth() + 1);
        const day = pad(current.getDate());
        
        cuts.push({
            label: label,
            dateSql: `${year}-${month}-${day}`, // Para Firebird (YYYY-MM-DD)
            dateMsSql: `${year}${month}${day}` // Para SQL Server (YYYYMMDD)
        });
        
        current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    return cuts;
}

// Cache en memoria para evitar consultar cortes históricos que no cambian
let cachedHistoricalData = null;
let cachedCutsCount = 0;

// Ejecutar la sincronización de Salliqueló
async function runSynchronization() {
    const timestamp = new Date().toLocaleString();
    console.log(`\n[${timestamp}] 🔄 Iniciando ciclo de sincronización de Salliqueló...`);
    
    let globalData = [];
    
    try {
        const query = `
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
          AND c.VISIBILIDAD IN (0, 16)
          AND p.VISIBILIDAD = 0
          AND c.TIPOCOMPROBANTE_OID IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 43, 56)
          AND NOT EXISTS (SELECT 1 FROM COMPROBANTE baja WHERE baja.COMPROBANTERELACIONADO_OID = c.OID AND baja.TIPOCOMPROBANTE_OID = 52)
          AND (cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0)) > 0.01
          AND c.TALONARIO_OID NOT IN (23, 24)
          AND ci.ALNUMERO > 0
          AND NOT (
            COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) = 0
            AND c.FECHA < DATEADD(-1 YEAR TO CURRENT_DATE)
          )
        `;
        
        console.log("[Firebird] Consultando base de datos local de Salliqueló...");
        const rows = await queryFirebird(query);
        
        globalData = rows.map(row => ({
            origin: 'Salliquelo',
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
        
        console.log(`[Firebird] Éxito: Cargados ${globalData.length} saldos en tiempo real de Salliqueló.`);

        // Extraer cortes históricos semanales de Salliqueló (los miércoles) de forma automática y dinámica
        const currentCuts = getWednesdayCuts();
        const hasNewCut = !cachedHistoricalData || (cachedCutsCount !== currentCuts.length);
        
        if (hasNewCut) {
            console.log(`[Firebird] 📥 Detectados ${currentCuts.length} cortes históricos a procesar (anterior: ${cachedCutsCount}). Consultando y cacheando...`);
            let tempHist = [];
            for (const cut of currentCuts) {
                console.log(`[Firebird] Consultando corte histórico: ${cut.label}...`);
                const histQuery = `
                SELECT 
                    p.NUMERO AS client_code,
                    p.NOMBRE AS client_name,
                    SUM(cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can JOIN COMPROBANTE pay ON can.COMPROBANTE_OID = pay.OID WHERE can.COMPROBANTECANCELADO_OID = c.OID AND pay.FECHA <= '${cut.dateSql}'), 0)) AS outstanding_balance
                FROM COMPROBANTE c
                JOIN COMPROBANTEIDENTIFICACION ci ON c.COMPROBANTEIDENTIFICACION_OID = ci.OID
                JOIN TIPOCOMPROBANTE t ON c.TIPOCOMPROBANTE_OID = t.OID
                JOIN CONTRAPARTIDA cp ON cp.COMPROBANTE_OID = c.OID AND cp.TIPOCONTRAPARTIDA_OID = 5
                JOIN CUENTACORRIENTE ct ON cp.CUENTACORRIENTE_OID = ct.OID
                JOIN PERSONA p ON ct.PROPIETARIO_OID = p.OID
                WHERE cp.IMPORTE > 0 
                  AND p.dtype = 'Cliente'
                  AND c.VISIBILIDAD IN (0, 16)
                  AND p.VISIBILIDAD = 0
                  AND c.TIPOCOMPROBANTE_OID IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 43, 56)
                  AND NOT EXISTS (SELECT 1 FROM COMPROBANTE baja WHERE baja.COMPROBANTERELACIONADO_OID = c.OID AND baja.TIPOCOMPROBANTE_OID = 52 AND baja.FECHA <= '${cut.dateSql}')
                  AND c.TALONARIO_OID NOT IN (23, 24)
                  AND ci.ALNUMERO > 0
                  AND c.FECHA <= '${cut.dateSql}'
                  AND (cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can JOIN COMPROBANTE pay ON can.COMPROBANTE_OID = pay.OID WHERE can.COMPROBANTECANCELADO_OID = c.OID AND pay.FECHA <= '${cut.dateSql}'), 0)) > 0.01
                GROUP BY p.NUMERO, p.NOMBRE
                `;
                const histRows = await queryFirebird(histQuery);
                const histData = histRows.map(row => {
                    return {
                        origin: 'Salliquelo',
                        client: String(row.client_name).trim(),
                        clientCode: cleanClientCode(row.client_code),
                        amount: parseFloat(row.outstanding_balance),
                        originalAmount: parseFloat(row.outstanding_balance),
                        paidAmount: 0,
                        week: cut.label,
                        invoice: 'HISTÓRICO',
                        date: formatDateForCutFirebird(cut.dateSql),
                        dueDate: formatDateForCutFirebird(cut.dateSql),
                        situacion: 'HISTÓRICO'
                    };
                });
                tempHist = [...tempHist, ...histData];
            }
            cachedHistoricalData = tempHist;
            cachedCutsCount = currentCuts.length;
            console.log(`[Firebird] 💾 Guardados en cache ${cachedHistoricalData.length} registros históricos.`);
        } else {
            console.log(`[Firebird] ⚡ Reutilizando ${cachedHistoricalData.length} registros históricos desde la cache.`);
        }

        globalData = [...globalData, ...cachedHistoricalData];

        console.log(`[Firebird] Sincronización completa preparada: total ${globalData.length} registros (tiempo real + cortes).`);
    } catch (dbErr) {
        console.error("[Firebird] ERROR al extraer saldos de Salliqueló:", dbErr.message);
        return;
    }
    
    // Subir a Render
    try {
        console.log(`[Render] Enviando ${globalData.length} registros a la nube...`);
        const response = await fetch(RENDER_SYNC_URL, {
            method: 'POST',
            headers: {
                'x-sync-token': SYNC_TOKEN,
                'x-sync-origin': 'Salliquelo', // Header identificador de origen
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(globalData)
        });
        
        if (!response.ok) {
            throw new Error(`Código HTTP de respuesta: ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`[Render] ¡Sincronización de Salliqueló EXITOSA!`, result);
    } catch (syncErr) {
        console.error("[Render] ERROR al subir datos de Salliqueló:", syncErr.message);
    }
}

// Bucle de sincronización: ejecutar al arrancar y cada 30 segundos
const INTERVAL_SECONDS = 30;
console.log(`=============================================================`);
console.log(`🔄 INICIANDO CLIENTE SINCRONIZADOR DE SALLIQUELÓ (CALVO PC)`);
console.log(`Sincronizando cada ${INTERVAL_SECONDS} segundos.`);
console.log(`Destino: ${RENDER_SYNC_URL}`);
console.log(`=============================================================`);

runSynchronization();
setInterval(runSynchronization, INTERVAL_SECONDS * 1000);
