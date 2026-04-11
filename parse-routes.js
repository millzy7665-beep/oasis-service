const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/chrismills/Downloads/0. ROUTE SHEET - APR 2026.xlsm');

// Parse individual route sheets
const allClients = [];
const routeSheetNames = wb.SheetNames.filter(n => n.trim().startsWith('ROUTE'));

routeSheetNames.forEach(sheetName => {
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  
  const routeHeader = (data[0] || []).find(c => c && typeof c === 'string' && c.includes('ROUTE'));
  const routeNum = sheetName.trim();
  const techName = routeHeader ? routeHeader.replace(/ROUTE\s*#\d+\s*/i, '').trim() : '';
  
  const days = (data[1] || []).filter(d => d);
  
  // Track clients per day column
  const dayClients = {}; // day -> [clients]
  days.forEach(d => { dayClients[d] = []; });
  
  for (let row = 2; row < data.length; row++) {
    const cells = data[row] || [];
    const hasText = cells.some(c => typeof c === 'string' && c.trim().length > 0);
    if (hasText) {
      cells.forEach((cell, colIdx) => {
        if (typeof cell === 'string' && cell.trim() && colIdx < days.length) {
          dayClients[days[colIdx]].push(cell.trim());
        }
      });
    }
  }
  
  // Build unique client list for this route
  const clientMap = {};
  Object.entries(dayClients).forEach(([day, clients]) => {
    clients.forEach(raw => {
      // Normalize: use first line as key
      const firstLine = raw.split(/\r?\n/)[0].trim();
      const key = firstLine.substring(0, 50).toUpperCase();
      if (!clientMap[key]) {
        clientMap[key] = { raw, days: [] };
      }
      if (!clientMap[key].days.includes(day)) {
        clientMap[key].days.push(day);
      }
    });
  });
  
  Object.values(clientMap).forEach(entry => {
    allClients.push({
      tech: techName,
      route: routeNum,
      raw: entry.raw.replace(/\r\n/g, ' | ').replace(/\n/g, ' | '),
      days: entry.days
    });
  });
});

console.log('Total route entries: ' + allClients.length);
console.log('\nBy tech:');
const byTech = {};
allClients.forEach(c => {
  if (!byTech[c.tech]) byTech[c.tech] = 0;
  byTech[c.tech]++;
});
Object.entries(byTech).forEach(([t,n]) => console.log('  ' + t + ': ' + n + ' clients'));

console.log('\nSample (first 20):');
allClients.slice(0, 20).forEach(c => {
  console.log(c.tech + ' | ' + c.days.join(',') + ' | ' + c.raw.substring(0, 70));
});

// Also show some multi-day clients
console.log('\nMulti-day clients (sample):');
allClients.filter(c => c.days.length > 1).slice(0, 15).forEach(c => {
  console.log(c.tech + ' | ' + c.days.join(',') + ' | ' + c.raw.substring(0, 70));
});

// Output as JSON for reference
const fs = require('fs');
fs.writeFileSync('/tmp/route-data.json', JSON.stringify(allClients, null, 2));
console.log('\nFull data written to /tmp/route-data.json');
