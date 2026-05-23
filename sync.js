const firebird = require('node-firebird');
const path = require('path');
const fs = require('fs');

// Opciones de conexión a Firebird del servidor principal (Producción en vivo)
const dbOptions = {
    host: '192.168.2.150', // Servidor principal
    port: 3050,
    database: 'C:/ERPCalvoyAsociados/Database/ERPDATABASE.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: true,
    connectTimeout: 5000 // 5 segundos para el sincronizador
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



// Ejecutar la sincronización completa
async function runSynchronization() {
    const timestamp = new Date().toLocaleString();
    console.log(`\n[${timestamp}] 🔄 Iniciando ciclo de sincronización de saldos...`);
    
    let globalData = [];
    

    
    // 2. Cargar datos en vivo de Aguas y PepsiCo desde la base de datos Firebird local
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
          AND c.TIPOCOMPROBANTE_OID IN (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 43, 56)
          AND (cp.IMPORTE + COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0)) > 0.01
          AND c.TALONARIO_OID IN (23, 24)
          AND ci.ALNUMERO > 0
          AND NOT (
            COALESCE((SELECT SUM(can.IMPORTE) FROM CANCELACION can WHERE can.COMPROBANTECANCELADO_OID = c.OID), 0) = 0
            AND c.FECHA < DATEADD(-1 YEAR TO CURRENT_DATE)
          )
        `;
        
        console.log("[Firebird] Conectando y consultando base de datos local...");
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
        console.log(`[Firebird] Éxito: Cargados ${aguasMapped.length} saldos de Aguas y ${pepsiMapped.length} de PepsiCo.`);
    } catch (dbErr) {
        console.error("[Firebird] ERROR CRÍTICO al leer base de datos:", dbErr.message);
        return; // Detener sincronización si falla la DB principal
    }
    
    // 3. Subir el conjunto consolidado al servidor de Render mediante POST seguro
    try {
        console.log(`[Render] Enviando ${globalData.length} registros a la nube en Render...`);
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
        console.log(`[Render] ¡Sincronización EXITOSA! Respuesta del servidor:`, result);
    } catch (syncErr) {
        console.error("[Render] ERROR al subir datos a la nube:", syncErr.message);
    }
}

// Bucle de sincronización: ejecutar al arrancar y cada 2 minutos
const INTERVAL_MINUTES = 2;
console.log(`=============================================================`);
console.log(`🔄 INICIANDO CLIENTE SINCRONIZADOR INGENTRON`);
console.log(`Sincronizando cada ${INTERVAL_MINUTES} minutos.`);
console.log(`Destino: ${RENDER_SYNC_URL}`);
console.log(`=============================================================`);

runSynchronization();
setInterval(runSynchronization, INTERVAL_MINUTES * 60 * 1000);
