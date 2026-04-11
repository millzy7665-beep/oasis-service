const REPAIRS_STORAGE_PREFIX = 'oasis_repairs_';

const RepairUsers = {
  t1: { name: 'Jet', role: 'technician' },
  t2: { name: 'Mark', role: 'technician' },
  t3: { name: 'Tech 3', role: 'technician' },
  admin: { name: 'Chris (Admin)', role: 'admin' }
};

const RepairDB = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(REPAIRS_STORAGE_PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    localStorage.setItem(REPAIRS_STORAGE_PREFIX + key, JSON.stringify(value));
  },

  init() {
    if (!this.get('clients')) {
      this.set('clients', [
        {
          id: 'c1',
          name: 'Villa Azure',
          address: 'Seven Mile Beach',
          contact: 'Property Manager'
        },
        {
          id: 'c2',
          name: 'Harbour Point',
          address: 'West Bay Road',
          contact: 'Maintenance Office'
        }
      ]);
    }

    if (!this.get('orders')) {
      this.set('orders', [
        {
          id: 'r1',
          clientId: 'c1',
          clientName: 'Villa Azure',
          address: 'Seven Mile Beach',
          date: new Date().toISOString().split('T')[0],
          time: '09:00',
          assignedTo: 'Jet',
          status: 'open',
          jobType: 'Pump Repair',
          priority: 'High',
          summary: 'Inspect noisy circulation pump and replace seal if needed.',
          materials: 'Pump seal kit',
          labourHours: '2',
          notes: 'Customer requested update before noon.'
        }
      ]);
    }
  }
};

const RepairApp = {
  currentUser: null,
  currentView: 'dashboard'
};

function repairMain() {
  return document.getElementById('main');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

function getRepairClients() {
  return RepairDB.get('clients', []);
}

function setRepairClients(clients) {
  RepairDB.set('clients', clients);
}

function getRepairOrders() {
  return RepairDB.get('orders', []);
}

function setRepairOrders(orders) {
  RepairDB.set('orders', orders);
}

function isRepairAdmin() {
  return RepairApp.currentUser?.role === 'admin';
}

function updateAdminNav() {
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isRepairAdmin() ? '' : 'none';
  });
}

function setActiveNav(view) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

function renderRepairView(view = 'dashboard') {
  RepairApp.currentView = view;
  setActiveNav(view);

  if (view === 'dashboard') return renderRepairDashboard();
  if (view === 'tech-orders') return renderRepairOrders();
  if (view === 'customers') return renderRepairClients();
  if (view === 'admin') return renderRepairAdmin();

  renderRepairDashboard();
}

function renderRepairDashboard() {
  const main = repairMain();
  if (!main) return;

  const orders = getRepairOrders();
  const clients = getRepairClients();
  const openOrders = orders.filter(order => order.status !== 'completed');
  const highPriority = orders.filter(order => order.priority === 'High');
  const recentOrders = orders.slice(0, 5);

  main.innerHTML = `
    <div class="wave-banner">
      <div class="wave-banner-eyebrow">OASIS Technician</div>
      <div class="wave-banner-title">${escapeHtml(RepairApp.currentUser?.name || 'Technician')}</div>
      <div class="wave-banner-sub">Standalone app for technician work orders</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">🛠️</div>
        <div class="stat-value">${orders.length}</div>
        <div class="stat-label">Repair Orders</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📂</div>
        <div class="stat-value">${openOrders.length}</div>
        <div class="stat-label">Open Jobs</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⚡</div>
        <div class="stat-value">${highPriority.length}</div>
        <div class="stat-label">High Priority</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-value">${clients.length}</div>
        <div class="stat-label">Clients</div>
      </div>
    </div>

    <div class="section-header">
      <div class="section-title">Recent Work Orders</div>
      <button class="btn btn-primary btn-sm" onclick="renderRepairOrderForm()">+ New Work Order</button>
    </div>

    <div class="card">
      <div class="card-body">
        ${recentOrders.length ? recentOrders.map(order => repairOrderCard(order)).join('') : `
          <div class="empty-state">
            <div class="empty-icon">🧰</div>
            <div class="empty-title">No technician work orders yet</div>
            <div class="empty-subtitle">Create the first one for the team</div>
          </div>
        `}
      </div>
    </div>
  `;
}

function repairOrderCard(order) {
  return `
    <div class="job-card" style="margin-bottom:12px;">
      <div class="job-card-header">
        <div>
          <div class="job-card-title">${escapeHtml(order.clientName || 'Repair Job')}</div>
          <div class="job-card-customer">${escapeHtml(order.jobType || 'General Repair')}</div>
          <div class="job-meta">
            <div class="job-meta-item">📅 ${escapeHtml(order.date || '')}</div>
            <div class="job-meta-item">👤 ${escapeHtml(order.assignedTo || '')}</div>
          </div>
        </div>
      </div>
      <div class="job-card-body">
        <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value">${escapeHtml(order.status || 'open')}</div></div>
        <div class="detail-row"><div class="detail-label">Priority</div><div class="detail-value">${escapeHtml(order.priority || 'Normal')}</div></div>
        <div class="detail-row"><div class="detail-label">Address</div><div class="detail-value">${escapeHtml(order.address || '')}</div></div>
      </div>
      <div class="job-card-footer">
        <button class="btn btn-secondary btn-sm" onclick="renderRepairOrderForm('${escapeHtml(order.id)}')">Open</button>
        <button class="btn btn-primary btn-sm" onclick="saveRepairOrder('${escapeHtml(order.id)}', true)">PDF</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRepairOrder('${escapeHtml(order.id)}')">Delete</button>
      </div>
    </div>
  `;
}

function renderRepairOrders() {
  const main = repairMain();
  if (!main) return;

  const orders = getRepairOrders();

  main.innerHTML = `
    <div class="section-header">
      <div class="section-title">OASIS Technician Work Orders</div>
      <button class="btn btn-primary btn-sm" onclick="renderRepairOrderForm()">+ New Work Order</button>
    </div>

    <div class="card">
      <div class="card-body">
        <p style="margin-bottom:14px;color:var(--gray-500)">This app is fully separate from Oasis Service and keeps its own repair data.</p>
        ${orders.length ? orders.map(order => repairOrderCard(order)).join('') : `
          <div class="empty-state">
            <div class="empty-icon">🛠️</div>
            <div class="empty-title">No technician work orders</div>
            <div class="empty-subtitle">Tap “New Work Order” to add one</div>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderRepairClients() {
  const main = repairMain();
  if (!main) return;

  const clients = getRepairClients();

  main.innerHTML = `
    <div class="section-header">
      <div class="section-title">Repair Clients</div>
      <button class="btn btn-primary btn-sm" onclick="quickAddClient()">+ Add Client</button>
    </div>

    <div class="card">
      <div class="card-body">
        ${clients.length ? clients.map(client => `
          <div class="list-item">
            <div class="list-item-avatar">${escapeHtml((client.name || 'C').charAt(0).toUpperCase())}</div>
            <div class="list-item-info">
              <div class="list-item-name">${escapeHtml(client.name)}</div>
              <div class="list-item-sub">${escapeHtml(client.address || '')}</div>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-secondary btn-sm" onclick="renderRepairOrderForm('', '${escapeHtml(client.id)}')">New WO</button>
              <button class="btn btn-danger btn-sm" onclick="deleteRepairClient('${escapeHtml(client.id)}')">Delete</button>
            </div>
          </div>
        `).join('') : `
          <div class="empty-state">
            <div class="empty-icon">👥</div>
            <div class="empty-title">No clients yet</div>
            <div class="empty-subtitle">Add a repair client to get started</div>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderRepairAdmin() {
  const main = repairMain();
  if (!main) return;

  if (!isRepairAdmin()) {
    main.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-icon">🔒</div>
            <div class="empty-title">Admin access only</div>
            <div class="empty-subtitle">Sign in as Chris (Admin) to view this section</div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const orders = getRepairOrders();
  const technicians = Object.values(RepairUsers).filter(user => user.role === 'technician');

  main.innerHTML = `
    <div class="section-header">
      <div class="section-title">Technician Admin</div>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="detail-row"><div class="detail-label">App</div><div class="detail-value">OASIS Technician</div></div>
        <div class="detail-row"><div class="detail-label">Technicians</div><div class="detail-value">${technicians.map(tech => escapeHtml(tech.name)).join(', ')}</div></div>
        <div class="detail-row"><div class="detail-label">Stored Work Orders</div><div class="detail-value">${orders.length}</div></div>
        <div class="detail-row"><div class="detail-label">Separate Storage</div><div class="detail-value">${REPAIRS_STORAGE_PREFIX}</div></div>
      </div>
    </div>
  `;
}

function repairClientOptions(selectedId = '') {
  return getRepairClients().map(client => `
    <option value="${escapeHtml(client.id)}" ${client.id === selectedId ? 'selected' : ''}>${escapeHtml(client.name)}</option>
  `).join('');
}

function renderRepairOrderForm(orderId = '', presetClientId = '') {
  const main = repairMain();
  if (!main) return;

  const existing = orderId ? getRepairOrders().find(order => order.id === orderId) : null;
  const order = existing || {
    id: '',
    clientId: presetClientId,
    clientName: '',
    address: '',
    date: new Date().toISOString().split('T')[0],
    time: '',
    assignedTo: RepairApp.currentUser?.name || '',
    status: 'open',
    jobType: '',
    priority: 'Normal',
    summary: '',
    materials: '',
    labourHours: '',
    notes: ''
  };

  main.innerHTML = `
    <div class="section-header">
      <div class="section-title">${orderId ? 'Edit Technician Work Order' : 'New Technician Work Order'}</div>
      <button class="btn btn-secondary btn-sm" onclick="renderRepairView('tech-orders')">← Back</button>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="form-row">
          <label for="repair-client">Client</label>
          <select id="repair-client" onchange="onRepairClientChange()">
            <option value="">— Select client —</option>
            ${repairClientOptions(order.clientId || presetClientId)}
          </select>
        </div>

        <div class="form-row">
          <label for="repair-address">Address</label>
          <input id="repair-address" type="text" value="${escapeHtml(order.address || '')}">
        </div>

        <div class="form-row">
          <label for="repair-date">Date</label>
          <input id="repair-date" type="date" value="${escapeHtml(order.date || '')}">
        </div>

        <div class="form-row">
          <label for="repair-time">Time</label>
          <input id="repair-time" type="time" value="${escapeHtml(order.time || '')}">
        </div>

        <div class="form-row">
          <label for="repair-tech">Assigned Tech</label>
          <input id="repair-tech" type="text" value="${escapeHtml(order.assignedTo || '')}">
        </div>

        <div class="form-row">
          <label for="repair-type">Work Order Type</label>
          <input id="repair-type" type="text" value="${escapeHtml(order.jobType || '')}" placeholder="Pump repair, leak check, automation issue...">
        </div>

        <div class="form-row">
          <label for="repair-priority">Priority</label>
          <select id="repair-priority">
            <option value="Low" ${order.priority === 'Low' ? 'selected' : ''}>Low</option>
            <option value="Normal" ${order.priority === 'Normal' ? 'selected' : ''}>Normal</option>
            <option value="High" ${order.priority === 'High' ? 'selected' : ''}>High</option>
          </select>
        </div>

        <div class="form-row">
          <label for="repair-status">Status</label>
          <select id="repair-status">
            <option value="open" ${order.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="in-progress" ${order.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
            <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
          </select>
        </div>

        <div class="form-row">
          <label for="repair-summary">Summary</label>
          <textarea id="repair-summary">${escapeHtml(order.summary || '')}</textarea>
        </div>

        <div class="form-row">
          <label for="repair-materials">Materials / Parts</label>
          <textarea id="repair-materials">${escapeHtml(order.materials || '')}</textarea>
        </div>

        <div class="form-row">
          <label for="repair-labour">Labour Hours</label>
          <input id="repair-labour" type="number" step="0.25" value="${escapeHtml(order.labourHours || '')}">
        </div>

        <div class="form-row">
          <label for="repair-notes">Notes</label>
          <textarea id="repair-notes">${escapeHtml(order.notes || '')}</textarea>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
          <button class="btn btn-primary" onclick="saveRepairOrder('${escapeHtml(orderId)}')">Save Work Order</button>
          <button class="btn send-report-btn" onclick="saveRepairOrder('${escapeHtml(orderId)}', true)">Download PDF</button>
        </div>
      </div>
    </div>
  `;

  onRepairClientChange();
}

function onRepairClientChange() {
  const select = document.getElementById('repair-client');
  const address = document.getElementById('repair-address');
  if (!select || !address) return;

  const client = getRepairClients().find(item => item.id === select.value);
  if (client) {
    address.value = client.address || '';
  }
}

function collectRepairOrderFromForm(orderId = '') {
  const clientId = document.getElementById('repair-client')?.value || '';
  const client = getRepairClients().find(item => item.id === clientId);

  return {
    id: orderId || `r${Date.now()}`,
    clientId,
    clientName: client?.name || 'Unassigned Client',
    address: document.getElementById('repair-address')?.value || '',
    date: document.getElementById('repair-date')?.value || '',
    time: document.getElementById('repair-time')?.value || '',
    assignedTo: document.getElementById('repair-tech')?.value || '',
    status: document.getElementById('repair-status')?.value || 'open',
    jobType: document.getElementById('repair-type')?.value || '',
    priority: document.getElementById('repair-priority')?.value || 'Normal',
    summary: document.getElementById('repair-summary')?.value || '',
    materials: document.getElementById('repair-materials')?.value || '',
    labourHours: document.getElementById('repair-labour')?.value || '',
    notes: document.getElementById('repair-notes')?.value || ''
  };
}

function saveRepairOrder(orderId = '', downloadAfterSave = false) {
  const order = collectRepairOrderFromForm(orderId);
  const orders = getRepairOrders();
  const index = orders.findIndex(item => item.id === order.id);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }

  setRepairOrders(orders);
  showToast('Technician work order saved');

  if (downloadAfterSave) {
    downloadRepairPDF(order.id);
    return;
  }

  renderRepairView('tech-orders');
}

function downloadRepairPDF(orderId) {
  const order = getRepairOrders().find(item => item.id === orderId);
  if (!order || !window.jspdf) {
    showToast('Unable to generate PDF');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.text('OASIS Technician Work Order', 20, 24);

  doc.setFontSize(11);
  doc.text(`Client: ${order.clientName || ''}`, 20, 42);
  doc.text(`Address: ${order.address || ''}`, 20, 52);
  doc.text(`Date: ${order.date || ''}  ${order.time || ''}`.trim(), 20, 62);
  doc.text(`Assigned Tech: ${order.assignedTo || ''}`, 20, 72);
  doc.text(`Status: ${order.status || ''}`, 20, 82);
  doc.text(`Priority: ${order.priority || ''}`, 20, 92);
  doc.text(`Type: ${order.jobType || ''}`, 20, 102);

  let y = 118;
  doc.setFontSize(13);
  doc.text('Work Summary', 20, y);
  y += 8;
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(order.summary || 'No summary provided.', 170);
  doc.text(summaryLines, 20, y);
  y += summaryLines.length * 6 + 8;

  doc.setFontSize(13);
  doc.text('Materials / Parts', 20, y);
  y += 8;
  doc.setFontSize(10);
  const materialLines = doc.splitTextToSize(order.materials || 'None listed.', 170);
  doc.text(materialLines, 20, y);
  y += materialLines.length * 6 + 8;

  doc.text(`Labour Hours: ${order.labourHours || '0'}`, 20, y);
  y += 10;

  doc.setFontSize(13);
  doc.text('Notes', 20, y);
  y += 8;
  doc.setFontSize(10);
  const noteLines = doc.splitTextToSize(order.notes || 'No additional notes.', 170);
  doc.text(noteLines, 20, y);

  const safeClient = (order.clientName || 'Client').replace(/[^a-z0-9]+/gi, '_');
  doc.save(`OASIS_Technician_${safeClient}_${order.date || 'work_order'}.pdf`);

  showToast('Technician PDF saved to device');
  renderRepairView('tech-orders');
}

function deleteRepairOrder(orderId) {
  if (!confirm('Delete this technician work order?')) return;
  const orders = getRepairOrders().filter(order => order.id !== orderId);
  setRepairOrders(orders);
  showToast('Technician work order deleted');
  renderRepairView('tech-orders');
}

function quickAddClient() {
  const name = prompt('Client name');
  if (!name) return;
  const address = prompt('Client address') || '';
  const contact = prompt('Contact name') || '';

  const clients = getRepairClients();
  clients.unshift({
    id: `c${Date.now()}`,
    name,
    address,
    contact
  });

  setRepairClients(clients);
  showToast('Client added');
  renderRepairClients();
}

function deleteRepairClient(clientId) {
  if (!confirm('Delete this client from OASIS Technician?')) return;
  setRepairClients(getRepairClients().filter(client => client.id !== clientId));
  setRepairOrders(getRepairOrders().filter(order => order.clientId !== clientId));
  showToast('Client removed');
  renderRepairClients();
}

function doLogin() {
  const username = document.getElementById('login-tech')?.value;
  if (!username || !RepairUsers[username]) {
    const error = document.getElementById('login-error');
    if (error) error.style.display = 'block';
    return;
  }

  RepairApp.currentUser = { ...RepairUsers[username], username };
  localStorage.setItem(REPAIRS_STORAGE_PREFIX + 'currentUser', JSON.stringify(RepairApp.currentUser));

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  updateAdminNav();
  renderRepairView('dashboard');
}

function signOut() {
  localStorage.removeItem(REPAIRS_STORAGE_PREFIX + 'currentUser');
  RepairApp.currentUser = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
  RepairDB.init();

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => renderRepairView(btn.dataset.view));
  });

  const savedUser = RepairDB.get('currentUser', null);
  if (savedUser?.username && RepairUsers[savedUser.username]) {
    RepairApp.currentUser = { ...RepairUsers[savedUser.username], username: savedUser.username };
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    updateAdminNav();
    renderRepairView('dashboard');
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});

window.doLogin = doLogin;
window.signOut = signOut;
window.renderRepairView = renderRepairView;
window.renderRepairOrderForm = renderRepairOrderForm;
window.saveRepairOrder = saveRepairOrder;
window.downloadRepairPDF = downloadRepairPDF;
window.deleteRepairOrder = deleteRepairOrder;
window.quickAddClient = quickAddClient;
window.deleteRepairClient = deleteRepairClient;
window.onRepairClientChange = onRepairClientChange;