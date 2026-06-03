const fs = require('fs');
const path = require('path');

// Parser de fechas robusto para formatos típicos en archivos CSV (DD/MM/YYYY)
function parseCsvDate(val) {
    if (!val) return '';
    const clean = String(val).trim();
    const match = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
    }
    return '';
}

// Parseador de CSV robusto con delimitador punto y coma (;)
function parseCsvContent(csvText) {
    if (!csvText) return [];
    
    const lines = csvText.split(/\r?\n/);
    if (lines.length === 0) return [];
    
    const headerLine = lines[0];
    const headers = headerLine.split(';').map(h => {
        let clean = h.trim();
        if (clean.startsWith('"') && clean.endsWith('"')) {
            clean = clean.slice(1, -1).trim();
        }
        return clean;
    });
    
    const colCodigoIdx = headers.findIndex(h => /ArticuloCodigo/i.test(h));
    const colProductoIdx = headers.findIndex(h => /ArticuloDescrip/i.test(h));
    const colVencIdx = headers.findIndex(h => /FechaVenc/i.test(h));
    const colCantIdx = headers.findIndex(h => /Cantidad/i.test(h));
    const colLoteIdx = headers.findIndex(h => /Lote/i.test(h));
    
    console.log(`\n[CSV Parser] Índices de columnas identificados:`);
    console.log(` - Código:     Idx ${colCodigoIdx} ("${headers[colCodigoIdx] || ''}")`);
    console.log(` - Producto:   Idx ${colProductoIdx} ("${headers[colProductoIdx] || ''}")`);
    console.log(` - Vencimiento: Idx ${colVencIdx} ("${headers[colVencIdx] || ''}")`);
    console.log(` - Cantidad:   Idx ${colCantIdx} ("${headers[colCantIdx] || ''}")`);
    console.log(` - Lote:       Idx ${colLoteIdx} ("${headers[colLoteIdx] || ''}")`);
    
    if (colCodigoIdx === -1 || colProductoIdx === -1 || colCantIdx === -1) {
        throw new Error("El archivo CSV no posee el formato de columnas requerido.");
    }
    
    const parsedData = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cells = line.split(';').map(c => {
            let clean = c.trim();
            if (clean.startsWith('"') && clean.endsWith('"')) {
                clean = clean.slice(1, -1).trim();
            }
            return clean;
        });
        
        const codigo = colCodigoIdx < cells.length ? cells[colCodigoIdx] : '';
        const producto = colProductoIdx < cells.length ? cells[colProductoIdx] : 'Sin Nombre';
        const lote = (colLoteIdx !== -1 && colLoteIdx < cells.length) ? cells[colLoteIdx] : 'S/L';
        const cantidadRaw = colCantIdx < cells.length ? cells[colCantIdx] : '0';
        const cantidad = parseFloat(cantidadRaw.replace(',', '.')) || 0;
        const vencRaw = colVencIdx < cells.length ? cells[colVencIdx] : '';
        const fechaVencimiento = parseCsvDate(vencRaw);
        
        if (!codigo && producto === 'Sin Nombre') continue;
        
        let categoria = 'Almacén';
        const prodLower = producto.toLowerCase();
        if (/queso|lact|yog|manteca|crema|leche/i.test(prodLower)) {
            categoria = 'Lácteos';
        } else if (/bebida|coca|fanta|sprite|cerveza|agua|gaseosa|jugo/i.test(prodLower)) {
            categoria = 'Bebidas';
        } else if (/jam[oó]n|salame|fiambr|mortadela|panceta/i.test(prodLower)) {
            categoria = 'Fiambrería';
        }
        
        parsedData.push({
            codigo,
            producto,
            categoria,
            lote: lote || 'S/L',
            cantidad,
            fechaVencimiento
        });
    }
    
    return parsedData;
}

// Ejecutar prueba
try {
    const csvPath = "C:\\Users\\Usuario\\Downloads\\StockDetallado_20260529_1749.csv";
    console.log(`[Test] Intentando leer archivo CSV en: ${csvPath}`);
    
    if (!fs.existsSync(csvPath)) {
        console.error(`[Error] El archivo de prueba no existe en la ruta indicada.`);
        process.exit(1);
    }
    
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const result = parseCsvContent(csvText);
    
    console.log(`\n======================================================`);
    console.log(`✅ ¡Prueba de Parseo Exitosa!`);
    console.log(`Total de registros normalizados: ${result.length}`);
    console.log(`======================================================`);
    
    console.log(`\nMuestra de los primeros 5 registros parseados:`);
    console.log(JSON.stringify(result.slice(0, 5), null, 2));
    
} catch (e) {
    console.error(`[🔴 ERROR DE PARSEO]:`, e.message);
}
