const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Helper para retardo
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Cargar configuración local de config.json, variables de entorno o fallbacks
let config = {
    digipUser: process.env.DIGIP_USER || 'facundo benegas',
    digipPass: process.env.DIGIP_PASS || 'Facundo2026',
    syncToken: process.env.SYNC_TOKEN || 'TokenIngentronSeguro2026',
    syncUrl: 'https://ingentron.onrender.com/api/update-stock',
    intervalHours: 2,
    headless: true,
    downloadPath: './downloads'
};

const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
    try {
        const loadedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        config = { ...config, ...loadedConfig };
        console.log(`[Config] Archivo config.json cargado correctamente.`);
    } catch (e) {
        console.error(`[Config] Error parseando config.json, usando variables de entorno o valores por defecto.`, e.message);
    }
} else {
    console.log(`[Config] No se encontro config.json. Usando variables de entorno o valores por defecto.`);
}

// Asegurar directorios de descargas y capturas de pantalla
const downloadDir = path.resolve(__dirname, config.downloadPath || './downloads');
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}

const screenshotsDir = path.resolve(__dirname, './screenshots');
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Helper para buscar el archivo descargado más reciente y válido (Excel o CSV) en una o varias carpetas
function findNewestExcelFile(dirs) {
    const folders = Array.isArray(dirs) ? dirs : [dirs];
    let newestFile = null;
    let newestTime = 0;

    for (const dir of folders) {
        if (!dir || !fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const ext = path.extname(file).toLowerCase();
                if ((ext === '.xlsx' || ext === '.xls' || ext === '.csv') && !file.startsWith('~$')) {
                    const stats = fs.statSync(fullPath);
                    if (stats.mtimeMs > newestTime) {
                        newestTime = stats.mtimeMs;
                        newestFile = fullPath;
                    }
                }
            }
        } catch (e) {
            console.error(`[Scanner] Error leyendo directorio ${dir}:`, e.message);
        }
    }
    return newestFile;
}

// Parser de fechas robusto de Excel y strings
function parseExcelDate(val) {
    if (!val) return '';
    
    // Si viene como número de fecha de Excel (ej: 46161)
    if (typeof val === 'number') {
        const date = new Date((val - 25569) * 86400 * 1000);
        if (!isNaN(date.getTime())) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }
    
    // Si viene como string
    if (typeof val === 'string') {
        const clean = val.trim();
        // Formato estándar YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
        
        // Formato DD/MM/YYYY o DD-MM-YYYY
        const match = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (match) {
            const day = match[1].padStart(2, '0');
            const month = match[2].padStart(2, '0');
            let year = match[3];
            if (year.length === 2) {
                year = '20' + year;
            }
            return `${year}-${month}-${day}`;
        }
    }
    
    return '';
}

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
    
    // Separar por saltos de línea (soportando LF y CRLF)
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
    
    // Encontrar índices de columnas ignorando diferencias de codificación y tildes
    const colCodigoIdx = headers.findIndex(h => /ArticuloCodigo/i.test(h));
    const colProductoIdx = headers.findIndex(h => /ArticuloDescrip/i.test(h));
    const colVencIdx = headers.findIndex(h => /FechaVenc/i.test(h));
    const colCantIdx = headers.findIndex(h => /Cantidad/i.test(h));
    const colLoteIdx = headers.findIndex(h => /Lote/i.test(h));
    
    console.log(`[CSV Parser] Mapeos identificados:`);
    console.log(` - Código:     Idx ${colCodigoIdx} ("${headers[colCodigoIdx] || ''}")`);
    console.log(` - Producto:   Idx ${colProductoIdx} ("${headers[colProductoIdx] || ''}")`);
    console.log(` - Vencimiento: Idx ${colVencIdx} ("${headers[colVencIdx] || ''}")`);
    console.log(` - Cantidad:   Idx ${colCantIdx} ("${headers[colCantIdx] || ''}")`);
    console.log(` - Lote:       Idx ${colLoteIdx} ("${headers[colLoteIdx] || ''}")`);
    
    if (colCodigoIdx === -1 || colProductoIdx === -1 || colCantIdx === -1) {
        throw new Error("El archivo CSV no posee el formato de columnas requerido (ArticuloCodigo, ArticuloDescripcion/Descripción, Cantidad).");
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
        
        // Asignación de categorías inteligente
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

function getSystemChromePath() {
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env.USERPROFILE + '\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
    
    for (const p of paths) {
        if (p && fs.existsSync(p)) {
            console.log(`[RPA] Detectado navegador del sistema en: ${p}`);
            return p;
        }
    }
    return null;
}

// Función para subir el snapshot local de stock al servidor (ligero y rápido)
async function uploadLocalSnapshot() {
    const localSnapshotPath = path.join(__dirname, 'stock_local_snapshot.json');
    if (!fs.existsSync(localSnapshotPath)) {
        console.log(`[Lightweight Sync] No existe un archivo de snapshot local (${localSnapshotPath}) para subir.`);
        return false;
    }
    
    try {
        const payload = JSON.parse(fs.readFileSync(localSnapshotPath, 'utf8'));
        if (!Array.isArray(payload) || payload.length === 0) {
            console.log(`[Lightweight Sync] El archivo de snapshot local está vacío o es inválido.`);
            return false;
        }
        
        // Cargar el histórico local para resiliencia en la nube
        const localHistoryPath = path.join(__dirname, 'stock_history.json');
        let localHistory = {};
        if (fs.existsSync(localHistoryPath)) {
            try {
                localHistory = JSON.parse(fs.readFileSync(localHistoryPath, 'utf8')) || {};
            } catch (e) {}
        }
        
        // Estructura robusta para resiliencia total
        const uploadPayload = {
            current: payload,
            history: localHistory
        };
        
        console.log(`[Lightweight Sync] Subiendo snapshot e histórico local (${payload.length} lotes, ${Object.keys(localHistory).length} días de historial) a ${config.syncUrl}...`);
        const resUpload = await fetch(config.syncUrl, {
            method: 'POST',
            headers: {
                'x-sync-token': config.syncToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(uploadPayload)
        });

        if (!resUpload.ok) {
            throw new Error(`Servidor retorno codigo de respuesta HTTP: ${resUpload.status}`);
        }
        
        const resultUploadJson = await resUpload.json();
        console.log(`[Lightweight Sync] ¡Carga de resiliencia del stock local EXITOSA!`, resultUploadJson);
        return true;
    } catch (err) {
        console.error(`[Lightweight Sync] Error durante la carga del snapshot local:`, err.message);
        return false;
    }
}

// Proceso principal de Scraping y Carga
async function runDigipScraper(isMidnightCut = false) {
    const timestamp = new Date().toLocaleString();
    console.log(`\n[${timestamp}] 🔄 Iniciando ciclo de scraping de Digip WMS (${isMidnightCut ? 'Corte de Medianoche' : 'Tiempo Real'})...`);

    // Validar si las credenciales son las predeterminadas
    if (config.digipUser === 'usuario_placeholder' || config.digipPass === 'pass_placeholder') {
        console.warn(`[⚠️ ADVERTENCIA] Las credenciales de Digip WMS no estan configuradas.`);
        console.warn(`Por favor, complete su usuario y clave en 'config.json' para iniciar.`);
        return;
    }

    let browser;
    try {
        const systemChromePath = getSystemChromePath();
        const launchOptions = {
            headless: config.headless !== false ? 'new' : false,
            defaultViewport: null,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        };
        
        if (systemChromePath) {
            launchOptions.executablePath = systemChromePath;
        } else {
            console.log(`[RPA] Usando Chromium por defecto de Puppeteer en la cache...`);
        }
        
        console.log(`[RPA] Levantando navegador headless (${systemChromePath ? 'Nativo del Sistema' : 'Chromium Cache'})...`);
        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();
        
        // Configurar la descarga en Puppeteer headless mediante CDP
        console.log(`[RPA] Configurando carpeta de descargas: ${downloadDir}`);
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadDir
        });

        console.log(`[RPA] Navegando a la zona de Reportes de Stock...`);
        await page.goto('https://app.digipwms.com/Reportes/Stock', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        const urlActual = page.url();
        console.log(`[RPA] URL cargada: ${urlActual}`);

        // Detectar si fuimos redirigidos al Login o si la página requiere autenticación
        const necesitaAutenticacion = await page.evaluate(() => {
            return !!(document.querySelector('input[type="password"]') || 
                      document.querySelector('[name*="Login"]') || 
                      document.querySelector('[href*="Login"]') ||
                      document.querySelector('form[action*="Login" i]'));
        });

        if (necesitaAutenticacion) {
            console.log(`[RPA] Formulario de inicio de sesion detectado. Iniciando sesion con el usuario: ${config.digipUser}...`);
            
            // Buscar campos usando selectores flexibles en cascada
            const selectoresUsuario = ['input[type="text"]', 'input[type="email"]', 'input[name*="user" i]', 'input[name*="email" i]', '#Email', '#Username'];
            const selectoresClave = ['input[type="password"]', 'input[name*="pass" i]', '#Password'];
            const selectoresBoton = ['button[type="submit"]', 'input[type="submit"]', '.btn-primary', 'button.login-button', '#btnLogin', 'button'];

            // Rellenar Usuario
            let usuarioRellenado = false;
            for (const selector of selectoresUsuario) {
                try {
                    if (await page.$(selector)) {
                        await page.type(selector, config.digipUser);
                        usuarioRellenado = true;
                        console.log(`[RPA] Campo usuario cargado usando selector: "${selector}"`);
                        break;
                    }
                } catch (e) {}
            }
            if (!usuarioRellenado) throw new Error("No se pudo localizar el campo del nombre de usuario en Digip WMS.");

            // Rellenar Contraseña
            let claveRellenada = false;
            for (const selector of selectoresClave) {
                try {
                    if (await page.$(selector)) {
                        await page.type(selector, config.digipPass);
                        claveRellenada = true;
                        console.log(`[RPA] Campo contraseña cargado usando selector: "${selector}"`);
                        break;
                    }
                } catch (e) {}
            }
            if (!claveRellenada) throw new Error("No se pudo localizar el campo de contraseña en Digip WMS.");

            // Hacer clic en Ingresar
            let clickExitoso = false;
            for (const selector of selectoresBoton) {
                try {
                    const btn = await page.$(selector);
                    if (btn) {
                        console.log(`[RPA] Presionando boton de ingreso con selector: "${selector}"`);
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }),
                            page.click(selector)
                        ]);
                        clickExitoso = true;
                        break;
                    }
                } catch (e) {}
            }

            if (!clickExitoso) {
                console.log(`[RPA] No se clickeo boton de forma directa. Intentando pulsar tecla Enter...`);
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }),
                    page.keyboard.press('Enter')
                ]);
            }

            console.log(`[RPA] Autenticacion enviada. URL actual: ${page.url()}`);
        } else {
            console.log(`[RPA] Sesion activa o acceso directo correcto. Saltando login.`);
        }

        // Registrar archivos existentes en la carpeta de descargas antes de iniciar la descarga
        const systemDownloadsDir = path.join(process.env.USERPROFILE || 'C:\\Users\\Usuario', 'Downloads');
        const dirsToScan = [downloadDir, systemDownloadsDir];
        const archivoInicial = findNewestExcelFile(dirsToScan);
        const archivoInicialTime = archivoInicial ? fs.statSync(archivoInicial).mtimeMs : 0;

        // Optimización masiva: Acceder directamente a la URL de descarga de Excel para mayor rapidez y estabilidad
        const DIRECT_DOWNLOAD_URL = 'https://app.digipwms.com/Reportes/Stock/DescargarStockDetalle?AreaId=0&PropiedadDetalleId=0&ArticuloId=0';
        console.log(`[RPA] Descargando Excel de stock directamente desde: ${DIRECT_DOWNLOAD_URL}`);
        
        try {
            await page.goto(DIRECT_DOWNLOAD_URL, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
        } catch (gotoErr) {
            // Nota: En Puppeteer, navegar a un enlace de descarga de archivo directo a veces lanza un error de navegacion abortada.
            // Esto es normal y esperado ya que Chromium no renderiza una pagina HTML, sino que descarga el archivo.
            console.log(`[RPA] Descarga directa iniciada (Navegacion finalizada: ${gotoErr.message})`);
        }

        // Esperar la descarga del Excel
        console.log(`[RPA] Esperando que se complete la descarga del reporte...`);
        let excelDescargado = null;
        const timeoutDescarga = 90000; // 90 segundos
        const startDownloadTime = Date.now();

        while (Date.now() - startDownloadTime < timeoutDescarga) {
            await delay(1000);
            const candidato = findNewestExcelFile(dirsToScan);
            if (candidato) {
                const stats = fs.statSync(candidato);
                // Si es un archivo nuevo (modificado despues del click de descarga)
                if (stats.mtimeMs > archivoInicialTime) {
                    const ext = path.extname(candidato).toLowerCase();
                    const temporal = ext === '.crdownload' || ext === '.tmp' || candidato.includes('.tmp');
                    
                    // Si no es temporal y no se ha modificado en los ultimos 2 segundos, consideramos la descarga finalizada
                    if (!temporal && (Date.now() - stats.mtimeMs) > 1500) {
                        excelDescargado = candidato;
                        break;
                    }
                }
            }
        }

        if (!excelDescargado) {
            throw new Error("Tiempo de espera agotado sin detectar el archivo descargado (Excel o CSV).");
        }
        console.log(`[Parser] ¡Archivo detectado en disco!: ${excelDescargado}`);

        const extDesc = path.extname(excelDescargado).toLowerCase();
        let stockResult = [];

        if (extDesc === '.csv') {
            console.log(`[Parser] Detectado formato CSV. Procesando y parseando con parseCsvContent...`);
            const csvText = fs.readFileSync(excelDescargado, 'utf8');
            stockResult = parseCsvContent(csvText);
        } else {
            console.log(`[Parser] Detectado formato Excel. Procesando y parseando con XLSX...`);
            const workbook = XLSX.readFile(excelDescargado);
            const firstSheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[firstSheetName];
            const filasPlanas = XLSX.utils.sheet_to_json(sheet, { defval: "" });

            console.log(`[Parser] Leidas ${filasPlanas.length} filas del archivo Excel.`);

            if (filasPlanas.length > 0) {
                // Analizar la primera fila para identificar indices/columnas de forma dinámica e insensible a mayusculas
                const primerRegistro = filasPlanas[0];
                const columnasDisponibles = Object.keys(primerRegistro);

                const colCodigo = columnasDisponibles.find(k => /ean|bar|c[oó]digo.*bar|c[oó]digo/i.test(k));
                const colProducto = columnasDisponibles.find(k => /descrip|prod|art[ií]culo|nombre/i.test(k));
                const colLote = columnasDisponibles.find(k => /lote|partida|batch/i.test(k));
                const colCantidad = columnasDisponibles.find(k => /cant|stock|fisico|dispon|unidades/i.test(k));
                const colVencimiento = columnasDisponibles.find(k => /venc|f\..*venc|caducidad|expir/i.test(k));

                console.log(`[Parser] Mapeos dinamicos de columnas resueltos:`);
                console.log(` - EAN/Código:    "${colCodigo || 'No detectado'}"`);
                console.log(` - Producto/Desc: "${colProducto || 'No detectado'}"`);
                console.log(` - Lote/Partida:  "${colLote || 'No detectado'}"`);
                console.log(` - Cantidad/Stk:  "${colCantidad || 'No detectado'}"`);
                console.log(` - Vencimiento:   "${colVencimiento || 'No detectado'}"`);

                for (const row of filasPlanas) {
                    const codigo = colCodigo ? String(row[colCodigo]).trim() : '';
                    const producto = colProducto ? String(row[colProducto]).trim() : 'Sin Nombre';
                    const lote = colLote ? String(row[colLote]).trim() : 'S/L';
                    const cantidad = colCantidad ? parseFloat(row[colCantidad]) || 0 : 0;
                    const vencRaw = colVencimiento ? row[colVencimiento] : '';
                    const fechaVencimiento = parseExcelDate(vencRaw);

                    // Omitir filas invalidas o vacias
                    if (!codigo && producto === 'Sin Nombre') continue;

                    // Categoria inteligente basada en palabras clave
                    let categoria = 'Almacén';
                    const prodLower = producto.toLowerCase();
                    if (/queso|lact|yog|manteca|crema|leche/i.test(prodLower)) {
                        categoria = 'Lácteos';
                    } else if (/bebida|coca|fanta|sprite|cerveza|agua|gaseosa|jugo/i.test(prodLower)) {
                        categoria = 'Bebidas';
                    } else if (/jam[oó]n|salame|fiambr|mortadela|panceta/i.test(prodLower)) {
                        categoria = 'Fiambrería';
                    }

                    stockResult.push({
                        codigo,
                        producto,
                        categoria,
                        lote,
                        cantidad,
                        fechaVencimiento
                    });
                }
            }
        }

        console.log(`[Parser] Normalizados ${stockResult.length} registros listos para subir.`);

        // Limpiar el Excel temporal de disco inmediatamente
        try {
            fs.unlinkSync(excelDescargado);
            console.log(`[Parser] Limpieza exitosa: Archivo temporal de stock eliminado.`);
        } catch (unlinkErr) {
            console.warn(`[Parser] No se pudo eliminar el excel de stock: ${unlinkErr.message}`);
        }

        // Guardar snapshot local y subir a Render
        if (stockResult.length > 0) {
            // Guardar el snapshot localmente para persistencia y reintentos ligeros
            const localSnapshotPath = path.join(__dirname, 'stock_local_snapshot.json');
            fs.writeFileSync(localSnapshotPath, JSON.stringify(stockResult, null, 2));
            console.log(`[Parser] Guardado snapshot local de stock (${stockResult.length} registros) en: ${localSnapshotPath}`);
            
            // --- ACTUALIZAR HISTÓRICO DIARIO LOCAL (SOLO SI ES CORTE DE MEDIANOCHE) ---
            if (isMidnightCut) {
                const localDate = new Date(new Date().getTime() - 3 * 3600 * 1000); // Argentina UTC-3
                localDate.setDate(localDate.getDate() - 1); // Restar 1 día para registrar el día que acaba de terminar (ayer)
                const targetDateStr = localDate.toISOString().split('T')[0];
                
                const localHistoryPath = path.join(__dirname, 'stock_history.json');
                let localHistory = {};
                if (fs.existsSync(localHistoryPath)) {
                    try {
                        localHistory = JSON.parse(fs.readFileSync(localHistoryPath, 'utf8')) || {};
                    } catch (e) {}
                }
                localHistory[targetDateStr] = stockResult;
                
                // Mantener solo los últimos 15 días de capturas
                const dates = Object.keys(localHistory).sort();
                if (dates.length > 15) {
                    const datesToRemove = dates.slice(0, dates.length - 15);
                    for (const d of datesToRemove) {
                        delete localHistory[d];
                    }
                }
                fs.writeFileSync(localHistoryPath, JSON.stringify(localHistory, null, 2));
                console.log(`[Parser] Histórico diario local de 15 días actualizado con el corte del día finalizado: ${targetDateStr}`);
            } else {
                console.log(`[Parser] Sincronización en tiempo real. No se modifica el histórico local.`);
            }
            
            // Subir de inmediato
            await uploadLocalSnapshot();
        } else {
            console.log(`[RPA] No se encontraron registros de stock validos para sincronizar.`);
        }

    } catch (err) {
        console.error(`[🔴 ERROR EN RPA DIGIP]:`, err.message);
        
        // Guardar captura de pantalla en caso de fallo para depurar selectors
        if (browser) {
            try {
                const pages = await browser.pages();
                if (pages.length > 0) {
                    const errorScreenshotPath = path.join(screenshotsDir, 'error_sync_digip.png');
                    await pages[0].screenshot({ path: errorScreenshotPath, fullPage: true });
                    console.log(`[RPA] Captura de pantalla de error guardada en: ${errorScreenshotPath}`);
                }
            } catch (screenshotErr) {
                console.error(`[RPA] No se pudo guardar la captura de error:`, screenshotErr.message);
            }
        }
    } finally {
        if (browser) {
            console.log(`[RPA] Cerrando navegador Chromium.`);
            await browser.close();
        }
    }
}

// Función para calcular los milisegundos restantes hasta el próximo corte diario (00:00:00 hs de Argentina, UTC-3)
function getMsUntilMidnight() {
    const now = new Date();
    const argOffset = -3; // UTC-3 para Argentina
    
    // Obtener fecha y hora desplazada a la zona horaria de Argentina
    const nowArg = new Date(now.getTime() + (argOffset * 60 + now.getTimezoneOffset()) * 60 * 1000);
    
    // Crear el objeto de fecha para la medianoche del día siguiente
    const midnightArg = new Date(nowArg);
    midnightArg.setDate(nowArg.getDate() + 1);
    midnightArg.setHours(0, 0, 0, 0);
    
    // Calcular diferencia en tiempo absoluto real
    const diffMs = midnightArg.getTime() - nowArg.getTime();
    
    console.log(`[Programador] Hora actual local (Arg): ${nowArg.toLocaleString()}`);
    console.log(`[Programador] Siguiente corte diario programado (Arg): ${midnightArg.toLocaleString()}`);
    console.log(`[Programador] Tiempo restante hasta el corte diario: ${Math.round(diffMs / 1000 / 60)} minutos.`);
    
    return diffMs;
}

// Bucle inteligente de ejecución diaria y periódica
async function scheduleDailySync() {
    console.log("=============================================================");
    console.log("🔄 SINCRONIZADOR DE VENCIMIENTOS DE STOCK - DIGIP WMS (RPA)");
    console.log(`Modo: Scraping en tiempo real (cada 10 min) + Corte de Medianoche`);
    console.log(`URL Destino Render: ${config.syncUrl}`);
    console.log("=============================================================");
    
    // 1. Carga inicial / verificación de hoy
    const localSnapshotPath = path.join(__dirname, 'stock_local_snapshot.json');
    let hasTodaySnapshot = false;
    if (fs.existsSync(localSnapshotPath)) {
        try {
            const stats = fs.statSync(localSnapshotPath);
            const todayStr = new Date(new Date().getTime() - 3 * 3600 * 1000).toISOString().split('T')[0];
            const fileDateStr = new Date(stats.mtimeMs - 3 * 3600 * 1000).toISOString().split('T')[0];
            if (todayStr === fileDateStr) {
                hasTodaySnapshot = true;
            }
        } catch (e) {}
    }
    
    if (hasTodaySnapshot) {
        console.log(`\n[Programador] Encontrado snapshot local de hoy. Subiendo copia al servidor...`);
        await uploadLocalSnapshot();
    } else {
        console.log(`\n[Programador] No se encontró snapshot de hoy. Iniciando Scraping RPA inicial en tiempo real...`);
        await runDigipScraper(false);
    }
    
    // 2. Iniciar el bucle de scraping periódico en tiempo real cada 2 minutos
    const scrapeIntervalMs = 2 * 60 * 1000; // 2 minutos
    console.log(`[Programador] Programando scraping periódico en tiempo real cada 2 minutos.`);
    setInterval(async () => {
        console.log(`\n[Programador] Ejecutando scraping periódico en tiempo real...`);
        try {
            await runDigipScraper(false);
        } catch (err) {
            console.error("[Programador] Error durante el scraping periódico en tiempo real:", err.message);
        }
    }, scrapeIntervalMs);
    
    // 3. Iniciar el bucle diario para tomar la foto final a la medianoche (00:00 hs de Argentina)
    const runNext = () => {
        const delayMs = getMsUntilMidnight();
        
        setTimeout(async () => {
            console.log("\n[Programador] ¡Es medianoche (00:00 hs)! Iniciando Scraping RPA para el corte de medianoche...");
            try {
                await runDigipScraper(true);
            } catch (err) {
                console.error("[Programador] Error durante la ejecución del corte de medianoche:", err.message);
            }
            // Programar el siguiente corte diario de forma recursiva
            runNext();
        }, delayMs);
    };
    
    runNext();
}

// Iniciar programador continuo
scheduleDailySync();
