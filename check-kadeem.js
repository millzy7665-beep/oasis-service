const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/chrismills/Downloads/Route_Visits_Final_Adjusted.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws);

const TECH_NAME_MAP = { 'king': 'Kingsley', 'stephon': 'Elvin' };
function normalizeTechName(name) {
  const lower = (name || '').trim().toLowerCase();
  return TECH_NAME_MAP[lower] || (name || '').trim();
}

// Kadeem Friday from spreadsheet
const kadeemFri = rows.filter(r => (r['Route Name']||'').trim() === 'Kadeem' && (r['Day']||'').trim() === 'Friday');
console.log('Kadeem Friday in spreadsheet:', kadeemFri.length);
kadeemFri.forEach(r => console.log('  ', r['Client Name'], '|', r['Address']));

// Now check what the grouped entry looks like
const clientMap = {};
rows.forEach(row => {
  const day = (row['Day'] || '').trim();
  const routeNum = String(row['Route #'] || '').trim();
  const techRaw = (row['Route Name'] || '').trim();
  const tech = normalizeTechName(techRaw);
  const clientName = (row['Client Name'] || '').trim();
  const address = (row['Address'] || '').trim();
  if (!clientName || !day) return;
  const normalDay = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
  const key = (tech + '|' + clientName + '|' + address).toUpperCase();
  if (!clientMap[key]) {
    clientMap[key] = { tech, route: 'Route ' + routeNum, name: clientName, address, days: [] };
  }
  if (!clientMap[key].days.includes(normalDay)) clientMap[key].days.push(normalDay);
});

const kadeemEntries = Object.values(clientMap).filter(e => e.tech === 'Kadeem');
const kadeemFriGrouped = kadeemEntries.filter(e => e.days.includes('Friday'));
console.log('\nKadeem entries with Friday after grouping:', kadeemFriGrouped.length);
kadeemFriGrouped.forEach(e => console.log('  ', e.name, '|', e.address, '| Days:', e.days.join(', ')));

// Check for Kadeem entries with very similar names
console.log('\nAll Kadeem entries:');
kadeemEntries.forEach(e => console.log('  ', e.name, '|', e.address, '| Days:', e.days.join(', ')));
