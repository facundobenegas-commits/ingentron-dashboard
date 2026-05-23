const express = require('express');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const firebird = require('node-firebird');

const app = express();

// Servir archivos estáticos del dashboard (index.html, styles.css, app.js)
app.use(express.static(__dirname));

// Opciones de conexión a Firebird de PRODUCCIÓN (servidor en vivo)
const dbOptions = {
    host: '192.168.2.150', // servidor (nombre de red: 'servidor')
    port: 3050,
    database: 'C:/ERPCalvoyAsociados/Database/ERPDATABASE.FDB',
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

// Endpoint unificado y ultra-rápido en tiempo real (para versión Beta)
app.get('/api/saldos', async (req, res) => {
    let globalData = [];
    
    // 1. Cargar Salliqueló y Trenque Lauquen (La Gruya) desde el Excel estático
    try {
        const excelPath = path.join(__dirname, 'QUERY.xlsx');
        if (fs.existsSync(excelPath)) {
            const workbook = XLSX.readFile(excelPath);
            
            // Salliqueló
            if (workbook.Sheets['SALLIQUELO']) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets['SALLIQUELO'], { header: 1 });
                const salliqueloData = parseStandardSheet(rows, 'SALLIQUELO', 'Salliquelo');
                globalData.push(...salliqueloData);
            }
            
            // Trenque Lauquen
            if (workbook.Sheets['TRENQUE LAUQUEN']) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets['TRENQUE LAUQUEN'], { header: 1 });
                const trenqueData = parseStandardSheet(rows, 'TRENQUE LAUQUEN', 'Trenque Lauquen');
                globalData.push(...trenqueData);
            }
        }
    } catch (err) {
        console.error("Error leyendo Salliquelo/Trenque Lauquen desde Excel:", err);
    }
    
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
        liveSuccess = true;
        console.log(`Conexión Firebird exitosa: Cargados ${aguasMapped.length} saldos de Aguas y ${pepsiMapped.length} de PepsiCo.`);
    } catch (dbErr) {
        console.error("ADVERTENCIA: No se pudo conectar a la base de datos Firebird. Usando fallback de Excel:", dbErr.message);
    }
    
    // 3. Fallback: Si Firebird falló, leer Aguas y PepsiCo desde QUERY.xlsx
    if (!liveSuccess) {
        try {
            const excelPath = path.join(__dirname, 'QUERY.xlsx');
            if (fs.existsSync(excelPath)) {
                const workbook = XLSX.readFile(excelPath);
                
                // Aguas Fallback
                if (workbook.Sheets['SALDOS AGUAS']) {
                    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['SALDOS AGUAS'], { header: 1 });
                    const aguasData = parseStandardSheet(rows, 'SALDOS AGUAS', 'Aguas');
                    globalData.push(...aguasData);
                }
                
                // PepsiCo Fallback
                if (workbook.Sheets['SALDOS NUEVO']) {
                    const rows = XLSX.utils.sheet_to_json(workbook.Sheets['SALDOS NUEVO'], { header: 1 });
                    const pepsiData = parseSaldosNuevo(rows, 'PepsiCo');
                    globalData.push(...pepsiData);
                }
                console.log("Cargados saldos estáticos desde QUERY.xlsx (modo fallback).");
            }
        } catch (excelErr) {
            console.error("Error en fallback de Excel:", excelErr);
        }
    }
    
    res.json(globalData);
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
