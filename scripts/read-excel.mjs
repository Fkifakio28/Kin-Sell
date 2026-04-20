import ExcelJS from 'exceljs';

const filePath = String.raw`c:\Users\filik\Downloads\Phone Link\Cahier de recette (test) KIN-SELL.xlsx`;

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);

const sheet = workbook.getWorksheet('TEST');

// Column widths
console.log('=== COLUMN WIDTHS ===');
for (let i = 1; i <= sheet.columnCount; i++) {
  const col = sheet.getColumn(i);
  console.log(`  Col ${i}: width=${col.width}`);
}

// Row heights
console.log('\n=== ROW HEIGHTS ===');
sheet.eachRow({ includeEmpty: true }, (row, n) => {
  if (n <= 10) console.log(`  Row ${n}: height=${row.height}`);
});

// Merges
console.log('\n=== MERGES ===');
console.log(JSON.stringify(sheet.model.merges));

// Detailed cell styles for key rows
for (const rowNum of [3, 6, 7, 8]) {
  console.log(`\n=== ROW ${rowNum} STYLES ===`);
  const row = sheet.getRow(rowNum);
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    console.log(`  Cell [${col}]: value="${typeof cell.value === 'object' ? JSON.stringify(cell.value) : cell.value}"`);
    console.log(`    font: ${JSON.stringify(cell.font)}`);
    console.log(`    fill: ${JSON.stringify(cell.fill)}`);
    console.log(`    alignment: ${JSON.stringify(cell.alignment)}`);
    console.log(`    border: ${JSON.stringify(cell.border)}`);
  });
}
