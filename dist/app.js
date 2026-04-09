// OASIS Service and Repair App - Unified Version
// Features: Login, Dashboard, Clients, Chem Sheets, Repair Orders, Settings
// PDF generation with local save instead of email

// ==========================================
// DATA MANAGEMENT (DB)
// ==========================================
class DB {
  constructor() {
    this.storage = window.localStorage;
  }

  get(key, defaultValue = null) {
    try {
      const item = this.storage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  set(key, value) {
    try {
      this.storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  remove(key) {
    this.storage.removeItem(key);
  }

  clear() {
    this.storage.clear();
  }
}

const db = new DB();

// ==========================================
// AUTHENTICATION
// ==========================================
class Auth {
  constructor() {
    this.currentUser = null;
    this.users = {
      't1': { role: 'technician', name: 'Ace' },
      't2': { role: 'technician', name: 'Ariel' },
      't3': { role: 'technician', name: 'Donald' },
      't4': { role: 'technician', name: 'Elvin' },
      't5': { role: 'technician', name: 'Jermaine' },
      't6': { role: 'technician', name: 'Kadeem' },
      't7': { role: 'technician', name: 'Kingsley' },
      't8': { role: 'technician', name: 'Malik' },
      't9': { role: 'technician', name: 'Jet' },
      't10': { role: 'technician', name: 'Mark' },
      't11': { role: 'technician', name: 'Tech 3' },
      'admin': { role: 'admin', name: 'Chris Mills' }
    };
  }

  login(username) {
    if (this.users[username]) {
      this.currentUser = { ...this.users[username], username };
      db.set('currentUser', this.currentUser);
      return true;
    }
    return false;
  }

  logout() {
    this.currentUser = null;
    db.remove('currentUser');
  }

  getCurrentUser() {
    if (!this.currentUser) {
      this.currentUser = db.get('currentUser');
    }
    return this.currentUser;
  }

  isLoggedIn() {
    return !!this.getCurrentUser();
  }

  isAdmin() {
    const user = this.getCurrentUser();
    return user && user.role === 'admin';
  }
}

const auth = new Auth();

// ==========================================
// MODAL SYSTEM
// ==========================================
class Modal {
  constructor() {
    this.currentModal = null;
  }

  show(modalId) {
    this.hide();
    this.currentModal = document.getElementById(modalId);
    if (this.currentModal) {
      this.currentModal.classList.remove('hidden');
    }
  }

  hide() {
    if (this.currentModal) {
      this.currentModal.classList.add('hidden');
      this.currentModal = null;
    }
  }

  confirm(message, callback) {
    if (confirm(message)) {
      callback();
    }
  }
}

const modal = new Modal();

// ==========================================
// ROUTER
// ==========================================
class Router {
  constructor() {
    this.routes = {
      'dashboard': this.renderDashboard.bind(this),
      'routes': this.renderRoutes.bind(this),
      'clients': this.renderClients.bind(this),
      'workorders': this.renderWorkOrders.bind(this),
      'settings': this.renderSettings.bind(this)
    };
    this.currentView = 'dashboard';
  }

  navigate(view) {
    this.currentView = view;
    if (this.routes[view]) {
      this.routes[view]();
    }
    this.updateNav();
  }

  updateNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === this.currentView);
    });
  }

  renderDashboard() {
    const content = document.getElementById('main-content');
    const repairOrders = getRepairOrders();
    content.innerHTML = `
      <div class="wave-banner">
        <div class="wave-banner-eyebrow">Welcome back</div>
        <div class="wave-banner-title">${auth.getCurrentUser().name}</div>
        <div class="wave-banner-sub">Ready for today's service and repair jobs</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">🧪</div>
          <div class="stat-value">${db.get('workorders', []).length}</div>
          <div class="stat-label">Chem Sheets</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🛠️</div>
          <div class="stat-value">${repairOrders.length}</div>
          <div class="stat-label">Repair Orders</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-value">${db.get('clients', []).length}</div>
          <div class="stat-label">Clients</div>
        </div>
      </div>

      <div class="section-header">
        <div class="section-title">Today's Schedule</div>
      </div>

      <div id="today-schedule">
        ${this.renderTodaySchedule()}
      </div>
    `;
  }

  renderTodaySchedule() {
    const workorders = db.get('workorders', []);
    const today = new Date().toDateString();
    const todayOrders = workorders.filter(wo => new Date(wo.date).toDateString() === today);

    if (todayOrders.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">📅</div>
          <div class="empty-title">No jobs today</div>
          <div class="empty-subtitle">Enjoy your day off!</div>
        </div>
      `;
    }

    return todayOrders.map(wo => `
      <div class="schedule-item">
        <div class="schedule-time">${wo.time || 'TBD'}</div>
        <div class="schedule-info">
          <div class="schedule-name">${wo.clientName}</div>
          <div class="schedule-detail">${wo.address}</div>
        </div>
        <div class="schedule-dot ${wo.status === 'completed' ? 'completed' : wo.status === 'in-progress' ? 'in-progress' : 'pending'}"></div>
      </div>
    `).join('');
  }

  renderRoutes() {
    const content = document.getElementById('main-content');
    content.innerHTML = `
      <div class="section-header">
        <div class="section-title">Daily Routes</div>
        <button class="btn btn-primary btn-sm" onclick="router.createRoute()">+ New Route</button>
      </div>

      <div id="routes-list">
        ${this.renderRoutesList()}
      </div>
    `;
  }

  renderRoutesList() {
    const routes = db.get('routes', []);
    if (routes.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🗺️</div>
          <div class="empty-title">No routes planned</div>
          <div class="empty-subtitle">Create your first daily route</div>
        </div>
      `;
    }

    return routes.map(route => `
      <div class="list-item">
        <div class="list-item-avatar">📍</div>
        <div class="list-item-info">
          <div class="list-item-name">${route.name}</div>
          <div class="list-item-sub">${route.stops.length} stops • ${route.date}</div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-secondary btn-sm" onclick="router.viewRoute('${route.id}')">View</button>
        </div>
      </div>
    `).join('');
  }

  renderClients() {
    const content = document.getElementById('main-content');
    content.innerHTML = `
      <div class="section-header">
        <div class="section-title">Clients</div>
        <button class="btn btn-primary btn-sm" onclick="quickAddClient()">+ Add Client</button>
      </div>

      <div id="clients-list">
        ${this.renderClientsList()}
      </div>
    `;
  }

  renderClientsList() {
    const clients = db.get('clients', []);
    if (clients.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-title">No clients yet</div>
          <div class="empty-subtitle">Add your first client</div>
        </div>
      `;
    }

    return clients.map(client => `
      <div class="list-item">
        <div class="list-item-avatar">${client.name.charAt(0).toUpperCase()}</div>
        <div class="list-item-info">
          <div class="list-item-name">${client.name}</div>
          <div class="list-item-sub">${client.address}</div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-secondary btn-sm" onclick="router.editClient('${client.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteClient('${client.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  renderWorkOrders() {
    const content = document.getElementById('main-content');
    content.innerHTML = `
      <div class="section-header">
        <div class="section-title">Service & Repair Jobs</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="router.createWorkOrder()">+ New Chem Sheet</button>
          <button class="btn btn-secondary btn-sm" onclick="renderRepairOrderForm()">+ Repair Order</button>
        </div>
      </div>

      <div id="workorders-list">
        ${this.renderWorkOrdersList()}
      </div>

      <div class="section-header" style="margin-top:10px">
        <div class="section-title">Repair Work Orders</div>
      </div>

      <div class="card">
        <div class="card-body">
          ${renderRepairOrdersList()}
        </div>
      </div>
    `;
  }

  renderWorkOrdersList() {
    const workorders = db.get('workorders', []);
    if (workorders.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🧪</div>
          <div class="empty-title">No chem sheets</div>
          <div class="empty-subtitle">Create your first chem sheet</div>
        </div>
      `;
    }

    return workorders.map(wo => `
      <div class="job-card">
        <div class="job-card-header">
          <div>
            <div class="job-card-title">${wo.clientName}</div>
            <div class="job-card-customer">${wo.address}</div>
            <div class="job-meta">
              <div class="job-meta-item">📅 ${wo.date}</div>
              <div class="job-meta-item">⏰ ${wo.time || 'TBD'}</div>
            </div>
          </div>
        </div>
        <div class="job-card-body">
          <div class="badge badge-${wo.status || 'pending'}">${wo.status || 'pending'}</div>
        </div>
        <div class="job-card-footer">
          <button class="btn btn-secondary btn-sm" onclick="router.viewWorkOrder('${wo.id}')">View</button>
          <button class="btn btn-primary btn-sm" onclick="router.editWorkOrder('${wo.id}')">Edit</button>
        </div>
      </div>
    `).join('');
  }

  renderSettings() {
    const content = document.getElementById('main-content');
    content.innerHTML = `
      <div class="section-header">
        <div class="section-title">Settings</div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="detail-row">
            <div class="detail-label">Current User</div>
            <div class="detail-value">${auth.getCurrentUser().name}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Role</div>
            <div class="detail-value">${auth.getCurrentUser().role}</div>
          </div>
          <button class="btn btn-danger" onclick="auth.logout(); location.reload()">Sign Out</button>
        </div>
      </div>
    `;
  }

  renderWorkOrderDetail(order) {
    const pool = { ...defaultChemReadings(), ...(order.readings?.pool || {}) };
    const spa = { ...defaultChemReadings(), ...(order.readings?.spa || {}) };
    const poolAdded = { ...defaultChemicalAdditions(), ...(order.chemicalsAdded?.pool || {}) };
    const spaAdded = { ...defaultChemicalAdditions(), ...(order.chemicalsAdded?.spa || {}) };
    const clients = db.get('clients', []);
    const technician = order.technician || auth.getCurrentUser()?.name || '';
    const timeIn = order.timeIn || order.time || '';
    const timeOut = order.timeOut || '';
    const timeSpent = calculateTimeSpent(timeIn, timeOut);
    const workPerformed = order.workPerformed || '';
    const followUpNotes = order.followUpNotes || order.notes || '';
    const content = document.getElementById('main-content');

    content.innerHTML = `
      <div class="wo-form">
        <div class="wo-bar">
          <button class="btn btn-secondary btn-sm" onclick="router.renderWorkOrders()">← Back</button>
          <div id="wo-client-name" class="wo-bar-title">${order.clientName || 'Chem Sheet'}</div>
          <button class="btn btn-primary btn-sm" onclick="saveWorkOrderForm('${order.id}')">Save</button>
        </div>

        <div class="wo-sec">
          <div class="wo-sec-hd">Customer & Service Details</div>
          <div class="wo-sec-bd">
            <div class="wo-hint">Capture the full original service log: pool and spa chemistry, chemicals added, and live LSI water balance.</div>

            <div class="form-row">
              <label for="wo-client">Customer</label>
              <select id="wo-client" onchange="onChemClientChange()">
                <option value="">— Select client —</option>
                ${clients.map(client => `<option value="${client.id}" ${client.id === order.clientId ? 'selected' : ''}>${client.name}</option>`).join('')}
              </select>
            </div>

            <div class="form-row">
              <label for="wo-tech">Technician</label>
              <input id="wo-tech" type="text" value="${technician}">
            </div>

            <div class="form-row">
              <label for="wo-date">Service Date</label>
              <input id="wo-date" type="date" value="${order.date || ''}">
            </div>

            <div class="wo-grid" style="margin-bottom:10px; border-radius:var(--radius-sm);">
              <div class="wo-fld">
                <div class="wo-fld-lbl">Time In</div>
                <input id="wo-time-in" class="wo-fld-inp" type="time" value="${timeIn}">
              </div>
              <div class="wo-fld">
                <div class="wo-fld-lbl">Time Out</div>
                <input id="wo-time-out" class="wo-fld-inp" type="time" value="${timeOut}">
              </div>
            </div>

            <div id="wo-time-spent-hint" class="wo-hint" style="margin-top:-2px; margin-bottom:12px;">Time on site: ${timeSpent || 'Enter both times to calculate duration.'}</div>

            <div class="form-row">
              <label for="wo-address">Address</label>
              <input id="wo-address" type="text" value="${order.address || ''}">
            </div>
          </div>
        </div>

        <div class="wo-sec">
          <div class="wo-sec-hd">Chemical Readings & Water Balance</div>
          <div class="wo-sec-bd">
            <div class="wo-blk-lbl">Pool</div>
            <div class="wo-grid">
              <div class="wo-fld"><div class="wo-fld-lbl">pH Level</div><input id="pool-ph" class="wo-fld-inp" type="number" step="0.1" value="${pool.ph || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Free Chlorine</div><input id="pool-chlorine" class="wo-fld-inp" type="number" step="0.1" value="${pool.chlorine || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Alkalinity</div><input id="pool-alkalinity" class="wo-fld-inp" type="number" value="${pool.alkalinity || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Cyanuric Acid</div><input id="pool-cya" class="wo-fld-inp" type="number" value="${pool.cya || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Calcium Hardness</div><input id="pool-calcium" class="wo-fld-inp" type="number" value="${pool.calcium || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Salt</div><input id="pool-salt" class="wo-fld-inp" type="number" value="${pool.salt || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Water Temp °F</div><input id="pool-temp" class="wo-fld-inp" type="number" value="${pool.temp || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">TDS</div><input id="pool-tds" class="wo-fld-inp" type="number" value="${pool.tds || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Phosphates</div><input id="pool-phosphates" class="wo-fld-inp" type="number" value="${pool.phosphates || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Borates</div><input id="pool-borates" class="wo-fld-inp" type="number" value="${pool.borates || ''}"></div>
            </div>

            <div class="wo-blk-lbl" style="margin-top:10px;">Spa</div>
            <div class="wo-grid">
              <div class="wo-fld"><div class="wo-fld-lbl">pH Level</div><input id="spa-ph" class="wo-fld-inp" type="number" step="0.1" value="${spa.ph || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Free Chlorine</div><input id="spa-chlorine" class="wo-fld-inp" type="number" step="0.1" value="${spa.chlorine || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Alkalinity</div><input id="spa-alkalinity" class="wo-fld-inp" type="number" value="${spa.alkalinity || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Cyanuric Acid</div><input id="spa-cya" class="wo-fld-inp" type="number" value="${spa.cya || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Calcium Hardness</div><input id="spa-calcium" class="wo-fld-inp" type="number" value="${spa.calcium || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Salt</div><input id="spa-salt" class="wo-fld-inp" type="number" value="${spa.salt || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Water Temp °F</div><input id="spa-temp" class="wo-fld-inp" type="number" value="${spa.temp || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">TDS</div><input id="spa-tds" class="wo-fld-inp" type="number" value="${spa.tds || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Phosphates</div><input id="spa-phosphates" class="wo-fld-inp" type="number" value="${spa.phosphates || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Borates</div><input id="spa-borates" class="wo-fld-inp" type="number" value="${spa.borates || ''}"></div>
            </div>
          </div>
        </div>

        <div class="wo-sec">
          <div class="wo-sec-hd">Chemicals Added</div>
          <div class="wo-sec-bd">
            <div class="wo-blk-lbl">Pool Additions</div>
            <div class="wo-grid">
              <div class="wo-fld"><div class="wo-fld-lbl">Tabs</div><input id="pool-add-tabs" class="wo-fld-inp" type="text" value="${poolAdded.tabs || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Shock / Oxidizer</div><input id="pool-add-shock" class="wo-fld-inp" type="text" value="${poolAdded.shock || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Muriatic Acid</div><input id="pool-add-muriaticAcid" class="wo-fld-inp" type="text" value="${poolAdded.muriaticAcid || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Soda Ash</div><input id="pool-add-sodaAsh" class="wo-fld-inp" type="text" value="${poolAdded.sodaAsh || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Sodium Bicarb</div><input id="pool-add-sodiumBicarb" class="wo-fld-inp" type="text" value="${poolAdded.sodiumBicarb || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Calcium Increaser</div><input id="pool-add-calcium" class="wo-fld-inp" type="text" value="${poolAdded.calcium || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Stabilizer</div><input id="pool-add-stabilizer" class="wo-fld-inp" type="text" value="${poolAdded.stabilizer || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Salt</div><input id="pool-add-salt" class="wo-fld-inp" type="text" value="${poolAdded.salt || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Phosphate Remover</div><input id="pool-add-phosphateRemover" class="wo-fld-inp" type="text" value="${poolAdded.phosphateRemover || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Algaecide</div><input id="pool-add-algaecide" class="wo-fld-inp" type="text" value="${poolAdded.algaecide || ''}"></div>
              <div class="wo-fld" style="grid-column:1 / -1"><div class="wo-fld-lbl">Other / Notes</div><input id="pool-add-other" class="wo-fld-inp" type="text" value="${poolAdded.other || ''}"></div>
            </div>

            <div class="wo-blk-lbl" style="margin-top:10px;">Spa Additions</div>
            <div class="wo-grid">
              <div class="wo-fld"><div class="wo-fld-lbl">Tabs</div><input id="spa-add-tabs" class="wo-fld-inp" type="text" value="${spaAdded.tabs || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Shock / Oxidizer</div><input id="spa-add-shock" class="wo-fld-inp" type="text" value="${spaAdded.shock || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Muriatic Acid</div><input id="spa-add-muriaticAcid" class="wo-fld-inp" type="text" value="${spaAdded.muriaticAcid || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Soda Ash</div><input id="spa-add-sodaAsh" class="wo-fld-inp" type="text" value="${spaAdded.sodaAsh || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Sodium Bicarb</div><input id="spa-add-sodiumBicarb" class="wo-fld-inp" type="text" value="${spaAdded.sodiumBicarb || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Calcium Increaser</div><input id="spa-add-calcium" class="wo-fld-inp" type="text" value="${spaAdded.calcium || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Stabilizer</div><input id="spa-add-stabilizer" class="wo-fld-inp" type="text" value="${spaAdded.stabilizer || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Salt</div><input id="spa-add-salt" class="wo-fld-inp" type="text" value="${spaAdded.salt || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Phosphate Remover</div><input id="spa-add-phosphateRemover" class="wo-fld-inp" type="text" value="${spaAdded.phosphateRemover || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Algaecide</div><input id="spa-add-algaecide" class="wo-fld-inp" type="text" value="${spaAdded.algaecide || ''}"></div>
              <div class="wo-fld" style="grid-column:1 / -1"><div class="wo-fld-lbl">Other / Notes</div><input id="spa-add-other" class="wo-fld-inp" type="text" value="${spaAdded.other || ''}"></div>
            </div>
          </div>
        </div>

        ${renderChemPhotoSection(order)}

        <div class="wo-sec">
          <div class="wo-sec-hd">Work Performed & Follow-Up</div>
          <div class="wo-sec-bd">
            <div class="form-row">
              <label for="wo-work">Work Performed</label>
              <textarea id="wo-work">${workPerformed}</textarea>
            </div>

            <div class="form-row">
              <label for="wo-notes">Issues / Follow-Up Notes</label>
              <textarea id="wo-notes">${followUpNotes}</textarea>
            </div>
          </div>
        </div>

        <div class="wo-sec">
          <div class="wo-sec-hd wo-calc-hd">LSI Calculator & Dosing Recommendations</div>
          <div class="wo-sec-bd">
            <div id="chem-guidance-preview">${renderChemDosingSummary(order)}</div>
          </div>
        </div>

        <div class="card" style="margin:12px;">
          <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-secondary" onclick="saveWorkOrderForm('${order.id}')">Save Changes</button>
            <button class="btn send-report-btn" onclick="shareReport('${order.id}')">Share Report</button>
          </div>
        </div>
      </div>
    `;

    attachChemFieldListeners(order.id);
  }

  // Quick actions
  createRoute() { showToast('Route planning can be added next.'); }
  viewRoute(id) { showToast(`Route ${id} selected`); }
  createWorkOrder(clientId = '') {
    const clients = db.get('clients', []);
    if (!clients.length) {
      showToast('Add a client first');
      this.renderClients();
      return;
    }

    const selectedClientId = clientId || clients[0].id;
    const order = workOrderManager.createOrder(selectedClientId);
    if (order) {
      this.renderWorkOrderDetail(order);
      showToast('Chem sheet created');
    }
  }
  viewWorkOrder(id) {
    const order = workOrderManager.getOrder(id);
    if (!order) {
      showToast('Work order not found');
      return;
    }
    this.renderWorkOrderDetail(order);
  }
  editWorkOrder(id) {
    const order = workOrderManager.getOrder(id);
    if (!order) {
      showToast('Work order not found');
      return;
    }
    this.renderWorkOrderDetail(order);
  }
  editClient(id) {
    const clients = db.get('clients', []);
    const client = clients.find(item => item.id === id);
    if (!client) {
      showToast('Client not found');
      return;
    }

    const name = prompt('Client name', client.name);
    if (!name) return;
    const address = prompt('Client address', client.address || '');
    if (address === null) return;

    client.name = name;
    client.address = address;
    db.set('clients', clients);
    showToast('Client updated');
    this.renderClients();
  }
}

const router = new Router();

// ==========================================
// WORK ORDER MANAGEMENT
// ==========================================
class WorkOrderManager {
  constructor() {
    this.currentOrder = null;
  }

  createOrder(clientId) {
    const clients = db.get('clients', []);
    const client = clients.find(c => c.id === clientId);
    if (!client) return null;

    const order = {
      id: Date.now().toString(),
      clientId,
      clientName: client.name,
      address: client.address,
      technician: auth.getCurrentUser()?.name || '',
      date: new Date().toISOString().split('T')[0],
      time: '',
      timeIn: '',
      timeOut: '',
      status: 'pending',
      readings: {
        pool: defaultChemReadings(),
        spa: defaultChemReadings()
      },
      chemicals: [],
      chemicalsAdded: {
        pool: defaultChemicalAdditions(),
        spa: defaultChemicalAdditions()
      },
      lsi: {
        pool: null,
        spa: null
      },
      workPerformed: '',
      followUpNotes: '',
      notes: '',
      photos: []
    };

    const orders = db.get('workorders', []);
    orders.push(order);
    db.set('workorders', orders);
    return order;
  }

  saveOrder(order) {
    const orders = db.get('workorders', []);
    const index = orders.findIndex(o => o.id === order.id);
    if (index >= 0) {
      orders[index] = order;
      db.set('workorders', orders);
      return true;
    }
    return false;
  }

  getOrder(id) {
    const orders = db.get('workorders', []);
    return orders.find(o => o.id === id);
  }

  calculateDosing(readings = {}) {
    const recommendations = [];
    const ph = parseFloat(readings.ph);
    const chlorine = parseFloat(readings.chlorine);
    const alkalinity = parseFloat(readings.alkalinity);
    const calcium = parseFloat(readings.calcium);
    const cya = parseFloat(readings.cya);
    const salt = parseFloat(readings.salt);
    const phosphates = parseFloat(readings.phosphates);
    const lsi = calculateLSI(readings);

    if (Number.isFinite(ph) && ph < 7.2) {
      recommendations.push({ chemical: 'Soda Ash', amount: '8–12 oz per 10,000 gal', reason: 'pH is running low' });
    } else if (Number.isFinite(ph) && ph > 7.8) {
      recommendations.push({ chemical: 'Muriatic Acid', amount: '12–16 oz per 10,000 gal', reason: 'pH is running high' });
    }

    if (Number.isFinite(chlorine) && chlorine < 1) {
      recommendations.push({ chemical: 'Liquid Chlorine', amount: '0.5–1 gal per 10,000 gal', reason: 'Free chlorine is low' });
    }

    if (Number.isFinite(alkalinity) && alkalinity < 80) {
      recommendations.push({ chemical: 'Sodium Bicarbonate', amount: '1.5 lb per 10,000 gal', reason: 'Alkalinity is low' });
    } else if (Number.isFinite(alkalinity) && alkalinity > 120) {
      recommendations.push({ chemical: 'Muriatic Acid', amount: '8–16 oz per 10,000 gal', reason: 'Alkalinity is high' });
    }

    if (Number.isFinite(calcium) && calcium < 200) {
      recommendations.push({ chemical: 'Calcium Increaser', amount: '1.25 lb per 10,000 gal', reason: 'Calcium hardness is low' });
    }

    if (Number.isFinite(cya) && cya < 30) {
      recommendations.push({ chemical: 'Stabilizer', amount: '13 oz per 10,000 gal', reason: 'Cyanuric acid is low' });
    } else if (Number.isFinite(cya) && cya > 80) {
      recommendations.push({ chemical: 'Dilution / Water Exchange', amount: 'Partial drain and refill', reason: 'Cyanuric acid is high' });
    }

    if (Number.isFinite(salt) && salt > 0 && salt < 2800) {
      recommendations.push({ chemical: 'Pool Salt', amount: '40 lb bag as needed', reason: 'Salt is below ideal range' });
    }

    if (Number.isFinite(phosphates) && phosphates > 500) {
      recommendations.push({ chemical: 'Phosphate Remover', amount: 'Per label dose', reason: 'Phosphates are elevated' });
    }

    if (lsi.score !== null && lsi.score < -0.3) {
      recommendations.push({ chemical: 'Balance Adjustment', amount: 'Raise pH / alkalinity / calcium', reason: `LSI is low (${lsi.formatted})` });
    } else if (lsi.score !== null && lsi.score > 0.3) {
      recommendations.push({ chemical: 'Balance Adjustment', amount: 'Lower pH / alkalinity / calcium', reason: `LSI is high (${lsi.formatted})` });
    }

    return recommendations;
  }

  generateReport(order) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const reportTitle = 'Chem Sheet Report';
    let y = applyOasisPdfBranding(doc, reportTitle);

    const ensureSpace = (needed = 20) => {
      if (y + needed > 270) {
        doc.addPage();
        y = applyOasisPdfBranding(doc, reportTitle);
      }
    };

    const addSectionTitle = title => {
      ensureSpace(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(13, 43, 69);
      doc.setFontSize(13);
      doc.text(title, 20, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
    };

    const addLine = (text, indent = 20) => {
      ensureSpace(7);
      doc.text(String(text), indent, y);
      y += 6;
    };

    const addWrappedSection = (title, text) => {
      if (!text) return;
      addSectionTitle(title);
      const lines = doc.splitTextToSize(String(text), 170);
      doc.text(lines, 20, y);
      y += lines.length * 5 + 5;
    };

    const addReadingsSection = (title, readings) => {
      const labels = {
        ph: 'pH',
        chlorine: 'Free Chlorine',
        alkalinity: 'Alkalinity',
        cya: 'Cyanuric Acid',
        calcium: 'Calcium Hardness',
        salt: 'Salt',
        temp: 'Water Temp °F',
        tds: 'TDS',
        phosphates: 'Phosphates',
        borates: 'Borates'
      };

      const entries = Object.entries(readings || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined);
      if (!entries.length) return;

      addSectionTitle(title);
      entries.forEach(([key, value]) => addLine(`${labels[key] || key}: ${value}`));
      y += 2;
    };

    const addChemicalAdditionsSection = (title, additions) => {
      const entries = getChemicalAdditionEntries(additions);
      if (!entries.length) return;
      addSectionTitle(title);
      entries.forEach(entry => addLine(entry));
      y += 2;
    };

    const addPhotoSection = photos => {
      const entries = normalizeChemPhotos(photos)
        .map((src, index) => src ? { src, label: CHEM_PHOTO_LABELS[index] } : null)
        .filter(Boolean);

      if (!entries.length) return;

      addSectionTitle('Service Photos');
      const photoWidth = 78;
      const photoHeight = 56;
      let column = 0;

      entries.forEach(photo => {
        if (column === 0) ensureSpace(photoHeight + 14);
        const x = column === 0 ? 20 : 110;
        try {
          doc.addImage(photo.src, photo.src.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, photoWidth, photoHeight);
        } catch (error) {
          doc.rect(x, y, photoWidth, photoHeight);
          doc.text('Photo unavailable', x + 16, y + 28);
        }
        doc.text(photo.label, x, y + photoHeight + 5);

        if (column === 1) {
          y += photoHeight + 12;
          column = 0;
        } else {
          column = 1;
        }
      });

      if (column === 1) y += photoHeight + 12;
    };

    const timeIn = order.timeIn || order.time || '';
    const timeOut = order.timeOut || '';
    const timeSpent = calculateTimeSpent(timeIn, timeOut);

    addLine(`Customer: ${order.clientName || ''}`);
    addLine(`Technician: ${order.technician || ''}`);
    addLine(`Address: ${order.address || ''}`);
    addLine(`Date: ${order.date || ''}`);
    if (timeIn) addLine(`Time In: ${timeIn}`);
    if (timeOut) addLine(`Time Out: ${timeOut}`);
    if (timeSpent) addLine(`Time on Site: ${timeSpent}`);
    y += 4;

    addReadingsSection('Pool Readings', order.readings?.pool || {});
    addReadingsSection('Spa Readings', order.readings?.spa || {});

    const poolLsi = calculateLSI(order.readings?.pool || {});
    const spaLsi = calculateLSI(order.readings?.spa || {});
    if (poolLsi.score !== null || spaLsi.score !== null) {
      addSectionTitle('Water Balance');
      if (poolLsi.score !== null) addLine(`Pool LSI: ${poolLsi.formatted} (${poolLsi.label})`);
      if (spaLsi.score !== null) addLine(`Spa LSI: ${spaLsi.formatted} (${spaLsi.label})`);
      y += 2;
    }

    addChemicalAdditionsSection('Pool Chemicals Added', order.chemicalsAdded?.pool || {});
    addChemicalAdditionsSection('Spa Chemicals Added', order.chemicalsAdded?.spa || {});

    const sourceReadings = Object.values(order.readings?.pool || {}).some(value => value !== '' && value !== null && value !== undefined)
      ? (order.readings?.pool || {})
      : (order.readings?.spa || {});
    const recommendations = Array.isArray(order.chemicals) && order.chemicals.length
      ? order.chemicals
      : this.calculateDosing(sourceReadings);

    if (recommendations.length) {
      addSectionTitle('Chemical Recommendations');
      recommendations.forEach(chem => addLine(`${chem.chemical}: ${chem.amount} — ${chem.reason}`));
      y += 2;
    }

    addWrappedSection('Work Performed', order.workPerformed || '');
    addWrappedSection('Issues / Follow-Up Notes', order.followUpNotes || order.notes || '');
    addPhotoSection(order.photos || []);

    doc.save(`OASIS_Service_Repair_${order.clientName}_${order.date}.pdf`);
    showToast('Report saved to device');
  }
}

const workOrderManager = new WorkOrderManager();

function migrateLegacyRepairData() {
  const legacyClientsRaw = window.localStorage.getItem('oasis_repairs_clients');
  const legacyOrdersRaw = window.localStorage.getItem('oasis_repairs_orders');

  if (legacyClientsRaw) {
    try {
      const legacyClients = JSON.parse(legacyClientsRaw);
      const currentClients = db.get('clients', []);
      const mergedClients = [...currentClients];

      legacyClients.forEach(client => {
        const exists = mergedClients.some(item => item.id === client.id || (item.name === client.name && item.address === client.address));
        if (!exists) {
          mergedClients.push(client);
        }
      });

      db.set('clients', mergedClients);
    } catch (error) {
      console.warn('Legacy repair clients migration failed', error);
    }
  }

  if (legacyOrdersRaw && !db.get('repairOrders', null)) {
    try {
      db.set('repairOrders', JSON.parse(legacyOrdersRaw));
    } catch (error) {
      console.warn('Legacy repair orders migration failed', error);
    }
  }
}

function seedTestClients() {
  const existingClients = db.get('clients', []);
  if (existingClients.length) return;

  db.set('clients', [
    {
      id: 'c101',
      name: 'Villa Azure',
      address: 'Seven Mile Beach',
      contact: 'Property Manager'
    },
    {
      id: 'c102',
      name: 'Harbour Point',
      address: 'West Bay Road',
      contact: 'Maintenance Office'
    },
    {
      id: 'c103',
      name: 'Palm Bay Retreat',
      address: 'Rum Point',
      contact: 'Site Supervisor'
    },
    {
      id: 'c104',
      name: 'Ocean Crest Residence',
      address: 'South Sound',
      contact: 'Homeowner'
    }
  ]);
}

function getRepairOrders() {
  return db.get('repairOrders', []);
}

function saveRepairOrders(orders) {
  db.set('repairOrders', orders);
}

// ==========================================
// UTILITIES
// ==========================================
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
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function defaultChemReadings() {
  return {
    ph: '',
    chlorine: '',
    alkalinity: '',
    calcium: '',
    cya: '',
    salt: '',
    temp: '',
    tds: '',
    phosphates: '',
    borates: ''
  };
}

function defaultChemicalAdditions() {
  return {
    tabs: '',
    shock: '',
    muriaticAcid: '',
    sodaAsh: '',
    sodiumBicarb: '',
    calcium: '',
    stabilizer: '',
    salt: '',
    phosphateRemover: '',
    algaecide: '',
    other: ''
  };
}

function getChemicalAdditionLabel(key) {
  const labels = {
    liquidChlorine: 'Liquid Chlorine',
    tabs: 'Tabs',
    shock: 'Shock / Oxidizer',
    muriaticAcid: 'Muriatic Acid',
    sodaAsh: 'Soda Ash',
    sodiumBicarb: 'Sodium Bicarb',
    calcium: 'Calcium Increaser',
    stabilizer: 'Stabilizer',
    salt: 'Salt',
    phosphateRemover: 'Phosphate Remover',
    algaecide: 'Algaecide',
    other: 'Other / Notes'
  };

  return labels[key] || key;
}

function getChemicalAdditionEntries(section = {}) {
  const knownKeys = Object.keys(defaultChemicalAdditions());
  return knownKeys
    .filter(key => section[key] !== '' && section[key] !== null && section[key] !== undefined)
    .map(key => `${getChemicalAdditionLabel(key)}: ${section[key]}`);
}

function calculateTimeSpent(timeIn = '', timeOut = '') {
  if (!timeIn || !timeOut) return '';

  const [startHour, startMinute] = String(timeIn).split(':').map(Number);
  const [endHour, endMinute] = String(timeOut).split(':').map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return '';

  let start = (startHour * 60) + startMinute;
  let end = (endHour * 60) + endMinute;
  if (end < start) end += 24 * 60;

  const totalMinutes = end - start;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function calculateLSI(readings = {}) {
  const ph = parseFloat(readings.ph);
  const alkalinity = parseFloat(readings.alkalinity);
  const calcium = parseFloat(readings.calcium);
  const tempF = parseFloat(readings.temp);
  const cya = parseFloat(readings.cya) || 0;
  const borates = parseFloat(readings.borates) || 0;
  const tds = Math.max(parseFloat(readings.tds) || 1000, 100);

  if (![ph, alkalinity, calcium, tempF].every(Number.isFinite)) {
    return {
      score: null,
      formatted: '—',
      label: 'Need pH, alkalinity, calcium and temp',
      state: 'na',
      badgeClass: 'lsi-bdg-na',
      boxClass: 'lsi-na',
      position: 50,
      adjustedAlkalinity: null
    };
  }

  const adjustedAlkalinity = Math.max(alkalinity - (cya * 0.33) - (borates * 0.1), 1);
  const tempK = ((tempF - 32) * 5 / 9) + 273.15;
  const aFactor = (Math.log10(tds) - 1) / 10;
  const bFactor = -13.12 * Math.log10(tempK) + 34.55;
  const cFactor = Math.log10(Math.max(calcium, 1)) - 0.4;
  const dFactor = Math.log10(adjustedAlkalinity);
  const saturationPH = (9.3 + aFactor + bFactor) - (cFactor + dFactor);
  const score = ph - saturationPH;

  let label = 'Balanced';
  let state = 'ok';
  let badgeClass = 'lsi-bdg-ok';
  let boxClass = 'lsi-ok';

  if (score < -0.6) {
    label = 'Corrosive';
    state = 'bad';
    badgeClass = 'lsi-bdg-bad';
    boxClass = 'lsi-bad';
  } else if (score < -0.3) {
    label = 'Slightly Low';
    state = 'warn';
    badgeClass = 'lsi-bdg-warn';
    boxClass = 'lsi-warn';
  } else if (score > 0.6) {
    label = 'Scale Forming';
    state = 'bad';
    badgeClass = 'lsi-bdg-bad';
    boxClass = 'lsi-bad';
  } else if (score > 0.3) {
    label = 'Slightly High';
    state = 'warn';
    badgeClass = 'lsi-bdg-warn';
    boxClass = 'lsi-warn';
  }

  const normalized = Math.max(-1, Math.min(1, score));

  return {
    score,
    formatted: score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2),
    label,
    state,
    badgeClass,
    boxClass,
    position: ((normalized + 1) / 2) * 100,
    adjustedAlkalinity: adjustedAlkalinity.toFixed(0)
  };
}

function renderLsiBox(title, readings = {}) {
  const result = calculateLSI(readings);

  if (result.score === null) {
    return `<div class="lsi-box lsi-na"><strong>${escapeHtml(title)} LSI:</strong> ${escapeHtml(result.label)}</div>`;
  }

  return `
    <div class="lsi-box ${result.boxClass}">
      <div class="lsi-main">
        <div>
          <div class="lsi-val">${escapeHtml(result.formatted)}</div>
          <div class="lsi-name">${escapeHtml(title)} LSI</div>
        </div>
        <div class="lsi-badge ${result.badgeClass}">${escapeHtml(result.label)}</div>
      </div>
      <div class="lsi-track"><span class="lsi-dot" style="left:${result.position}%;"></span></div>
      <div class="lsi-labels"><span>Corrosive</span><span>Ideal</span><span>Scaling</span></div>
      <div class="lsi-ideal">Ideal range: -0.30 to +0.30 • Adjusted alkalinity: ${escapeHtml(result.adjustedAlkalinity)} ppm</div>
    </div>
  `;
}

function renderChemDosingSummary(order) {
  const pool = { ...defaultChemReadings(), ...(order.readings?.pool || {}) };
  const spa = { ...defaultChemReadings(), ...(order.readings?.spa || {}) };
  const hasAnyInput = [...Object.values(pool), ...Object.values(spa)].some(value => value !== '' && value !== null && value !== undefined);

  if (!hasAnyInput) {
    return `
      <div class="dosing-empty">
        <div class="empty-icon">🧪</div>
        <div>Enter pool or spa readings to calculate LSI and restore the full original chem guidance.</div>
      </div>
    `;
  }

  const sourceReadings = Object.values(pool).some(value => value !== '' && value !== null && value !== undefined) ? pool : spa;
  const recommendations = Array.isArray(order.chemicals) && order.chemicals.length
    ? order.chemicals
    : workOrderManager.calculateDosing(sourceReadings);

  return `
    <div class="wo-grid" style="margin-bottom:12px;">
      ${renderLsiBox('Pool', pool)}
      ${renderLsiBox('Spa', spa)}
    </div>
    ${recommendations.length ? `
      <div class="dosing-hdr">Recommended additions based on current readings</div>
      ${recommendations.map(chem => {
        const reason = String(chem.reason || '');
        const tone = reason.toLowerCase().includes('low') ? 'dosing-low' : 'dosing-high';
        return `
          <div class="dosing-item ${tone}">
            <div class="dosing-top">
              <strong>${escapeHtml(chem.chemical || '')}</strong>
              <span class="dosing-add">${escapeHtml(chem.amount || '')}</span>
            </div>
            <div class="dosing-note">${escapeHtml(reason)}</div>
          </div>
        `;
      }).join('')}
    ` : `<div class="dosing-all-ok">Water balance looks in range. No immediate additions recommended.</div>`}
  `;
}

const CHEM_PHOTO_LABELS = ['Before', 'After', 'Photo 1', 'Photo 2', 'Photo 3', 'Photo 4', 'Photo 5'];

function normalizeChemPhotos(photos = []) {
  const source = Array.isArray(photos) ? photos : [];
  return CHEM_PHOTO_LABELS.map((_, index) => source[index] || '');
}

function renderChemPhotoSlot(orderId, label, photo, index) {
  const safeLabel = escapeHtml(label);
  return `
    <div class="photo-slot" id="photo-slot-${index}">
      <div class="photo-slot-lbl">${safeLabel}</div>
      <div class="photo-preview-box">
        ${photo ? `
          <img class="photo-thumb" src="${photo}" alt="${safeLabel}">
          <button type="button" class="photo-remove" onclick="removeChemPhoto('${orderId}', ${index})" aria-label="Remove ${safeLabel} photo">&times;</button>
        ` : `<div class="photo-add-btn">Add ${safeLabel} photo</div>`}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <label class="btn btn-secondary btn-sm" for="photo-camera-${index}">Take Photo</label>
        <label class="btn btn-secondary btn-sm" for="photo-gallery-${index}">Choose Photo</label>
      </div>
      <input id="photo-camera-${index}" class="photo-file-inp" type="file" accept="image/*" capture="environment" onchange="handleChemPhotoUpload('${orderId}', ${index}, event)">
      <input id="photo-gallery-${index}" class="photo-file-inp" type="file" accept="image/*" onchange="handleChemPhotoUpload('${orderId}', ${index}, event)">
    </div>
  `;
}

function renderChemPhotoSection(order) {
  const photos = normalizeChemPhotos(order.photos);
  const beforeAfter = CHEM_PHOTO_LABELS.slice(0, 2)
    .map((label, index) => renderChemPhotoSlot(order.id, label, photos[index], index))
    .join('');
  const extras = CHEM_PHOTO_LABELS.slice(2)
    .map((label, offset) => renderChemPhotoSlot(order.id, label, photos[offset + 2], offset + 2))
    .join('');

  return `
    <div class="wo-sec">
      <div class="wo-sec-hd wo-photo-hd">Service Photos</div>
      <div class="wo-sec-bd">
        <div class="photo-ba-row">${beforeAfter}</div>
        <div class="photo-extra-grid">${extras}</div>
      </div>
    </div>
  `;
}

function resizeImageForStorage(file, maxDimension = 1280, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = event => {
      const image = new Image();
      image.onload = () => {
        let { width, height } = image;
        const scale = Math.min(1, maxDimension / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      image.onerror = () => resolve(event.target?.result || '');
      image.src = event.target?.result || '';
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleChemPhotoUpload(orderId, slotIndex, event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const order = collectWorkOrderForm(orderId);
  if (!order) {
    showToast('Chem sheet not found');
    return;
  }

  try {
    showToast('Processing photo...');
    const dataUrl = await resizeImageForStorage(file);
    const photos = normalizeChemPhotos(order.photos);
    photos[slotIndex] = dataUrl;
    order.photos = photos;

    // Save to database
    workOrderManager.saveOrder(order);

    // Update ONLY the photo slot in the UI to prevent blank screen/data loss
    const slot = document.getElementById(`photo-slot-${slotIndex}`);
    if (slot) {
      const label = CHEM_PHOTO_LABELS[slotIndex];
      slot.outerHTML = renderChemPhotoSlot(orderId, label, dataUrl, slotIndex);
    } else {
      // Fallback if slot not found
      router.renderWorkOrderDetail(order);
    }

    showToast('Photo added');
  } catch (error) {
    console.error('Photo upload failed', error);
    showToast('Unable to add photo');
  } finally {
    if (event?.target) event.target.value = '';
  }
}

function removeChemPhoto(orderId, slotIndex) {
  const order = collectWorkOrderForm(orderId);
  if (!order) {
    showToast('Chem sheet not found');
    return;
  }

  const photos = normalizeChemPhotos(order.photos);
  photos[slotIndex] = '';
  order.photos = photos;

  // Save to database
  workOrderManager.saveOrder(order);

  // Update ONLY the photo slot in the UI
  const slot = document.getElementById(`photo-slot-${slotIndex}`);
  if (slot) {
    const label = CHEM_PHOTO_LABELS[slotIndex];
    slot.outerHTML = renderChemPhotoSlot(orderId, label, '', slotIndex);
  } else {
    router.renderWorkOrderDetail(order);
  }

  showToast('Photo removed');
}

function applyOasisPdfBranding(doc, title, subtitle = 'OASIS Service & Repair') {
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, 210, 24, 'F');
  doc.setFillColor(212, 175, 55);
  doc.rect(0, 24, 210, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(212, 175, 55);
  doc.setFontSize(22);
  doc.text('OASIS', 20, 15);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(subtitle, 20, 21);

  doc.setTextColor(13, 43, 69);
  doc.setFontSize(18);
  doc.text(title, 20, 38);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  return 48;
}

function getRepairCatalogData() {
  return window.TECH_WO_CATALOG_DATA || {};
}

function getRepairCatalogCategories() {
  return Object.keys(getRepairCatalogData());
}

function getRepairCatalogItems(category = '') {
  const catalog = getRepairCatalogData();
  return Array.isArray(catalog[category]) ? catalog[category] : [];
}

function normalizeRepairPartItems(parts = []) {
  const source = Array.isArray(parts) && parts.length ? parts : [{}];
  return source.map(part => ({
    category: part.category || '',
    partNumber: part.partNumber || '',
    product: part.product || '',
    qty: part.qty || '1',
    unitPrice: part.unitPrice || ''
  }));
}

function buildRepairPartsSummary(parts = []) {
  return normalizeRepairPartItems(parts)
    .filter(part => part.category || part.partNumber || part.product)
    .map(part => {
      const qty = part.qty || '1';
      const name = part.product || part.partNumber || 'Part';
      const category = part.category ? `${part.category}: ` : '';
      const partNumber = part.partNumber ? ` (${part.partNumber})` : '';
      const price = part.unitPrice ? ` @ $${Number(part.unitPrice).toFixed(2)}` : '';
      return `${qty} × ${category}${name}${partNumber}${price}`;
    })
    .join('\n');
}

function renderRepairPartRow(orderId, part, index) {
  const categories = getRepairCatalogCategories();
  const items = getRepairCatalogItems(part.category);
  const selectedItem = items.find(item => item.partNumber === part.partNumber)
    || items.find(item => item.product === part.product)
    || null;

  return `
    <div class="repair-part-row" data-index="${index}" style="margin-bottom:10px;">
      <div class="wo-grid" style="border-radius:var(--radius-sm); margin-bottom:6px;">
        <div class="wo-fld">
          <div class="wo-fld-lbl">Category</div>
          <select class="repair-part-category" onchange="refreshRepairOrderBuilder('${orderId || ''}')">
            <option value="">— Select category —</option>
            ${categories.map(category => `
              <option value="${escapeHtml(category)}" ${category === part.category ? 'selected' : ''}>${escapeHtml(category)}</option>
            `).join('')}
          </select>
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Equipment / Part</div>
          <select class="repair-part-product" onchange="refreshRepairOrderBuilder('${orderId || ''}')">
            <option value="">— Select equipment —</option>
            ${items.map(item => `
              <option value="${escapeHtml(item.partNumber)}"
                data-product="${escapeHtml(item.product)}"
                data-price="${escapeHtml(String(item.price ?? ''))}"
                ${item.partNumber === part.partNumber ? 'selected' : ''}>
                ${escapeHtml(item.product)}${item.partNumber ? ` — ${escapeHtml(item.partNumber)}` : ''}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Quantity</div>
          <input class="wo-fld-inp repair-part-qty" type="number" min="1" step="1" value="${escapeHtml(String(part.qty || '1'))}">
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Part Details</div>
          <div style="font-size:12px; color:var(--gray-600); line-height:1.5; min-height:38px;">
            ${selectedItem ? `${escapeHtml(selectedItem.partNumber || '')}${selectedItem.price ? ` • $${Number(selectedItem.price).toFixed(2)}` : ''}` : 'Choose a category and equipment item.'}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="removeRepairPartRow('${orderId || ''}', ${index})">Remove</button>
        </div>
      </div>
    </div>
  `;
}

function renderRepairPartsBuilder(orderId, order) {
  const rows = normalizeRepairPartItems(order.partsItems || []);
  return `
    <div class="wo-hint">Select parts by category, choose the equipment item, and enter the quantity used on the job.</div>
    ${rows.map((part, index) => renderRepairPartRow(orderId, part, index)).join('')}
    <button type="button" class="btn btn-secondary btn-sm" onclick="addRepairPartRow('${orderId || ''}')">+ Add Another Part / Equipment</button>
  `;
}

function refreshRepairOrderBuilder(orderId = '') {
  const draft = collectRepairOrderFromForm(orderId);
  if (!draft) return;
  renderRepairOrderForm(draft.id || orderId, '', draft);
}

function addRepairPartRow(orderId = '') {
  const draft = collectRepairOrderFromForm(orderId) || { id: orderId || '', partsItems: [] };
  draft.partsItems = normalizeRepairPartItems(draft.partsItems || []);
  draft.partsItems.push({ category: '', partNumber: '', product: '', qty: '1', unitPrice: '' });
  renderRepairOrderForm(draft.id || orderId, '', draft);
}

function removeRepairPartRow(orderId = '', index = 0) {
  const draft = collectRepairOrderFromForm(orderId) || { id: orderId || '', partsItems: [] };
  const rows = normalizeRepairPartItems(draft.partsItems || []).filter((_, rowIndex) => rowIndex !== index);
  draft.partsItems = rows.length ? rows : [{ category: '', partNumber: '', product: '', qty: '1', unitPrice: '' }];
  renderRepairOrderForm(draft.id || orderId, '', draft);
}

function updateRepairTimeSpentHint() {
  const hint = document.getElementById('repair-time-spent-hint');
  if (!hint) return;

  const timeIn = document.getElementById('repair-time-in')?.value || '';
  const timeOut = document.getElementById('repair-time-out')?.value || '';
  const spent = calculateTimeSpent(timeIn, timeOut);
  hint.textContent = `Time on site: ${spent || 'Enter both times to calculate duration.'}`;
}

function attachRepairFormListeners() {
  const timeIn = document.getElementById('repair-time-in');
  const timeOut = document.getElementById('repair-time-out');
  if (timeIn) timeIn.addEventListener('input', updateRepairTimeSpentHint);
  if (timeOut) timeOut.addEventListener('input', updateRepairTimeSpentHint);
  if (timeIn) timeIn.addEventListener('change', updateRepairTimeSpentHint);
  if (timeOut) timeOut.addEventListener('change', updateRepairTimeSpentHint);
  updateRepairTimeSpentHint();
}

const REPAIR_PHOTO_LABELS = ['Before', 'After', 'Equipment', 'Part', 'Repair Area', 'Photo 5', 'Photo 6'];

function normalizeRepairPhotos(photos = []) {
  const source = Array.isArray(photos) ? photos : [];
  return REPAIR_PHOTO_LABELS.map((_, index) => source[index] || '');
}

function renderRepairPhotoSlot(orderId, label, photo, index) {
  const safeLabel = escapeHtml(label);
  return `
    <div class="photo-slot">
      <div class="photo-slot-lbl">${safeLabel}</div>
      <div class="photo-preview-box">
        ${photo ? `
          <img class="photo-thumb" data-repair-photo-index="${index}" src="${photo}" alt="${safeLabel}">
          <button type="button" class="photo-remove" onclick="removeRepairPhoto('${orderId || ''}', ${index})" aria-label="Remove ${safeLabel} photo">&times;</button>
        ` : `<div class="photo-add-btn">Add ${safeLabel} photo</div>`}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <label class="btn btn-secondary btn-sm" for="repair-photo-camera-${index}">Take Photo</label>
        <label class="btn btn-secondary btn-sm" for="repair-photo-gallery-${index}">Choose Photo</label>
      </div>
      <input id="repair-photo-camera-${index}" class="photo-file-inp" type="file" accept="image/*" capture="environment" onchange="handleRepairPhotoUpload('${orderId || ''}', ${index}, event)">
      <input id="repair-photo-gallery-${index}" class="photo-file-inp" type="file" accept="image/*" onchange="handleRepairPhotoUpload('${orderId || ''}', ${index}, event)">
    </div>
  `;
}

function renderRepairPhotoSection(orderId, order) {
  const photos = normalizeRepairPhotos(order.photos);
  const beforeAfter = REPAIR_PHOTO_LABELS.slice(0, 2)
    .map((label, index) => renderRepairPhotoSlot(orderId, label, photos[index], index))
    .join('');
  const extras = REPAIR_PHOTO_LABELS.slice(2)
    .map((label, offset) => renderRepairPhotoSlot(orderId, label, photos[offset + 2], offset + 2))
    .join('');

  return `
    <div class="form-row">
      <label>Work Order Photos</label>
      <div class="photo-ba-row">${beforeAfter}</div>
      <div class="photo-extra-grid" style="margin-top:8px;">${extras}</div>
    </div>
  `;
}

async function handleRepairPhotoUpload(orderId, slotIndex, event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const order = collectRepairOrderFromForm(orderId);
  if (!order) {
    showToast('Repair work order not found');
    return;
  }

  try {
    const dataUrl = await resizeImageForStorage(file);
    const photos = normalizeRepairPhotos(order.photos);
    photos[slotIndex] = dataUrl;
    order.photos = photos;
    renderRepairOrderForm(order.id || orderId, '', order);
    showToast('Repair photo added');
  } catch (error) {
    console.error('Repair photo upload failed', error);
    showToast('Unable to add repair photo');
  } finally {
    if (event?.target) event.target.value = '';
  }
}

function removeRepairPhoto(orderId, slotIndex) {
  const order = collectRepairOrderFromForm(orderId);
  if (!order) {
    showToast('Repair work order not found');
    return;
  }

  const photos = normalizeRepairPhotos(order.photos);
  photos[slotIndex] = '';
  order.photos = photos;
  renderRepairOrderForm(order.id || orderId, '', order);
  showToast('Repair photo removed');
}

function renderRepairOrdersList() {
  const orders = getRepairOrders();

  if (!orders.length) {
    return `
      <div class="empty-state">
        <div class="empty-icon">🛠️</div>
        <div class="empty-title">No repair work orders</div>
        <div class="empty-subtitle">Create one to manage service repairs in the same app</div>
      </div>
    `;
  }

  return orders.map(order => `
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
        <button class="btn btn-primary btn-sm" onclick="saveRepairWorkOrder('${escapeHtml(order.id)}', true)">PDF</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRepairOrder('${escapeHtml(order.id)}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderRepairOrderForm(orderId = '', presetClientId = '', draftOrder = null) {
  const content = document.getElementById('main-content');
  const existing = !draftOrder && orderId ? getRepairOrders().find(order => order.id === orderId) : null;
  const clients = db.get('clients', []);
  const order = draftOrder || existing || {
    id: orderId || '',
    clientId: presetClientId,
    clientName: '',
    address: '',
    date: new Date().toISOString().split('T')[0],
    time: '',
    timeIn: '',
    timeOut: '',
    assignedTo: auth.getCurrentUser()?.name || '',
    status: 'open',
    jobType: '',
    priority: 'Normal',
    summary: '',
    materials: '',
    partsItems: [],
    partsSummary: '',
    labourHours: '',
    notes: '',
    photos: []
  };

  const activeOrderId = order.id || orderId || '';
  const timeIn = order.timeIn || order.time || '';
  const timeOut = order.timeOut || '';
  const timeSpent = calculateTimeSpent(timeIn, timeOut);

  content.innerHTML = `
    <div class="section-header">
      <div class="section-title">${activeOrderId ? 'Edit Technician Work Order' : 'New Technician Work Order'}</div>
      <button class="btn btn-secondary btn-sm" onclick="router.renderWorkOrders()">← Back</button>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="form-row">
          <label for="repair-client">Client</label>
          <select id="repair-client" onchange="onRepairClientChange()">
            <option value="">— Select client —</option>
            ${clients.map(client => `<option value="${escapeHtml(client.id)}" ${client.id === (order.clientId || presetClientId) ? 'selected' : ''}>${escapeHtml(client.name)}</option>`).join('')}
          </select>
        </div>

        <div class="form-row">
          <label for="repair-address">Address</label>
          <input id="repair-address" type="text" value="${escapeHtml(order.address || '')}">
        </div>

        <div class="wo-grid" style="margin-bottom:12px; border-radius:var(--radius-sm);">
          <div class="wo-fld">
            <div class="wo-fld-lbl">Date</div>
            <input id="repair-date" class="wo-fld-inp" type="date" value="${escapeHtml(order.date || '')}">
          </div>
          <div class="wo-fld">
            <div class="wo-fld-lbl">Assigned Tech</div>
            <input id="repair-tech" class="wo-fld-inp" type="text" value="${escapeHtml(order.assignedTo || '')}">
          </div>
          <div class="wo-fld">
            <div class="wo-fld-lbl">Time In</div>
            <input id="repair-time-in" class="wo-fld-inp" type="time" value="${escapeHtml(timeIn)}">
          </div>
          <div class="wo-fld">
            <div class="wo-fld-lbl">Time Out</div>
            <input id="repair-time-out" class="wo-fld-inp" type="time" value="${escapeHtml(timeOut)}">
          </div>
        </div>

        <div id="repair-time-spent-hint" class="wo-hint">Time on site: ${escapeHtml(timeSpent || 'Enter both times to calculate duration.')}</div>

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
          <label>Parts / Equipment</label>
          ${renderRepairPartsBuilder(activeOrderId, order)}
        </div>

        <div class="form-row">
          <label for="repair-materials">Additional Parts Notes</label>
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

        ${renderRepairPhotoSection(activeOrderId, order)}

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
          <button class="btn btn-primary" onclick="saveRepairWorkOrder('${escapeHtml(activeOrderId)}')">Save Work Order</button>
          <button class="btn send-report-btn" onclick="saveRepairWorkOrder('${escapeHtml(activeOrderId)}', true)">Share Report</button>
        </div>
      </div>
    </div>
  `;

  onRepairClientChange();
  attachRepairFormListeners();
}

function onRepairClientChange() {
  const select = document.getElementById('repair-client');
  const address = document.getElementById('repair-address');
  if (!select || !address) return;

  const client = db.get('clients', []).find(item => item.id === select.value);
  if (client) {
    address.value = client.address || '';
  }
}

function collectRepairOrderFromForm(orderId = '') {
  const clientId = document.getElementById('repair-client')?.value || '';
  const client = db.get('clients', []).find(item => item.id === clientId);
  const partItems = Array.from(document.querySelectorAll('.repair-part-row')).map(row => {
    const category = row.querySelector('.repair-part-category')?.value || '';
    const productSelect = row.querySelector('.repair-part-product');
    const selectedOption = productSelect?.selectedOptions?.[0] || null;
    const qty = row.querySelector('.repair-part-qty')?.value || '1';

    return {
      category,
      partNumber: productSelect?.value || '',
      product: selectedOption?.dataset.product || selectedOption?.textContent?.split(' — ')[0] || '',
      qty,
      unitPrice: selectedOption?.dataset.price || ''
    };
  }).filter(part => part.category || part.partNumber || part.product);

  const timeIn = document.getElementById('repair-time-in')?.value || '';
  const timeOut = document.getElementById('repair-time-out')?.value || '';
  const existing = orderId ? getRepairOrders().find(item => item.id === orderId) : null;
  const photos = REPAIR_PHOTO_LABELS.map((_, index) => {
    const preview = document.querySelector(`[data-repair-photo-index="${index}"]`);
    return preview?.getAttribute('src') || existing?.photos?.[index] || '';
  });

  return {
    id: orderId || existing?.id || `r${Date.now()}`,
    clientId,
    clientName: client?.name || existing?.clientName || 'Unassigned Client',
    address: document.getElementById('repair-address')?.value || '',
    date: document.getElementById('repair-date')?.value || '',
    time: timeIn,
    timeIn,
    timeOut,
    assignedTo: document.getElementById('repair-tech')?.value || '',
    status: document.getElementById('repair-status')?.value || 'open',
    jobType: document.getElementById('repair-type')?.value || '',
    priority: document.getElementById('repair-priority')?.value || 'Normal',
    summary: document.getElementById('repair-summary')?.value || '',
    materials: document.getElementById('repair-materials')?.value || '',
    partsItems: partItems,
    partsSummary: buildRepairPartsSummary(partItems),
    labourHours: document.getElementById('repair-labour')?.value || '',
    notes: document.getElementById('repair-notes')?.value || '',
    photos
  };
}

function saveRepairWorkOrder(orderId = '', downloadAfterSave = false) {
  const order = collectRepairOrderFromForm(orderId);
  const orders = getRepairOrders();
  const index = orders.findIndex(item => item.id === order.id);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }

  saveRepairOrders(orders);
  showToast('Repair work order saved');

  if (downloadAfterSave) {
    downloadRepairPDF(order.id);
    return;
  }

  router.renderWorkOrders();
}

function downloadRepairPDF(orderId) {
  const order = getRepairOrders().find(item => item.id === orderId);
  if (!order || !window.jspdf) {
    showToast('Unable to generate PDF');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = applyOasisPdfBranding(doc, 'Repair Work Order');

  const ensureSpace = (needed = 20) => {
    if (y + needed > 270) {
      doc.addPage();
      y = applyOasisPdfBranding(doc, 'Repair Work Order');
    }
  };

  const addLine = (label, value) => {
    ensureSpace(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value || ''), 55, y);
    y += 8;
  };

  const addWrappedSection = (title, text) => {
    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 43, 69);
    doc.setFontSize(13);
    doc.text(title, 20, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(text || '', 170);
    doc.text(lines, 20, y);
    y += lines.length * 6 + 8;
  };

  const addPhotoSection = photos => {
    const entries = normalizeRepairPhotos(photos)
      .map((src, index) => src ? { src, label: REPAIR_PHOTO_LABELS[index] } : null)
      .filter(Boolean);

    if (!entries.length) return;

    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 43, 69);
    doc.setFontSize(13);
    doc.text('Work Order Photos', 20, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    const photoWidth = 78;
    const photoHeight = 56;
    let column = 0;

    entries.forEach(photo => {
      if (column === 0) ensureSpace(photoHeight + 14);
      const x = column === 0 ? 20 : 110;
      try {
        doc.addImage(photo.src, photo.src.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, photoWidth, photoHeight);
      } catch (error) {
        doc.rect(x, y, photoWidth, photoHeight);
        doc.text('Photo unavailable', x + 16, y + 28);
      }
      doc.text(photo.label, x, y + photoHeight + 5);

      if (column === 1) {
        y += photoHeight + 12;
        column = 0;
      } else {
        column = 1;
      }
    });

    if (column === 1) y += photoHeight + 12;
  };

  const timeIn = order.timeIn || order.time || '';
  const timeOut = order.timeOut || '';
  const timeSpent = calculateTimeSpent(timeIn, timeOut);
  const partsSummary = order.partsSummary || buildRepairPartsSummary(order.partsItems || []);

  addLine('Client', order.clientName || '');
  addLine('Address', order.address || '');
  addLine('Date', order.date || '');
  if (timeIn) addLine('Time In', timeIn);
  if (timeOut) addLine('Time Out', timeOut);
  if (timeSpent) addLine('Time on Site', timeSpent);
  addLine('Assigned Tech', order.assignedTo || '');
  addLine('Status', order.status || '');
  addLine('Priority', order.priority || '');
  addLine('Type', order.jobType || '');

  addWrappedSection('Work Summary', order.summary || 'No summary provided.');
  addWrappedSection('Parts / Equipment', partsSummary || 'None listed.');
  if (order.materials) addWrappedSection('Additional Parts Notes', order.materials);
  addLine('Labour Hours', order.labourHours || '0');
  addWrappedSection('Notes', order.notes || 'No additional notes.');
  addPhotoSection(order.photos || []);

  const safeClient = (order.clientName || 'Client').replace(/[^a-z0-9]+/gi, '_');
  doc.save(`OASIS_Service_Repair_${safeClient}_${order.date || 'work_order'}.pdf`);

  showToast('Repair PDF saved to device');
  router.renderWorkOrders();
}

function deleteRepairOrder(orderId) {
  if (!confirm('Delete this repair work order?')) return;
  saveRepairOrders(getRepairOrders().filter(order => order.id !== orderId));
  showToast('Repair work order deleted');
  router.renderWorkOrders();
}

function populateLoginTechOptions() {
  const select = document.getElementById('login-tech');
  if (!select || !auth?.users) return;

  const currentValue = select.value || '';
  const entries = Object.entries(auth.users);
  const regularUsers = entries.filter(([id]) => id !== 'admin');
  const adminUsers = entries.filter(([id]) => id === 'admin');

  select.innerHTML = `
    <option value="">— Select your name —</option>
    ${[...regularUsers, ...adminUsers].map(([id, user]) => `
      <option value="${id}">${user.name}${user.role === 'admin' ? ' (Admin)' : ''}</option>
    `).join('')}
  `;

  select.value = currentValue;
}

// ==========================================
// APP INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  migrateLegacyRepairData();
  seedTestClients();
  populateLoginTechOptions();

  const loginScreen = document.getElementById('login-screen');
  const appShell = document.getElementById('app');
  const loginError = document.getElementById('login-error');

  // Check if user is logged in
  if (auth.isLoggedIn()) {
    loginScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    appShell.style.display = '';
    if (loginError) loginError.style.display = 'none';
    router.navigate('dashboard');
  } else {
    loginScreen.classList.remove('hidden');
    appShell.classList.add('hidden');
    appShell.style.display = 'none';
  }

  // Navigation
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      router.navigate(btn.dataset.view);
    });
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('login-tech').value;
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app');
    const loginError = document.getElementById('login-error');

    if (auth.login(username)) {
      loginScreen.classList.add('hidden');
      appShell.classList.remove('hidden');
      appShell.style.display = '';
      if (loginError) loginError.style.display = 'none';
      router.navigate('dashboard');
    } else if (loginError) {
      loginError.style.display = 'block';
    }
  });

  // Modal close
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      modal.hide();
    }
  });
});

// Global functions for HTML
function signOut() {
  auth.logout();
  location.reload();
}

function quickAddClient() {
  const name = prompt('Client name');
  if (!name) return;

  const address = prompt('Client address') || '';
  const contact = prompt('Contact name') || '';
  const clients = db.get('clients', []);

  clients.unshift({
    id: `c${Date.now()}`,
    name,
    address,
    contact
  });

  db.set('clients', clients);
  showToast('Client added');
  router.renderClients();
}

function deleteClient(clientId) {
  if (!confirm('Delete this client and related service records?')) return;

  db.set('clients', db.get('clients', []).filter(client => client.id !== clientId));
  db.set('workorders', db.get('workorders', []).filter(order => order.clientId !== clientId));
  db.set('repairOrders', getRepairOrders().filter(order => order.clientId !== clientId));

  showToast('Client removed');
  router.renderClients();
}

function onChemClientChange() {
  const select = document.getElementById('wo-client');
  const addressField = document.getElementById('wo-address');
  const title = document.getElementById('wo-client-name');
  if (!select) return;

  const client = db.get('clients', []).find(item => item.id === select.value);
  if (client) {
    if (addressField) addressField.value = client.address || '';
    if (title) title.textContent = client.name || 'Chem Sheet';
  }
}

function updateChemGuidancePreview(orderId) {
  const preview = document.getElementById('chem-guidance-preview');
  if (!preview) return;

  const order = collectWorkOrderForm(orderId);
  if (order) {
    preview.innerHTML = renderChemDosingSummary(order);
  }
}

function updateTimeSpentHint() {
  const hint = document.getElementById('wo-time-spent-hint');
  const timeIn = document.getElementById('wo-time-in')?.value || '';
  const timeOut = document.getElementById('wo-time-out')?.value || '';
  if (!hint) return;

  const spent = calculateTimeSpent(timeIn, timeOut);
  hint.textContent = `Time on site: ${spent || 'Enter both times to calculate duration.'}`;
}

function attachChemFieldListeners(orderId) {
  const form = document.querySelector('.wo-form');
  if (!form) return;

  form.querySelectorAll('input, select, textarea').forEach(field => {
    if (field.id && (field.id.startsWith('pool-') || field.id.startsWith('spa-'))) {
      field.addEventListener('input', () => updateChemGuidancePreview(orderId));
      field.addEventListener('change', () => updateChemGuidancePreview(orderId));
    }

    if (field.id === 'wo-time-in' || field.id === 'wo-time-out') {
      field.addEventListener('input', updateTimeSpentHint);
      field.addEventListener('change', updateTimeSpentHint);
    }
  });

  updateTimeSpentHint();
}

function collectWorkOrderForm(orderId) {
  const order = workOrderManager.getOrder(orderId);
  if (!order) return null;

  const dateInput = document.getElementById('wo-date');
  if (!dateInput) {
    return order;
  }

  const getValue = (id, fallback = '') => {
    const field = document.getElementById(id);
    return field ? field.value : fallback;
  };

  const existingPool = { ...defaultChemReadings(), ...(order.readings?.pool || {}) };
  const existingSpa = { ...defaultChemReadings(), ...(order.readings?.spa || {}) };
  const existingChemicalsAdded = order.chemicalsAdded || {};
  const existingPoolAdded = { ...defaultChemicalAdditions(), ...(existingChemicalsAdded.pool || {}) };
  const existingSpaAdded = { ...defaultChemicalAdditions(), ...(existingChemicalsAdded.spa || {}) };
  const selectedClientId = getValue('wo-client', order.clientId || '');
  const selectedClient = db.get('clients', []).find(item => item.id === selectedClientId);
  const followUpNotes = getValue('wo-notes', order.followUpNotes || order.notes || '');

  const updatedOrder = {
    ...order,
    clientId: selectedClientId || order.clientId,
    clientName: selectedClient?.name || order.clientName,
    technician: getValue('wo-tech', order.technician || auth.getCurrentUser()?.name || ''),
    date: getValue('wo-date', order.date),
    time: getValue('wo-time-in', order.timeIn || order.time || ''),
    timeIn: getValue('wo-time-in', order.timeIn || order.time || ''),
    timeOut: getValue('wo-time-out', order.timeOut || ''),
    address: selectedClient?.address || getValue('wo-address', order.address),
    workPerformed: getValue('wo-work', order.workPerformed || ''),
    followUpNotes,
    notes: followUpNotes,
    readings: {
      ...order.readings,
      pool: {
        ...existingPool,
        ph: getValue('pool-ph', existingPool.ph || ''),
        chlorine: getValue('pool-chlorine', existingPool.chlorine || ''),
        alkalinity: getValue('pool-alkalinity', existingPool.alkalinity || ''),
        calcium: getValue('pool-calcium', existingPool.calcium || ''),
        cya: getValue('pool-cya', existingPool.cya || ''),
        salt: getValue('pool-salt', existingPool.salt || ''),
        temp: getValue('pool-temp', existingPool.temp || ''),
        tds: getValue('pool-tds', existingPool.tds || ''),
        phosphates: getValue('pool-phosphates', existingPool.phosphates || ''),
        borates: getValue('pool-borates', existingPool.borates || '')
      },
      spa: {
        ...existingSpa,
        ph: getValue('spa-ph', existingSpa.ph || ''),
        chlorine: getValue('spa-chlorine', existingSpa.chlorine || ''),
        alkalinity: getValue('spa-alkalinity', existingSpa.alkalinity || ''),
        calcium: getValue('spa-calcium', existingSpa.calcium || ''),
        cya: getValue('spa-cya', existingSpa.cya || ''),
        salt: getValue('spa-salt', existingSpa.salt || ''),
        temp: getValue('spa-temp', existingSpa.temp || ''),
        tds: getValue('spa-tds', existingSpa.tds || ''),
        phosphates: getValue('spa-phosphates', existingSpa.phosphates || ''),
        borates: getValue('spa-borates', existingSpa.borates || '')
      }
    },
    chemicalsAdded: {
      pool: {
        ...existingPoolAdded,
        tabs: getValue('pool-add-tabs', existingPoolAdded.tabs || ''),
        shock: getValue('pool-add-shock', existingPoolAdded.shock || ''),
        muriaticAcid: getValue('pool-add-muriaticAcid', existingPoolAdded.muriaticAcid || ''),
        sodaAsh: getValue('pool-add-sodaAsh', existingPoolAdded.sodaAsh || ''),
        sodiumBicarb: getValue('pool-add-sodiumBicarb', existingPoolAdded.sodiumBicarb || ''),
        calcium: getValue('pool-add-calcium', existingPoolAdded.calcium || ''),
        stabilizer: getValue('pool-add-stabilizer', existingPoolAdded.stabilizer || ''),
        salt: getValue('pool-add-salt', existingPoolAdded.salt || ''),
        phosphateRemover: getValue('pool-add-phosphateRemover', existingPoolAdded.phosphateRemover || ''),
        algaecide: getValue('pool-add-algaecide', existingPoolAdded.algaecide || ''),
        other: getValue('pool-add-other', existingPoolAdded.other || '')
      },
      spa: {
        ...existingSpaAdded,
        tabs: getValue('spa-add-tabs', existingSpaAdded.tabs || ''),
        shock: getValue('spa-add-shock', existingSpaAdded.shock || ''),
        muriaticAcid: getValue('spa-add-muriaticAcid', existingSpaAdded.muriaticAcid || ''),
        sodaAsh: getValue('spa-add-sodaAsh', existingSpaAdded.sodaAsh || ''),
        sodiumBicarb: getValue('spa-add-sodiumBicarb', existingSpaAdded.sodiumBicarb || ''),
        calcium: getValue('spa-add-calcium', existingSpaAdded.calcium || ''),
        stabilizer: getValue('spa-add-stabilizer', existingSpaAdded.stabilizer || ''),
        salt: getValue('spa-add-salt', existingSpaAdded.salt || ''),
        phosphateRemover: getValue('spa-add-phosphateRemover', existingSpaAdded.phosphateRemover || ''),
        algaecide: getValue('spa-add-algaecide', existingSpaAdded.algaecide || ''),
        other: getValue('spa-add-other', existingSpaAdded.other || '')
      }
    }
  };

  updatedOrder.lsi = {
    pool: calculateLSI(updatedOrder.readings.pool),
    spa: calculateLSI(updatedOrder.readings.spa)
  };

  const sourceReadings = Object.values(updatedOrder.readings.pool).some(value => value !== '' && value !== null && value !== undefined)
    ? updatedOrder.readings.pool
    : updatedOrder.readings.spa;
  updatedOrder.chemicals = workOrderManager.calculateDosing(sourceReadings);

  return updatedOrder;
}

function saveWorkOrderForm(orderId) {
  const order = collectWorkOrderForm(orderId);
  if (!order) {
    showToast('Work order not found');
    return;
  }

  workOrderManager.saveOrder(order);
  router.renderWorkOrderDetail(order);
  showToast('Chem sheet saved');
}

function sendReport(orderId) {
  const order = collectWorkOrderForm(orderId);
  if (!order) {
    showToast('Work order not found');
    return;
  }

  workOrderManager.saveOrder(order);
  workOrderManager.generateReport(order);
}
