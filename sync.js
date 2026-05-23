const firebird = require('node-firebird');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Opciones de conexión a Firebird de pruebas (Copia local actualizada hoy)
const dbOptions = {
    host: '127.0.0.1', // localhost para pruebas locales en esta PC
    port: 3050,
    database: 'C:/Users/Usuario/Desktop/Tomcat 9.0/1_ERP.FDB',
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

// Lógica de parseo de La Gruya desde Excel local
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

// Ejecutar la sincronización completa
async function runSynchronization() {
    const timestamp = new Date().toLocaleString();
    console.log(`\n[${timestamp}] 🔄 Iniciando ciclo de sincronización de saldos...`);
    
    let globalData = [];
    
    // 1. Cargar datos de La Gruya desde el Excel local (Salliqueló y Trenque Lauquen)
    try {
        const excelPath = path.join(__dirname, 'QUERY.xlsx');
        if (fs.existsSync(excelPath)) {
            const workbook = XLSX.readFile(excelPath);
            
            // Salliqueló
            if (workbook.Sheets['SALLIQUELO']) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets['SALLIQUELO'], { header: 1 });
                const salliqueloData = parseStandardSheet(rows, 'SALLIQUELO', 'Salliquelo');
                globalData.push(...salliqueloData);
                console.log(`[La Gruya] Cargados ${salliqueloData.length} registros de Salliqueló.`);
            }
            
            // Trenque Lauquen
            if (workbook.Sheets['TRENQUE LAUQUEN']) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets['TRENQUE LAUQUEN'], { header: 1 });
                const trenqueData = parseStandardSheet(rows, 'TRENQUE LAUQUEN', 'Trenque Lauquen');
                globalData.push(...trenqueData);
                console.log(`[La Gruya] Cargados ${trenqueData.length} registros de Trenque Lauquen.`);
            }
        } else {
            console.warn("[La Gruya] ADVERTENCIA: QUERY.xlsx no se encontró en esta ubicación. Omitiendo La Gruya.");
        }
    } catch (excelErr) {
        console.error("[La Gruya] Error al leer La Gruya desde Excel:", excelErr.message);
    }
    
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
