const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  
  // Patch renderJobCard technician visibility
  content = content.replace(
    /currentUser.username === 'admin' ? \`<div class="job-meta-item">👤 \$\{wo.technician \|\| 'Unknown'\}<\/div>\` : ''/g,
    "isAdmin ? `<div class=\"job-meta-item\">👤 \${wo.technician || 'Unknown'}</div>` : ''"
  );

  // Patch renderJobCard delete button
  content = content.replace(
    /currentUser.username === 'admin' ? \`<button class="btn btn-danger btn-sm" onclick="deleteWorkOrder\('\$\{wo.id\}'\)">Delete<\/button>\` : ''/g,
    "isAdmin ? `<button class=\"btn btn-danger btn-sm\" onclick=\"deleteWorkOrder('\${wo.id}')\">Delete</button>` : ''"
  );
  
  // Patch renderRepairOrdersList delete button
  content = content.replace(
    /currentUser.username === 'admin' ? \`<button class="btn btn-danger btn-sm" onclick="deleteRepairOrder\('\$\{escapeHtml\(order.id\)\}'\)">Delete<\/button>\` : ''/g,
    "isAdmin ? `<button class=\"btn btn-danger btn-sm\" onclick=\"deleteRepairOrder('\${escapeHtml(order.id)}')\">Delete</button>` : ''"
  );
  
  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('/Users/chrismills/pool-service-app/app.js');
patchFile('/Users/chrismills/pool-service-app/www/app.js');
