const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/chrismills/Downloads/Route_Visits_Final_Adjusted.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws);

console.log('Total rows:', rows.length);
console.log('Headers:', Object.keys(rows[0]));
console.log('First 3 rows:', JSON.stringify(rows.slice(0, 3), null, 2));
console.log();

// Count per tech per day
const counts = {};
rows.forEach(r => {
  const tech = (r['Route Name'] || '').trim();
  const day = (r['Day'] || '').trim();
  const client = (r['Client Name'] || '').trim();
  if (!tech || !day || !client) return;
  const key = tech + '|' + day;
  if (!counts[key]) counts[key] = [];
  counts[key].push(client);
});

const techs = [...new Set(rows.map(r => (r['Route Name'] || '').trim()))].filter(Boolean).sort();
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

techs.forEach(tech => {
  console.log('--- ' + tech + ' ---');
  days.forEach(day => {
    const clients = counts[tech + '|' + day] || [];
    console.log('  ' + day + ': ' + clients.length + ' clients');
  });
  console.log();
});

// Now simulate what the app import does
const TECH_NAME_MAP = { 'king': 'Kingsley', 'stephon': 'Elvin' };
function normalizeTechName(name) {
  const lower = (name || '').trim().toLowerCase();
  return TECH_NAME_MAP[lower] || (name || '').trim();
}

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
  if (!clientMap[key].days.includes(normalDay)) {
    clientMap[key].days.push(normalDay);
  }
});

const routeEntries = Object.values(clientMap);
console.log('=== AFTER GROUPING ===');
console.log('Unique route entries (clients):', routeEntries.length);
console.log();

// Count unique entries per tech per day (what the app would show)
const appCounts = {};
routeEntries.forEach(entry => {
  entry.days.forEach(day => {
    const key = entry.tech + '|' + day;
    if (!appCounts[key]) appCounts[key] = 0;
    appCounts[key]++;
  });
});

const appTechs = [...new Set(routeEntries.map(e => e.tech))].sort();
appTechs.forEach(tech => {
  console.log('--- ' + tech + ' (app) ---');
  days.forEach(day => {
    const count = appCounts[tech + '|' + day] || 0;
    console.log('  ' + day + ': ' + count + ' clients');
  });
  console.log();
});

// Show Ariel Monday specifics
console.log('=== ARIEL MONDAY - FROM SPREADSHEET ===');
const arielMon = rows.filter(r => (r['Route Name'] || '').trim() === 'Ariel' && (r['Day'] || '').trim() === 'Monday');
arielMon.forEach(r => console.log('  ', r['Client Name'], '|', r['Address']));
console.log('Count:', arielMon.length);

console.log();
console.log('=== ARIEL - GROUPED ENTRIES WITH MONDAY ===');
routeEntries.filter(e => e.tech === 'Ariel' && e.days.includes('Monday')).forEach(e => {
  console.log('  ', e.name, '|', e.address, '| Days:', e.days.join(', '));
});
