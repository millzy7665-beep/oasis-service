const XLSX = require('xlsx');
const wb = XLSX.readFile('/Users/chrismills/Downloads/Route_Visits_Final_Adjusted.xlsx');
const ws = wb.Sheets['Route Visits'];
const data = XLSX.utils.sheet_to_json(ws);

console.log('Total rows:', data.length);

// Unique days
const days = [...new Set(data.map(r => r['Day']))];
console.log('\nDays:', days);

// Unique techs
const techs = [...new Set(data.map(r => r['Route Name']))];
console.log('\nTechs:', techs);

// Route numbers
const routes = [...new Set(data.map(r => r['Route #']))];
console.log('\nRoute #s:', routes);

// Count per tech per day
console.log('\nVisits per tech per day:');
techs.forEach(tech => {
  const techRows = data.filter(r => r['Route Name'] === tech);
  const dayCounts = {};
  days.forEach(d => { dayCounts[d] = techRows.filter(r => r['Day'] === d).length; });
  console.log(`  ${tech}: ${JSON.stringify(dayCounts)} (total ${techRows.length})`);
});

// Check Ariel specifically
console.log('\n--- Ariel entries ---');
data.filter(r => r['Route Name'] === 'Ariel').forEach(r => {
  console.log(`  ${r['Day']}: ${r['Client Name']} - ${r['Address']}`);
});

// Check Kingsley specifically
console.log('\n--- Kingsley entries ---');
data.filter(r => r['Route Name'] === 'Kingsley').forEach(r => {
  console.log(`  ${r['Day']}: ${r['Client Name']} - ${r['Address']}`);
});
