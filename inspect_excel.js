const ExcelJS = require('exceljs');

async function inspect() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('WO_TEMPLATE.xlsm');

  workbook.eachSheet((worksheet, sheetId) => {
    console.log(`Sheet ID: ${sheetId}, Name: ${worksheet.name}`);

    // Print first 20 rows and 10 columns to identify fields
    for (let i = 1; i <= 20; i++) {
      let rowValues = [];
      for (let j = 1; j <= 10; j++) {
        const cell = worksheet.getCell(i, j);
        rowValues.push(cell.value ? cell.value.toString().substring(0, 20) : '');
      }
      console.log(`Row ${i}: ${rowValues.join(' | ')}`);
    }
  });
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
