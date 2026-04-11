const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/chrismills/Downloads/Route_Visits_Final_Adjusted.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws);

const TECH_NAME_MAP = { 'king': 'Kingsley', 'stephon': 'Elvin' };
function normalizeTechName(name) {
  const lower = (name || '').trim().toLowerCase();
  return TECH_NAME_MAP[lower] || (name || '').trim();
}

const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Build route entries (same as app)
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

const routeEntries = Object.values(clientMap);
routeEntries.forEach(e => e.days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)));

// Simulate exact-match import into empty client list
const clients = [];
let matched = 0, created = 0;

routeEntries.forEach(entry => {
  const eName = entry.name.toLowerCase().trim();
  const eAddr = entry.address.toLowerCase().trim();
  const eTech = entry.tech.toLowerCase().trim();
  let match = clients.find(c =>
    c.name && c.name.toLowerCase().trim() === eName &&
    c.address && c.address.toLowerCase().trim() === eAddr &&
    c.technician && c.technician.toLowerCase().trim() === eTech
  );

  if (match) {
    const existing = match.serviceDays || [];
    entry.days.forEach(d => { if (!existing.includes(d)) existing.push(d); });
    existing.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    match.serviceDays = existing;
    match.route = entry.route;
    matched++;
  } else {
    clients.push({
      id: 'c_' + Math.random().toString(36).substr(2, 9),
      name: entry.name,
      address: entry.address,
      contact: '',
      technician: entry.tech,
      route: entry.route,
      serviceDays: entry.days
    });
    created++;
  }
});

console.log(`Matched: ${matched}, Created: ${created}, Total clients: ${clients.length}`);
console.log();

// Count per tech per day
const techs = [...new Set(clients.map(c => c.technician))].sort();
techs.forEach(tech => {
  const techClients = clients.filter(c => c.technician === tech);
  console.log(`--- ${tech} (${techClients.length} total clients) ---`);
  DAY_ORDER.forEach(day => {
    const count = techClients.filter(c => c.serviceDays && c.serviceDays.includes(day)).length;
    console.log(`  ${day}: ${count}`);
  });
  console.log();
});
