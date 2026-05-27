const sql = require('mssql');

// Opciones de conexión a SQL Server locales (corriendo dentro del propio servidor Gescom)
const sqlServerOptions = {
    user: 'usuario',
    password: '',
    server: '127.0.0.1', // localhost en el servidor Gescom
    database: 'idea',
    options: {
        encrypt: false, // Deshabilitar cifrado para la red local
        trustServerCertificate: true,
        instanceName: 'SQLSERVER2022' // Instancia local
    },
    connectionTimeout: 5000
};

// URL y Token del servidor en Render
const RENDER_SYNC_URL = 'https://ingentron.onrender.com/api/update-saldos';
const SYNC_TOKEN = process.env.SYNC_TOKEN || 'TokenIngentronSeguro2026';

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

function formatDateForCut(yyyymmdd) {
    if (!yyyymmdd || yyyymmdd.length !== 8) return 'N/A';
    const year = yyyymmdd.slice(2, 4);
    const month = yyyymmdd.slice(4, 6);
    const day = yyyymmdd.slice(6, 8);
    return `${day}/${month}/${year}`;
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

// Ejecutar la sincronización de PepsiCo
async function runSynchronization() {
    const timestamp = new Date().toLocaleString();
    console.log(`\n[${timestamp}] 🔄 Iniciando ciclo de sincronización de PepsiCo...`);
    
    let globalData = [];
    let pool;
    
    try {
        pool = await sql.connect(sqlServerOptions);
        const query = `
        SELECT 
            cccd.cliente_codigo AS client_code,
            cli.razon_social AS client_name,
            cccd.cccd_referencia AS doc_number,
            cccref.ccc_fecha AS doc_date,
            cccref.ccc_fechavenc AS due_date,
            cccref.ccc_importe AS total_amount,
            SUM(cccd.cccd_importe) AS outstanding_balance
        FROM ctacteclidet cccd
        INNER JOIN cliente cli ON cccd.cliente_codigo = cli.codigo
        INNER JOIN ctactecli cccref ON cccd.cccd_referencia = cccref.ccc_comprobante AND cccd.cliente_codigo = cccref.cliente_codigo AND cccd.empresa_id = cccref.empresa_id
        GROUP BY cccd.cliente_codigo, cli.razon_social, cccd.cccd_referencia, cccref.ccc_fecha, cccref.ccc_fechavenc, cccref.ccc_importe
        HAVING ABS(SUM(cccd.cccd_importe)) > 0.01
        `;
        
        console.log("[SQL Server] Consultando base de datos Gescom local...");
        const result = await pool.request().query(query);
        
        globalData = result.recordset.map(row => {
            const outstanding = parseFloat(row.outstanding_balance);
            const original = parseFloat(row.total_amount);
            return {
                origin: 'PepsiCo',
                client: String(row.client_name).trim(),
                clientCode: cleanClientCode(row.client_code),
                amount: outstanding,
                originalAmount: original,
                paidAmount: original - outstanding,
                week: 'Tiempo Real',
                invoice: String(row.doc_number).trim() || 'N/A',
                date: formatDate(row.doc_date),
                dueDate: formatDate(row.due_date),
                situacion: 'PENDIENTE DE PAGO'
            };
        });
        
        console.log(`[SQL Server] Éxito: Cargados ${globalData.length} saldos en tiempo real de PepsiCo.`);

        // Extraer cortes históricos semanales de forma automática y dinámica
        const currentCuts = getWednesdayCuts();
        const hasNewCut = !cachedHistoricalData || (cachedCutsCount !== currentCuts.length);
        
        if (hasNewCut) {
            console.log(`[SQL Server] 📥 Detectados ${currentCuts.length} cortes históricos a procesar (anterior: ${cachedCutsCount}). Consultando y cacheando...`);
            let tempHist = [];
            for (const cut of currentCuts) {
                console.log(`[SQL Server] Consultando corte histórico: ${cut.label}...`);
                const histQuery = `
                SELECT 
                    cccd.cliente_codigo AS client_code,
                    cli.razon_social AS client_name,
                    SUM(cccd.cccd_importe) AS outstanding_balance
                FROM ctacteclidet cccd
                INNER JOIN cliente cli ON cccd.cliente_codigo = cli.codigo
                INNER JOIN ctactecli ccc ON cccd.ccc_comprobante = ccc.ccc_comprobante AND cccd.cliente_codigo = ccc.cliente_codigo AND cccd.empresa_id = ccc.empresa_id
                WHERE ccc.ccc_fecha <= '${cut.dateMsSql}'
                GROUP BY cccd.cliente_codigo, cli.razon_social
                HAVING ABS(SUM(cccd.cccd_importe)) > 0.01
                `;
                const histResult = await pool.request().query(histQuery);
                const histData = histResult.recordset.map(row => {
                    return {
                        origin: 'PepsiCo',
                        client: String(row.client_name).trim(),
                        clientCode: cleanClientCode(row.client_code),
                        amount: parseFloat(row.outstanding_balance),
                        originalAmount: parseFloat(row.outstanding_balance),
                        paidAmount: 0,
                        week: cut.label,
                        invoice: 'HISTÓRICO',
                        date: formatDateForCut(cut.dateMsSql),
                        dueDate: formatDateForCut(cut.dateMsSql),
                        situacion: 'HISTÓRICO'
                    };
                });
                tempHist = [...tempHist, ...histData];
            }
            cachedHistoricalData = tempHist;
            cachedCutsCount = currentCuts.length;
            console.log(`[SQL Server] 💾 Guardados en cache ${cachedHistoricalData.length} registros históricos.`);
        } else {
            console.log(`[SQL Server] ⚡ Reutilizando ${cachedHistoricalData.length} registros históricos desde la cache.`);
        }

        globalData = [...globalData, ...cachedHistoricalData];

        console.log(`[SQL Server] Sincronización completa preparada: total ${globalData.length} registros (tiempo real + cortes).`);
    } catch (err) {
        console.error("[SQL Server] ERROR al extraer saldos de PepsiCo:", err.message);
        return;
    } finally {
        if (pool) {
            await pool.close();
        }
    }
    
    // Subir a Render
    try {
        console.log(`[Render] Enviando ${globalData.length} registros a la nube...`);
        const response = await fetch(RENDER_SYNC_URL, {
            method: 'POST',
            headers: {
                'x-sync-token': SYNC_TOKEN,
                'x-sync-origin': 'PepsiCo', // Header identificador de origen
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(globalData)
        });
        
        if (!response.ok) {
            throw new Error(`Código HTTP de respuesta: ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`[Render] ¡Sincronización de PepsiCo EXITOSA!`, result);
    } catch (syncErr) {
        console.error("[Render] ERROR al subir datos de PepsiCo:", syncErr.message);
    }
}

// Bucle de sincronización: ejecutar al arrancar y cada 30 segundos
const INTERVAL_SECONDS = 30;
console.log(`=============================================================`);
console.log(`🔄 INICIANDO CLIENTE SINCRONIZADOR DE PEPSICO (GESCOM PC)`);
console.log(`Sincronizando cada ${INTERVAL_SECONDS} segundos.`);
console.log(`Destino: ${RENDER_SYNC_URL}`);
console.log(`=============================================================`);

runSynchronization();
setInterval(runSynchronization, INTERVAL_SECONDS * 1000);
