const firebird = require('node-firebird');
const sql = require('mssql');

// 1. Opciones de conexión a Firebird de Calvo y Asociados (Aguas - Producción)
const firebirdOptions = {
    host: '192.168.2.150', // IP del servidor de Calvo
    port: 3050,
    database: 'C:/ERPCalvoyAsociados/Database/ERPDATABASE.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: true,
    connectTimeout: 5000
};

// 2. Opciones de conexión a SQL Server de Gescom (PepsiCo - Producción)
const sqlServerOptions = {
    user: 'usuario',
    password: '',
    server: '192.168.2.188', // SERVER-CX en red local
    database: 'idea',
    options: {
        encrypt: false, // Deshabilitar cifrado para la red local
        trustServerCertificate: true,
        instanceName: 'SQLSERVER2022'
    },
    connectionTimeout: 5000
};

// URL y Token del servidor en Render
const RENDER_SYNC_URL = 'https://ingentron.onrender.com/api/update-saldos';
const SYNC_TOKEN = process.env.SYNC_TOKEN || 'TokenIngentronSeguro2026';

// Helper para ejecutar consultas Firebird con Promesas
function queryFirebird(sqlQuery) {
    return new Promise((resolve, reject) => {
        firebird.attach(firebirdOptions, (err, db) => {
            if (err) return reject(err);
            db.query(sqlQuery, (err, results) => {
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

// Función para obtener saldos de Aguas desde Firebird
async function getAguasSaldos() {
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
      AND c.TIPOCOMPROBANTE_OID IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 43, 56)
      AND (cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0)) > 0.01
      AND c.TALONARIO_OID NOT IN (23, 24)
      AND ci.ALNUMERO > 0
      AND NOT (
        COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) = 0
        AND c.FECHA < DATEADD(-1 YEAR TO CURRENT_DATE)
      )
    `;
    
    console.log("[Firebird] Obteniendo saldos de Aguas de Calvo...");
    const rows = await queryFirebird(query);
    return rows.map(row => ({
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
}

// Función para obtener saldos de PepsiCo desde SQL Server (Gescom)
async function getPepsiSaldos() {
    console.log("[SQL Server] Conectando a Gescom...");
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
        HAVING SUM(cccd.cccd_importe) > 0.01
        `;
        
        const result = await pool.request().query(query);
        console.log(`[SQL Server] Extracción de PepsiCo exitosa: ${result.recordset.length} registros.`);
        return result.recordset.map(row => {
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
    } catch (err) {
        console.error("[SQL Server] ERROR al consultar PepsiCo en Gescom:", err.message);
        throw err;
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

// Ejecutar la sincronización completa
async function runSynchronization() {
    const timestamp = new Date().toLocaleString();
    console.log(`\n[${timestamp}] 🔄 Iniciando ciclo de sincronización dual...`);
    
    let globalData = [];
    
    // 1. Cargar Aguas (Firebird)
    try {
        const aguasData = await getAguasSaldos();
        globalData.push(...aguasData);
        console.log(`[Firebird] Cargados ${aguasData.length} saldos de Aguas.`);
    } catch (err) {
        console.error("[Firebird] ERROR al extraer saldos de Aguas:", err.message);
    }
    
    // 2. Cargar PepsiCo (SQL Server)
    try {
        const pepsiData = await getPepsiSaldos();
        globalData.push(...pepsiData);
        console.log(`[SQL Server] Cargados ${pepsiData.length} saldos de PepsiCo.`);
    } catch (err) {
        console.error("[SQL Server] ERROR al extraer saldos de PepsiCo:", err.message);
    }
    
    if (globalData.length === 0) {
        console.log("⚠️ No hay datos consolidados para enviar.");
        return;
    }
    
    // 3. Subir a Render
    try {
        console.log(`[Render] Enviando ${globalData.length} registros consolidados a Render...`);
        const response = await fetch(RENDER_SYNC_URL, {
            method: 'POST',
            headers: {
                'x-sync-token': SYNC_TOKEN,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(globalData)
        });
        
        if (!response.ok) {
            throw new Error(`Código HTTP de respuesta: ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`[Render] ¡Sincronización DUAL EXITOSA! Respuesta:`, result);
    } catch (syncErr) {
        console.error("[Render] ERROR al subir datos consolidados:", syncErr.message);
    }
}

// Bucle de sincronización: ejecutar al arrancar y cada 2 minutos
const INTERVAL_MINUTES = 2;
console.log(`=============================================================`);
console.log(`🔄 INICIANDO CLIENTE SINCRONIZADOR DUAL INGENTRON (SERVIDOR)`);
console.log(`Consolidando Aguas (Firebird) y PepsiCo (SQL Server)`);
console.log(`Frecuencia: Cada ${INTERVAL_MINUTES} minutos.`);
console.log(`Destino: ${RENDER_SYNC_URL}`);
console.log(`=============================================================`);

runSynchronization();
setInterval(runSynchronization, INTERVAL_MINUTES * 60 * 1000);
