const XLSX = require('xlsx');
const path = require('path');

const excelPath = path.join(__dirname, 'QUERY.xlsx');
console.log("Loading Excel file:", excelPath);
const workbook = XLSX.readFile(excelPath);

const sheetName = 'SALDOS AGUAS';
const sheet = workbook.Sheets[sheetName];
if (!sheet) {
    console.error(`Sheet ${sheetName} not found.`);
    process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
console.log(`Analyzing ${rows.length} rows in sheet ${sheetName}...`);

let foundRows = [];
rows.forEach((row, index) => {
    if (!row || row.length === 0) return;
    const rowStr = row.join(' ').toLowerCase();
    if (rowStr.includes('688') || rowStr.includes('ferrero')) {
        foundRows.push({ index, row });
    }
});

console.log(`Found ${foundRows.length} matching rows for Ferrero Hnos:`);
foundRows.forEach(item => {
    console.log(`Row ${item.index}: ${JSON.stringify(item.row)}`);
});
