// Build a compact route mapping for import into the app
const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/chrismills/Downloads/0. ROUTE SHEET - APR 2026.xlsm');

const routeSheetNames = wb.SheetNames.filter(n => n.trim().startsWith('ROUTE'));
const allEntries = [];

// Tech name overrides (from MASTER sheet)
const techOverrides = {
  'ROUTE 1': 'Kadeem',
  'ROUTE 2': 'Stephon', 
  'ROUTE 3': 'Jermaine',
  'ROUTE 4': 'Elvin',
  'ROUTE 5': 'Donald',
  'ROUTE 6': 'King',
  'ROUTE 7': 'Ariel',
  'ROUTE 8': 'Malik'
};

routeSheetNames.forEach(sheetName => {
  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  
  const routeNum = sheetName.trim();
  const techName = techOverrides[routeNum] || routeNum;
  const days = (data[1] || []).filter(d => d);
  
  const clientMap = {};
  
  for (let row = 2; row < data.length; row++) {
    const cells = data[row] || [];
    const hasText = cells.some(c => typeof c === 'string' && c.trim().length > 0);
    if (!hasText) continue;
    
    cells.forEach((cell, colIdx) => {
      if (typeof cell === 'string' && cell.trim() && colIdx < days.length) {
        const lines = cell.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l);
        // First line is the primary identifier
        const firstName = lines[0].replace(/\s*-\s*$/, '').trim();
        const key = firstName.substring(0, 50).toUpperCase();
        
        if (!clientMap[key]) {
          clientMap[key] = { name: firstName, fullText: lines.join(' - '), days: [] };
        }
        const day = days[colIdx];
        if (!clientMap[key].days.includes(day)) {
          clientMap[key].days.push(day);
        }
      }
    });
  }
  
  Object.values(clientMap).forEach(entry => {
    // Sort days in week order
    const dayOrder = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
    entry.days.sort((a,b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    
    allEntries.push({
      tech: techName,
      route: routeNum.replace('ROUTE ', 'Route '),
      name: entry.name,
      info: entry.fullText,
      days: entry.days
    });
  });
});

// Output as a compact JS array
console.log('const ROUTE_SCHEDULE = ' + JSON.stringify(allEntries, null, 2) + ';');
console.log('\n// Total entries: ' + allEntries.length);

// Also group by tech and show summary
const byTech = {};
allEntries.forEach(e => {
  if (!byTech[e.tech]) byTech[e.tech] = [];
  byTech[e.tech].push(e);
});

console.log('\n// Summary:');
Object.entries(byTech).forEach(([tech, entries]) => {
  console.log(`// ${tech} (${entries.length} clients):`);
  entries.slice(0, 3).forEach(e => {
    console.log(`//   ${e.name} - ${e.days.join(', ')}`);
  });
});

// Write just the data array to a file
const fs = require('fs');
fs.writeFileSync('/tmp/route-schedule.json', JSON.stringify(allEntries, null, 2));
console.log('\nWritten to /tmp/route-schedule.json');
