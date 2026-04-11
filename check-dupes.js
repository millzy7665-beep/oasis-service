const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/chrismills/Downloads/Route_Visits_Final_Adjusted.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws);

// Find client names that appear under multiple techs
const nameToTechs = {};
rows.forEach(r => {
  const name = (r['Client Name'] || '').trim().toLowerCase();
  const tech = (r['Route Name'] || '').trim();
  if (!name || !tech) return;
  if (!nameToTechs[name]) nameToTechs[name] = new Set();
  nameToTechs[name].add(tech);
});

const dupes = Object.entries(nameToTechs).filter(([k,v]) => v.size > 1);
console.log('Client names shared across multiple techs:', dupes.length);
dupes.forEach(([name, techs]) => {
  console.log('  ' + name + ' -> ' + [...techs].join(', '));
});

// Also check: same name, same tech, different days (should be grouped correctly)
const nameToEntries = {};
rows.forEach(r => {
  const name = (r['Client Name'] || '').trim().toLowerCase();
  const tech = (r['Route Name'] || '').trim();
  const day = (r['Day'] || '').trim();
  const addr = (r['Address'] || '').trim();
  if (!name) return;
  const key = tech + '|' + name;
  if (!nameToEntries[key]) nameToEntries[key] = { tech, name: (r['Client Name']||'').trim(), addr, days: [] };
  nameToEntries[key].days.push(day);
});

// Check if any same-name clients have different addresses within same tech
const sameNameDiffAddr = {};
rows.forEach(r => {
  const name = (r['Client Name'] || '').trim().toLowerCase();
  const tech = (r['Route Name'] || '').trim();
  const addr = (r['Address'] || '').trim();
  if (!name) return;
  const key = tech + '|' + name;
  if (!sameNameDiffAddr[key]) sameNameDiffAddr[key] = new Set();
  sameNameDiffAddr[key].add(addr);
});
const multiAddr = Object.entries(sameNameDiffAddr).filter(([k,v]) => v.size > 1);
console.log('\nSame tech+name with different addresses:', multiAddr.length);
multiAddr.forEach(([key, addrs]) => {
  console.log('  ' + key + ' -> ' + [...addrs].join(' | '));
});
