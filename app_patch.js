const fs = require('fs');

function patchFile(filepath) {
  let content = fs.readFileSync(filepath, 'utf8');
  
  // 1. Downgrade Jet and Mark to technician
  content = content.replace(
    /'t9': \{ role: 'admin', name: 'Jet' \},/g,
    "'t9': { role: 'technician', name: 'Jet' },"
  );
  content = content.replace(
    /'t10': \{ role: 'admin', name: 'Mark' \},/g,
    "'t10': { role: 'technician', name: 'Mark' },"
  );

  // 2. Register completed jobs route
  content = content.replace(
    "'settings': this.renderSettings.bind(this)",
    "'settings': this.renderSettings.bind(this),\n      'completed_jobs': this.renderCompletedJobs.bind(this)"
  );

  // 3. Add button to Admin workorders view
  content = content.replace(
    '<button class="btn btn-secondary btn-sm" onclick="exportCompletedToExcel()">Download Completed Orders</button>` : \'\'}',
    '<button class="btn btn-secondary btn-sm" onclick="exportCompletedToExcel()">Download Completed Orders</button>\n          <button class="btn btn-secondary btn-sm" onclick="router.navigate(\\\'completed_jobs\\\')">🔍 Search Completed Jobs</button>` : \'\'}'
  );

  // 4. Inject renderCompletedJobs
  const searchHtml = `
  renderCompletedJobs() {
    const content = document.getElementById('main-content');
    const isAdmin = auth.isAdmin();
    if (!isAdmin) {
       this.navigate('dashboard');
       return;
    }

    content.innerHTML = \\\`
      <div class="section-header">
        <div class="section-title">Completed Jobs History</div>
        <button class="btn btn-secondary btn-sm" onclick="router.goBack()">← Back</button>
      </div>
      <div style="padding: 15px 15px 0;">
        <input type="text" id="admin-search-completed" class="form-control" placeholder="Search by client or tech..." oninput="router.filterCompletedJobs(this.value)">
      </div>
      <div id="completed-jobs-results" style="padding: 0 15px; margin-top: 15px;">
        \\\${this.generateCompletedJobsHtml('')}
      </div>
    \\\`;
  }

  filterCompletedJobs(term) {
    const container = document.getElementById('completed-jobs-results');
    if (container) {
      container.innerHTML = this.generateCompletedJobsHtml(term);
    }
  }

  generateCompletedJobsHtml(term) {
    term = (term || '').toLowerCase().trim();
    const allWorkorders = db.get('workorders', []);
    const allRepairOrders = db.get('repairOrders', []);
    const currentUser = auth.getCurrentUser();
    
    let completedWO = allWorkorders.filter(wo => wo.status === 'completed');
    let completedRO = allRepairOrders.filter(ro => ro.status === 'completed');

    if (term) {
      completedWO = completedWO.filter(wo => 
        (wo.clientName && wo.clientName.toLowerCase().includes(term)) || 
        (wo.technician && wo.technician.toLowerCase().includes(term)) ||
        (wo.date && wo.date.includes(term))
      );
      completedRO = completedRO.filter(ro => 
        (ro.clientName && ro.clientName.toLowerCase().includes(term)) || 
        (ro.assignedTo && ro.assignedTo.toLowerCase().includes(term)) ||
        (ro.date && ro.date.includes(term))
      );
    }

    if (completedWO.length === 0 && completedRO.length === 0) {
      return \\\`<div class="empty-state"><div class="empty-title">No completed jobs found</div></div>\\\`;
    }

    let html = '';
    if (completedWO.length > 0) {
        html += \\\`<div class="section-title" style="margin-bottom: 10px;">Chem Sheets (\\\${completedWO.length})</div>\\\`;
        html += completedWO.map(wo => this.renderJobCard(wo, true, true, currentUser)).join('');
    }
    if (completedRO.length > 0) {
        html += \\\`<div class="section-title" style="margin-top: 20px; margin-bottom: 10px;">Repair Orders (\\\${completedRO.length})</div>\\\`;
        html += completedRO.map(order => \\\`
          <div class="job-card" style="margin-bottom:12px;">
            <div class="job-card-header">
              <div>
                <div class="job-card-title">\\\${escapeHtml(order.clientName || 'Repair Job')}</div>
                <div class="job-card-customer">\\\${escapeHtml(order.jobType || 'General Repair')}</div>
                <div class="job-meta">
                  <div class="job-meta-item">📅 \\\${escapeHtml(order.date || '')}</div>
                  <div class="job-meta-item">👤 \\\${escapeHtml(order.assignedTo || '')}</div>
                </div>
              </div>
            </div>
            <div class="job-card-body">
              <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value">\\\${escapeHtml(order.status || 'open')}</div></div>
              <div class="detail-row"><div class="detail-label">Priority</div><div class="detail-value">\\\${escapeHtml(order.priority || 'Normal')}</div></div>
              <div class="detail-row"><div class="detail-label">Address</div><div class="detail-value">\\\${escapeHtml(order.address || '')}</div></div>
            </div>
            <div class="job-card-footer">
              <button class="btn btn-secondary btn-sm" onclick="renderRepairOrderForm('\\\${escapeHtml(order.id)}')">Open</button>
              <button class="btn btn-primary btn-sm" onclick="shareRepairPDF('\\\${escapeHtml(order.id)}')">Share</button>
              <button class="btn btn-danger btn-sm" onclick="deleteRepairOrder('\\\${escapeHtml(order.id)}')">Delete</button>
            </div>
          </div>
        \\\`).join('');
    }
    return html;
  }
`;
  content = content.replace(
    "  renderSettings() {",
    searchHtml + "\n  renderSettings() {"
  );

  fs.writeFileSync(filepath, content, 'utf8');
}

patchFile('/Users/chrismills/pool-service-app/app.js');
patchFile('/Users/chrismills/pool-service-app/www/app.js');

