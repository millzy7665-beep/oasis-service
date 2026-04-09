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
      't12': { role: 'technician', name: 'Java' },
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
    console.log('Navigating to:', view);
    this.currentView = view;
    if (this.routes[view]) {
      try {
        this.routes[view]();
      } catch (e) {
        console.error('Navigation error for view:', view, e);
        // Fallback UI if rendering fails
        document.getElementById('main-content').innerHTML = `
          <div class="empty-state">
            <div class="empty-title">Page Error</div>
            <div class="empty-subtitle">Something went wrong while loading this page.</div>
            <button class="btn btn-primary" onclick="location.reload()">Refresh App</button>
          </div>
        `;
      }
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
    if (!content) return;

    const user = auth.getCurrentUser();
    const userName = user ? user.name : 'Technician';
    const repairOrders = typeof getRepairOrders === 'function' ? getRepairOrders() : [];

    content.innerHTML = `
      <div class="wave-banner">
        <div class="wave-banner-eyebrow">Welcome back</div>
        <div class="wave-banner-title">${userName}</div>
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
    const shareUrl = 'https://millzy7665-beep.github.io/oasis-service/';
    const isAdmin = auth.isAdmin();

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
          <button class="btn btn-danger" onclick="auth.logout(); location.reload()" style="width: 100%; margin-top: 10px;">Sign Out</button>
        </div>
      </div>

      ${isAdmin ? `
      <div class="section-header" style="margin-top: 20px;">
        <div class="section-title">Share App (Admin Only)</div>
      </div>

      <div class="card">
        <div class="card-body" style="text-align: center;">
          <p style="margin-bottom: 15px; color: var(--gray-600); font-size: 14px;">Share the OASIS Service app with your team.</p>

          <div style="background: white; padding: 15px; border-radius: 8px; display: inline-block; margin-bottom: 15px; border: 1px solid var(--gray-200);">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shareUrl)}" alt="App QR Code" style="width: 200px; height: 200px; display: block;">
          </div>

          <div class="form-row" style="text-align: left;">
            <label>App Link</label>
            <div style="display: flex; gap: 8px;">
              <input type="text" readonly value="${shareUrl}" id="share-url-input" style="flex: 1; font-size: 13px;">
              <button class="btn btn-secondary btn-sm" onclick="copyShareLink()">Copy</button>
            </div>
          </div>

          <button class="btn btn-primary" style="width: 100%; margin-top: 15px;" onclick="shareAppLink()">Share Link</button>
        </div>
      </div>
      ` : ''}
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
              <select id="wo-tech">
                ${Object.entries(auth.users)
                  .sort((a, b) => a[1].name.localeCompare(b[1].name))
                  .map(([id, user]) => `<option value="${user.name}" ${user.name === technician ? 'selected' : ''}>${user.name}</option>`).join('')}
              </select>
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
    const filename = `OASIS_Service_Report_${(order.clientName || 'Client').replace(/[^a-z0-9]/gi, '_')}_${order.date || 'Date'}.pdf`;

    const navy = [13, 43, 69];
    const gold = [201, 168, 124];
    const teal = [34, 102, 131];
    const lightBeige = [248, 245, 241];

    let y = 0;

    const renderPage = (isNewPage = false) => {
      if (isNewPage) doc.addPage();
      y = applyOasisPdfBranding(doc, 'Service Report');

      // Info Grid Background
      doc.setFillColor(...lightBeige);
      doc.rect(0, y - 10, 210, 50, 'F');

      const col1 = 20;
      const col2 = 110;
      let gridY = y;

      const addGridItem = (label, value, x, currentY) => {
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.setFont('helvetica', 'normal');
        doc.text(label.toUpperCase(), x, currentY);
        doc.setFontSize(10);
        doc.setTextColor(...navy);
        doc.setFont('helvetica', 'bold');
        doc.text(String(value || '—'), x, currentY + 5);
      };

      addGridItem('Client', order.clientName, col1, gridY);
      addGridItem('Date', order.date, col2, gridY);
      gridY += 12;
      addGridItem('Address', order.address, col1, gridY);
      addGridItem('Time In / Out', `${order.timeIn || '—'} / ${order.timeOut || '—'}`, col2, gridY);
      gridY += 12;
      addGridItem('Technician', order.technician, col1, gridY);
      addGridItem('Route & Pool Size', `Route — ${order.poolSize || '—'}`, col2, gridY);
      gridY += 12;
      addGridItem('Surface', order.surfaceType || '—', col1, gridY);
      addGridItem('Condition', order.condition || '—', col2, gridY);

      y = gridY + 15;
      applyOasisPdfFooter(doc);
    };

    renderPage();

    const ensureSpace = (needed = 20) => {
      if (y + needed > 260) {
        renderPage(true);
      }
    };

    const addSectionHeader = (title) => {
      ensureSpace(12);
      doc.setFillColor(...navy);
      doc.rect(10, y, 190, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(title.toUpperCase(), 15, y + 5);
      y += 10;
    };

    const addReadingsTable = (title, readings) => {
      const labels = {
        chlorine: 'Chlorine',
        ph: 'pH',
        alkalinity: 'Alkalinity',
        cya: 'CYA',
        calcium: 'Calcium',
        salt: 'Salt',
        phosphates: 'Phosphate',
        tds: 'TDS'
      };

      addSectionHeader(title);

      // Table Header
      doc.setFillColor(...teal);
      doc.rect(10, y, 190, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text('PARAMETER', 15, y + 5);
      doc.text('POOL', 110, y + 5);
      doc.text('SPA', 160, y + 5);
      y += 7;

      Object.entries(labels).forEach(([key, label], index) => {
        ensureSpace(8);
        if (index % 2 === 0) {
          doc.setFillColor(245, 245, 245);
          doc.rect(10, y, 190, 7, 'F');
        }
        doc.setTextColor(...navy);
        doc.setFont('helvetica', 'normal');
        doc.text(label, 15, y + 5);
        doc.text(String(order.readings?.pool?.[key] || '—'), 110, y + 5);
        doc.text(String(order.readings?.spa?.[key] || '—'), 160, y + 5);
        y += 7;
      });

      doc.setFontSize(6);
      doc.setTextColor(150, 150, 150);
      doc.text('Ideal: Chlorine 1-3 ppm · pH 7.2-7.6 · Alkalinity 80-120 ppm · CYA 30-50 ppm · Calcium 200-400 ppm', 15, y + 4);
      y += 8;
    };

    addReadingsTable('Chemical Readings', order.readings || {});

    addSectionHeader('Chemicals Added');
    doc.setFontSize(9);
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.text('POOL', 15, y + 5);
    doc.text('SPA', 110, y + 5);
    y += 7;
    doc.setDrawColor(...gold);
    doc.line(15, y, 100, y);
    doc.line(110, y, 195, y);
    y += 5;

    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120, 120, 120);
    const poolChems = getChemicalAdditionEntries(order.chemicalsAdded?.pool || []);
    const spaChems = getChemicalAdditionEntries(order.chemicalsAdded?.spa || []);

    const maxChems = Math.max(poolChems.length, spaChems.length, 1);
    for (let i = 0; i < maxChems; i++) {
      ensureSpace(6);
      doc.text(poolChems[i] || (i === 0 ? 'None added' : ''), 15, y);
      doc.text(spaChems[i] || (i === 0 ? 'None added' : ''), 110, y);
      y += 6;
    }
    y += 5;

    if (order.workPerformed || order.notes || order.followUpNotes) {
      addSectionHeader('Service Notes');
      doc.setFillColor(252, 250, 247);
      const notes = `${order.workPerformed || ''}\n${order.followUpNotes || order.notes || ''}`.trim();
      const lines = doc.splitTextToSize(notes || 'No notes recorded.', 180);
      doc.rect(15, y, 185, lines.length * 5 + 6, 'F');
      doc.setDrawColor(...gold);
      doc.line(15, y, 15, y + lines.length * 5 + 6);
      doc.setTextColor(100, 100, 100);
      doc.text(lines, 20, y + 5);
      y += lines.length * 5 + 15;
    }

    // Add Photo section
    const photos = normalizeChemPhotos(order.photos || []);
    if (photos.some(p => p)) {
      addSectionHeader('Service Photos');
      const photoWidth = 55;
      const photoHeight = 40;
      let x = 15;

      photos.forEach((src, idx) => {
        if (!src) return;

        // Before adding, ensure we don't start a photo at the bottom of the page
        if (y + photoHeight + 10 > 280) {
            doc.addPage();
            y = 20; // reset y
        }

        try {
          doc.addImage(src, 'JPEG', x, y, photoWidth, photoHeight);
          doc.setFontSize(7);
          doc.setTextColor(150, 150, 150);
          doc.text(CHEM_PHOTO_LABELS[idx], x, y + photoHeight + 4);
        } catch (e) {
          console.error("PDF Image add failed", e);
        }

        x += 60;
        if (x > 150) {
          x = 15;
          y += photoHeight + 8;
        }
      });
    }

    sharePDF(doc, filename);
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
        <button type="button" class="btn btn-secondary btn-sm" onclick="takeNativePhoto('chem', '${orderId}', ${index})">Take Photo</button>
        <label class="btn btn-secondary btn-sm" for="photo-gallery-${index}">Choose Photo</label>
      </div>
      <input id="photo-gallery-${index}" name="photo-gallery-${index}" class="photo-file-inp" type="file" accept="image/*" onchange="handleChemPhotoUpload('${orderId}', ${index}, event)">
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

/**
 * Native Camera Implementation
 * Bypasses HTML inputs to force camera launch on Android
 */
async function takeNativePhoto(type, orderId, slotIndex) {
  try {
    if (typeof Capacitor === 'undefined' || !Capacitor.Plugins.Camera) {
      showToast('Camera plugin not available');
      return;
    }

    const image = await Capacitor.Plugins.Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: 'dataUrl',
      source: 'CAMERA' // Forces camera specifically
    });

    if (!image || !image.dataUrl) return;

    if (type === 'chem') {
      const order = collectWorkOrderForm(orderId);
      if (!order) return;
      const photos = normalizeChemPhotos(order.photos);
      photos[slotIndex] = image.dataUrl;
      order.photos = photos;
      workOrderManager.saveOrder(order);
      const slot = document.getElementById(`photo-slot-${slotIndex}`);
      if (slot) {
        slot.outerHTML = renderChemPhotoSlot(orderId, CHEM_PHOTO_LABELS[slotIndex], image.dataUrl, slotIndex);
      }
      showToast('Photo added');
    } else {
      const order = collectRepairOrderFromForm(orderId);
      if (!order) return;

      const photos = normalizeRepairPhotos(order.photos);
      photos[slotIndex] = image.dataUrl;
      order.photos = photos;

      // Persist immediately
      const orders = getRepairOrders();
      const idx = orders.findIndex(o \u003d\u003e o.id === order.id);
      if (idx \u003e\u003d 0) {
        orders[idx] = order;
      } else {
        orders.unshift(order);
      }
      saveRepairOrders(orders);

      const slot = document.getElementById(`repair-photo-slot-${slotIndex}`);
      if (slot \u0026\u0026 orderId) {
        const label = REPAIR_PHOTO_LABELS[slotIndex];
        slot.outerHTML = renderRepairPhotoSlot(order.id, label, image.dataUrl, slotIndex);
        showToast(\u0027Repair photo added\u0027);
      } else {
        renderRepairOrderForm(order.id, \u0027\u0027, order);
        showToast(\u0027Repair photo added\u0027);
      }
    }
  } catch (error) {
    console.error('Native camera error:', error);
    if (error.message !== 'User cancelled photos app') {
      showToast('Unable to open camera');
    }
  }
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

async function shareFile(base64Data, filename, contentType = 'application/octet-stream') {
  try {
    if (typeof Capacitor === 'undefined') {
      throw new Error('Capacitor is not defined');
    }

    const { Filesystem, Share } = Capacitor.Plugins;
    if (!Filesystem || !Share) {
      throw new Error('Capacitor Plugins (Filesystem or Share) not available');
    }

    const saveResult = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: 'CACHE'
    });

    await Share.share({
      title: 'OASIS Report',
      text: `OASIS Service Report: ${filename}`,
      url: saveResult.uri,
    });
  } catch (error) {
    console.warn('Native sharing failed, falling back to browser download:', error);
    // Fallback for web/unsupported
    const link = document.createElement('a');
    link.href = `data:${contentType};base64,${base64Data}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Report downloaded to device');
  }
}

async function sharePDF(doc, filename) {
  const b64 = doc.output('datauristring').split(',')[1];
  await shareFile(b64, filename, 'application/pdf');
}

async function exportRepairToExcel(orderId) {
  const order = collectRepairOrderFromForm(orderId);
  if (!order) {
    showToast('Repair work order not found');
    return;
  }

  showToast('Generating Excel report...');

  try {
    const response = await fetch('WO_TEMPLATE.xlsm');
    const arrayBuffer = await response.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const ws = workbook.getWorksheet('WORK SHEET');
    if (!ws) {
      console.error('Worksheet "WORK SHEET" not found. Available sheets:', workbook.worksheets.map(s => s.name).join(', '));
      throw new Error('Worksheet "WORK SHEET" not found in template. Please ensure the template contains a sheet named exactly "WORK SHEET".');
    }

    // Populate Basic Info
    ws.getCell('C3').value = `${order.clientName || ''}\n${order.address || ''}`;
    ws.getCell('G3').value = order.date || '';

    // Work Description (split across rows 5-8 if needed)
    const summary = order.summary || '';
    ws.getCell('B5').value = summary;

    // Notes for Billing
    let partsStr = (order.partsItems || []).map(p => `${p.qty}x ${p.product}`).join(', ');
    if (order.materials) partsStr += '\n' + order.materials;
    ws.getCell('B10').value = partsStr;

    // Notes for Tech
    ws.getCell('B12').value = order.notes || '';

    // Work Log
    ws.getCell('B16').value = order.date || '';
    ws.getCell('C16').value = order.timeIn || '';
    ws.getCell('D16').value = order.assignedTo || '';
    ws.getCell('G16').value = parseFloat(order.labourHours) || 0;

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Robust binary to base64 conversion
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const safeClient = (order.clientName || 'Client').replace(/[^a-z0-9]+/gi, '_');
    const filename = `OASIS_WO_${safeClient}_${order.date || 'repair'}.xlsm`;

    await shareFile(base64, filename, 'application/vnd.ms-excel.sheet.macroEnabled.12');
    showToast('Excel report ready');
  } catch (error) {
    console.error('Excel export failed:', error);
    showToast('Excel export failed');
  }
}

function applyOasisPdfBranding(doc, title, subtitle = 'LUXURY POOL & WATERSHAPE DESIGN') {
  const navy = [13, 43, 69];
  const gold = [201, 168, 124];
  const white = [255, 255, 255];

  // Header
  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, 28, 210, 1.5, 'F');

  // Logo Placeholder / Text
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('O A S I S', 45, 18);

  // Title
  doc.setFontSize(14);
  doc.text(title.toUpperCase(), 190, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...gold);
  doc.text(subtitle.toUpperCase(), 190, 22, { align: 'right' });

  return 40;
}

function applyOasisPdfFooter(doc) {
  const navy = [13, 43, 69];
  const gold = [201, 168, 124];
  const white = [255, 255, 255];
  const y = 275;

  doc.setFillColor(...navy);
  doc.rect(0, y, 210, 22, 'F');

  doc.setTextColor(...white);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('O A S I S', 40, y + 10);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text('Luxury Pool & Watershape Design, Construction & Maintenance', 40, y + 15);

  doc.setTextColor(...white);
  doc.text('Harbour Walk, 2nd Floor — Grand Cayman, KY1-1001', 190, y + 8, { align: 'right' });
  doc.text('+1 345-945-7665 · oasis.ky', 190, y + 13, { align: 'right' });
  doc.text(`Generated ${new Date().toLocaleDateString()}`, 190, y + 18, { align: 'right' });
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
          <select class="repair-part-category" onchange="refreshRepairOrderBuilder(\u0027${orderId || \u0027\u0027}\u0027)">
            <option value="">— Select category —</option>
            ${categories.map(category => `
              <option value="${escapeHtml(category)}" ${category === part.category ? \u0027selected\u0027 : \u0027\u0027}>${escapeHtml(category)}</option>
            `).join(\u0027\u0027)}
          </select>
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Equipment / Part</div>
          <select class="repair-part-product" onchange="refreshRepairOrderBuilder(\u0027${orderId || \u0027\u0027}\u0027)">
            <option value="">— Select equipment —</option>
            ${items.map(item => `
              <option value="${escapeHtml(item.partNumber)}"
                data-product="${escapeHtml(item.product)}"
                data-price="${escapeHtml(String(item.price ?? \u0027\u0027))}"
                ${item.partNumber === part.partNumber ? \u0027selected\u0027 : \u0027\u0027}>
                ${escapeHtml(item.product)}${item.partNumber ? ` — ${escapeHtml(item.partNumber)}` : \u0027\u0027}
              </option>
            `).join(\u0027\u0027)}
          </select>
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Quantity</div>
          <input class="wo-fld-inp repair-part-qty" type="number" min="1" step="1" value="${escapeHtml(String(part.qty || \u00271\u0027))}" oninput="updateRepairPartRowDetails(this)">
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Part Details</div>
          <div class="repair-part-details" style="font-size:12px; color:var(--gray-600); line-height:1.5; min-height:38px;">
            ${selectedItem ? `${escapeHtml(selectedItem.partNumber || \u0027\u0027)}${selectedItem.price ? ` • $${Number(selectedItem.price).toFixed(2)}` : \u0027\u0027}` : \u0027Choose a category and equipment item.\u0027}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="removeRepairPartRow(\u0027${orderId || \u0027\u0027}\u0027, ${index})">Remove</button>
        </div>
      </div>
    </div>
  `;
}

function updateRepairPartRowDetails(input) {
  const row = input.closest(\u0027.repair-part-row\u0027);
  const productSelect = row.querySelector(\u0027.repair-part-product\u0027);
  const detailsDiv = row.querySelector(\u0027.repair-part-details\u0027);
  const qty = parseInt(input.value) || 1;

  const selectedOption = productSelect.selectedOptions[0];
  if (selectedOption \u0026\u0026 selectedOption.value) {
    const partNumber = selectedOption.value;
    const price = parseFloat(selectedOption.dataset.price);
    if (!isNaN(price)) {
      const total = (price * qty).toFixed(2);
      detailsDiv.innerHTML = `${escapeHtml(partNumber)} • $${price.toFixed(2)}<br><b>Line Total: $${total}</b>`;
    } else {
      detailsDiv.textContent = partNumber;
    }
  }
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
    <div class="photo-slot" id="repair-photo-slot-${index}">
      <div class="photo-slot-lbl">${safeLabel}</div>
      <div class="photo-preview-box">
        ${photo ? `
          <img class="photo-thumb" data-repair-photo-index="${index}" src="${photo}" alt="${safeLabel}">
          <button type="button" class="photo-remove" onclick="removeRepairPhoto('${orderId || ''}', ${index})" aria-label="Remove ${safeLabel} photo">&times;</button>
        ` : `<div class="photo-add-btn">Add ${safeLabel} photo</div>`}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="takeNativePhoto('repair', '${orderId || ''}', ${index})">Take Photo</button>
        <label class="btn btn-secondary btn-sm" for="repair-photo-gallery-${index}">Choose Photo</label>
      </div>
      <input id="repair-photo-gallery-${index}" name="repair-photo-gallery-${index}" class="photo-file-inp" type="file" accept="image/*" onchange="handleRepairPhotoUpload('${orderId || ''}', ${index}, event)">
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

  try {
    const order = collectRepairOrderFromForm(orderId);
    if (!order) {
      showToast(\u0027Repair work order not found\u0027);
      return;
    }

    showToast(\u0027Processing repair photo...\u0027);
    const dataUrl = await resizeImageForStorage(file);
    if (!dataUrl) throw new Error(\u0027Photo processing failed\u0027);

    const photos = normalizeRepairPhotos(order.photos);
    photos[slotIndex] = dataUrl;
    order.photos = photos;

    // Persist immediately
    const orders = getRepairOrders();
    const idx = orders.findIndex(o \u003d\u003e o.id === order.id);
    if (idx \u003e\u003d 0) {
      orders[idx] = order;
    } else {
      orders.unshift(order);
    }
    saveRepairOrders(orders);

    const slot = document.getElementById(`repair-photo-slot-${slotIndex}`);
    if (slot \u0026\u0026 orderId) {
      const label = REPAIR_PHOTO_LABELS[slotIndex];
      slot.outerHTML = renderRepairPhotoSlot(order.id, label, dataUrl, slotIndex);
      showToast(\u0027Repair photo added\u0027);
    } else {
      renderRepairOrderForm(order.id, \u0027\u0027, order);
      showToast(\u0027Repair photo added\u0027);
    }
  } catch (error) {
    console.error(\u0027Repair photo upload failed\u0027, error);
    showToast(\u0027Unable to add repair photo\u0027);
  } finally {
    if (event?.target) event.target.value = \u0027\u0027;
  }
}

function removeRepairPhoto(orderId, slotIndex) {
  const order = collectRepairOrderFromForm(orderId);
  if (!order) {
    showToast(\u0027Repair work order not found\u0027);
    return;
  }

  const photos = normalizeRepairPhotos(order.photos);
  photos[slotIndex] = \u0027\u0027;
  order.photos = photos;

  // Persist immediately
  const orders = getRepairOrders();
  const idx = orders.findIndex(o \u003d\u003e o.id === order.id);
  if (idx \u003e\u003d 0) {
    orders[idx] = order;
    saveRepairOrders(orders);
  }

  const slot = document.getElementById(`repair-photo-slot-${slotIndex}`);
  if (slot \u0026\u0026 orderId) {
    const label = REPAIR_PHOTO_LABELS[slotIndex];
    slot.outerHTML = renderRepairPhotoSlot(order.id, label, \u0027\u0027, slotIndex);
  } else {
    renderRepairOrderForm(order.id, \u0027\u0027, order);
  }

  showToast(\u0027Repair photo removed\u0027);
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
        <button class="btn btn-primary btn-sm" onclick="saveRepairWorkOrder('${escapeHtml(order.id)}', true)">Share</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRepairOrder('${escapeHtml(order.id)}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function renderRepairOrderForm(orderId = \u0027\u0027, presetClientId = \u0027\u0027, draftOrder = null) {
  const content = document.getElementById(\u0027main-content\u0027);
  const existing = !draftOrder \u0026\u0026 orderId ? getRepairOrders().find(order \u003d\u003e order.id === orderId) : null;
  const clients = db.get(\u0027clients\u0027, []);
  const order = draftOrder || existing || {
    id: orderId || `r${Date.now()}`,
    clientId: presetClientId,
    clientName: \u0027\u0027,
    address: \u0027\u0027,
    date: new Date().toISOString().split(\u0027T\u0027)[0],
    time: \u0027\u0027,
    timeIn: \u0027\u0027,
    timeOut: \u0027\u0027,
    assignedTo: auth.getCurrentUser()?.name || \u0027\u0027,
    status: \u0027open\u0027,
    jobType: \u0027\u0027,
    priority: \u0027Normal\u0027,
    summary: \u0027\u0027,
    materials: \u0027\u0027,
    partsItems: [],
    partsSummary: \u0027\u0027,
    labourHours: \u0027\u0027,
    notes: \u0027\u0027,
    photos: []
  };

  const activeOrderId = order.id;
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
            <select id="repair-tech" class="wo-fld-inp">
              ${Object.entries(auth.users)
                .sort((a, b) => a[1].name.localeCompare(b[1].name))
                .map(([id, user]) => `<option value="${user.name}" ${user.name === (order.assignedTo || '') ? 'selected' : ''}>${user.name}</option>`).join('')}
            </select>
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

function collectRepairOrderFromForm(orderId = \u0027\u0027) {
  const existing = orderId ? getRepairOrders().find(item \u003d\u003e item.id === orderId) : null;
  const finalId = orderId || existing?.id || `r${Date.now()}`;

  const clientId = document.getElementById(\u0027repair-client\u0027)?.value || \u0027\u0027;
  const client = db.get(\u0027clients\u0027, []).find(item \u003d\u003e item.id === clientId);
  const partItems = Array.from(document.querySelectorAll(\u0027.repair-part-row\u0027)).map(row \u003d\u003e {
    const category = row.querySelector(\u0027.repair-part-category\u0027)?.value || \u0027\u0027;
    const productSelect = row.querySelector(\u0027.repair-part-product\u0027);
    const selectedOption = productSelect?.selectedOptions?.[0] || null;
    const qty = row.querySelector(\u0027.repair-part-qty\u0027)?.value || \u00271\u0027;

    return {
      category,
      partNumber: productSelect?.value || \u0027\u0027,
      product: selectedOption?.dataset.product || selectedOption?.textContent?.split(\u0027 — \u0027)[0] || \u0027\u0027,
      qty,
      unitPrice: selectedOption?.dataset.price || \u0027\u0027
    };
  }).filter(part \u003d\u003e part.category || part.partNumber || part.product);

  const timeIn = document.getElementById(\u0027repair-time-in\u0027)?.value || \u0027\u0027;
  const timeOut = document.getElementById(\u0027repair-time-out\u0027)?.value || \u0027\u0027;

  const photos = REPAIR_PHOTO_LABELS.map((_, index) \u003d\u003e {
    const preview = document.querySelector(`[data-repair-photo-index="${index}"]`);
    return preview?.getAttribute(\u0027src\u0027) || existing?.photos?.[index] || \u0027\u0027;
  });

  return {
    id: finalId,
    clientId,
    clientName: client?.name || existing?.clientName || \u0027Unassigned Client\u0027,
    address: document.getElementById(\u0027repair-address\u0027)?.value || \u0027\u0027,
    date: document.getElementById(\u0027repair-date\u0027)?.value || \u0027\u0027,
    time: timeIn,
    timeIn,
    timeOut,
    assignedTo: document.getElementById(\u0027repair-tech\u0027)?.value || \u0027\u0027,
    status: document.getElementById(\u0027repair-status\u0027)?.value || \u0027open\u0027,
    jobType: document.getElementById(\u0027repair-type\u0027)?.value || \u0027\u0027,
    priority: document.getElementById(\u0027repair-priority\u0027)?.value || \u0027Normal\u0027,
    summary: document.getElementById(\u0027repair-summary\u0027)?.value || \u0027\u0027,
    materials: document.getElementById(\u0027repair-materials\u0027)?.value || \u0027\u0027,
    partsItems: partItems,
    partsSummary: buildRepairPartsSummary(partItems),
    labourHours: document.getElementById(\u0027repair-labour\u0027)?.value || \u0027\u0027,
    notes: document.getElementById(\u0027repair-notes\u0027)?.value || \u0027\u0027,
    photos
  };
}

function saveRepairWorkOrder(orderId = '', shareAfterSave = false) {
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

  if (shareAfterSave) {
    shareRepairPDF(order.id);
    return;
  }

  router.renderWorkOrders();
}


function shareRepairPDF(orderId) {
  const order = getRepairOrders().find(item => item.id === orderId);
  if (!order || !window.jspdf) {
    showToast('Unable to generate PDF');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const filename = `OASIS_Repair_Work_Order_${(order.clientName || 'Client').replace(/[^a-z0-9]/gi, '_')}_${order.date || 'Date'}.pdf`;

  const navy = [13, 43, 69];
  const gold = [201, 168, 124];
  const lightBeige = [248, 245, 241];

  let y = 0;

  const renderPage = (isNewPage = false) => {
    if (isNewPage) doc.addPage();
    y = applyOasisPdfBranding(doc, 'Repair Work Order');

    // Info Grid Background
    doc.setFillColor(...lightBeige);
    doc.rect(0, y - 10, 210, 50, 'F');

    const col1 = 20;
    const col2 = 110;
    let gridY = y;

    const addGridItem = (label, value, x, currentY) => {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text(label.toUpperCase(), x, currentY);
      doc.setFontSize(10);
      doc.setTextColor(...navy);
      doc.setFont('helvetica', 'bold');
      doc.text(String(value || '—'), x, currentY + 5);
    };

    addGridItem('Client', order.clientName, col1, gridY);
    addGridItem('Date', order.date, col2, gridY);
    gridY += 12;
    addGridItem('Address', order.address, col1, gridY);
    addGridItem('Status / Priority', `${order.status || '—'} / ${order.priority || '—'}`, col2, gridY);
    gridY += 12;
    addGridItem('Assigned Tech', order.assignedTo, col1, gridY);
    addGridItem('Job Type', order.jobType || '—', col2, gridY);
    gridY += 12;
    addGridItem('Time In / Out', `${order.timeIn || '—'} / ${order.timeOut || '—'}`, col1, gridY);
    addGridItem('Time on Site', calculateTimeSpent(order.timeIn, order.timeOut) || '—', col2, gridY);

    y = gridY + 15;
    applyOasisPdfFooter(doc);
  };

  renderPage();

  const ensureSpace = (needed = 20) => {
    if (y + needed > 260) {
      renderPage(true);
    }
  };

  const addSectionHeader = (title) => {
    ensureSpace(12);
    doc.setFillColor(...navy);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), 15, y + 5);
    y += 10;
  };

  addSectionHeader('Work Summary');
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'normal');
  const summaryLines = doc.splitTextToSize(order.summary || 'No summary provided.', 180);
  doc.text(summaryLines, 15, y);
  y += (summaryLines.length * 5) + 8;

  if (order.partsItems && order.partsItems.length > 0) {
    addSectionHeader('Parts & Equipment');
    doc.setFont('helvetica', 'bold');
    doc.text('Part Description', 15, y);
    doc.text('Qty', 160, y);
    y += 6;
    doc.setDrawColor(...gold);
    doc.line(15, y, 195, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    order.partsItems.forEach(item => {
      ensureSpace(7);
      doc.text(`${item.category}: ${item.product}` || 'Unknown Part', 15, y);
      doc.text(String(item.qty || 1), 160, y);
      y += 6;
    });
    y += 5;
  }

  if (order.notes) {
    addSectionHeader('Service Notes');
    doc.setFontSize(10);
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(order.notes, 180);
    doc.text(notesLines, 15, y);
    y += (notesLines.length * 5) + 8;
  }

  const photos = normalizeRepairPhotos(order.photos || []);
  if (photos.some(p => p)) {
    addSectionHeader('Repair Photos');
    const photoWidth = 60;
    const photoHeight = 45;
    let x = 15;
    photos.forEach((src, idx) => {
      if (!src) return;
      ensureSpace(photoHeight + 10);
      try {
        doc.addImage(src, 'JPEG', x, y, photoWidth, photoHeight);
        doc.setFontSize(7);
        doc.text(REPAIR_PHOTO_LABELS[idx], x, y + photoHeight + 4);
      } catch (e) {}
      x += 65;
      if (x > 150) {
        x = 15;
        y += photoHeight + 10;
      }
    });
  }

  sharePDF(doc, filename);
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

  const entries = Object.entries(auth.users)
    .filter(([id]) => id !== 't12') // Hide Java from the list
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  select.innerHTML = `
    <option value="" disabled selected>— Select your name —</option>
    ${entries.map(([id, user]) => `
      <option value="${id}">${user.name}${user.role === 'admin' ? ' (Admin)' : ''}</option>
    `).join('')}
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  migrateLegacyRepairData();
  seedTestClients();
  populateLoginTechOptions();

  const loginScreen = document.getElementById('login-screen');
  const appShell = document.getElementById('app');
  const loginError = document.getElementById('login-error');

  if (auth.isLoggedIn()) {
    console.log('User is already logged in:', auth.getCurrentUser().name);
    if (loginScreen) {
      loginScreen.style.display = 'none';
      loginScreen.classList.add('hidden');
    }
    if (appShell) {
      appShell.classList.remove('hidden');
      appShell.style.display = 'flex';
    }
    if (loginError) loginError.style.display = 'none';

    // Immediate navigation to dashboard
    try {
      router.navigate('dashboard');
    } catch (err) {
      console.error('Initial navigation error:', err);
    }
  } else {
        router.navigate('dashboard');
      } catch (err) {
        console.error('Initial navigation error:', err);
      }
    }, 100);
  } else {
    console.log('No user logged in');
    if (loginScreen) {
      loginScreen.classList.remove('hidden');
      loginScreen.style.display = 'flex';
    }
    if (appShell) {
      appShell.classList.add('hidden');
      appShell.style.display = 'none';
    }
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      router.navigate(btn.dataset.view);
    });
  });

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const select = document.getElementById('login-tech');
    const username = select ? select.value : '';
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app');
    const loginError = document.getElementById('login-error');

    console.log('Attempting login for:', username);

    if (username && auth.login(username)) {
      console.log('Login successful');

      // Force UI transition with zero delay
      if (loginScreen) {
        loginScreen.style.display = 'none';
        loginScreen.setAttribute('style', 'display: none !important');
      }
      if (appShell) {
        appShell.classList.remove('hidden');
        appShell.style.display = 'flex';
        appShell.setAttribute('style', 'display: flex !important');
      }
      if (loginError) loginError.style.display = 'none';

      // Immediate navigation
      try {
        router.navigate('dashboard');
      } catch (err) {
        console.error('Navigation error:', err);
        location.reload();
      }
    } else {
      console.warn('Login failed: invalid username');
      if (loginError) loginError.style.display = 'block';
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      modal.hide();
    }
  });
});

function signOut() {
  auth.logout();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('app').style.display = 'none';
  const loginScreen = document.getElementById('login-screen');
  loginScreen.classList.remove('hidden');
  loginScreen.style.display = 'flex';
  router.navigate('dashboard');
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

function shareReport(orderId) {
  const order = collectWorkOrderForm(orderId);
  if (!order) {
    showToast('Work order not found');
    return;
  }

  workOrderManager.saveOrder(order);
  workOrderManager.generateReport(order);
}

function sendReport(orderId) {
  shareReport(orderId);
}

async function shareAppLink() {
  const shareUrl = 'https://millzy7665-beep.github.io/oasis-service/';
  try {
    if (typeof Capacitor !== 'undefined' && Capacitor.Plugins.Share) {
      await Capacitor.Plugins.Share.share({
        title: 'OASIS Service App',
        text: 'Access the OASIS Service & Repair App',
        url: shareUrl,
        dialogTitle: 'Share App Link'
      });
    } else {
      copyShareLink();
    }
  } catch (err) {
    console.error('Sharing failed:', err);
    copyShareLink();
  }
}

function copyShareLink() {
  const urlInput = document.getElementById('share-url-input');
  if (urlInput) {
    urlInput.select();
    urlInput.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(urlInput.value).then(() => {
      showToast('App link copied to clipboard');
    }).catch(err => {
      console.error('Copy failed:', err);
      showToast('Manual copy required');
    });
  }
}
