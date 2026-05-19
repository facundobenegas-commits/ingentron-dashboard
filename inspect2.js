const XLSX = require('xlsx');
const filePath = 'c:/Users/FACU/Desktop/mesa de trabajo/QUERY.xlsx';
try {
    const workbook = XLSX.readFile(filePath);
    
    ['TRENQUE LAUQUEN', 'SALDOS NUEVO'].forEach(sheetName => {
        console.log(`\n--- ${sheetName} ---`);
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        for (let i = 0; i < Math.min(rows.length, 25); i++) {
            if (rows[i] && rows[i].length > 0) {
                console.log(`Row ${i}:`, rows[i].slice(0, 10));
            }
        }
    });
} catch (e) {
    console.error(e);
}
