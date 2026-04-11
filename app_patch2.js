const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  
  const searchStr = `  // Filter: ONLY Chris (admin) sees everything. Jet, Mark and others see ONLY their own.\n  const orders = (auth.isAdmin())\n    ? allOrders\n    : allOrders.filter(o => o.assignedTo === currentUser.name);`;
  
  const replaceStr = `  // Filter: ONLY Chris (admin) sees everything. Jet, Mark and others see ONLY their own.\n  let orders = isAdmin \n    ? allOrders \n    : allOrders.filter(o => o.assignedTo === currentUser.name);\n\n  // Hide completed repair orders from the main active list for everyone\n  orders = orders.filter(o => o.status !== 'completed');`;

  content = content.replace(searchStr, replaceStr);
  content = content.replace(searchStr, replaceStr); // just in case there are 2
  content = content.replace(searchStr, replaceStr); // just in case there are 3

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('/Users/chrismills/pool-service-app/app.js');
patchFile('/Users/chrismills/pool-service-app/www/app.js');
