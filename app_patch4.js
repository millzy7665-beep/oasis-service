const fs = require('fs');
const filepath = '/Users/chrismills/pool-service-app/app.js';
const filepathWww = '/Users/chrismills/pool-service-app/www/app.js';

let content = fs.readFileSync(filepath, 'utf8');

// Fix saveWorkOrderForm (find last instance)
const saveWoRegex = /function saveWorkOrderForm\(orderId\) {(\s*const order = collectWorkOrderForm\(orderId\);)?([\s\S]*?workOrderManager\.saveOrder\(order\);[\s\S]*?)}/g;
let lastMatch;
while ((match = saveWoRegex.exec(content)) !== null) {
  lastMatch = match;
}
if (lastMatch) {
  const replacement = `function saveWorkOrderForm(orderId) {
  const order = collectWorkOrderForm(orderId);
  if (!order) {
    showToast('Work order not found');
    return;
  }
  
  order.status = document.getElementById('wo-status')?.value || order.status;
  workOrderManager.saveOrder(order);
  router.navigate('workorders');
  showToast('Chem sheet saved');
}`;
  content = content.substring(0, lastMatch.index) + replacement + content.substring(lastMatch.index + lastMatch[0].length);
}

// Fix saveRepairWorkOrder (find last instance)
const saveRoRegex = /function saveRepairWorkOrder\(orderId = '', shareAfterSave = false\) {([\s\S]*?)}/g;
while ((match = saveRoRegex.exec(content)) !== null) {
  lastMatch = match;
}
if (lastMatch) {
  const replacement = `function saveRepairWorkOrder(orderId = '', shareAfterSave = false) {
  const order = collectRepairOrderFromForm(orderId);
  if (!order) return;
  order.status = document.getElementById('repair-status')?.value || order.status;
  
  const orders = getRepairOrders();
  const index = orders.findIndex(item => item.id === order.id);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }

  saveRepairOrders(orders);
  showToast('Repair work order saved');

  if (shareAfterSave) {
    shareRepairPDF(order.id);
  } else {
    router.renderWorkOrders();
  }
}`;
  content = content.substring(0, lastMatch.index) + replacement + content.substring(lastMatch.index + lastMatch[0].length);
}


// Fix Admin search page formatting
const generateHtmlRegex = /generateCompletedJobsHtml\(term\) {([\s\S]*?)return html;(\s*)}/g;
while ((match = generateHtmlRegex.exec(content)) !== null) {
  lastMatch = match;
}
if (lastMatch) {
  const replacement = `generateCompletedJobsHtml(term) {
    term = (term || '').toLowerCase().trim();
    const allWorkorders = db.get('workorders', []);
    const allRepairOrders = db.get('repairOrders', []);
    const currentUser = auth.getCurrentUser();
    
    let completedJobs = [
      ...allWorkorders.filter(j => j.status === 'completed'),
      ...allRepairOrders.filter(j => j.status === 'completed')
    ];

    if (term) {
      completedJobs = completedJobs.filter(j => 
        (j.clientName && j.clientName.toLowerCase().includes(term)) || 
        ((j.technician || j.assignedTo) && (j.technician || j.assignedTo).toLowerCase().includes(term)) ||
        (j.date && j.date.includes(term))
      );
    }
    
    completedJobs.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (completedJobs.length === 0) {
      return \`<div class="empty-state"><div class="empty-title">No completed jobs found for '\${term}'</div></div>\`;
    }

    const jobToCard = (job) => {
        const isRepair = !!job.jobType;
        const title = escapeHtml(job.clientName || 'Job');
        const subtitle = escapeHtml(isRepair ? job.jobType : job.address);
        const tech = escapeHtml(job.technician || job.assignedTo || '');
        const date = escapeHtml(job.date || '');
        const openCmd = isRepair ? \`renderRepairOrderForm('\${escapeHtml(job.id)}')\` : \`router.viewWorkOrder('\${job.id}')\`;
        const shareCmd = isRepair ? \`shareRepairPDF('\${escapeHtml(job.id)}')\` : \`shareReport('\${job.id}')\`;
        const deleteCmd = isRepair ? \`deleteRepairOrder('\${escapeHtml(job.id)}')\` : \`deleteWorkOrder('\${job.id}')\`;

        return \\\`
        <div class="job-card job-card-completed" style="margin-bottom:12px;">
            <div class="job-card-header">
                <div>
                    <div class="job-card-title">\\\${title}</div>
                    <div class="job-card-customer">\\\${subtitle}</div>
                    <div class="job-meta">
                        <div class="job-meta-item">📅 \\\${date}</div>
                        <div class="job-meta-item">👤 \\\${tech}</div>
                    </div>
                </div>
            </div>
            <div class="job-card-footer">
                <button class="btn btn-secondary btn-sm" onclick="\\\${openCmd}">Open</button>
                <button class="btn btn-primary btn-sm" onclick="\\\${shareCmd}">Share</button>
                <button class="btn btn-danger btn-sm" onclick="\\\${deleteCmd}">Delete</button>
            </div>
        </div>
        \\\`;
    };

    return completedJobs.map(jobToCard).join('');
  }`;
  content = content.substring(0, lastMatch.index) + replacement + content.substring(lastMatch.index + lastMatch[0].length);
}

fs.writeFileSync(filepath, content, 'utf8');
fs.writeFileSync(filepathWww, content, 'utf8');
