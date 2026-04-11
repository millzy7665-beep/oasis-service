const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/chrismills/Downloads/Route_Visits_Final_Adjusted.xlsx');

console.log('Sheet names:', wb.SheetNames);

wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log(`\n=== Sheet: ${name} (${data.length} rows) ===`);
  // Show headers
  if (data.length > 0) {
    console.log('Headers:', JSON.stringify(data[0]));
  }
  // Show first 10 data rows
  data.slice(1, 15).forEach((row, i) => {
    console.log(`Row ${i + 1}:`, JSON.stringify(row));
  });
});
