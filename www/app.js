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
      't9': { role: 'admin', name: 'Jet' },
      't10': { role: 'admin', name: 'Mark' },
      'admin': { role: 'admin', name: 'Chris Mills' }
    };
  }

  login(username, pin) {
    const user = this.users[username];
    if (user) {
      // Jet and Mark specific PIN
      if ((username === 't9' || username === 't10') && pin === '1234') {
        this.currentUser = { ...user, username };
        db.set('currentUser', this.currentUser);
        return true;
      }

      // Default PINs
      const requiredPin = (user.role === 'admin') ? '0000' : '1111';
      if (pin === requiredPin) {
        this.currentUser = { ...user, username };
        db.set('currentUser', this.currentUser);
        return true;
      }
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
    // Safety check: refresh user data from roster to ensure RBAC role is always up-to-date
    if (this.currentUser && this.currentUser.username) {
      const freshData = this.users[this.currentUser.username];
      if (freshData) {
        this.currentUser = { ...freshData, username: this.currentUser.username };
      }
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

  canShare() {
    const user = this.getCurrentUser();
    if (!user) return false;
    // Chris (admin), Jet (t9), Mark (t10)
    return user.username === 'admin' || user.username === 't9' || user.username === 't10';
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
    this.history = ['dashboard'];
  }

  navigate(view, pushHistory = true) {
    console.log('Navigating to:', view);
    this.currentView = view;
    if (pushHistory && this.history[this.history.length - 1] !== view) {
      this.history.push(view);
    }
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

  goBack() {
    if (this.history.length > 1) {
      this.history.pop(); // Remove current view
      const prevView = this.history[this.history.length - 1];
      this.navigate(prevView, false);
    }
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

    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    content.innerHTML = `
      <div class="wave-banner">
        <div class="wave-banner-eyebrow">Welcome back</div>
        <div class="wave-banner-title">${userName}</div>
        <div class="wave-banner-sub">Ready for today's service and repair jobs • ${todayStr}</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card" onclick="router.navigate('workorders')">
          <div class="stat-icon">🧪</div>
          <div class="stat-value">${db.get('workorders', []).length}</div>
          <div class="stat-label">Chem Sheets</div>
        </div>
        <div class="stat-card" onclick="router.navigate('workorders')">
          <div class="stat-icon">🛠️</div>
          <div class="stat-value">${repairOrders.length}</div>
          <div class="stat-label">Repair Orders</div>
        </div>
        <div class="stat-card" onclick="router.navigate('clients')">
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
    const allWorkorders = db.get('workorders', []);
    const currentUser = auth.getCurrentUser();

    // Filter by tech unless admin
    const workorders = (currentUser && currentUser.username === 'admin')
      ? allWorkorders
      : allWorkorders.filter(wo => wo.technician === currentUser.name);

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
    const user = auth.getCurrentUser();
    const isAdmin = auth.isAdmin();
    const isMainAdmin = user && user.username === 'admin';

    content.innerHTML = `
      <div class="section-header">
        <div class="section-title">Clients</div>
        <div style="display:flex; gap:8px;">
          ${isMainAdmin ? '<button class="btn btn-secondary btn-sm" onclick="bulkImportClients()">Bulk Import</button>' : ''}
          ${isAdmin ? '<button class="btn btn-primary btn-sm" onclick="quickAddClient()">+ Add Client</button>' : ''}
        </div>
      </div>

      <div class="search-bar" style="margin: 0 16px 12px;">
        <input type="text" id="client-search" placeholder="Search 280+ clients..." oninput="router.filterClients(this.value)" class="form-control">
      </div>

      <div id="clients-list">
        ${this.renderClientsList()}
      </div>
    `;
  }

  filterClients(query) {
    const list = document.getElementById('clients-list');
    if (!list) return;
    list.innerHTML = this.renderClientsList(query);
  }

  renderClientsList(query = '') {
    const allClients = db.get('clients', []);
    const isAdmin = auth.isAdmin();

    const clients = query
      ? allClients.filter(c =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.address.toLowerCase().includes(query.toLowerCase())
        )
      : allClients;

    if (clients.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-title">No clients found</div>
          <div class="empty-subtitle">${isAdmin ? 'Try a different search or add a client' : 'Check back later for client list'}</div>
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
          <button class="btn btn-icon" onclick="openMap('${client.address}')" title="View on Map">📍</button>
          ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="router.editClient('${client.id}')">Edit</button>` : ''}
          ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteClient('${client.id}')">Delete</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  renderWorkOrders() {
    const content = document.getElementById('main-content');
    const isAdmin = auth.isAdmin();

    content.innerHTML = `
      <div class="section-header">
        <div class="section-title">Service & Repair Jobs</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="exportCompletedToExcel()">Download Completed Orders</button>` : ''}
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
    const allWorkorders = db.get('workorders', []);
    const currentUser = auth.getCurrentUser();
    const isAdmin = auth.isAdmin();
    const canShare = auth.canShare();

    // Filter: ONLY Chris (admin) sees everything. Jet, Mark and others see ONLY their own.
    const workorders = (currentUser && currentUser.username === 'admin')
      ? allWorkorders
      : allWorkorders.filter(wo => wo.technician === currentUser.name);

    if (workorders.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🧪</div>
          <div class="empty-title">No jobs found</div>
          <div class="empty-subtitle">${isAdmin ? 'No active jobs' : 'Check back later for your assigned jobs'}</div>
        </div>
      `;
    }

    if (isAdmin) {
      // Grouping logic for Admin (Chris)
      const techs = [...new Set(workorders.map(wo => wo.technician || 'Unassigned'))].sort();

      return techs.map(tech => {
        const techJobs = workorders.filter(wo => (wo.technician || 'Unassigned') === tech);
        const completed = techJobs.filter(wo => wo.status === 'completed');
        const pending = techJobs.filter(wo => wo.status !== 'completed');

        return `
          <div class="wo-group">
            <div class="wo-group-hd" onclick="toggleAccordion(this)">
              <span>👤 ${tech} (${completed.length} Completed / ${pending.length} Pending)</span>
              <span class="wo-chev">▼</span>
            </div>
            <div class="wo-sec-bd">
              <div class="job-list-compact">
                ${techJobs.map(wo => this.renderJobCard(wo, canShare, isAdmin, currentUser)).join('')}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    return workorders.map(wo => this.renderJobCard(wo, canShare, isAdmin, currentUser)).join('');
  }

  renderJobCard(wo, canShare, isAdmin, currentUser) {
    const isCompleted = wo.status === 'completed';
    return `
      <div class="job-card ${isCompleted ? 'job-card-completed' : ''}">
        <div class="job-card-header">
          <div>
            <div class="job-card-title">${wo.clientName}</div>
            <div class="job-card-customer">${wo.address}</div>
            <div class="job-meta">
              <div class="job-meta-item">📅 ${wo.date}</div>
              <div class="job-meta-item">⏰ ${wo.time || 'TBD'}</div>
              ${currentUser.username === 'admin' ? `<div class="job-meta-item">👤 ${wo.technician || 'Unknown'}</div>` : ''}
            </div>
          </div>
          <button class="btn btn-icon" onclick="openMap('${wo.address}')" title="View on Map">📍</button>
        </div>
        <div class="job-card-body">
          <div class="badge badge-${wo.status || 'pending'}">${wo.status || 'pending'}</div>
        </div>
        <div class="job-card-footer">
          <button class="btn btn-secondary btn-sm" onclick="router.viewWorkOrder('${wo.id}')">Open</button>
          ${canShare ? `<button class="btn btn-primary btn-sm" onclick="shareReport('${wo.id}')">Share</button>` : ''}
          ${currentUser.username === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteWorkOrder('${wo.id}')">Delete</button>` : ''}
        </div>
      </div>
    `;
  }

  renderSettings() {
    const content = document.getElementById('main-content');
    const user = auth.getCurrentUser();
    const isAdmin = auth.isAdmin();
    const isMainAdmin = user && user.username === 'admin';

    content.innerHTML = `
      <div class="section-header">
        <div class="section-title">Settings</div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="detail-row">
            <div class="detail-label">Current User</div>
            <div class="detail-value">${user.name}</div>
          </div>
          <div class="detail-row">
            <div class="detail-label">Role</div>
            <div class="detail-value" style="text-transform: capitalize;">${user.role}</div>
          </div>
          <button class="btn btn-danger" onclick="auth.logout(); location.reload()" style="width: 100%; margin-top: 10px;">Sign Out</button>
        </div>
      </div>

      ${isMainAdmin ? `
      <div class="section-header" style="margin-top: 20px;">
        <div class="section-title">Team Distribution</div>
      </div>
      <div class="card">
        <div class="card-body">
          <p style="font-size: 13px; color: var(--gray-600); margin-bottom: 12px;">
            To share the app with your team, copy the link below or scan the QR code.
          </p>
          <div class="form-group" style="padding:0; margin-bottom:12px; display:none;">
            <label class="form-label">APK Download Link</label>
            <input type="text" id="apk-link-input" class="form-control" placeholder="Paste your Drive link here..." value="https://millzy7665-beep.github.io/oasis-service/">
          </div>

          <div id="qr-container" style="text-align: center; margin-top: 15px;">
            <div style="background: white; padding: 10px; display: inline-block; border-radius: 8px;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https%3A%2F%2Fmillzy7665-beep.github.io%2Foasis-service%2F" alt="Scan to Download">
            </div>
            <p style="font-size: 11px; margin-top: 8px; color: var(--champagne-dk);">Scan with technician phone to download App</p>
            <div style="margin-top: 12px; display: flex; justify-content: center; gap: 8px;">
              <input type="text" id="apk-link-display" class="form-control form-control-sm" value="https://millzy7665-beep.github.io/oasis-service/" readonly>
              <button class="btn btn-secondary btn-sm" onclick="copyApkLink()">Copy</button>
            </div>
            <div style="margin-top: 10px;">
              <button class="btn btn-secondary btn-sm" onclick="shareAppLink()">Share Link</button>
            </div>
          </div>
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

            <div class="form-row">
              <label for="wo-status">Job Status</label>
              <select id="wo-status">
                <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
              </select>
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
              <div class="wo-fld"><div class="wo-fld-lbl">Tabs</div><input id="pool-add-tabs" class="wo-fld-inp" type="number" inputmode="decimal" value="${poolAdded.tabs || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Shock / Oxidizer</div><input id="pool-add-shock" class="wo-fld-inp" type="number" inputmode="decimal" value="${poolAdded.shock || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Muriatic Acid</div><input id="pool-add-muriaticAcid" class="wo-fld-inp" type="number" inputmode="decimal" value="${poolAdded.muriaticAcid || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Soda Ash</div><input id="pool-add-sodaAsh" class="wo-fld-inp" type="number" inputmode="decimal" value="${poolAdded.sodaAsh || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Sodium Bicarb</div><input id="pool-add-sodiumBicarb" class="wo-fld-inp" type="number" inputmode="decimal" value="${poolAdded.sodiumBicarb || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Calcium Increaser</div><input id="pool-add-calcium" class="wo-fld-inp" type="number" inputmode="decimal" value="${poolAdded.calcium || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Stabilizer</div><input id="pool-add-stabilizer" class="wo-fld-inp" type="number" inputmode="decimal" value="${poolAdded.stabilizer || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Salt</div><input id="pool-add-salt" class="wo-fld-inp" type="number" inputmode="decimal" value="${poolAdded.salt || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Phosphate Remover</div><input id="pool-add-phosphateRemover" class="wo-fld-inp" type="number" inputmode="decimal" value="${poolAdded.phosphateRemover || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Algaecide</div><input id="pool-add-algaecide" class="wo-fld-inp" type="number" inputmode="decimal" value="${poolAdded.algaecide || ''}"></div>
              <div class="wo-fld" style="grid-column:1 / -1"><div class="wo-fld-lbl">Other / Notes</div><input id="pool-add-other" class="wo-fld-inp" type="text" value="${poolAdded.other || ''}"></div>
            </div>

            <div class="wo-blk-lbl" style="margin-top:10px;">Spa Additions</div>
            <div class="wo-grid">
              <div class="wo-fld"><div class="wo-fld-lbl">Tabs</div><input id="spa-add-tabs" class="wo-fld-inp" type="number" inputmode="decimal" value="${spaAdded.tabs || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Shock / Oxidizer</div><input id="spa-add-shock" class="wo-fld-inp" type="number" inputmode="decimal" value="${spaAdded.shock || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Muriatic Acid</div><input id="spa-add-muriaticAcid" class="wo-fld-inp" type="number" inputmode="decimal" value="${spaAdded.muriaticAcid || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Soda Ash</div><input id="spa-add-sodaAsh" class="wo-fld-inp" type="number" inputmode="decimal" value="${spaAdded.sodaAsh || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Sodium Bicarb</div><input id="spa-add-sodiumBicarb" class="wo-fld-inp" type="number" inputmode="decimal" value="${spaAdded.sodiumBicarb || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Calcium Increaser</div><input id="spa-add-calcium" class="wo-fld-inp" type="number" inputmode="decimal" value="${spaAdded.calcium || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Stabilizer</div><input id="spa-add-stabilizer" class="wo-fld-inp" type="number" inputmode="decimal" value="${spaAdded.stabilizer || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Salt</div><input id="spa-add-salt" class="wo-fld-inp" type="number" inputmode="decimal" value="${spaAdded.salt || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Phosphate Remover</div><input id="spa-add-phosphateRemover" class="wo-fld-inp" type="number" inputmode="decimal" value="${spaAdded.phosphateRemover || ''}"></div>
              <div class="wo-fld"><div class="wo-fld-lbl">Algaecide</div><input id="spa-add-algaecide" class="wo-fld-inp" type="number" inputmode="decimal" value="${spaAdded.algaecide || ''}"></div>
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
            ${auth.canShare() ? `<button class="btn send-report-btn" onclick="shareReport('${order.id}')">Share Report</button>` : ''}
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
    if (!auth.isAdmin()) {
      showToast('Only admins can edit client details');
      return;
    }
    const clients = db.get('clients', []);
    const client = clients.find(item => item.id === id);
    if (!client) {
      showToast('Client not found');
      return;
    }
    this.renderClientDetail(client);
  }

  renderClientDetail(client) {
    const content = document.getElementById('main-content');
    content.innerHTML = `
      <div class="wo-form">
        <div class="wo-bar">
          <button class="btn btn-secondary btn-sm" onclick="router.renderClients()">← Back</button>
          <div class="wo-bar-title">Client Profile</div>
          <button class="btn btn-primary btn-sm" onclick="saveClientDetails('${client.id}')">Save</button>
        </div>

        <div class="wo-sec">
          <div class="wo-sec-hd">Individual Client Details</div>
          <div class="wo-sec-bd">
            <div class="form-group">
              <label class="form-label">Client Name</label>
              <input type="text" id="edit-client-name" class="form-control" value="${escapeHtml(client.name)}">
            </div>

            <div class="form-group">
              <label class="form-label">Service Address</label>
              <div style="display:flex; gap:8px;">
                <input type="text" id="edit-client-address" class="form-control" value="${escapeHtml(client.address)}">
                <button class="btn btn-icon" onclick="openMap(document.getElementById('edit-client-address').value)">📍</button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Contact / Email</label>
              <input type="email" id="edit-client-contact" class="form-control" value="${escapeHtml(client.contact || '')}">
            </div>

            <div class="form-group">
              <label class="form-label">Preferred Technician</label>
              <input type="text" id="edit-client-tech" class="form-control" value="${escapeHtml(client.technician || '')}">
            </div>
          </div>
        </div>

        <div class="card" style="margin:16px;">
          <div class="card-body" style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn btn-primary" style="flex:1" onclick="saveClientDetails('${client.id}')">Save Changes</button>
            <button class="btn btn-secondary" style="flex:1" onclick="shareClientDetails('${client.id}')">Share Profile</button>
          </div>
        </div>
      </div>
    `;
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

  async generateReport(order) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const filename = `OASIS_Service_Report_${(order.clientName || 'Client').replace(/[^a-z0-9]/gi, '_')}_${order.date || 'Date'}.pdf`;

    const navy = [13, 43, 69];
    const gold = [201, 168, 124];
    const teal = [34, 102, 131];
    const lightBeige = [248, 245, 241];

    let logoData = null;
    try {
      logoData = await getImageDataUrl('oasis-logo.png');
    } catch (e) {
      console.warn('Logo load failed', e);
    }

    const renderHeader = () => {
      doc.setFillColor(...navy);
      doc.rect(0, 0, 210, 25, 'F');
      doc.setFillColor(...gold);
      doc.rect(0, 25, 210, 1, 'F');

      if (logoData) {
        doc.addImage(logoData, 'PNG', 12, 5, 15, 15);
      }

      doc.setTextColor(255, 255, 255);
      doc.setFont('times', 'bold');
      doc.setFontSize(22);
      doc.text('O A S I S', 32, 17);

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('SERVICE REPORT', 195, 14, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...gold);
      doc.text('LUXURY POOL & WATERSHAPE DESIGN', 195, 19, { align: 'right' });

      return 35;
    };

    const renderFooter = () => {
      const footerY = 278;
      doc.setFillColor(...navy);
      doc.rect(0, footerY, 210, 20, 'F');
      doc.setFillColor(...gold);
      doc.rect(0, footerY, 210, 0.5, 'F');

      if (logoData) {
        doc.addImage(logoData, 'PNG', 12, footerY + 4, 12, 12);
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('times', 'bold');
      doc.text('O A S I S', 30, footerY + 12);

      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 180);
      doc.text('Luxury Pool & Watershape Design, Construction & Maintenance', 55, footerY + 12);

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.text('Harbour Walk, 2nd Floor — Grand Cayman', 195, footerY + 9, { align: 'right' });
      doc.text('oasis.ky  ·  +1 345-945-7665', 195, footerY + 14, { align: 'right' });
    };

    let y = renderHeader();

    // Info Grid
    doc.setFillColor(...lightBeige);
    doc.rect(10, y, 190, 22, 'F');

    let gridY = y + 7;
    const col1 = 15;
    const col2 = 110;

    const addField = (label, value, x, currentY) => {
      doc.setFontSize(6);
      doc.setTextColor(120, 120, 120);
      doc.setFont('helvetica', 'bold');
      doc.text(label.toUpperCase(), x, currentY);
      doc.setFontSize(9);
      doc.setTextColor(...navy);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value || '—'), x, currentY + 5);
    };

    addField('Customer', order.clientName, col1, gridY);
    addField('Date', order.date, col2, gridY);
    gridY += 12;
    addField('Service Address', order.address, col1, gridY);
    addField('Time In / Out', `${order.timeIn || '—'} / ${order.timeOut || '—'}`, col2, gridY);

    y += 28;

    // Readings Table
    doc.setFillColor(...navy);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('CHEMICAL READINGS', 15, y + 5);
    doc.text('POOL', 115, y + 5);
    doc.text('SPA', 165, y + 5);
    y += 7;

    const params = [
      { key: 'ph', label: 'pH Level' },
      { key: 'chlorine', label: 'Free Chlorine' },
      { key: 'alkalinity', label: 'Total Alkalinity' },
      { key: 'cya', label: 'Cyanuric Acid' },
      { key: 'calcium', label: 'Calcium Hardness' },
      { key: 'salt', label: 'Salt Content' },
      { key: 'temp', label: 'Water Temperature' }
    ];

    params.forEach((p, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(248, 248, 248);
        doc.rect(10, y, 190, 5, 'F');
      }
      doc.setTextColor(...navy);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(p.label, 15, y + 3.5);
      doc.text(String(order.readings?.pool?.[p.key] || '—'), 115, y + 3.5);
      doc.text(String(order.readings?.spa?.[p.key] || '—'), 165, y + 3.5);
      y += 5;
    });

    y += 4;

    // Chemicals Added
    doc.setFillColor(...navy);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('CHEMICALS ADDED', 15, y + 5);
    y += 10;

    doc.setFontSize(7);
    doc.setTextColor(...navy);
    doc.setFont('helvetica', 'bold');
    doc.text('POOL', 15, y);
    doc.text('SPA', 110, y);
    y += 2;
    doc.setDrawColor(...gold);
    doc.line(15, y, 100, y);
    doc.line(110, y, 195, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    const poolChems = getChemicalAdditionEntries(order.chemicalsAdded?.pool || []);
    const spaChems = getChemicalAdditionEntries(order.chemicalsAdded?.spa || []);
    const maxLines = Math.max(poolChems.length, spaChems.length, 1);

    for(let i=0; i<maxLines; i++) {
      if (y > 220) break;
      doc.text(poolChems[i] || (i===0 ? 'None recorded' : ''), 15, y);
      doc.text(spaChems[i] || (i===0 ? 'None recorded' : ''), 110, y);
      y += 4.5;
    }

    y += 4;

    // Notes
    doc.setFillColor(...navy);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('SERVICE NOTES', 15, y + 5);
    y += 10;

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(7);
    const notesStr = `${order.workPerformed || ''} ${order.followUpNotes || order.notes || ''}`.trim();
    const splitNotes = doc.splitTextToSize(notesStr || 'No additional notes for this visit.', 180);
    doc.text(splitNotes, 15, y);
    y += (splitNotes.length * 4.5) + 5;

    // Photos (Compact)
    const photos = normalizeChemPhotos(order.photos || []);
    if (photos.some(p => p)) {
      if (y > 230) {
        // Skip photos if no room
      } else {
        doc.setFillColor(...navy);
        doc.rect(10, y, 190, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text('SERVICE PHOTOS', 15, y + 5);
        y += 10;

        const pW = 40;
        const pH = 30;
        let pX = 15;
        photos.forEach((p, i) => {
          if (p && i < 4 && pX < 180) {
            try {
              doc.addImage(p, 'JPEG', pX, y, pW, pH);
              doc.setFontSize(5);
              doc.setTextColor(150, 150, 150);
              doc.text(CHEM_PHOTO_LABELS[i], pX, y + pH + 3);
            } catch(e) {}
            pX += 45;
          }
        });
      }
    }

    renderFooter();
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

function bulkImportClients() {
  const data = prompt("Paste clients JSON here (Array of objects with name and address)");
  if (!data) return;
  try {
    const newClients = JSON.parse(data);
    if (!Array.isArray(newClients)) {
      alert("Invalid format. Expected an array.");
      return;
    }
    const clients = db.get('clients', []);
    newClients.forEach(c => {
      clients.unshift({
        id: `c${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: c.name || 'New Client',
        address: c.address || '',
        contact: c.contact || ''
      });
    });
    db.set('clients', clients);
    showToast(`${newClients.length} clients imported`);
    router.renderClients();
  } catch (e) {
    alert("Error parsing JSON: " + e.message);
  }
}

function cleanupTestClients() {
  const testIds = ['c101', 'c102', 'c103', 'c104'];
  const clients = db.get('clients', []);
  const filtered = clients.filter(c => !testIds.includes(c.id));
  if (filtered.length !== clients.length) {
    db.set('clients', filtered);
  }
}

async function exportCompletedToExcel() {
  const allWorkorders = db.get('workorders', []);
  const completed = allWorkorders.filter(wo => wo.status === 'completed');

  if (completed.length === 0) {
    showToast('No completed work orders to export');
    return;
  }

  showToast('Generating Excel report...');

  try {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('OASIS Service Records');

    const chemKeys = [
      { key: 'tabs', label: 'Tabs' },
      { key: 'shock', label: 'Shock/Oxidizer' },
      { key: 'muriaticAcid', label: 'Muriatic Acid' },
      { key: 'sodaAsh', label: 'Soda Ash' },
      { key: 'sodiumBicarb', label: 'Sodium Bicarb' },
      { key: 'calcium', label: 'Calcium Increaser' },
      { key: 'stabilizer', label: 'Stabilizer' },
      { key: 'salt', label: 'Salt' },
      { key: 'phosphateRemover', label: 'Phosphate Remover' },
      { key: 'algaecide', label: 'Algaecide' }
    ];

    // Define Columns
    const columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Address', key: 'address', width: 35 },
      { header: 'Technician', key: 'tech', width: 15 },
      { header: 'Time In', key: 'timeIn', width: 10 },
      { header: 'Time Out', key: 'timeOut', width: 10 },
      { header: 'Pool Chlorine', key: 'pCl', width: 12 },
      { header: 'Pool pH', key: 'pph', width: 10 },
      { header: 'Pool Alk', key: 'palk', width: 10 }
    ];

    // Add columns for each pool chemical
    chemKeys.forEach(ck => {
      columns.push({ header: `Pool ${ck.label}`, key: `p_${ck.key}`, width: 15 });
    });

    columns.push(
      { header: 'Spa Chlorine', key: 'sCl', width: 12 },
      { header: 'Spa pH', key: 'sph', width: 10 },
      { header: 'Spa Alk', key: 'salk', width: 10 }
    );

    // Add columns for each spa chemical
    chemKeys.forEach(ck => {
      columns.push({ header: `Spa ${ck.label}`, key: `s_${ck.key}`, width: 15 });
    });

    columns.push({ header: 'Service Notes', key: 'notes', width: 40 });

    ws.columns = columns;

    // Style Header
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0D2B45' } };

    completed.forEach(wo => {
      const rowData = {
        date: wo.date,
        client: wo.clientName,
        address: wo.address,
        tech: wo.technician,
        timeIn: wo.timeIn || wo.time || '',
        timeOut: wo.timeOut || '',
        pCl: wo.readings?.pool?.chlorine || '',
        pph: wo.readings?.pool?.ph || '',
        palk: wo.readings?.pool?.alkalinity || '',
        sCl: wo.readings?.spa?.chlorine || '',
        sph: wo.readings?.spa?.ph || '',
        salk: wo.readings?.spa?.alkalinity || '',
        notes: (wo.workPerformed || '') + ' ' + (wo.followUpNotes || wo.notes || '')
      };

      // Populate pool chemical values
      chemKeys.forEach(ck => {
        rowData[`p_${ck.key}`] = wo.chemicalsAdded?.pool?.[ck.key] || '';
      });

      // Populate spa chemical values
      chemKeys.forEach(ck => {
        rowData[`s_${ck.key}`] = wo.chemicalsAdded?.spa?.[ck.key] || '';
      });

      ws.addRow(rowData);
    });

    const buffer = await workbook.xlsx.writeBuffer();

    // Robust binary to base64 conversion
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const filename = `OASIS_Service_Records_${new Date().toISOString().split('T')[0]}.xlsx`;

    await shareFile(base64, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    showToast('Excel export ready');
  } catch (error) {
    console.error('Excel export failed:', error);
    showToast('Excel export failed');
  }
}

function openMap(address) {
  if (!address) return;
  let query = address;
  if (!query.toLowerCase().includes('grand cayman')) {
    query += ', Grand Cayman';
  }
  const encodedAddress = encodeURIComponent(query);
  const url = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  window.open(url, '_blank');
}

function saveClientDetails(clientId) {
  const name = document.getElementById('edit-client-name').value;
  const address = document.getElementById('edit-client-address').value;
  const contact = document.getElementById('edit-client-contact').value;
  const tech = document.getElementById('edit-client-tech').value;

  if (!name) {
    alert('Name is required');
    return;
  }

  const clients = db.get('clients', []);
  const index = clients.findIndex(c => c.id === clientId);
  if (index >= 0) {
    clients[index] = { ...clients[index], name, address, contact, technician: tech };
    db.set('clients', clients);

    // Also update any matching workorders
    const workorders = db.get('workorders', []);
    workorders.forEach(wo => {
      if (wo.clientId === clientId) {
        wo.clientName = name;
        wo.address = address;
        wo.technician = tech;
      }
    });
    db.set('workorders', workorders);

    showToast('Client profile updated');
    router.renderClients();
  }
}

async function shareClientDetails(clientId) {
  const clients = db.get('clients', []);
  const client = clients.find(c => c.id === clientId);
  if (!client) return;

  const text = `Client: ${client.name}\nAddress: ${client.address}\nContact: ${client.contact || 'None'}\nTech: ${client.technician || 'None'}`;

  try {
    if (typeof Capacitor !== 'undefined' && Capacitor.Plugins.Share) {
      await Capacitor.Plugins.Share.share({
        title: `Client Profile: ${client.name}`,
        text: text,
        dialogTitle: 'Share Client Details'
      });
    } else {
      await navigator.clipboard.writeText(text);
      showToast('Client details copied to clipboard');
    }
  } catch (err) {
    console.error('Sharing failed:', err);
    showToast('Manual copy required');
  }
}

function initMasterSchedule() {
  if (db.get('masterScheduleLoaded')) return;

  const clients = [
    { name: "Coleen Martin", address: "122 Belaire Drive", tech: "Kadeem" },
    { name: "Jeey Bomford", address: "49 Mary Read Crescent", tech: "Kadeem" },
    { name: "Emile VanderBol", address: "694 South Sound", tech: "Kadeem" },
    { name: "Tom Wye", address: "800 South Sound", tech: "Kadeem" },
    { name: "Gcpsl Sea View", address: "South Church Street", tech: "Kadeem" },
    { name: "Kirsten Buttenhoff", address: "Seas the day, South Sound", tech: "Kadeem" },
    { name: "Sunrise Phase 3", address: "Old Crewe Rd", tech: "Kadeem" },
    { name: "Vivi Townhomes", address: "275 Fairbanks Rd", tech: "Kadeem" },
    { name: "Zoe Foster", address: "47 Latana Way", tech: "Elvin" },
    { name: "Claudia Subiotto", address: "531 South Church Street", tech: "Elvin" },
    { name: "Caribbean Courts", address: "Bcqs, South Sound", tech: "Elvin" },
    { name: "Max Jones", address: "Cocoloba Condos", tech: "Elvin" },
    { name: "Fin South Church Street", address: "Fin Strata", tech: "Elvin" },
    { name: "Lakeland Villas #1", address: "Old Crewe Rd", tech: "Elvin" },
    { name: "Point Of View", address: "South Sound", tech: "Elvin" },
    { name: "South Palms #1", address: "Glen Eden Rd", tech: "Elvin" },
    { name: "Southern Skies", address: "South Sound", tech: "Elvin" },
    { name: "Correy Williams", address: "16 Cypress Point", tech: "Jermaine" },
    { name: "Andy Albray", address: "17 The Deck House", tech: "Jermaine" },
    { name: "Joanne Akdeniz", address: "42 Hoya Quay", tech: "Jermaine" },
    { name: "Paul Skinner", address: "50 Orchid Drive", tech: "Jermaine" },
    { name: "Sunshine Properties", address: "54 Galway Quay", tech: "Jermaine" },
    { name: "Mike Stroh", address: "64 Waterford Quay", tech: "Jermaine" },
    { name: "Tim Bradley", address: "66 Baquarat Quay", tech: "Jermaine" },
    { name: "Plum Mandalay", address: "Seven Mile", tech: "Jermaine" },
    { name: "Ocean Pointe Villas", address: "West Bay", tech: "Jermaine" },
    { name: "Snug Harbour Villas", address: "Snug Harbour", tech: "Jermaine" },
    { name: "Rich Merlo", address: "276 Yacht Club Drive", tech: "Ace" },
    { name: "John Ferarri", address: "30 Orchid Drive", tech: "Ace" },
    { name: "Gary Gibbs", address: "306 Yacht Club dr", tech: "Ace" },
    { name: "Andrew Muir", address: "318 Yacht Drive", tech: "Ace" },
    { name: "Scott Somerville", address: "40 Orchid Drive", tech: "Ace" },
    { name: "Ash Lavine", address: "404 Orchid Drive", tech: "Ace" },
    { name: "Vlad Aldea", address: "474 Yacht Club Dr", tech: "Ace" },
    { name: "Abraham Burak", address: "Salt Creek", tech: "Ace" },
    { name: "Sunset Point Condos", address: "North West Point Rd", tech: "Ace" },
    { name: "Villa Mare", address: "Vista Del Mar", tech: "Ace" },
    { name: "Jenny Frizzle", address: "302 Windswept Drive", tech: "Donald" },
    { name: "Anthoney Reid", address: "88 Mallard Drive", tech: "Donald" },
    { name: "Coral Bay Village", address: "Shamrock Rd", tech: "Donald" },
    { name: "Harbor Walk", address: "Grand Harbour", tech: "Donald" },
    { name: "Indigo Bay", address: "Shamrock Rd", tech: "Donald" },
    { name: "Periwinkle", address: "Edgewater Way", tech: "Donald" },
    { name: "Savannah Grand", address: "Savannah", tech: "Donald" },
    { name: "South Shore", address: "Shamrock Rd", tech: "Donald" },
    { name: "The Palms At Patricks", address: "Patricks Island", tech: "Donald" },
    { name: "Olea Main Pool", address: "Minerva Way", tech: "Kingsley" },
    { name: "One Canal Point", address: "Canal Point", tech: "Kingsley" },
    { name: "Poinsettia", address: "Seven Mile Beach", tech: "Kingsley" },
    { name: "The Beachcomber", address: "Seven Mile Beach", tech: "Kingsley" },
    { name: "Kimpton Splash Pad", address: "Kimpton Seafire", tech: "Ariel" },
    { name: "Alison Nolan", address: "129 Nelson Quay", tech: "Ariel" },
    { name: "Merryl Jackson", address: "535 Canal Point Dr", tech: "Ariel" },
    { name: "Jenna Wong", address: "59 Shorecrest Circle", tech: "Ariel" },
    { name: "Plymouth", address: "Canal Point Dr", tech: "Ariel" },
    { name: "Glen Kennedy", address: "Salt Creek", tech: "Ariel" },
    { name: "Mark Vandevelde", address: "Salt Creek", tech: "Ariel" },
    { name: "Gwenda Ebanks", address: "Silver Sands", tech: "Ariel" },
    { name: "Juliett Austin", address: "134 Abbey Way", tech: "Malik" },
    { name: "Haroon Pandhoie", address: "24 Chariot Dr", tech: "Malik" },
    { name: "Joanna Robson", address: "27 Teal Island", tech: "Malik" },
    { name: "Jason Butcher", address: "44 Grand Estates", tech: "Malik" },
    { name: "Julie O'Hara", address: "56 Grand Estates", tech: "Malik" },
    { name: "Mike Gibbs", address: "78 Grand Estates", tech: "Malik" },
    { name: "Grapetree Condos", address: "Seven Mile Beach", tech: "Malik" },
    { name: "The Colonial Club", address: "Seven Mile Beach", tech: "Malik" },
    { name: "Suzanne Bothwell", address: "227 Smith Road", tech: "Kadeem" },
    { name: "Caribbean Paradise", address: "South Sound", tech: "Kadeem" },
    { name: "L'Ambience", address: "Fairbanks Rd", tech: "Kadeem" },
function saveApkLink() {
  const input = document.getElementById('apk-link-input');
  if (!input) return;

  const link = input.value.trim();
  db.set('apk_download_link', link);

  // Re-render the settings view to update the QR code
  if (router.currentView === 'settings') {
    router.renderSettings();
  }

  showToast(link ? 'APK link saved' : 'APK link cleared');
}

async function shareAppLink() {
  const link = db.get('apk_download_link') || (window.location.origin + '/oasis-app.apk');
  if (!link) {
    showToast('No link to share');
    return;
  }

  const shareData = {
    title: 'Download Pool Tech App',
    text: 'Download the latest version of the Pool Service App here:',
    url: link,
    dialogTitle: 'Share APK Link'
  };

  try {
    if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.Share) {
      await Capacitor.Plugins.Share.share(shareData);
    } else if (navigator.share) {
      await navigator.share(shareData);
    } else {
      // Fallback to clipboard
      await navigator.clipboard.writeText(link);
      showToast('Link copied to clipboard');
    }
  } catch (err) {
    console.error('Error sharing:', err);
    // Fallback to clipboard on error
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copied to clipboard');
    } catch (clipboardErr) {
      showToast('Could not share or copy link');
    }
  }
}

async function copyApkLink() {
  const link = db.get('apk_download_link') || (window.location.origin + '/oasis-app.apk');
  if (link) {
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copied to clipboard');
    } catch (err) {
      console.error('Failed to copy link: ', err);
      showToast('Could not copy link');
    }
  }
}
