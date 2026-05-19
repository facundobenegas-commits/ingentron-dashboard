const XLSX = require('xlsx');
const path = require('path');

const filePath = 'c:/Users/FACU/Desktop/mesa de trabajo/QUERY.xlsx';
try {
    const workbook = XLSX.readFile(filePath);
    console.log("Worksheet Names:", workbook.SheetNames);
    
    workbook.SheetNames.forEach(sheetName => {
        console.log(`\n--- Sheet: ${sheetName} ---`);
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        console.log("Total rows:", rows.length);
        console.log("First 10 rows:");
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            console.log(`Row ${i}:`, rows[i] ? rows[i].slice(0, 15) : 'empty');
        }
    });
} catch (e) {
    console.error("Error reading file:", e);
}
