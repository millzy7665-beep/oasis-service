// OASIS Service and Repair App - Unified Version
// Features: Login, Dashboard, Clients, Chem Sheets, Repair Orders, Settings
// PDF generation with local save instead of email

// ==========================================
// FIREBASE INITIALIZATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAo3vP7Myf08Q8KqoFlcgGNOZp2mX2R-38",
  authDomain: "oasis-service-app-69def.firebaseapp.com",
  projectId: "oasis-service-app-69def",
  storageBucket: "oasis-service-app-69def.firebasestorage.app",
  messagingSenderId: "156557428291",
  appId: "1:156557428291:web:243524f03403d05c65f6f6",
  measurementId: "G-THQ9YGZ0B5"
};

firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();

// Collections that sync across all devices via Firestore
const SYNCED_KEYS = ['clients', 'workorders', 'repairOrders', 'oasis_notifications'];

// ==========================================
// DATA MANAGEMENT (DB) — localStorage + Firestore sync
// ==========================================
class DB {
  constructor() {
    this.storage = window.localStorage;
    this._listeners = {};
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
    } catch (e) {
      // localStorage full or unavailable
    }

    // Sync shared collections to Firestore
    if (SYNCED_KEYS.includes(key)) {
      firestore.collection('app_data').doc(key).set({ data: JSON.parse(JSON.stringify(value)), updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
        .catch(err => console.warn('Firestore write failed for', key, err));
    }
    return true;
  }

  remove(key) {
    this.storage.removeItem(key);
    if (SYNCED_KEYS.includes(key)) {
      firestore.collection('app_data').doc(key).delete()
        .catch(err => console.warn('Firestore delete failed for', key, err));
    }
  }

  clear() {
    this.storage.clear();
  }

  // Called once on startup — listen for Firestore changes and update localStorage + UI
  startRealtimeSync() {
    // Track known notification IDs so we only alert on truly new ones
    const knownNotificationIds = new Set(
      (JSON.parse(this.storage.getItem('oasis_notifications') || '[]')).map(n => n.id)
    );

    SYNCED_KEYS.forEach(key => {
      firestore.collection('app_data').doc(key).onSnapshot(snapshot => {
        if (!snapshot.exists) return;
        const remoteData = snapshot.data().data;
        const localRaw = this.storage.getItem(key);
        const localData = localRaw ? JSON.parse(localRaw) : null;

        // Only update if data actually changed (avoid infinite loops)
        if (JSON.stringify(remoteData) !== JSON.stringify(localData)) {
          this.storage.setItem(key, JSON.stringify(remoteData));
          console.log(`[Sync] ${key} updated from Firestore`);

          // Present device notifications for new incoming notifications
          if (key === 'oasis_notifications' && typeof notificationManager !== 'undefined') {
            const newItems = (remoteData || []).filter(n => !knownNotificationIds.has(n.id));
            newItems.forEach(n => {
              knownNotificationIds.add(n.id);
              notificationManager.presentLiveNotification(n);
            });
          }

          // Re-render current view so user sees live changes
          if (typeof router !== 'undefined' && router.currentView) {
            try { router.navigate(router.currentView); } catch (e) { /* ignore */ }
          }
        }
      }, err => {
        console.warn('Firestore listener error for', key, err);
      });
    });

    // On first load, pull any existing Firestore data that localStorage doesn't have
    SYNCED_KEYS.forEach(key => {
      const local = this.storage.getItem(key);
      if (!local || local === '[]' || local === 'null') {
        firestore.collection('app_data').doc(key).get().then(doc => {
          if (doc.exists && doc.data().data) {
            this.storage.setItem(key, JSON.stringify(doc.data().data));
            console.log(`[Sync] ${key} pulled from Firestore on startup`);
          }
        }).catch(() => {});
      }
    });

    // Request notification permission early
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
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
      'admin': { role: 'admin', name: 'Chris Mills' },
      'admin2': { role: 'admin', name: 'James Bussey' }
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
    return user.role === 'admin' || user.username === 't9' || user.username === 't10';
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

class NotificationManager {
  constructor() {
    this.storageKey = 'oasis_notifications';
  }

  getAll() {
    return db.get(this.storageKey, []);
  }

  saveAll(items = []) {
    db.set(this.storageKey, items.slice(0, 250));
  }

  getForUser(user = auth.getCurrentUser()) {
    const userName = user?.name || '';
    return this.getAll().filter(item => item.recipient === userName || item.recipient === 'all');
  }

  getUnreadForUser(user = auth.getCurrentUser()) {
    return this.getForUser(user).filter(item => !item.read);
  }

  async requestPermission() {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch (error) {
      console.warn('Browser notification permission request failed', error);
    }

    try {
      const localNotifications = typeof Capacitor !== 'undefined' ? Capacitor.Plugins?.LocalNotifications : null;
      if (localNotifications?.requestPermissions) {
        await localNotifications.requestPermissions();
      }
    } catch (error) {
      console.warn('Local notification permission request failed', error);
    }
  }

  async presentLiveNotification(item) {
    const currentUser = auth.getCurrentUser();
    if (!currentUser || item.recipient !== currentUser.name) return;

    try {
      const localNotifications = typeof Capacitor !== 'undefined' ? Capacitor.Plugins?.LocalNotifications : null;
      if (localNotifications?.schedule) {
        await localNotifications.schedule({
          notifications: [{
            id: Number(String(Date.now()).slice(-8)),
            title: item.title,
            body: item.message,
            schedule: { at: new Date(Date.now() + 500) }
          }]
        });
        return;
      }
    } catch (error) {
      console.warn('Capacitor local notification failed', error);
    }

    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(item.title, { body: item.message });
        return;
      }
    } catch (error) {
      console.warn('Browser notification failed', error);
    }

    showToast(item.title);
  }

  async create({ type = 'update', title = 'New update', message = '', recipients = [], targetView = '', targetId = '', actionLabel = 'Open' }) {
    const list = this.getAll();
    const createdAt = new Date().toISOString();
    const targetRecipients = [...new Set((Array.isArray(recipients) ? recipients : [recipients]).filter(Boolean))];

    for (const recipient of targetRecipients) {
      const item = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        title,
        message,
        recipient,
        createdAt,
        targetView,
        targetId,
        actionLabel,
        read: false
      };

      list.unshift(item);
      await this.presentLiveNotification(item);
    }

    this.saveAll(list);
  }

  markRead(noteId, user = auth.getCurrentUser()) {
    const userName = user?.name || '';
    let updatedNote = null;

    const updated = this.getAll().map(item => {
      if (item.id === noteId && (!userName || item.recipient === userName || item.recipient === 'all')) {
        updatedNote = { ...item, read: true };
        return updatedNote;
      }
      return item;
    });

    this.saveAll(updated);
    return updatedNote;
  }

  markAllRead(user = auth.getCurrentUser()) {
    const userName = user?.name || '';
    const updated = this.getAll().map(item => (
      item.recipient === userName ? { ...item, read: true } : item
    ));
    this.saveAll(updated);
  }

  showUnreadToast(user = auth.getCurrentUser()) {
    const unreadCount = this.getUnreadForUser(user).length;
    if (unreadCount) {
      showToast(`${unreadCount} new notification${unreadCount === 1 ? '' : 's'}`);
    }
  }

  renderDashboardPanel() {
    const notes = this.getUnreadForUser().slice(0, 4);

    if (!notes.length) {
      return `
        <div class="card" style="margin: 0 16px 12px;">
          <div class="card-body">
            <div class="empty-title">No new notifications</div>
            <div class="empty-subtitle">New clients, chem sheets, and repair orders from Admin will appear here offline on this device.</div>
          </div>
        </div>
      `;
    }

    const iconMap = {
      client: '👥',
      chem: '🧪',
      repair: '🛠️',
      update: '🔔'
    };

    return `
      <div class="card" style="margin: 0 16px 12px;">
        <div class="card-body">
          ${notes.map(note => {
            const stamp = note.createdAt
              ? new Date(note.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              : '';

            return `
              <div class="detail-row" style="align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid var(--gray-200);">
                <div style="font-size:18px; line-height:1;">${iconMap[note.type] || '🔔'}</div>
                <div style="flex:1;">
                  <div class="detail-value" style="font-weight:700;">${escapeHtml(note.title || 'Update')}</div>
                  <div class="detail-label" style="margin-top:3px;">${escapeHtml(note.message || '')}</div>
                  <div class="detail-label" style="margin-top:4px; font-size:11px;">${escapeHtml(stamp)}</div>
                  <div style="margin-top:8px;">
                    <button class="btn btn-secondary btn-sm" onclick="openNotificationItem('${note.id}')">${escapeHtml(note.actionLabel || 'Acknowledge')}</button>
                  </div>
                </div>
                <span class="badge badge-pending">New</span>
              </div>
            `;
          }).join('')}
          <div style="margin-top:10px;">
            <button class="btn btn-secondary btn-sm" onclick="markNotificationsRead()">Clear All Notifications</button>
          </div>
        </div>
      </div>
    `;
  }
}

const notificationManager = new NotificationManager();

function getAdminNames() {
  return Object.values(auth.users)
    .filter(user => user.role === 'admin')
    .map(user => user.name)
    .sort((a, b) => a.localeCompare(b));
}

function getAdminName() {
  return getAdminNames()[0] || 'Chris Mills';
}

function getAdminRecipients(excludeName = '') {
  return getAdminNames().filter(name => name && name !== excludeName);
}

function getTechnicianNames() {
  return Object.values(auth.users)
    .filter(user => user.role === 'technician')
    .map(user => user.name)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeTechnicianName(name = '') {
  const value = String(name || '').trim();
  if (!value) return '';

  const match = getTechnicianNames().find(item => item.toLowerCase() === value.toLowerCase());
  return match || value;
}

function markNotificationsRead() {
  notificationManager.markAllRead();
  showToast('Notifications cleared');
  if (router.currentView === 'dashboard') {
    router.renderDashboard();
  }
}

function openNotificationItem(noteId) {
  const note = notificationManager.markRead(noteId);
  if (!note) return;

  if (note.targetView === 'chem' && note.targetId) {
    router.viewWorkOrder(note.targetId);
    return;
  }

  if (note.targetView === 'repair' && note.targetId) {
    renderRepairOrderForm(note.targetId);
    return;
  }

  if (note.targetView === 'clients') {
    router.renderClients();
    return;
  }

  if (note.targetView === 'workorders') {
    router.renderWorkOrders();
    return;
  }

  router.renderDashboard();
}

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
    this.adminJobStatusFilter = 'all';
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
    const user = auth.getCurrentUser();
    const isOfficeUser = auth.isAdmin() || (user && (user.name === 'Jet' || user.name === 'Mark'));
    // Hide Work Orders tab for field techs
    const woBtn = document.querySelector('.nav-item[data-view="workorders"]');
    if (woBtn) woBtn.style.display = isOfficeUser ? '' : 'none';
    // Rename nav labels for office users
    const routesBtn = document.querySelector('.nav-item[data-view="routes"]');
    if (routesBtn) {
      const label = routesBtn.querySelector('.nav-label');
      const icon = routesBtn.querySelector('.nav-icon');
      if (isOfficeUser) { if (label) label.textContent = 'Work Orders'; if (icon) icon.textContent = '🛠️'; }
      else { if (label) label.textContent = 'Routes'; if (icon) icon.textContent = '🗺️'; }
    }
    if (woBtn) {
      const label = woBtn.querySelector('.nav-label');
      if (label && isOfficeUser) label.textContent = 'Create WO';
    }
  }

  setAdminJobStatusFilter(value = 'all') {
    this.adminJobStatusFilter = value || 'all';
    if (this.currentView === 'workorders') {
      this.renderWorkOrders();
    }
  }

  applyStatusFilter(items = []) {
    const filter = this.adminJobStatusFilter || 'all';

    if (filter === 'completed') {
      return items.filter(item => (item.status || '').toLowerCase() === 'completed');
    }

    if (filter === 'pending') {
      return items.filter(item => (item.status || '').toLowerCase() !== 'completed');
    }

    return items;
  }

  getVisibleJobs(items = [], technicianField = 'technician') {
    const currentUser = auth.getCurrentUser();
    if (!currentUser) return [];

    return currentUser.role === 'admin'
      ? items
      : items.filter(item => (item?.[technicianField] || '') === currentUser.name);
  }

  getDateKey(value = '') {
    if (!value) return '';

    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  renderDashboard() {
    const content = document.getElementById('main-content');
    if (!content) return;

    const user = auth.getCurrentUser();
    const userName = user ? user.name : 'Technician';
    const isAdmin = auth.isAdmin();
    const visibleWorkorders = this.getVisibleJobs(db.get('workorders', []), 'technician');
    const visibleRepairOrders = this.getVisibleJobs(typeof getRepairOrders === 'function' ? getRepairOrders() : [], 'assignedTo');
    const unreadNotifications = notificationManager.getUnreadForUser(user).length;

    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const todayDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // Today's route clients for this tech
    const allClients = db.get('clients', []);
    const myRouteClients = isAdmin
      ? allClients.filter(c => c.serviceDays && c.serviceDays.includes(todayDay))
      : allClients.filter(c => c.technician === userName && c.serviceDays && c.serviceDays.includes(todayDay));

    // Total assigned clients for this tech
    const myTotalClients = isAdmin ? allClients.length : allClients.filter(c => c.technician && c.technician.toLowerCase() === userName.toLowerCase()).length;
    const isOfficeUser = isAdmin || (user && (user.name === 'Jet' || user.name === 'Mark'));

    // Work orders for dashboard - admin sees all, techs see their own
    const myRepairOrders = visibleRepairOrders.filter(r => (r.status || 'open') !== 'completed')
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    content.innerHTML = `
      <div class="wave-banner">
        <div class="wave-banner-eyebrow">Welcome back</div>
        <div class="wave-banner-title">${userName}</div>
        <div class="wave-banner-sub">${todayStr} • ${myRouteClients.length} stops today</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card" onclick="router.navigate('routes')">
          <div class="stat-icon">🗺️</div>
          <div class="stat-value">${myRouteClients.length}</div>
          <div class="stat-label">Today's Visits</div>
        </div>
        <div class="stat-card" onclick="router.navigate('clients')">
          <div class="stat-icon">👥</div>
          <div class="stat-value">${myTotalClients}</div>
          <div class="stat-label">Total Visits</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🛠️</div>
          <div class="stat-value">${myRepairOrders.length}</div>
          <div class="stat-label">Open Work Orders</div>
        </div>
      </div>

      ${myRepairOrders.length > 0 ? `
      <div class="section-header">
        <div class="section-title">${isAdmin ? 'All Open Work Orders' : 'My Work Orders'}</div>
      </div>
      ${myRepairOrders.map(order => `
        <div class="list-item" onclick="renderRepairOrderForm('${escapeHtml(order.id)}')" style="cursor:pointer;">
          <div class="list-item-avatar" style="background:#fff3e0; color:#e65100;">🛠️</div>
          <div class="list-item-info">
            <div class="list-item-name">${escapeHtml(order.clientName || 'Repair Job')}</div>
            <div class="list-item-sub">${escapeHtml(order.jobType || 'General Repair')} • ${escapeHtml(order.date || 'No date')}</div>
            <div class="list-item-sub" style="font-size:11px; color:#666;">📍 ${escapeHtml(order.address || '')}${!isAdmin && order.assignedTo ? '' : ` • 👤 ${escapeHtml(order.assignedTo || 'Unassigned')}`}</div>
          </div>
          <div class="list-item-actions">
            <span style="font-size:11px; padding:3px 8px; border-radius:12px; background:${order.status === 'in-progress' ? '#fff3e0' : '#e3f2fd'}; color:${order.status === 'in-progress' ? '#e65100' : '#1565c0'};">${escapeHtml(order.status || 'open')}</span>
          </div>
        </div>
      `).join('')}
      ` : `
      <div class="card" style="margin:16px;"><div class="card-body"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No open work orders</div></div></div></div>
      `}

    `;
  }

  renderTodaySchedule() {
    const currentUser = auth.getCurrentUser();
    const todayKey = this.getDateKey(new Date());

    const chemJobs = this.getVisibleJobs(db.get('workorders', []), 'technician').map(wo => ({
      id: wo.id,
      clientName: wo.clientName || 'Chem Sheet',
      address: wo.address || '',
      time: wo.time || wo.timeIn || 'TBD',
      status: wo.status || 'pending',
      kind: 'Chem Sheet',
      openAction: `router.viewWorkOrder('${wo.id}')`,
      dateKey: this.getDateKey(wo.date)
    }));

    const repairJobs = this.getVisibleJobs(typeof getRepairOrders === 'function' ? getRepairOrders() : [], 'assignedTo').map(order => ({
      id: order.id,
      clientName: order.clientName || 'Repair Job',
      address: order.address || '',
      time: order.timeIn || order.time || 'TBD',
      status: order.status || 'open',
      kind: order.jobType || 'Repair Order',
      openAction: `renderRepairOrderForm('${order.id}')`,
      dateKey: this.getDateKey(order.date)
    }));

    const todayJobs = [...chemJobs, ...repairJobs]
      .filter(job => job.dateKey === todayKey)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

    if (todayJobs.length === 0) {
      return `
        <div class="card" style="margin: 0 16px 12px;">
          <div class="card-body">
            <div class="empty-title">No scheduled jobs for today</div>
            <div class="empty-subtitle">Assigned jobs for ${currentUser?.name || 'this user'} will appear here automatically.</div>
          </div>
        </div>
      `;
    }

    return todayJobs.map(job => `
      <div class="schedule-item" onclick="${job.openAction}" style="cursor:pointer;">
        <div class="schedule-time">${escapeHtml(job.time || 'TBD')}</div>
        <div class="schedule-info">
          <div class="schedule-name">${escapeHtml(job.clientName)}</div>
          <div class="schedule-detail">${escapeHtml(job.kind)} • ${escapeHtml(job.address || 'Address TBD')}</div>
        </div>
        <div class="schedule-dot ${(job.status || '').toLowerCase() === 'completed' ? 'completed' : (job.status || '').toLowerCase() === 'in-progress' ? 'in-progress' : 'pending'}"></div>
      </div>
    `).join('');
  }

  renderRoutes() {
    const content = document.getElementById('main-content');
    const user = auth.getCurrentUser();
    const isAdmin = auth.isAdmin();
    const isOfficeUser = isAdmin || (user && (user.name === 'Jet' || user.name === 'Mark'));

    // Office users see Repair Visits instead of Routes
    if (isOfficeUser) { return this.renderRepairVisits(); }

    const allClients = db.get('clients', []);
    const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // For techs, show only their assigned route clients
    // For admin, show all routes or let them pick a tech
    let techFilter = isAdmin ? (this._routeTechFilter || 'all') : (user ? user.name : '');
    const techClients = techFilter === 'all'
      ? allClients.filter(c => c.serviceDays && c.serviceDays.length)
      : allClients.filter(c => c.technician === techFilter && c.serviceDays && c.serviceDays.length);

    // Get unique tech names for admin dropdown
    const techs = [...new Set(allClients.filter(c => c.technician).map(c => c.technician))].sort();

    // Build day tabs - default to today
    this._routeDayFilter = this._routeDayFilter || today;
    const dayFilter = this._routeDayFilter;

    const dayClients = dayFilter === 'all'
      ? techClients
      : techClients.filter(c => c.serviceDays && c.serviceDays.includes(dayFilter));

    content.innerHTML = `
      <div class="section-header">
        <div style="display:flex; align-items:center; gap:8px;"><button class="btn btn-icon" onclick="router.goBack()" style="font-size:20px; padding:0 4px;">←</button><div class="section-title">${isAdmin ? 'Route Schedule' : (user ? user.name + "'s Route" : 'My Route')}</div></div>
        ${isAdmin ? '' : `<div style="font-size:12px; color:#666;">${techClients.length} clients assigned</div>`}
      </div>

      ${isAdmin ? `
        <div style="padding:0 16px 8px;">
          <select class="form-control" onchange="router._routeTechFilter=this.value; router.renderRoutes();" style="font-size:14px;">
            <option value="all" ${techFilter === 'all' ? 'selected' : ''}>All Technicians</option>
            ${techs.map(t => `<option value="${escapeHtml(t)}" ${techFilter === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
          </select>
        </div>
      ` : ''}

      <div style="display:flex; gap:4px; padding:0 16px 10px; overflow-x:auto;">
        <button class="btn btn-sm ${dayFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="router._routeDayFilter='all'; router.renderRoutes();">All</button>
        ${DAY_ORDER.map(day => `
          <button class="btn btn-sm ${dayFilter === day ? 'btn-primary' : 'btn-secondary'}" style="${day === today ? 'border:2px solid #FFD700;' : ''}" onclick="router._routeDayFilter='${day}'; router.renderRoutes();">
            ${day.substring(0, 3)}${day === today ? ' ★' : ''}
          </button>
        `).join('')}
      </div>

      <div style="padding:0 16px 8px; color:#666; font-size:13px;">
        ${dayFilter === 'all' ? `${dayClients.length} total scheduled clients` : `${dayClients.length} clients for ${dayFilter}${dayFilter === today ? ' (today)' : ''}`}
      </div>

      <div id="routes-list">
        ${this.renderRouteClients(dayClients, dayFilter, techFilter)}
      </div>
    `;
  }

  renderRouteClients(clients, dayFilter, techFilter) {
    if (clients.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🗺️</div>
          <div class="empty-title">No clients scheduled</div>
          <div class="empty-subtitle">${dayFilter === 'all' ? 'No route clients found for this filter' : 'No visits scheduled for ' + dayFilter}</div>
        </div>
      `;
    }

    const isAdmin = auth.isAdmin();

    // Group by tech if admin viewing all
    if (isAdmin && techFilter === 'all') {
      const byTech = {};
      clients.forEach(c => {
        const tech = c.technician || 'Unassigned';
        if (!byTech[tech]) byTech[tech] = [];
        byTech[tech].push(c);
      });

      let html = '';
      Object.keys(byTech).sort().forEach(tech => {
        html += `<div style="background:#1a237e; color:#fff; padding:8px 16px; font-weight:600; font-size:14px; margin-top:4px;">👤 ${escapeHtml(tech)} (${byTech[tech].length})</div>`;
        html += byTech[tech].sort((a, b) => a.name.localeCompare(b.name)).map(c => this.renderRouteCard(c)).join('');
      });
      return html;
    }

    return clients.sort((a, b) => a.name.localeCompare(b.name)).map(c => this.renderRouteCard(c)).join('');
  }

  renderRouteCard(client) {
    const daysLabel = (client.serviceDays || []).map(d => d.substring(0, 3)).join(', ');
    return `
      <div class="list-item" onclick="router.editClient('${escapeHtml(client.id)}')" style="cursor:pointer;">
        <div class="list-item-avatar" style="background:#e3f2fd; color:#1565c0;">📍</div>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(client.name)}</div>
          <div class="list-item-sub">${escapeHtml(client.address)}</div>
          <div class="list-item-sub" style="font-size:11px; color:#2196F3;">${escapeHtml(client.route || '')}${daysLabel ? ' · ' + daysLabel : ''}</div>
        </div>
        <div class="list-item-actions">
          <button class="btn btn-icon" onclick="event.stopPropagation(); openMap('${escapeHtml(client.address)}')" title="Navigate">📍</button>
        </div>
      </div>
    `;
  }

  renderRoutesList() {
    return this.renderRouteClients([], 'all', 'all');
  }

  renderRepairVisits() {
    const content = document.getElementById('main-content');
    const isAdmin = auth.isAdmin();
    const canShare = auth.canShare();
    const allRepair = typeof getRepairOrders === 'function' ? getRepairOrders() : [];
    const openCount = allRepair.filter(r => (r.status || 'open') !== 'completed').length;
    const doneCount = allRepair.filter(r => (r.status || '') === 'completed').length;
    this._repairFilter = this._repairFilter || 'all';

    // Build day-based view
    let dayViewHTML = '';
    if (this._repairFilter === 'byday') {
      // Group orders by date
      const grouped = {};
      allRepair.forEach(order => {
        const dateKey = order.date || 'Unscheduled';
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(order);
      });
      // Sort date keys (Unscheduled last)
      const sortedDates = Object.keys(grouped).sort((a, b) => {
        if (a === 'Unscheduled') return 1;
        if (b === 'Unscheduled') return -1;
        return new Date(a) - new Date(b);
      });
      if (sortedDates.length === 0) {
        dayViewHTML = `<div class="empty-state"><div class="empty-icon">🛠️</div><div class="empty-title">No work orders</div><div class="empty-subtitle">Create a work order to get started</div></div>`;
      } else {
        dayViewHTML = sortedDates.map(dateKey => {
          const orders = grouped[dateKey];
          let label = dateKey;
          if (dateKey !== 'Unscheduled') {
            const d = new Date(dateKey + 'T00:00:00');
            const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            label = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
          }
          const openInDay = orders.filter(o => (o.status || 'open') !== 'completed').length;
          const doneInDay = orders.filter(o => (o.status || '') === 'completed').length;
          return `
            <div style="margin-bottom:16px;">
              <div style="font-weight:600;font-size:15px;padding:8px 0;border-bottom:2px solid var(--primary-color, #2196F3);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                <span>📅 ${label}</span>
                <span style="font-size:12px;font-weight:400;color:#666;">${openInDay} open · ${doneInDay} done</span>
              </div>
              ${orders.map(order => `
                <div class="job-card" style="margin-bottom:8px;">
                  <div class="job-card-header"><div>
                    <div class="job-card-title">${escapeHtml(order.clientName || 'Repair Job')}</div>
                    <div class="job-card-customer">${escapeHtml(order.jobType || 'General Repair')}</div>
                    <div class="job-meta"><div class="job-meta-item">👤 ${escapeHtml(order.assignedTo || '')}</div></div>
                  </div></div>
                  <div class="job-card-body">
                    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value">${escapeHtml(order.status || 'open')}</div></div>
                    <div class="detail-row"><div class="detail-label">Address</div><div class="detail-value">${escapeHtml(order.address || '')}</div></div>
                  </div>
                  <div class="job-card-footer">
                    <button class="btn ${order.status === 'completed' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="renderRepairOrderForm('${escapeHtml(order.id)}')">${order.status === 'completed' ? 'Completed' : 'Open'}</button>
                    ${canShare ? `<button class="btn btn-primary btn-sm" onclick="shareRepairPDF('${escapeHtml(order.id)}')">Share</button>` : ''}
                    ${auth.getCurrentUser().role === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteRepairOrder('${escapeHtml(order.id)}')">Delete</button>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }).join('');
      }
    }

    content.innerHTML = `
      <div class="section-header">
        <div style="display:flex; align-items:center; gap:8px;"><button class="btn btn-icon" onclick="router.goBack()" style="font-size:20px; padding:0 4px;">\u2190</button><div class="section-title">Repair Visits</div></div>
        <button class="btn btn-primary btn-sm" onclick="renderRepairOrderForm()">+ Work Order</button>
      </div>

      <div style="display:flex;gap:8px;margin:0 16px 12px;flex-wrap:wrap;">
        <button class="btn btn-sm ${this._repairFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="router._repairFilter='all'; router.renderRepairVisits();">All (${allRepair.length})</button>
        <button class="btn btn-sm ${this._repairFilter === 'byday' ? 'btn-primary' : 'btn-secondary'}" onclick="router._repairFilter='byday'; router.renderRepairVisits();">By Day</button>
        <button class="btn btn-sm ${this._repairFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}" onclick="router._repairFilter='pending'; router.renderRepairVisits();">Open (${openCount})</button>
        <button class="btn btn-sm ${this._repairFilter === 'completed' ? 'btn-primary' : 'btn-secondary'}" onclick="router._repairFilter='completed'; router.renderRepairVisits();">Completed (${doneCount})</button>
      </div>

      <div class="card">
        <div class="card-body">
          ${this._repairFilter === 'byday' ? dayViewHTML : renderRepairOrdersList(this._repairFilter)}
        </div>
      </div>
    `;
  }

  renderClients() {
    const content = document.getElementById('main-content');
    const user = auth.getCurrentUser();
    const isAdmin = auth.isAdmin();
    const isMainAdmin = user && user.role === 'admin';
    const isOfficeUser = isAdmin || (user && (user.name === 'Jet' || user.name === 'Mark'));
    this._clientViewMode = this._clientViewMode || 'all';
    if (!isAdmin && this._clientViewMode === 'byRoute') this._clientViewMode = 'all';
    // Office users only see All view
    if (isOfficeUser) this._clientViewMode = 'all';

    content.innerHTML = `
      <div class="section-header">
        <div style="display:flex; align-items:center; gap:8px;"><button class="btn btn-icon" onclick="router.goBack()" style="font-size:20px; padding:0 4px;">←</button><div class="section-title">${isOfficeUser ? 'Clients' : (user ? user.name + "'s Clients" : 'My Clients')}</div></div>
        <div style="display:flex; gap:8px;">
          ${isMainAdmin ? '<button class="btn btn-secondary btn-sm" onclick="importRouteSchedule()">Import Route Sheet</button>' : ''}
          ${isAdmin ? '<button class="btn btn-primary btn-sm" onclick="quickAddClient()">+ Add Client</button>' : ''}
        </div>
      </div>

      ${isOfficeUser ? '' : `
      <div style="display:flex; gap:6px; padding:0 16px 8px; flex-wrap:wrap;">
        <button class="btn btn-sm ${this._clientViewMode === 'all' ? 'btn-primary' : 'btn-secondary'}" onclick="router.setClientView('all')">All</button>
        <button class="btn btn-sm ${this._clientViewMode === 'byDay' ? 'btn-primary' : 'btn-secondary'}" onclick="router.setClientView('byDay')">By Day</button>
      </div>
      `}

      <div class="search-bar" style="margin: 0 16px 12px;">
        <input type="text" id="client-search" placeholder="Search clients..." oninput="router.filterClients(this.value)" class="form-control">
      </div>

      <div id="clients-list">
        ${this.renderClientsList()}
      </div>
    `;
  }

  setClientView(mode) {
    this._clientViewMode = mode;
    this.renderClients();
  }

  filterClients(query) {
    const list = document.getElementById('clients-list');
    if (!list) return;
    list.innerHTML = this.renderClientsList(query);
  }

  renderClientCard(client, isAdmin) {
    const daysLabel = (client.serviceDays && client.serviceDays.length) ? client.serviceDays.map(d => d.substring(0,3)).join(', ') : '';
    const routeLabel = client.route || '';
    const metaParts = [client.address, routeLabel, daysLabel].filter(Boolean);

    return `
      <div class="list-item">
        <div class="list-item-avatar">${client.name.charAt(0).toUpperCase()}</div>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(client.name)}</div>
          <div class="list-item-sub">${escapeHtml(client.address)}</div>
          ${daysLabel ? `<div class="list-item-sub" style="font-size:11px; color:#2196F3;">${escapeHtml(routeLabel ? routeLabel + ' · ' + daysLabel : daysLabel)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="btn btn-icon" onclick="openMap('${escapeHtml(client.address)}')" title="View on Map">📍</button>
          ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="router.editClient('${escapeHtml(client.id)}')">Edit</button>` : ''}
        </div>
      </div>
    `;
  }

  renderClientsList(query = '') {
    const allClients = db.get('clients', []);
    const isAdmin = auth.isAdmin();
    const user = auth.getCurrentUser();
    const mode = this._clientViewMode || 'all';

    // Office users (admin, Jet, Mark) see all clients; field techs see only their own
    const isOfficeUser = isAdmin || (user && (user.name === 'Jet' || user.name === 'Mark'));
    let baseClients = isOfficeUser
      ? allClients
      : allClients.filter(c => c.technician && user && c.technician.toLowerCase() === user.name.toLowerCase());

    let clients = query
      ? baseClients.filter(c =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.address.toLowerCase().includes(query.toLowerCase()) ||
          (c.technician || '').toLowerCase().includes(query.toLowerCase()) ||
          (c.route || '').toLowerCase().includes(query.toLowerCase())
        )
      : baseClients;

    if (clients.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">👥</div>
          <div class="empty-title">No clients found</div>
          <div class="empty-subtitle">${isAdmin ? 'Try a different search or add a client' : 'Check back later for client list'}</div>
        </div>
      `;
    }

    if (mode === 'all' || query) {
      clients.sort((a, b) => a.name.localeCompare(b.name));
      return clients.map(c => this.renderClientCard(c, isAdmin)).join('');
    }

    const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    if (mode === 'byRoute') {
      const byTech = {};
      clients.filter(c => c.serviceDays && c.serviceDays.length).forEach(c => {
        const tech = c.technician || 'Unassigned';
        if (!byTech[tech]) byTech[tech] = {};
        const days = c.serviceDays;
        days.forEach(day => {
          if (!byTech[tech][day]) byTech[tech][day] = [];
          byTech[tech][day].push(c);
        });
      });

      let html = '';
      Object.keys(byTech).sort().forEach(tech => {
        const techDays = byTech[tech];
        const totalClients = new Set();
        Object.values(techDays).forEach(arr => arr.forEach(c => totalClients.add(c.id)));
        html += `<div style="background:#1a237e; color:#fff; padding:10px 16px; font-weight:600; font-size:15px; margin-top:8px;">👤 ${escapeHtml(tech)} <span style="font-weight:400; font-size:12px; opacity:0.8;">(${totalClients.size} clients)</span></div>`;

        const sortedDays = Object.keys(techDays).sort((a, b) => {
          const ai = DAY_ORDER.indexOf(a); const bi = DAY_ORDER.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

        sortedDays.forEach(day => {
          const dayClients = techDays[day].sort((a, b) => a.name.localeCompare(b.name));
          html += `<div style="background:#e3f2fd; padding:6px 16px; font-weight:600; font-size:13px; color:#1565c0;">📅 ${escapeHtml(day)} (${dayClients.length})</div>`;
          html += dayClients.map(c => this.renderClientCard(c, isAdmin)).join('');
        });
      });
      return html;
    }

    if (mode === 'byDay') {
      const byDay = {};
      clients.filter(c => c.serviceDays && c.serviceDays.length).forEach(c => {
        const days = c.serviceDays;
        days.forEach(day => {
          if (!byDay[day]) byDay[day] = [];
          byDay[day].push(c);
        });
      });

      const sortedDays = Object.keys(byDay).sort((a, b) => {
        const ai = DAY_ORDER.indexOf(a); const bi = DAY_ORDER.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      let html = '';
      sortedDays.forEach(day => {
        const dayClients = byDay[day].sort((a, b) => (a.technician || 'ZZZ').localeCompare(b.technician || 'ZZZ') || a.name.localeCompare(b.name));
        html += `<div style="background:#1a237e; color:#fff; padding:10px 16px; font-weight:600; font-size:15px; margin-top:8px;">📅 ${escapeHtml(day)} <span style="font-weight:400; font-size:12px; opacity:0.8;">(${dayClients.length} visits)</span></div>`;

        let currentTech = '';
        dayClients.forEach(c => {
          const tech = c.technician || 'Unassigned';
          if (tech !== currentTech) {
            currentTech = tech;
            html += `<div style="background:#e3f2fd; padding:6px 16px; font-weight:600; font-size:13px; color:#1565c0;">👤 ${escapeHtml(tech)}</div>`;
          }
          html += this.renderClientCard(c, isAdmin);
        });
      });
      return html;
    }

    return clients.map(c => this.renderClientCard(c, isAdmin)).join('');
  }

  renderWorkOrders() {
    const content = document.getElementById('main-content');
    const isAdmin = auth.isAdmin();
    const canShare = auth.canShare();

    const allChem = db.get('workorders', []);
    const allRepair = getRepairOrders();
    const chemOpen = allChem.filter(w => (w.status || 'pending') !== 'completed').length;
    const chemDone = allChem.filter(w => (w.status || 'pending') === 'completed').length;
    const repairOpen = allRepair.filter(r => (r.status || 'open') === 'open').length;
    const repairProgress = allRepair.filter(r => (r.status || '') === 'in-progress').length;
    const repairDone = allRepair.filter(r => (r.status || '') === 'completed').length;

    content.innerHTML = `
      <div class="section-header">
        <div style="display:flex; align-items:center; gap:8px;"><button class="btn btn-icon" onclick="router.goBack()" style="font-size:20px; padding:0 4px;">←</button><div class="section-title">Create Work Order</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="downloadCompletedWorkOrders()">📥 Download WO</button>` : ''}
          ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="downloadBulkChemSheets()">📥 Download Chem Sheets</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="renderRepairOrderForm()">+ Work Order</button>
          ${isAdmin ? `<button class="btn btn-primary btn-sm" onclick="router.createWorkOrder()">+ Chem Sheet</button>` : ''}
        </div>
      </div>

      <div style="padding:16px;">
        <div class="empty-state">
          <div class="empty-icon">🛠️</div>
          <div class="empty-title">Create a new work order</div>
          <div class="empty-subtitle">Tap + Work Order or + Chem Sheet above to get started</div>
        </div>
      </div>
    `;
  }

  renderWorkOrdersList() {
    const allWorkorders = db.get('workorders', []);
    const currentUser = auth.getCurrentUser();
    const isAdmin = auth.isAdmin();
    const canShare = auth.canShare();

    let workorders = this.applyStatusFilter(allWorkorders);

    if (workorders.length === 0) {
      const filter = this.adminJobStatusFilter || 'all';
      const emptyTitle = filter === 'completed'
        ? 'No completed chem sheets'
        : filter === 'pending'
          ? 'No open or pending chem sheets'
          : 'No chem sheets found';

      return `
        <div class="empty-state">
          <div class="empty-icon">🧪</div>
          <div class="empty-title">${emptyTitle}</div>
          <div class="empty-subtitle">${isAdmin ? 'Try a different filter or create a new job' : 'Check back later for your assigned jobs'}</div>
        </div>
      `;
    }

    const sortedWorkorders = [...workorders].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return sortedWorkorders.map(wo => this.renderJobCard(wo, canShare, isAdmin, currentUser)).join('');
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
              ${currentUser.role === 'admin' ? `<div class="job-meta-item">👤 ${wo.technician || 'Unknown'}</div>` : ''}
            </div>
          </div>
          <button class="btn btn-icon" onclick="openMap('${wo.address}')" title="View on Map">📍</button>
        </div>
        <div class="job-card-body">
          <div class="badge badge-${wo.status || 'pending'}">${wo.status || 'pending'}</div>
        </div>
        <div class="job-card-footer">
          <button class="btn ${isCompleted ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="router.viewWorkOrder('${wo.id}')">${isCompleted ? 'Completed' : 'Open'}</button>
          ${canShare ? `<button class="btn btn-primary btn-sm" onclick="shareReport('${wo.id}')">Share</button>` : ''}
          ${currentUser.role === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteWorkOrder('${wo.id}')">Delete</button>` : ''}
        </div>
      </div>
    `;
  }

  renderSettings() {
    const content = document.getElementById('main-content');
    const user = auth.getCurrentUser();
    const isAdmin = auth.isAdmin();
    const isMainAdmin = user && user.role === 'admin';

    content.innerHTML = `
      <div class="section-header">
        <div style="display:flex; align-items:center; gap:8px;"><button class="btn btn-icon" onclick="router.goBack()" style="font-size:20px; padding:0 4px;">←</button><div class="section-title">Settings</div></div>
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

      ${isAdmin ? `
      <div class="section-header" style="margin-top: 20px;">
        <div class="section-title">Estimate Builder</div>
      </div>
      <div class="card">
        <div class="card-body">
          <button class="btn btn-primary" onclick="router.createEstimate()">Open Estimate Sheet</button>
        </div>
      </div>
      ` : ''}

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
            <label class="form-label">App Link</label>
            <input type="text" id="apk-link-input" class="form-control" placeholder="Paste your app link here..." value="https://millzy7665-beep.github.io/oasis-service/">
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
                <option value="">— Search client —</option>
                ${[...clients].sort((a, b) => a.name.localeCompare(b.name)).map(client => `<option value="${client.id}" ${client.id === order.clientId ? 'selected' : ''}>${client.name}</option>`).join('')}
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
                <option value="open" ${order.status === 'open' ? 'selected' : ''}>Open</option>
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
  createEstimate(clientId = '') {
    if (!auth.isAdmin()) {
      showToast('Only admins can create estimate sheets');
      return;
    }

    const clients = db.get('clients', []);
    if (!clients.length) {
      showToast('Add a client first');
      this.renderClients();
      return;
    }

    renderEstimateForm('', clientId || clients[0].id);
  }
  viewEstimate(id) {
    if (!auth.isAdmin()) {
      showToast('Only admins can view estimate sheets');
      return;
    }

    renderEstimateForm(id);
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
    const allDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const clientDays = client.serviceDays || [];

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
              <label class="form-label">Assigned Technician</label>
              <input type="text" id="edit-client-tech" class="form-control" value="${escapeHtml(client.technician || '')}">
            </div>

            <div class="form-group">
              <label class="form-label">Route</label>
              <input type="text" id="edit-client-route" class="form-control" value="${escapeHtml(client.route || '')}" placeholder="e.g. Route 1">
            </div>

            <div class="form-group">
              <label class="form-label">Service Days</label>
              <div id="edit-client-days" style="display:flex; gap:6px; flex-wrap:wrap;">
                ${allDays.map(day => `
                  <label style="display:flex; align-items:center; gap:4px; padding:6px 10px; background:${clientDays.includes(day) ? '#2196F3' : '#e0e0e0'}; color:${clientDays.includes(day) ? '#fff' : '#333'}; border-radius:16px; font-size:13px; cursor:pointer;">
                    <input type="checkbox" value="${day}" ${clientDays.includes(day) ? 'checked' : ''} style="display:none;" onchange="this.parentElement.style.background=this.checked?'#2196F3':'#e0e0e0'; this.parentElement.style.color=this.checked?'#fff':'#333';">
                    ${day.substring(0, 3)}
                  </label>
                `).join('')}
              </div>
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

    const currentUser = auth.getCurrentUser();
    const assignedTechnician = client.technician || currentUser?.name || '';

    const order = {
      id: Date.now().toString(),
      clientId,
      clientName: client.name,
      address: client.address,
      technician: assignedTechnician,
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
      doc.setFont('helvetica', 'normal');
      doc.setCharSpace(1.6);
      doc.setFontSize(18);
      doc.text('OASIS', 32, 16.5);
      doc.setCharSpace(0);

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
      doc.setFont('helvetica', 'normal');
      doc.setCharSpace(1.4);
      doc.setFontSize(10.5);
      doc.text('OASIS', 30, footerY + 11.5);
      doc.setCharSpace(0);

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
      doc.setDrawColor(235, 235, 235);
      doc.line(10, y + 5, 200, y + 5);
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

// Route schedule import from XLSM file
function importRouteSchedule() {
  const content = document.getElementById('main-content');
  content.innerHTML = `
    <div class="wo-form">
      <div class="wo-bar">
        <button class="btn btn-secondary btn-sm" onclick="router.renderClients()">\u2190 Back</button>
        <div class="wo-bar-title">Import Route Sheet</div>
      </div>
      <div class="wo-sec">
        <div class="wo-sec-hd">Upload Route Sheet (.xlsm / .xlsx)</div>
        <div class="wo-sec-bd">
          <p style="color:#666; font-size:13px; margin-bottom:12px;">Select your route schedule Excel file. The importer will read each ROUTE sheet tab and assign service days to matching clients.</p>
          <p style="color:#666; font-size:13px; margin-bottom:12px;">Expected format: Each sheet named "ROUTE #" with Row 1 = tech name, Row 2 = day headers (MONDAY-SATURDAY), then alternating time/client rows.</p>
          <div class="form-group">
            <input type="file" id="route-file-input" accept=".xlsx,.xlsm,.xls" class="form-control" onchange="processRouteFile(this)">
          </div>
          <div id="route-import-status" style="margin-top:12px;"></div>
        </div>
      </div>
    </div>
  `;
}

function processRouteFile(input) {
  const file = input.files[0];
  if (!file) return;

  const statusEl = document.getElementById('route-import-status');
  statusEl.innerHTML = '<p style="color:#2196F3;">Reading file...</p>';

  // Map route sheet tech names to app auth names
  const TECH_NAME_MAP = {
    'king': 'Kingsley',
    'stephon': 'Elvin'
  };
  function normalizeTechName(name) {
    const lower = (name || '').trim().toLowerCase();
    return TECH_NAME_MAP[lower] || (name || '').trim();
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

      let routeEntries = [];

      // Detect format: flat table (Day, Route #, Route Name, Client Name, Address) vs multi-tab
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const firstRow = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })[0] || [];
      const headers = firstRow.map(h => String(h).toLowerCase().trim());
      const isFlat = headers.includes('day') && headers.includes('client name');

      if (isFlat) {
        // Flat format: each row is one visit (day + tech + client + address)
        const rows = XLSX.utils.sheet_to_json(firstSheet);
        const clientMap = {};

        rows.forEach(row => {
          const day = (row['Day'] || '').trim();
          const routeNum = String(row['Route #'] || '').trim();
          const techRaw = (row['Route Name'] || '').trim();
          const tech = normalizeTechName(techRaw);
          const clientName = (row['Client Name'] || '').trim();
          const address = (row['Address'] || '').trim();
          if (!clientName || !day) return;

          // Normalize day name
          const normalDay = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
          const key = (tech + '|' + clientName + '|' + address).toUpperCase();

          if (!clientMap[key]) {
            clientMap[key] = {
              tech: tech,
              route: 'Route ' + routeNum,
              name: clientName,
              address: address,
              days: []
            };
          }
          if (!clientMap[key].days.includes(normalDay)) {
            clientMap[key].days.push(normalDay);
          }
        });

        // Sort days and build entries
        Object.values(clientMap).forEach(entry => {
          entry.days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
          routeEntries.push(entry);
        });
      } else {
        // Multi-tab format: each sheet is a route
        const techOverrides = {
          'ROUTE 1': 'Kadeem', 'ROUTE 2': 'Elvin', 'ROUTE 3': 'Jermaine',
          'ROUTE 4': 'Ace', 'ROUTE 5': 'Donald', 'ROUTE 6': 'Kingsley',
          'ROUTE 7': 'Ariel', 'ROUTE 8': 'Malik'
        };

        wb.SheetNames.filter(n => n.trim().toUpperCase().startsWith('ROUTE')).forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          const routeKey = sheetName.trim();
          const techName = techOverrides[routeKey] || normalizeTechName(routeKey.replace(/ROUTE\s*#?\d*\s*/i, ''));
          const days = (rows[1] || []).filter(d => typeof d === 'string' && d.trim());

          const clientMap = {};
          for (let row = 2; row < rows.length; row++) {
            const cells = rows[row] || [];
            const hasText = cells.some(c => typeof c === 'string' && c.trim().length > 0);
            if (!hasText) continue;
            cells.forEach((cell, colIdx) => {
              if (typeof cell === 'string' && cell.trim() && colIdx < days.length) {
                const lines = cell.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l);
                const firstName = lines[0].replace(/\s*-\s*$/, '').trim();
                const key = firstName.substring(0, 50).toUpperCase();
                if (!clientMap[key]) clientMap[key] = { name: firstName, address: lines.join(' '), days: [] };
                const day = days[colIdx];
                if (!clientMap[key].days.includes(day)) clientMap[key].days.push(day);
              }
            });
          }

          Object.values(clientMap).forEach(entry => {
            entry.days.sort((a, b) => DAY_ORDER.map(d=>d.toUpperCase()).indexOf(a.toUpperCase()) - DAY_ORDER.map(d=>d.toUpperCase()).indexOf(b.toUpperCase()));
            routeEntries.push({
              tech: techName,
              route: routeKey.replace('ROUTE ', 'Route ').trim(),
              name: entry.name,
              address: entry.address,
              days: entry.days.map(d => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase())
            });
          });
        });
      }

      // Clear old serviceDays from all clients first
      const clients = db.get('clients', []);
      clients.forEach(c => { c.serviceDays = []; c.route = ''; });

      let matched = 0, created = 0;

      routeEntries.forEach(entry => {
        // Match on name + address + tech to avoid collisions between same-name clients
        const eName = entry.name.toLowerCase().trim();
        const eAddr = entry.address.toLowerCase().trim();
        const eTech = entry.tech.toLowerCase().trim();
        let match = clients.find(c =>
          c.name && c.name.toLowerCase().trim() === eName &&
          c.address && c.address.toLowerCase().trim() === eAddr &&
          c.technician && c.technician.toLowerCase().trim() === eTech
        );

        if (match) {
          const existing = match.serviceDays || [];
          entry.days.forEach(d => { if (!existing.includes(d)) existing.push(d); });
          existing.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
          match.serviceDays = existing;
          match.route = entry.route;
          matched++;
        } else {
          clients.push({
            id: 'c_' + Math.random().toString(36).substr(2, 9),
            name: entry.name,
            address: entry.address,
            contact: '',
            technician: entry.tech,
            route: entry.route,
            serviceDays: entry.days
          });
          created++;
        }
      });

      db.set('clients', clients);

      // Count unique clients with schedule
      const scheduled = clients.filter(c => c.serviceDays && c.serviceDays.length > 0).length;

      statusEl.innerHTML = `
        <div style="background:#e8f5e9; padding:12px; border-radius:8px;">
          <p style="color:#2e7d32; font-weight:600; margin-bottom:8px;">Import Complete</p>
          <p style="color:#333; font-size:13px;">\ud83d\udcca ${routeEntries.length} unique route entries processed</p>
          <p style="color:#333; font-size:13px;">\u2705 ${matched} existing clients updated</p>
          <p style="color:#333; font-size:13px;">\u2795 ${created} new clients created</p>
          <p style="color:#333; font-size:13px;">\ud83d\udcc5 ${scheduled} clients now have scheduled service days</p>
          <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="router.setClientView('byRoute'); router.renderClients();">View By Route</button>
          <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="router.navigate('routes')">View Routes</button>
        </div>
      `;
    } catch (err) {
      statusEl.innerHTML = '<p style="color:#c62828;">Error reading file: ' + escapeHtml(err.message) + '</p>';
      console.error('Route import error:', err);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function exportCompletedToExcel() {
  const isCompleted = (status = '') => String(status || '').trim().toLowerCase() === 'completed';
  const sortByNewest = (items = []) => [...items].sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0));

  const completedChemSheets = sortByNewest(db.get('workorders', []).filter(wo => isCompleted(wo.status)));
  const completedRepairOrders = sortByNewest(getRepairOrders().filter(order => isCompleted(order.status)));

  if (completedChemSheets.length === 0 && completedRepairOrders.length === 0) {
    showToast('No completed chem sheets or repair orders to export');
    return;
  }

  showToast('Generating Excel report...');

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OASIS Service App';
    workbook.created = new Date();
    workbook.modified = new Date();

    const styleHeader = (sheet, columnCount) => {
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0D2B45' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columnCount }
      };
    };

    const formatBody = (sheet) => {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.alignment = { vertical: 'top', wrapText: true };
      });
    };

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

    const chemSheet = workbook.addWorksheet('Chem Sheets');
    const chemColumns = [
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

    chemKeys.forEach(ck => {
      chemColumns.push({ header: `Pool ${ck.label}`, key: `p_${ck.key}`, width: 15 });
    });

    chemColumns.push(
      { header: 'Spa Chlorine', key: 'sCl', width: 12 },
      { header: 'Spa pH', key: 'sph', width: 10 },
      { header: 'Spa Alk', key: 'salk', width: 10 }
    );

    chemKeys.forEach(ck => {
      chemColumns.push({ header: `Spa ${ck.label}`, key: `s_${ck.key}`, width: 15 });
    });

    chemColumns.push({ header: 'Service Notes', key: 'notes', width: 40 });
    chemSheet.columns = chemColumns;
    styleHeader(chemSheet, chemColumns.length);

    completedChemSheets.forEach(wo => {
      const rowData = {
        date: wo.date || '',
        client: wo.clientName || '',
        address: wo.address || '',
        tech: wo.technician || '',
        timeIn: wo.timeIn || wo.time || '',
        timeOut: wo.timeOut || '',
        pCl: wo.readings?.pool?.chlorine || '',
        pph: wo.readings?.pool?.ph || '',
        palk: wo.readings?.pool?.alkalinity || '',
        sCl: wo.readings?.spa?.chlorine || '',
        sph: wo.readings?.spa?.ph || '',
        salk: wo.readings?.spa?.alkalinity || '',
        notes: `${wo.workPerformed || ''} ${wo.followUpNotes || wo.notes || ''}`.trim()
      };

      chemKeys.forEach(ck => {
        rowData[`p_${ck.key}`] = wo.chemicalsAdded?.pool?.[ck.key] || '';
        rowData[`s_${ck.key}`] = wo.chemicalsAdded?.spa?.[ck.key] || '';
      });

      chemSheet.addRow(rowData);
    });

    if (chemSheet.rowCount === 1) {
      chemSheet.addRow({ client: 'No completed chem sheets' });
    }
    formatBody(chemSheet);

    const repairColumns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Address', key: 'address', width: 35 },
      { header: 'Technician', key: 'tech', width: 18 },
      { header: 'Job Type', key: 'jobType', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Time In', key: 'timeIn', width: 10 },
      { header: 'Time Out', key: 'timeOut', width: 10 },
      { header: 'Labour Hours', key: 'labourHours', width: 12 },
      { header: 'Materials', key: 'materials', width: 30 },
      { header: 'Parts Summary', key: 'partsSummary', width: 40 },
      { header: 'Work Summary', key: 'summary', width: 40 },
      { header: 'Notes', key: 'notes', width: 40 }
    ];

    const repairSheet = workbook.addWorksheet('Repair Orders');
    repairSheet.columns = repairColumns;
    styleHeader(repairSheet, repairColumns.length);

    completedRepairOrders.forEach(order => {
      repairSheet.addRow({
        date: order.date || '',
        client: order.clientName || '',
        address: order.address || '',
        tech: order.assignedTo || '',
        jobType: order.jobType || '',
        status: order.status || '',
        timeIn: order.timeIn || order.time || '',
        timeOut: order.timeOut || '',
        labourHours: order.labourHours || '',
        materials: order.materials || '',
        partsSummary: order.partsSummary || '',
        summary: order.summary || '',
        notes: order.notes || ''
      });
    });

    if (repairSheet.rowCount === 1) {
      repairSheet.addRow({ client: 'No completed repair orders' });
    }
    formatBody(repairSheet);

    const buffer = await workbook.xlsx.writeBuffer();

    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    const base64 = btoa(binary);
    const filename = `OASIS_Completed_Orders_${new Date().toISOString().split('T')[0]}.xlsx`;

    await shareFileByEmail(base64, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    showToast('Completed orders Excel ready to email');
  } catch (error) {
    console.error('Excel export failed:', error);
    showToast('Excel export failed');
  }
}


async function downloadCompletedWorkOrders() {
  const allRepair = getRepairOrders();
  const completed = allRepair.filter(r =>
    (r.status || '').toLowerCase() === 'completed' &&
    r.assignedTo && (r.assignedTo === 'Jet' || r.assignedTo === 'Mark')
  ).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (completed.length === 0) {
    showToast('No completed work orders from Jet or Mark to download');
    return;
  }

  showToast('Generating Excel...');

  try {
    const wb = XLSX.utils.book_new();

    const rows = completed.map(order => ({
      'Date': order.date || '',
      'Client': order.clientName || '',
      'Address': order.address || '',
      'Assigned To': order.assignedTo || '',
      'Job Type': order.jobType || '',
      'Status': order.status || '',
      'Time In': order.timeIn || order.time || '',
      'Time Out': order.timeOut || '',
      'Labour Hours': order.labourHours || '',
      'Materials': order.materials || '',
      'Parts Summary': order.partsSummary || '',
      'Work Summary': order.summary || '',
      'Notes': order.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
      { wch: 12 }, { wch: 25 }, { wch: 35 }, { wch: 15 },
      { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 30 }, { wch: 40 }, { wch: 40 }, { wch: 40 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Completed Work Orders');

    const filename = `OASIS_Work_Orders_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);

    // Offer to clear downloaded work orders
    if (confirm(`Downloaded ${completed.length} work orders.\n\nRemove these completed work orders from the app?`)) {
      const remaining = allRepair.filter(r => {
        const isCompleted = (r.status || '').toLowerCase() === 'completed';
        const isJetMark = r.assignedTo && (r.assignedTo === 'Jet' || r.assignedTo === 'Mark');
        return !(isCompleted && isJetMark);
      });
      saveRepairOrders(remaining);
      showToast(`Removed ${completed.length} downloaded work orders`);
    } else {
      showToast(`Downloaded ${completed.length} completed work orders`);
    }
  } catch (error) {
    console.error('Download failed:', error);
    showToast('Download failed - check console');
  }
}


async function downloadBulkChemSheets() {
  const fieldTechs = ['Ace', 'Ariel', 'Donald', 'Elvin', 'Jermaine', 'Kadeem', 'Kingsley', 'Malik'];
  const allChem = db.get('workorders', []);
  const completed = allChem.filter(wo =>
    (wo.status || '').toLowerCase() === 'completed' &&
    wo.technician && fieldTechs.includes(wo.technician)
  );

  if (completed.length === 0) {
    showToast('No completed chem sheets from field techs to download');
    return;
  }

  showToast('Generating Chem Sheets Excel...');

  try {
    const wb = XLSX.utils.book_new();

    // Group by client
    const byClient = {};
    completed.forEach(wo => {
      const key = wo.clientName || wo.clientId || 'Unknown';
      if (!byClient[key]) byClient[key] = { address: wo.address || '', visits: [] };
      byClient[key].visits.push(wo);
    });

    // Sort clients alphabetically
    const clientNames = Object.keys(byClient).sort((a, b) => a.localeCompare(b));

    const readingLabels = [
      { key: 'chlorine', label: 'Chlorine' },
      { key: 'ph', label: 'pH' },
      { key: 'alkalinity', label: 'Alkalinity' },
      { key: 'calcium', label: 'Calcium' },
      { key: 'cya', label: 'CYA' },
      { key: 'salt', label: 'Salt' },
      { key: 'temp', label: 'Temp' },
      { key: 'tds', label: 'TDS' },
      { key: 'phosphates', label: 'Phosphates' }
    ];

    const chemLabels = [
      { key: 'tabs', label: 'Tabs' },
      { key: 'shock', label: 'Shock' },
      { key: 'muriaticAcid', label: 'Muriatic Acid' },
      { key: 'sodaAsh', label: 'Soda Ash' },
      { key: 'sodiumBicarb', label: 'Sodium Bicarb' },
      { key: 'calcium', label: 'Calcium' },
      { key: 'stabilizer', label: 'Stabilizer' },
      { key: 'salt', label: 'Salt' },
      { key: 'phosphateRemover', label: 'Phos Remover' },
      { key: 'algaecide', label: 'Algaecide' }
    ];

    // Build a single summary sheet with all clients
    // Each client gets a header row, then rows for readings/chemicals per visit date
    const summaryRows = [];

    clientNames.forEach(clientName => {
      const data = byClient[clientName];
      // Sort visits by date
      const visits = data.visits.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

      // Helper to sum numeric values from visit cells, parsing numbers from strings
      const sumVisitValues = (values) => {
        let total = 0;
        let hasValue = false;
        values.forEach(val => {
          const num = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
          if (!isNaN(num)) { total += num; hasValue = true; }
        });
        return hasValue ? total : '';
      };

      // Header row: Client | Address | Field | date columns | Total
      const headerRow = ['Client', 'Address', 'Field'];
      visits.forEach(v => {
        const d = v.date || 'No Date';
        headerRow.push(d);
      });
      headerRow.push('TOTAL');
      summaryRows.push(headerRow);

      // Total visits row
      const visitsRow = [clientName, data.address, 'Total Visits'];
      visits.forEach(() => visitsRow.push(''));
      visitsRow.push(visits.length);
      summaryRows.push(visitsRow);

      // Technician row
      const techRow = ['', '', 'Technician'];
      visits.forEach(v => techRow.push(v.technician || ''));
      techRow.push('');
      summaryRows.push(techRow);

      // Time In row
      const timeInRow = ['', '', 'Time In'];
      visits.forEach(v => timeInRow.push(v.timeIn || v.time || ''));
      timeInRow.push('');
      summaryRows.push(timeInRow);

      // Time Out row
      const timeOutRow = ['', '', 'Time Out'];
      visits.forEach(v => timeOutRow.push(v.timeOut || ''));
      timeOutRow.push('');
      summaryRows.push(timeOutRow);

      // Pool readings (no totals for readings - they are measurements not quantities)
      readingLabels.forEach(rl => {
        const row = ['', '', 'Pool ' + rl.label];
        visits.forEach(v => row.push((v.readings && v.readings.pool && v.readings.pool[rl.key]) || ''));
        row.push('');
        summaryRows.push(row);
      });

      // Pool chemicals added (with totals)
      chemLabels.forEach(cl => {
        const row = ['', '', 'Pool ' + cl.label + ' Added'];
        const vals = [];
        visits.forEach(v => {
          const val = (v.chemicalsAdded && v.chemicalsAdded.pool && v.chemicalsAdded.pool[cl.key]) || '';
          vals.push(val);
          row.push(val);
        });
        row.push(sumVisitValues(vals));
        summaryRows.push(row);
      });

      // Spa readings (no totals)
      readingLabels.forEach(rl => {
        const row = ['', '', 'Spa ' + rl.label];
        visits.forEach(v => row.push((v.readings && v.readings.spa && v.readings.spa[rl.key]) || ''));
        row.push('');
        summaryRows.push(row);
      });

      // Spa chemicals added (with totals)
      chemLabels.forEach(cl => {
        const row = ['', '', 'Spa ' + cl.label + ' Added'];
        const vals = [];
        visits.forEach(v => {
          const val = (v.chemicalsAdded && v.chemicalsAdded.spa && v.chemicalsAdded.spa[cl.key]) || '';
          vals.push(val);
          row.push(val);
        });
        row.push(sumVisitValues(vals));
        summaryRows.push(row);
      });

      // Notes row
      const notesRow = ['', '', 'Notes'];
      visits.forEach(v => notesRow.push(((v.workPerformed || '') + ' ' + (v.followUpNotes || v.notes || '')).trim()));
      notesRow.push('');
      summaryRows.push(notesRow);

      // Blank separator row
      summaryRows.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(summaryRows);

    // Set column widths
    const maxCols = Math.max(...summaryRows.map(r => r.length));
    const cols = [{ wch: 25 }, { wch: 35 }, { wch: 22 }];
    for (let i = 3; i < maxCols; i++) cols.push({ wch: 14 });
    ws['!cols'] = cols;

    XLSX.utils.book_append_sheet(wb, ws, 'Chem Sheets');

    const filename = `OASIS_Chem_Sheets_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);

    // Offer to clear downloaded chem sheets
    if (confirm(`Downloaded chem sheets for ${clientNames.length} clients.\n\nRemove these completed chem sheets from the app?`)) {
      const allWO = db.get('workorders', []);
      const remaining = allWO.filter(wo => {
        const isCompleted = (wo.status || '').toLowerCase() === 'completed';
        const isTech = wo.technician && fieldTechs.includes(wo.technician);
        return !(isCompleted && isTech);
      });
      db.set('workorders', remaining);
      showToast(`Removed ${completed.length} downloaded chem sheets`);
    } else {
      showToast(`Downloaded chem sheets for ${clientNames.length} clients`);
    }
  } catch (error) {
    console.error('Chem sheet download failed:', error);
    showToast('Download failed - check console');
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
  const route = document.getElementById('edit-client-route') ? document.getElementById('edit-client-route').value : '';
  const dayCheckboxes = document.querySelectorAll('#edit-client-days input[type=checkbox]');
  const serviceDays = Array.from(dayCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

  if (!name) {
    alert('Name is required');
    return;
  }

  const clients = db.get('clients', []);
  const index = clients.findIndex(c => c.id === clientId);
  if (index >= 0) {
    clients[index] = { ...clients[index], name, address, contact, technician: tech, route, serviceDays };
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
    { name: "Mystic Retreat", address: "John Greer Boulavard", tech: "Kadeem" },
    { name: "Brian Lonergan", address: "18 Paradise Close", tech: "Elvin" },
    { name: "South Bay Estates", address: "Bel Air Dr", tech: "Elvin" },
    { name: "Andy Marcher", address: "234 Drake Quay", tech: "Jermaine" },
    { name: "Andreas Haug", address: "359 North West Point Rd", tech: "Jermaine" },
    { name: "Dolce Vita", address: "Govenors Harbour", tech: "Jermaine" },
    { name: "Amber Stewart", address: "Dolce Vita 4", tech: "Jermaine" },
    { name: "Pleasant View", address: "West Bay", tech: "Jermaine" },
    { name: "Jack Leeland", address: "120 Oleander Dr", tech: "Ace" },
    { name: "Greg Swart", address: "182 Prospect Point Rd", tech: "Ace" },
    { name: "Kahlill Strachan", address: "27 Jump Link", tech: "Ace" },
    { name: "Loreen Stewart", address: "29 Galaxy Way", tech: "Ace" },
    { name: "Francia Lloyd", address: "30 Soto Lane", tech: "Ace" },
    { name: "Tom Balon", address: "37 Teal Island", tech: "Ace" },
    { name: "Charles Ebanks", address: "Bonnieview Av", tech: "Donald" },
    { name: "One Canal Point Gym", address: "Canal Point", tech: "Kingsley" },
    { name: "Colin Robinson", address: "130 Halkieth Rd", tech: "Malik" },
    { name: "Moon Bay", address: "Shamrock Rd", tech: "Malik" },
    { name: "Cayman Coves", address: "South Church Street", tech: "Kadeem" },
    { name: "Venetia", address: "South Sound", tech: "Kadeem" },
    { name: "Stephen Leontsinis", address: "1340 South Sound", tech: "Elvin" },
    { name: "Tim Dailyey", address: "North Webster Dr", tech: "Elvin" },
    { name: "Nicholas Lynn", address: "Sandlewood Crescent", tech: "Elvin" },
    { name: "Tom Newton", address: "304 South Sound", tech: "Elvin" },
    { name: "Joyce Follows", address: "35 Jacaranda Ct", tech: "Elvin" },
    { name: "Declean Magennis", address: "62 Ithmar Circle", tech: "Elvin" },
    { name: "Riyaz Norrudin", address: "63 Langton Way", tech: "Elvin" },
    { name: "Mangrove", address: "Bcqs", tech: "Elvin" },
    { name: "Quentin Creegan", address: "Villa Aramone", tech: "Elvin" },
    { name: "Jodie O'Mahony", address: "12 El Nathan", tech: "Jermaine" },
    { name: "Charles Motsinger", address: "124 Hillard", tech: "Jermaine" },
    { name: "Steve Daker", address: "33 Spurgeon Cr", tech: "Jermaine" },
    { name: "Laura Redman", address: "45 Yates Drive", tech: "Jermaine" },
    { name: "David Collins", address: "512 Yacht Dr", tech: "Jermaine" },
    { name: "Albert Schimdberger", address: "55 Elnathan Rd", tech: "Jermaine" },
    { name: "Jordan Constable", address: "60 Philip Crescent", tech: "Jermaine" },
    { name: "Blair Ebanks", address: "71 Spurgeon Crescent", tech: "Jermaine" },
    { name: "Bertrand Bagley", address: "91 El Nathan Drive", tech: "Jermaine" },
    { name: "Laura Egglishaw", address: "94 Park Side Close", tech: "Jermaine" },
    { name: "Hugo Munoz", address: "171 Leeward Dr", tech: "Ace" },
    { name: "Mitchell Demeter", address: "19 Whirlaway Close", tech: "Ace" },
    { name: "Habte Skale", address: "32 Trevor Close", tech: "Ace" },
    { name: "Paul Reynolds", address: "424 Prospect Point Rd", tech: "Ace" },
    { name: "Thomas Ponessa", address: "450 Prospect Point Rd", tech: "Ace" },
    { name: "Jim Brannon", address: "87 Royal Palms Drive", tech: "Ace" },
    { name: "Coastal Escape", address: "Omega Bay", tech: "Ace" },
    { name: "Inity Ridge", address: "Prospect Point Rd", tech: "Ace" },
    { name: "Ocean Reach", address: "Old Crewe Rd", tech: "Ace" },
    { name: "Scott Somerville", address: "Rum Point Rd", tech: "Donald" },
    { name: "Alexander McGarry", address: "2628 Bodden Town Rd", tech: "Donald" },
    { name: "67 On The Bay", address: "Queens Highway", tech: "Donald" },
    { name: "Hesham Sida", address: "824 Seaview Rd", tech: "Donald" },
    { name: "Peter Watler", address: "952 Seaview Rd", tech: "Donald" },
    { name: "Paradise Sur Mar", address: "Sand Cay Rd", tech: "Donald" },
    { name: "Rip Kai", address: "Rum Point Drive", tech: "Donald" },
    { name: "Sunrays", address: "Sand Cay Rd", tech: "Donald" },
    { name: "Greg Melehov", address: "16 Galway Quay", tech: "Kingsley" },
    { name: "William Jackman", address: "221 Crystal Dr", tech: "Kingsley" },
    { name: "Regant Court", address: "Brittania", tech: "Kingsley" },
    { name: "Solara Main", address: "Crystal Harbour", tech: "Kingsley" },
    { name: "Steven Joyce", address: "199 Crystal Drive", tech: "Ariel" },
    { name: "Rick Gorter", address: "33 Shoreview Point", tech: "Ariel" },
    { name: "Marcia Milgate", address: "34 Newhaven", tech: "Ariel" },
    { name: "Chad Horwitz", address: "49 Calico Quay", tech: "Ariel" },
    { name: "Malcom Swift", address: "Miramar", tech: "Ariel" },
    { name: "Roland Stewart", address: "Kimpton Seafire", tech: "Ariel" },
    { name: "Strata #70", address: "Boggy Sands rd", tech: "Ariel" },
    { name: "Tracey Kline", address: "108 Roxborough dr", tech: "Malik" },
    { name: "Debbie Ebanks", address: "Fischers Reef", tech: "Malik" },
    { name: "John Corallo", address: "3A Seahven", tech: "Malik" },
    { name: "Encompass", address: "3B Seahven", tech: "Malik" },
    { name: "Joseph Hurlston", address: "42 Monumnet Rd", tech: "Malik" },
    { name: "George McKenzie", address: "534 Rum Point Dr", tech: "Malik" },
    { name: "Twin Palms", address: "Rum Point Dr", tech: "Malik" },
    { name: "Bernie Bako", address: "#4 Venetia", tech: "Kadeem" },
    { name: "Cindy Conway", address: "#7 The Chimes", tech: "Kadeem" },
    { name: "Patricia Conroy", address: "58 Anne Bonney Crescent", tech: "Kadeem" },
    { name: "Park View Courts", address: "Spruce Lane", tech: "Kadeem" },
    { name: "The Bentley", address: "Crewe rd", tech: "Kadeem" },
    { name: "Jackie Murphy", address: "110 The lakes", tech: "Elvin" },
    { name: "Chris Turell", address: "127 Denham Thompson Way", tech: "Elvin" },
    { name: "Guy Locke", address: "1326 South Sound", tech: "Elvin" },
    { name: "Rena Streker", address: "1354 South Sound", tech: "Elvin" },
    { name: "Jennifer Bodden", address: "25 Ryan Road", tech: "Elvin" },
    { name: "Nicholas Gargaro", address: "538 South Sound Rd", tech: "Elvin" },
    { name: "Jessica Wright", address: "55 Edgmere Circle", tech: "Elvin" },
    { name: "Stewart Donald", address: "72 Conch Drive", tech: "Elvin" },
    { name: "Andre Ogle", address: "87 The Avenue", tech: "Elvin" },
    { name: "Jon Brosnihan", address: "#6 Shorewinds Trail", tech: "Jermaine" },
    { name: "Michael Bascina", address: "13 Victoria Dr", tech: "Jermaine" },
    { name: "Nigel Daily", address: "Snug Harbour", tech: "Jermaine" },
    { name: "Steven Manning", address: "61 Shoreline Dr", tech: "Jermaine" },
    { name: "Guy Cowan", address: "74 Shorecrest", tech: "Jermaine" },
    { name: "Kadi Pentney", address: "Kings Court", tech: "Jermaine" },
    { name: "Shoreway Townhomes", address: "Adonis Dr", tech: "Jermaine" },
    { name: "Randal Martin", address: "151 Shorecrest Circle", tech: "Jermaine" },
    { name: "Brandon Smith", address: "Victoria Villas", tech: "Jermaine" },
    { name: "David Guilmette", address: "183 Crystal Drive", tech: "Ace" },
    { name: "Stef Dimitrio", address: "266 Raleigh Quay", tech: "Ace" },
    { name: "Clive Harris", address: "516 Crighton Drive", tech: "Ace" },
    { name: "Chez Tschetter", address: "53 Marquise Quay", tech: "Ace" },
    { name: "Ross Fortune", address: "90 Prince Charles", tech: "Ace" },
    { name: "Simon Palmer", address: "Olivias Cove", tech: "Ace" },
    { name: "Caroline Moran", address: "197 Bimini Dr", tech: "Donald" },
    { name: "James Reeve", address: "215 Bimini Dr", tech: "Donald" },
    { name: "David Mullen", address: "23 Silver Thatch", tech: "Donald" },
    { name: "Sina Mirzale", address: "353 Bimini Dr", tech: "Donald" },
    { name: "Mike Kornegay", address: "40 Palm Island Circle", tech: "Donald" },
    { name: "Marlon Bispath", address: "519 Bimini Dr", tech: "Donald" },
    { name: "Margaret Fantasia", address: "526 Bimini Dr", tech: "Donald" },
    { name: "Kenny Rankin", address: "Grand Harbour", tech: "Donald" },
    { name: "James Mendes", address: "106 Olea", tech: "Ariel" },
    { name: "James O'Brien", address: "102 Olea", tech: "Ariel" },
    { name: "Lexi Pappadakis", address: "110 Olea", tech: "Ariel" },
    { name: "Manuela Lupu", address: "103 Olea", tech: "Ariel" },
    { name: "Mr Holland", address: "107 Olea", tech: "Ariel" },
    { name: "Nikki Harris", address: "213 olea", tech: "Ariel" },
    { name: "Scott Hughes", address: "111 Olea", tech: "Ariel" },
    { name: "Mr Kelly and Mrs Kahn", address: "112 Olea", tech: "Ariel" },
    { name: "Anu O'Driscoll", address: "23 Lalique Point", tech: "Malik" },
    { name: "Shelly Do Vale", address: "47 Marbel Drive", tech: "Malik" },
    { name: "Iman Shafiei", address: "53 Baquarat Quay", tech: "Malik" },
    { name: "Enrique Tasende", address: "65 Baccarat Quay", tech: "Malik" },
    { name: "David Wilson", address: "Boggy Sands", tech: "Malik" },
    { name: "Nina Irani", address: "Casa Oasis", tech: "Malik" },
    { name: "Sandy Lane Townhomes", address: "Boggy Sands Rd", tech: "Malik" },
    { name: "Valencia Heights", address: "Strata #536", tech: "Kadeem" },
    { name: "Jaime-Lee Eccles", address: "176 Conch Dr", tech: "Kadeem" },
    { name: "Mehdi Khosrow-Pour", address: "610 South Sound Rd", tech: "Kadeem" },
    { name: "Michelle Bryan", address: "65 Fairview Road", tech: "Kadeem" },
    { name: "Gareth thacker", address: "9 The Venetia", tech: "Kadeem" },
    { name: "Raoul Pal", address: "93 Marry read crescent", tech: "Kadeem" },
    { name: "Hilton Estates", address: "Fairbanks Rd", tech: "Kadeem" },
    { name: "Romell El Madhani", address: "117 Crystal Dr", tech: "Elvin" },
    { name: "Britni Strong", address: "150 Parkway Dr", tech: "Elvin" },
    { name: "Victoria Wheaton", address: "36 Whitehall Gardens", tech: "Elvin" },
    { name: "Prasanna Ketheeswaran", address: "46 Captian Currys Rd", tech: "Elvin" },
    { name: "Jaron Goldberg", address: "52 Parklands Close", tech: "Elvin" },
    { name: "Mitzi Callan", address: "Morganville Condos", tech: "Elvin" },
    { name: "Saphire", address: "Jec, Nwp Rd", tech: "Elvin" },
    { name: "The Sands", address: "Boggy Sand Rd", tech: "Elvin" },
    { name: "Turtle Breeze", address: "Conch Point Rd", tech: "Elvin" },
    { name: "Francois Du Toit", address: "Snug Harbour", tech: "Jermaine" },
    { name: "Paolo Pollini", address: "16 Stewart Ln", tech: "Jermaine" },
    { name: "Robert Morrison", address: "265 Jennifer Dr", tech: "Jermaine" },
    { name: "Johann Prinslo", address: "270 Jennifer Dr", tech: "Jermaine" },
    { name: "Andre Slabbert", address: "7 Victoria Dr", tech: "Jermaine" },
    { name: "Alicia McGill", address: "84 Andrew Drive", tech: "Jermaine" },
    { name: "Palm Heights Residence", address: "Seven Mile Beach", tech: "Jermaine" },
    { name: "Jean Mean", address: "211 Sea Spray Dr", tech: "Ace" },
    { name: "Paul Rowan", address: "265 Sea Spray Dr", tech: "Ace" },
    { name: "Charmaine Richter", address: "40 Natures Circle", tech: "Ace" },
    { name: "Rory Andrews", address: "44 Country Road", tech: "Ace" },
    { name: "Walker Romanica", address: "79 Riley Circle", tech: "Ace" },
    { name: "Craig Stewart", address: "88 Leeward Drive", tech: "Ace" },
    { name: "Grand Palmyra", address: "Seven Mile Beach", tech: "Ace" },
    { name: "Jay Easterbrook", address: "33 Cocoplum", tech: "Ace" },
    { name: "Harry Tee", address: "438 Water Cay Rd", tech: "Donald" },
    { name: "Sarah Dobbyn-Thomson", address: "441 Water Cay Rd", tech: "Donald" },
    { name: "Reg Williams", address: "Cliff House", tech: "Donald" },
    { name: "Gypsy", address: "1514 Rum Point Dr", tech: "Donald" },
    { name: "Kai Vista", address: "Rum Point Dr", tech: "Donald" },
    { name: "Ocean Vista", address: "Rum Point", tech: "Donald" },
    { name: "Stefan Marenzi", address: "Water Cay Rd", tech: "Donald" },
    { name: "Bella Rocca", address: "Queens Highway", tech: "Donald" },
    { name: "Sea 2 Inity", address: "Kiabo", tech: "Donald" },
    { name: "Guy Manning", address: "Diamonds Edge", tech: "Kingsley" },
    { name: "Kent Nickerson", address: "Salt Creek", tech: "Kingsley" },
    { name: "Grecia Iuculano", address: "133 Magellan Quay", tech: "Ariel" },
    { name: "Suzanne Correy", address: "394 Canal Point Rd", tech: "Ariel" },
    { name: "November Capitol", address: "One Canal Point", tech: "Ariel" },
    { name: "Safe Harbor", address: "West Bay", tech: "Ariel" },
    { name: "Bert Thacker", address: "West Bay", tech: "Ariel" },
    { name: "Izzy Akdeniz", address: "105 Solara", tech: "Malik" },
    { name: "Sandra Tobin", address: "108 Solara", tech: "Malik" },
    { name: "Philip Smyres", address: "Conch Point Villas", tech: "Malik" },
    { name: "Brandon Caruana", address: "Conch Point Villas", tech: "Malik" },
    { name: "Chelsea Pederson", address: "131 Conch Point", tech: "Malik" },
    { name: "Kate Ye", address: "17 Cypres Point", tech: "Malik" },
    { name: "Phillip Cadien", address: "312 Cypres Point", tech: "Malik" }
  ];

  // Map to store unique clients by name
  const uniqueClients = {};
  clients.forEach(c => {
    if (!uniqueClients[c.name]) {
      uniqueClients[c.name] = {
        id: `c_${Math.random().toString(36).substr(2, 9)}`,
        name: c.name,
        address: c.address,
        technician: c.tech
      };
    }
  });

  const clientArray = Object.values(uniqueClients);
  db.set('clients', clientArray);

  // Generate pending workorders for each client assigned to their tech
  const workorders = clientArray.map(c => ({
    id: `wo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    clientId: c.id,
    clientName: c.name,
    address: c.address,
    technician: c.technician,
    date: new Date().toISOString().split('T')[0],
    status: 'pending',
    readings: { pool: defaultChemReadings(), spa: defaultChemReadings() },
    chemicalsAdded: { pool: defaultChemicalAdditions(), spa: defaultChemicalAdditions() },
    photos: []
  }));

  db.set('workorders', workorders);
  db.set('masterScheduleLoaded', true);
}

function populateLoginTechOptions() {
  const select = document.getElementById('login-tech');
  if (!select) return;

  const entries = Object.entries(auth.users)
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  select.innerHTML = `
    <option value="" disabled selected>— Select your name —</option>
    ${entries.map(([id, user]) => `
      <option value="${id}">${user.name}${user.role === 'admin' ? ' (Admin)' : ''}</option>
    `).join('')}
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  // Start Firestore real-time sync
  db.startRealtimeSync();

  // Always force login screen on startup
  auth.logout();

  cleanupTestClients();
  initMasterSchedule();
  migrateLegacyRepairData();
  populateLoginTechOptions();

  // Android Back Button Handling
  if (typeof Capacitor !== 'undefined' && Capacitor.Plugins.App) {
    Capacitor.Plugins.App.addListener('backButton', () => {
      if (router.currentView === 'dashboard') {
        // Stop at home page, don't exit if logged in (though we force login above)
        return;
      }

      if (!auth.isLoggedIn()) {
        // If at login screen, maybe let it exit or do nothing
        return;
      }

      router.goBack();
    });
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      router.navigate(btn.dataset.view);
    });
  });

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const select = document.getElementById('login-tech');
    const pinInput = document.getElementById('login-pin');
    const username = select ? select.value : '';
    const pin = pinInput ? pinInput.value : '';
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app');
    const loginError = document.getElementById('login-error');

    console.log('Attempting login for:', username);

    if (auth.login(username, pin)) {
      console.log('Login successful');
      const loginScreen = document.getElementById('login-screen');
      const appShell = document.getElementById('app');

      if (loginScreen) {
        loginScreen.style.setProperty('display', 'none', 'important');
      }
      if (appShell) {
        appShell.classList.remove('hidden');
        appShell.style.setProperty('display', 'flex', 'important');
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
      console.warn('Login failed: invalid username or PIN');
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
  if (!auth.isAdmin()) {
    showToast('Only admins can add clients');
    return;
  }
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
  if (!auth.isAdmin()) {
    showToast('Only admins can delete clients');
    return;
  }
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
    status: getValue('wo-status', order.status || 'pending'),
    address: selectedClient?.address || getValue('wo-address', order.address),
    workPerformed: getValue('wo-work', order.workPerformed || ''),
    followUpNotes,
    notes: followUpNotes,
    photos: normalizeChemPhotos(order.photos), // Ensure photos are preserved from the original order
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

  order.status = document.getElementById('wo-status')?.value || order.status || 'pending';
  if (order.status !== 'completed') {
    showToast('Please set status to Completed before saving');
    return;
  }
  workOrderManager.saveOrder(order);
  router.navigate('workorders');
  showToast('Completed chem sheet saved');
}

function shareReport(orderId) {
  const order = collectWorkOrderForm(orderId);
  if (!order) {
    showToast('Work order not found');
    return;
  }

  order.status = document.getElementById('wo-status')?.value || order.status || 'pending';
  if (order.status !== 'completed') {
    showToast('Please set status to Completed before sharing');
    return;
  }
  workOrderManager.saveOrder(order);
  workOrderManager.generateReport(order);
}

function sendReport(orderId) {
  shareReport(orderId);
}

function getRepairOrders() {
  return db.get('repairOrders', []);
}

function saveRepairOrders(orders) {
  db.set('repairOrders', orders);
}

function renderRepairOrdersList(statusFilter = 'all') {
  const allOrders = getRepairOrders();
  const currentUser = auth.getCurrentUser();
  const isAdmin = auth.isAdmin();
  const canShare = auth.canShare();

  let orders = allOrders;

  if (statusFilter === 'completed') {
    orders = orders.filter(order => (order.status || '').toLowerCase() === 'completed');
  } else if (statusFilter === 'pending') {
    orders = orders.filter(order => (order.status || '').toLowerCase() !== 'completed');
  }

  if (!orders.length) {
    const emptyTitle = statusFilter === 'completed'
      ? 'No completed repair orders'
      : statusFilter === 'pending'
        ? 'No open or pending repair orders'
        : 'No repair work orders';

    return `
      <div class="empty-state">
        <div class="empty-icon">🛠️</div>
        <div class="empty-title">${emptyTitle}</div>
        <div class="empty-subtitle">Try a different filter or create a repair order</div>
      </div>
    `;
  }

  return [...orders].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).map(order => `
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
        <div class="detail-row"><div class="detail-label">Address</div><div class="detail-value">${escapeHtml(order.address || '')}</div></div>
      </div>
      <div class="job-card-footer">
        <button class="btn ${order.status === 'completed' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="renderRepairOrderForm('${escapeHtml(order.id)}')">${order.status === 'completed' ? 'Completed' : 'Open'}</button>
        ${canShare ? `<button class="btn btn-primary btn-sm" onclick="shareRepairPDF('${escapeHtml(order.id)}')">Share</button>` : ''}
        ${currentUser.role === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteRepairOrder('${escapeHtml(order.id)}')">Delete</button>` : ''}
      </div>
    </div>
  `).join('');
}

function renderRepairOrderForm(orderId = '', presetClientId = '', draftOrder = null) {
  const content = document.getElementById('main-content');
  const existing = !draftOrder && orderId ? getRepairOrders().find(order => order.id === orderId) : null;
  const clients = db.get('clients', []);
  const order = draftOrder || existing || {
    id: orderId || `r${Date.now()}`,
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
    summary: '',
    materials: '',
    partsItems: [],
    partsSummary: '',
    labourHours: '',
    notes: '',
    photos: []
  };

  const activeOrderId = order.id;
  const timeIn = order.timeIn || order.time || '';
  const timeOut = order.timeOut || '';
  const timeSpent = calculateTimeSpent(timeIn, timeOut);

  content.innerHTML = `
    <div class="wo-form">
      <div class="wo-bar">
        <button class="btn btn-secondary btn-sm" onclick="router.renderWorkOrders()">← Back</button>
        <div id="repair-bar-title" class="wo-bar-title">${order.clientName || 'Repair Order'}</div>
        <button class="btn btn-primary btn-sm" onclick="saveRepairWorkOrder('${activeOrderId}')">Save</button>
      </div>

      <div class="wo-sec">
        <div class="wo-sec-hd" onclick="toggleAccordion(this)">
          <span>Customer & Job Details</span>
          <span class="wo-chev">▼</span>
        </div>
        <div class="wo-sec-bd" data-active-repair-id="${activeOrderId}">
          <div class="form-row" style="position:relative;">
            <label for="repair-client-search">Client</label>
            <input type="hidden" id="repair-client" value="${escapeHtml(order.clientId || presetClientId || '')}">
            <input type="text" id="repair-client-search" class="form-control" placeholder="Type to search clients..." value="${escapeHtml(order.clientName || '')}" autocomplete="off" oninput="filterRepairClientDropdown(this.value)" onfocus="filterRepairClientDropdown(this.value)">
            <div id="repair-client-dropdown" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:100; max-height:200px; overflow-y:auto; background:#fff; border:1px solid #ddd; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15);"></div>
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
            <label for="repair-status">Status</label>
            <select id="repair-status">
              <option value="open" ${order.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="in-progress" ${order.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
              <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
            </select>
          </div>
        </div>
      </div>

      <div class="wo-sec">
        <div class="wo-sec-hd" onclick="toggleAccordion(this)">
          <span>Work Summary & Parts</span>
          <span class="wo-chev">▼</span>
        </div>
        <div class="wo-sec-bd">
          <div class="form-row">
            <label for="repair-summary">Summary of Work</label>
            <textarea id="repair-summary" placeholder="Describe the repair performed...">${escapeHtml(order.summary || '')}</textarea>
          </div>

          <div class="form-row">
            <label>Parts & Equipment Installed</label>
            ${renderRepairPartsBuilder(activeOrderId, order)}
          </div>

          <div class="form-row">
            <label for="repair-materials">Additional Parts Notes</label>
            <textarea id="repair-materials" placeholder="Materials used, part numbers not in catalog...">${escapeHtml(order.materials || '')}</textarea>
          </div>

          <div class="form-row">
            <label for="repair-labour">Labour Hours</label>
            <input id="repair-labour" type="number" step="0.25" value="${escapeHtml(order.labourHours || '')}">
          </div>

          <div class="form-row">
            <label for="repair-notes">Internal Office Notes</label>
            <textarea id="repair-notes" placeholder="Notes for billing or follow-up...">${escapeHtml(order.notes || '')}</textarea>
          </div>
        </div>
      </div>

      ${renderRepairPhotoSection(activeOrderId, order)}

      <div class="card" style="margin:12px;">
        <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="saveRepairWorkOrder('${escapeHtml(activeOrderId)}')">Save Changes</button>
          ${auth.canShare() ? `<button class="btn send-report-btn" onclick="saveRepairWorkOrder('${escapeHtml(activeOrderId)}', true)">Share Report</button>` : ''}
        </div>
      </div>
    </div>
  `;

  onRepairClientChange();
  attachRepairFormListeners();
}

function onRepairClientChange() {
  const hiddenInput = document.getElementById('repair-client');
  const searchInput = document.getElementById('repair-client-search');
  const address = document.getElementById('repair-address');
  const title = document.getElementById('repair-bar-title');
  if (!hiddenInput || !address) return;

  const client = db.get('clients', []).find(item => item.id === hiddenInput.value);
  if (client) {
    address.value = client.address || '';
    if (searchInput) searchInput.value = client.name || '';
    if (title) title.textContent = client.name || 'Repair Order';
  }
}


function filterRepairClientDropdown(query) {
  const dropdown = document.getElementById('repair-client-dropdown');
  if (!dropdown) return;
  const clients = [...db.get('clients', [])].sort((a, b) => a.name.localeCompare(b.name));
  const q = (query || '').toLowerCase();
  const filtered = q ? clients.filter(c => c.name.toLowerCase().includes(q) || (c.address || '').toLowerCase().includes(q)) : clients;

  if (filtered.length === 0) {
    dropdown.innerHTML = '<div style="padding:10px 14px;color:#999;font-size:13px;">No clients found</div>';
  } else {
    dropdown.innerHTML = filtered.map(c => `
      <div style="padding:10px 14px;cursor:pointer;font-size:14px;border-bottom:1px solid #f0f0f0;" onmousedown="selectRepairClient('${escapeHtml(c.id)}','${escapeHtml(c.name)}')">${escapeHtml(c.name)}<span style="display:block;font-size:11px;color:#888;">${escapeHtml(c.address || '')}</span></div>
    `).join('');
  }
  dropdown.style.display = 'block';

  setTimeout(() => {
    const searchInput = document.getElementById('repair-client-search');
    if (searchInput && !searchInput._blurBound) {
      searchInput._blurBound = true;
      searchInput.addEventListener('blur', () => {
        setTimeout(() => { if (dropdown) dropdown.style.display = 'none'; }, 200);
      });
    }
  }, 0);
}

function selectRepairClient(clientId, clientName) {
  const hiddenInput = document.getElementById('repair-client');
  const searchInput = document.getElementById('repair-client-search');
  const dropdown = document.getElementById('repair-client-dropdown');
  if (hiddenInput) hiddenInput.value = clientId;
  if (searchInput) searchInput.value = clientName;
  if (dropdown) dropdown.style.display = 'none';
  onRepairClientChange();
}

function collectRepairOrderFromForm(orderId = '') {
  // Use a stable identifier if this is a brand new order being filled out
  const formElement = document.getElementById('repair-client');
  if (formElement && !orderId) {
      // If we're in the form but don't have an ID yet, check if one was already assigned
      // to the form session to avoid duplicates on every photo take/upload.
      const existingIdField = document.querySelector('[data-active-repair-id]');
      if (existingIdField) {
          orderId = existingIdField.getAttribute('data-active-repair-id');
      }
  }

  const existing = orderId ? getRepairOrders().find(item => item.id === orderId) : null;
  const finalId = orderId || existing?.id || `r${Date.now()}`;

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

  const photos = REPAIR_PHOTO_LABELS.map((_, index) => {
    const preview = document.querySelector(`[data-repair-photo-index="${index}"]`);
    return preview?.getAttribute('src') || existing?.photos?.[index] || '';
  });

  return {
    id: finalId,
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
    summary: document.getElementById('repair-summary')?.value || '',
    materials: document.getElementById('repair-materials')?.value || '',
    partsItems: partItems,
    partsSummary: buildRepairPartsSummary(partItems),
    labourHours: document.getElementById('repair-labour')?.value || '',
    notes: document.getElementById('repair-notes')?.value || '',
    photos
  };
}

function saveRepairWorkOrder(orderId = '', shareAfterSave = false) {
  const order = collectRepairOrderFromForm(orderId);
  if (!order) return;

  order.status = document.getElementById('repair-status')?.value || order.status || 'open';
  if (order.status !== 'completed') {
    showToast('Please set status to Completed before saving');
    return;
  }

  const orders = getRepairOrders();
  const index = orders.findIndex(item => item.id === order.id);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }

  saveRepairOrders(orders);
  showToast('Completed work order saved');

  if (shareAfterSave) {
    shareRepairPDF(order.id);
    return;
  }

  router.renderWorkOrders();
}

function getImageDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function shareRepairPDF(orderId) {
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

  let logoData = null;
  try {
    logoData = await getImageDataUrl('oasis-logo.png');
  } catch (e) {
    console.warn('Logo load failed', e);
  }

  let y = 0;

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
    doc.text('REPAIR WORK ORDER', 195, 14, { align: 'right' });
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

  y = renderHeader();

  // Info Grid

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
  addField('Address', order.address, col1, gridY);
  addField('Job Type', order.jobType, col2, gridY);
  gridY += 12;
  addField('Assigned Tech', order.assignedTo, col1, gridY);
  addField('Status', order.status, col2, gridY);
  gridY += 12;
  addField('Time In / Out', `${order.timeIn || '—'} / ${order.timeOut || '—'}`, col1, gridY);
  addField('Labour Hours', order.labourHours || '—', col2, gridY);

  y += 50;

  // Work Summary
  doc.setFillColor(...navy);
  doc.rect(10, y, 190, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('WORK SUMMARY', 15, y + 5);
  y += 10;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const summaryLines = doc.splitTextToSize(order.summary || 'No summary provided.', 180);
  doc.text(summaryLines, 15, y);
  y += (summaryLines.length * 5) + 5;

  // Parts Table
  if (order.partsItems && order.partsItems.length > 0) {
    doc.setFillColor(...navy);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('PARTS & EQUIPMENT INSTALLED', 15, y + 5);
    doc.text('QTY', 170, y + 5);
    y += 7;

    order.partsItems.forEach((item, i) => {
      doc.setDrawColor(235, 235, 235);
      doc.line(10, y + 6, 200, y + 6);
      doc.setTextColor(...navy);
      doc.text(`${item.category}: ${item.product}` || 'Unknown Part', 15, y + 4.5);
      doc.text(String(item.qty || 1), 170, y + 4.5);
      y += 6;
    });
    y += 5;
  }

  // Office Notes
  if (order.notes) {
    doc.setFillColor(...navy);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('INTERNAL OFFICE NOTES', 15, y + 5);
    y += 10;
    doc.setTextColor(60, 60, 60);
    const notesLines = doc.splitTextToSize(order.notes, 180);
    doc.text(notesLines, 15, y);
    y += (notesLines.length * 5) + 5;
  }

  // Photos (Compact)
  const photos = normalizeRepairPhotos(order.photos || []);
  if (photos.some(p => p)) {
    doc.setFillColor(...navy);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('REPAIR PHOTOS', 15, y + 5);
    y += 10;

    const pW = 42;
    const pH = 32;
    let pX = 15;
    photos.forEach((p, i) => {
      if (p && i < 4) { // Max 4 photos to fit on one page
        try {
          doc.addImage(p, 'JPEG', pX, y, pW, pH);
          doc.setFontSize(6);
          doc.setTextColor(150, 150, 150);
          doc.text(REPAIR_PHOTO_LABELS[i], pX, y + pH + 4);
        } catch(e) {}
        pX += 48;
      }
    });
  }

  renderFooter();
  sharePDF(doc, filename);
}

function toggleAccordion(header) {
  const body = header.nextElementSibling;
  const chev = header.querySelector('.wo-chev');
  if (!body) return;

  const isCollapsed = body.classList.contains('collapsed');
  if (isCollapsed) {
    body.classList.remove('collapsed');
    if (chev) chev.textContent = '▼';
  } else {
    body.classList.add('collapsed');
    if (chev) chev.textContent = '▶';
  }
}

function deleteRepairOrder(orderId) {
  if (!auth.isAdmin()) {
    showToast('Only admins can delete work orders');
    return;
  }
  if (!confirm('Delete this repair work order?')) return;
  saveRepairOrders(getRepairOrders().filter(order => order.id !== orderId));
  showToast('Repair work order deleted');
  router.renderWorkOrders();
}

function deleteWorkOrder(orderId) {
  if (!auth.isAdmin()) {
    showToast('Only admins can delete chem sheets');
    return;
  }
  if (!confirm('Delete this chem sheet?')) return;
  const orders = db.get('workorders', []).filter(o => o.id !== orderId);
  db.set('workorders', orders);
  showToast('Chem sheet deleted');
  router.renderWorkOrders();
}

const ESTIMATE_STATUSES = ['Draft', 'Sent', 'Approved', 'Declined'];

function getEstimateSheets() {
  return db.get('estimates', []);
}

function saveEstimateSheets(estimates = []) {
  db.set('estimates', estimates);
}

function getEstimateSheet(id = '') {
  return getEstimateSheets().find(item => item.id === id) || null;
}

function parseEstimateNumber(value = 0) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = String(value ?? '').replace(/[^0-9.-]+/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatEstimateMoney(value = 0) {
  return parseEstimateNumber(value).toFixed(2);
}

function getEstimateDefaultDate() {
  return new Date().toISOString().split('T')[0];
}

function getEstimateDefaultValidUntil(dateValue = getEstimateDefaultDate()) {
  const sourceDate = new Date(dateValue || getEstimateDefaultDate());
  if (Number.isNaN(sourceDate.getTime())) return '';
  sourceDate.setDate(sourceDate.getDate() + 30);
  return sourceDate.toISOString().split('T')[0];
}

function nextEstimateNumber(currentId = '') {
  const highest = getEstimateSheets()
    .filter(item => item.id !== currentId)
    .reduce((max, item) => {
      const match = String(item.estimateNumber || '').match(/(\d+)/);
      const value = match ? parseInt(match[1], 10) : 0;
      return Number.isFinite(value) && value > max ? value : max;
    }, 0);

  return `EST-${String(highest + 1).padStart(4, '0')}`;
}

function getEstimateStatusBadgeClass(status = 'Draft') {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'approved') return 'completed';
  if (normalized === 'sent') return 'in-progress';
  return 'pending';
}

function normalizeEstimateItems(items = []) {
  const source = Array.isArray(items) && items.length ? items : [{}];
  return source.map(item => ({
    category: item.category || '',
    partNumber: item.partNumber || '',
    equipment: item.equipment || item.product || '',
    qty: String(item.qty || '1'),
    unitPrice: item.unitPrice ?? item.price ?? '',
    subtotal: item.subtotal || '',
    note: item.note || ''
  }));
}

function calculateEstimateItemSubtotal(item = {}) {
  const qty = Math.max(parseEstimateNumber(item.qty), 0);
  const unitPrice = Math.max(parseEstimateNumber(item.unitPrice), 0);
  return qty * unitPrice;
}

function calculateEstimateSubtotal(items = []) {
  return normalizeEstimateItems(items)
    .reduce((sum, item) => sum + calculateEstimateItemSubtotal(item), 0);
}

function renderEstimateList() {
  const clients = db.get('clients', []);
  const estimates = [...getEstimateSheets()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (!estimates.length) {
    return `
      <div class="empty-state" style="margin:0;">
        <div class="empty-icon">🧾</div>
        <div class="empty-title">No estimate sheets yet</div>
        <div class="empty-subtitle">Use the Estimate Sheet button above to create a branded client quote with clean totals.</div>
      </div>
    `;
  }

  return estimates.map(estimate => {
    const client = clients.find(item => item.id === estimate.clientId);
    const clientName = client?.name || estimate.clientName || 'Client';
    const total = formatEstimateMoney(estimate.total || estimate.subtotal || 0);

    return `
      <div class="job-card">
        <div class="job-card-header">
          <div>
            <div class="job-card-title">${escapeHtml(clientName)}</div>
            <div class="job-card-customer">${escapeHtml(estimate.project || 'Client Estimate')}</div>
            <div class="job-meta">
              <div class="job-meta-item">🧾 ${escapeHtml(estimate.estimateNumber || 'Draft')}</div>
              <div class="job-meta-item">📅 ${escapeHtml(estimate.date || '')}</div>
              <div class="job-meta-item">💲 $${escapeHtml(total)}</div>
            </div>
          </div>
          <div class="badge badge-${getEstimateStatusBadgeClass(estimate.status)}">${escapeHtml(estimate.status || 'Draft')}</div>
        </div>
        ${estimate.scope ? `<div class="detail-row"><div class="detail-label">Scope</div><div class="detail-value">${escapeHtml(estimate.scope)}</div></div>` : ''}
        <div class="job-card-footer">
          <button class="btn btn-secondary btn-sm" onclick="router.viewEstimate('${escapeHtml(estimate.id)}')">Open</button>
          <button class="btn btn-secondary btn-sm" onclick="saveEstimatePDF('${escapeHtml(estimate.id)}')">PDF</button>
          ${auth.canShare() ? `<button class="btn btn-primary btn-sm" onclick="shareEstimatePDF('${escapeHtml(estimate.id)}')">Share</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteEstimateSheet('${escapeHtml(estimate.id)}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderEstimateItemRow(estimateId, item, index) {
  const categories = getRepairCatalogCategories();
  const catalogItems = getRepairCatalogItems(item.category);
  const selectedItem = catalogItems.find(entry => entry.partNumber === item.partNumber)
    || catalogItems.find(entry => entry.product === item.equipment)
    || null;
  const qty = String(item.qty || '1');
  const unitPrice = formatEstimateMoney(selectedItem?.price ?? item.unitPrice ?? 0);
  const lineTotal = formatEstimateMoney(calculateEstimateItemSubtotal({ qty, unitPrice }));

  return `
    <div class="estimate-item-row" data-index="${index}" style="margin-bottom:12px;">
      <div class="wo-grid" style="border-radius:var(--radius-sm); margin-bottom:6px;">
        <div class="wo-fld">
          <div class="wo-fld-lbl">Category</div>
          <select class="estimate-item-category" onchange="refreshEstimateBuilder('${escapeHtml(estimateId || '')}')">
            <option value="">— Select category —</option>
            ${categories.map(category => `
              <option value="${escapeHtml(category)}" ${category === item.category ? 'selected' : ''}>${escapeHtml(category)}</option>
            `).join('')}
          </select>
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Equipment / Part</div>
          <select class="estimate-item-product" onchange="updateEstimateItemRowDetails(this)">
            <option value="">— Select equipment —</option>
            ${catalogItems.map(entry => `
              <option value="${escapeHtml(entry.partNumber || entry.product)}"
                data-product="${escapeHtml(entry.product)}"
                data-price="${escapeHtml(String(entry.price ?? ''))}"
                ${(entry.partNumber === item.partNumber || entry.product === item.equipment) ? 'selected' : ''}>
                ${escapeHtml(entry.product)}${entry.partNumber ? ` — ${escapeHtml(entry.partNumber)}` : ''}
              </option>
            `).join('')}
          </select>
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Qty</div>
          <input class="wo-fld-inp estimate-item-qty" type="number" min="1" step="1" value="${escapeHtml(qty)}" oninput="updateEstimateItemRowDetails(this)">
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Unit Price</div>
          <input class="wo-fld-inp estimate-item-price" type="number" min="0" step="0.01" value="${escapeHtml(unitPrice)}" oninput="updateEstimateItemRowDetails(this)">
        </div>
      </div>

      <div class="detail-row" style="margin-bottom:8px;">
        <div class="detail-label">Part / Line Total</div>
        <div class="detail-value estimate-item-details">${selectedItem ? `${escapeHtml(selectedItem.partNumber || '')} • $${formatEstimateMoney(selectedItem.price ?? unitPrice)}` : 'Choose a category and equipment item.'}<br><strong>Line Total: $${escapeHtml(lineTotal)}</strong></div>
      </div>

      <div class="form-row" style="margin-bottom:8px;">
        <label>Line Note</label>
        <input class="form-control estimate-item-note" type="text" value="${escapeHtml(item.note || '')}" placeholder="Optional note for this equipment line">
      </div>

      <div style="display:flex;justify-content:flex-end;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="removeEstimateItemRow('${escapeHtml(estimateId || '')}', ${index})">Remove Line</button>
      </div>
    </div>
  `;
}

function renderEstimateForm(estimateId = '', presetClientId = '', draftEstimate = null) {
  if (!auth.isAdmin()) {
    showToast('Only admins can create estimate sheets');
    router.renderWorkOrders();
    return;
  }

  const clients = db.get('clients', []);
  if (!clients.length) {
    showToast('Add a client first');
    router.renderClients();
    return;
  }

  const existing = !draftEstimate && estimateId ? getEstimateSheet(estimateId) : null;
  const estimate = draftEstimate || existing || {};
  const activeEstimateId = estimate.id || estimateId || `est_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const selectedClientId = estimate.clientId || presetClientId || clients[0]?.id || '';
  const selectedClient = clients.find(item => item.id === selectedClientId) || null;
  const createdDate = estimate.date || getEstimateDefaultDate();
  const validUntil = estimate.validUntil || getEstimateDefaultValidUntil(createdDate);
  const items = normalizeEstimateItems(estimate.items || []);
  const subtotal = formatEstimateMoney(estimate.subtotal || calculateEstimateSubtotal(items));
  const total = formatEstimateMoney(estimate.total || calculateEstimateSubtotal(items));
  const currentUser = auth.getCurrentUser();
  const content = document.getElementById('main-content');

  content.innerHTML = `
    <div class="wo-form">
      <div class="wo-bar">
        <button class="btn btn-secondary btn-sm" onclick="router.renderWorkOrders()">← Back</button>
        <div id="estimate-form-title" class="wo-bar-title">${escapeHtml(estimate.project || selectedClient?.name || 'Estimate Sheet')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="saveEstimateSheet('${escapeHtml(activeEstimateId)}', true)">Save & Share</button>
          <button class="btn btn-primary btn-sm" onclick="saveEstimateSheet('${escapeHtml(activeEstimateId)}')">Save</button>
        </div>
      </div>

      <div class="card" style="margin:12px 16px 0;">
        <div class="card-body">
          <div class="card-title">Branded Client Estimate Sheet</div>
          <div class="list-item-sub" style="margin-top:6px;">Build a clean OASIS estimate using the client list and equipment catalogue. Tax and discount sections have been removed.</div>
        </div>
      </div>

      <div class="wo-sec">
        <div class="wo-sec-hd">Estimate Details</div>
        <div class="wo-sec-bd">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Estimate #</label>
              <input id="est-number" class="form-control" value="${escapeHtml(estimate.estimateNumber || nextEstimateNumber(estimateId))}">
            </div>
            <div class="form-group">
              <label class="form-label">Date *</label>
              <input id="est-date" class="form-control" type="date" value="${escapeHtml(createdDate)}">
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Valid Until</label>
              <input id="est-valid-until" class="form-control" type="date" value="${escapeHtml(validUntil)}">
            </div>
            <div class="form-group">
              <label class="form-label">Status</label>
              <select id="est-status" class="form-control">
                ${ESTIMATE_STATUSES.map(status => `<option value="${escapeHtml(status)}" ${status === (estimate.status || 'Draft') ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Client *</label>
            <select id="est-client" class="form-control" onchange="onEstimateClientChange()">
              ${[...clients].sort((a, b) => a.name.localeCompare(b.name)).map(client => `<option value="${escapeHtml(client.id)}" ${client.id === selectedClientId ? 'selected' : ''}>${escapeHtml(client.name)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Address</label>
            <input id="est-address" class="form-control" value="${escapeHtml(estimate.address || selectedClient?.address || '')}">
          </div>

          <div class="form-group">
            <label class="form-label">Project / Estimate Title</label>
            <input id="est-project" class="form-control" value="${escapeHtml(estimate.project || 'Pool Equipment Estimate')}" placeholder="Pump replacement, heater install, automation upgrade...">
          </div>

          <div class="form-group">
            <label class="form-label">Scope Summary</label>
            <textarea id="est-scope" class="form-control" rows="3" placeholder="Briefly describe the work or equipment being quoted">${escapeHtml(estimate.scope || '')}</textarea>
          </div>
        </div>
      </div>

      <div class="wo-sec">
        <div class="wo-sec-hd">Equipment & Pricing</div>
        <div class="wo-sec-bd">
          <div class="wo-hint">Select equipment from the existing catalogue, set your quantities, and the totals will update automatically.</div>
          <div id="estimate-items-list">${items.map((item, index) => renderEstimateItemRow(activeEstimateId, item, index)).join('')}</div>
          <button type="button" class="btn btn-secondary" style="width:100%;justify-content:center;" onclick="addEstimateItemRow('${escapeHtml(activeEstimateId)}')">+ Add Equipment Line</button>

          <div class="form-row" style="margin-top:12px;">
            <div class="form-group">
              <label class="form-label">Subtotal</label>
              <input id="est-subtotal" class="form-control" value="${escapeHtml(subtotal)}" readonly style="background:var(--gray-50);">
            </div>
            <div class="form-group">
              <label class="form-label">Grand Total</label>
              <input id="est-total" class="form-control" value="${escapeHtml(total)}" readonly style="background:var(--gray-50);font-weight:700;color:var(--navy);">
            </div>
          </div>
        </div>
      </div>

      <div class="wo-sec">
        <div class="wo-sec-hd">Client Notes & Terms</div>
        <div class="wo-sec-bd">
          <div class="form-group">
            <label class="form-label">Prepared By</label>
            <input id="est-prepared-by" class="form-control" value="${escapeHtml(estimate.preparedBy || currentUser?.name || 'OASIS')}">
          </div>
          <div class="form-group">
            <label class="form-label">Terms</label>
            <textarea id="est-terms" class="form-control" rows="3">${escapeHtml(estimate.terms || 'Estimate valid for 30 days. Pricing is based on the current scope and may change if site conditions or selected equipment change.')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea id="est-notes" class="form-control" rows="3" placeholder="Optional client-facing notes">${escapeHtml(estimate.notes || '')}</textarea>
          </div>
        </div>
      </div>

      <div class="card" style="margin:12px;">
        <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="saveEstimateSheet('${escapeHtml(activeEstimateId)}', true)">Save & Share</button>
          <button class="btn btn-primary" onclick="saveEstimateSheet('${escapeHtml(activeEstimateId)}')">Save Estimate</button>
        </div>
      </div>
    </div>
  `;

  updateEstimateTotals();
}

function onEstimateClientChange() {
  const clientId = document.getElementById('est-client')?.value || '';
  const client = db.get('clients', []).find(item => item.id === clientId);
  const address = document.getElementById('est-address');
  const title = document.getElementById('estimate-form-title');

  if (address && client) {
    address.value = client.address || '';
  }

  if (title && client && !document.getElementById('est-project')?.value.trim()) {
    title.textContent = client.name || 'Estimate Sheet';
  }
}

function updateEstimateItemRowDetails(source) {
  const row = source?.closest('.estimate-item-row');
  if (!row) return;

  const productSelect = row.querySelector('.estimate-item-product');
  const qtyInput = row.querySelector('.estimate-item-qty');
  const priceInput = row.querySelector('.estimate-item-price');
  const detailsDiv = row.querySelector('.estimate-item-details');
  const selectedOption = productSelect?.selectedOptions?.[0];

  if (productSelect && source === productSelect && priceInput && selectedOption?.dataset?.price) {
    priceInput.value = formatEstimateMoney(selectedOption.dataset.price);
  }

  const qty = Math.max(parseEstimateNumber(qtyInput?.value || 0), 0);
  const unitPrice = Math.max(parseEstimateNumber(priceInput?.value || 0), 0);
  const lineTotal = qty * unitPrice;
  const partNumber = selectedOption?.value || '';

  if (detailsDiv) {
    detailsDiv.innerHTML = `${partNumber ? `${escapeHtml(partNumber)} • ` : ''}$${formatEstimateMoney(unitPrice)}<br><strong>Line Total: $${formatEstimateMoney(lineTotal)}</strong>`;
  }

  updateEstimateTotals();
}

function updateEstimateTotals() {
  const total = Array.from(document.querySelectorAll('.estimate-item-row')).reduce((sum, row) => {
    const qty = parseEstimateNumber(row.querySelector('.estimate-item-qty')?.value || 0);
    const unitPrice = parseEstimateNumber(row.querySelector('.estimate-item-price')?.value || 0);
    return sum + (qty * unitPrice);
  }, 0);

  const subtotalField = document.getElementById('est-subtotal');
  const totalField = document.getElementById('est-total');
  if (subtotalField) subtotalField.value = formatEstimateMoney(total);
  if (totalField) totalField.value = formatEstimateMoney(total);
  return total;
}

function collectEstimateFromForm(estimateId = '') {
  const existing = estimateId ? getEstimateSheet(estimateId) : null;
  const clients = db.get('clients', []);
  const clientId = document.getElementById('est-client')?.value || '';
  const client = clients.find(item => item.id === clientId) || null;
  const subtotal = updateEstimateTotals();

  const items = Array.from(document.querySelectorAll('.estimate-item-row')).map(row => {
    const productSelect = row.querySelector('.estimate-item-product');
    const selectedOption = productSelect?.selectedOptions?.[0];
    const qty = row.querySelector('.estimate-item-qty')?.value || '1';
    const unitPrice = row.querySelector('.estimate-item-price')?.value || '';
    return {
      category: row.querySelector('.estimate-item-category')?.value || '',
      partNumber: productSelect?.value || '',
      equipment: selectedOption?.dataset?.product || '',
      qty,
      unitPrice,
      subtotal: formatEstimateMoney(parseEstimateNumber(qty) * parseEstimateNumber(unitPrice)),
      note: row.querySelector('.estimate-item-note')?.value?.trim() || ''
    };
  }).filter(item => item.category || item.partNumber || item.equipment || item.note || parseEstimateNumber(item.qty) || parseEstimateNumber(item.unitPrice));

  return {
    id: existing?.id || estimateId || `est_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    estimateNumber: document.getElementById('est-number')?.value.trim() || nextEstimateNumber(estimateId),
    clientId,
    clientName: client?.name || existing?.clientName || '',
    address: document.getElementById('est-address')?.value.trim() || client?.address || '',
    date: document.getElementById('est-date')?.value || '',
    validUntil: document.getElementById('est-valid-until')?.value || '',
    status: document.getElementById('est-status')?.value || 'Draft',
    project: document.getElementById('est-project')?.value.trim() || '',
    scope: document.getElementById('est-scope')?.value.trim() || '',
    preparedBy: document.getElementById('est-prepared-by')?.value.trim() || auth.getCurrentUser()?.name || 'OASIS',
    terms: document.getElementById('est-terms')?.value.trim() || '',
    notes: document.getElementById('est-notes')?.value.trim() || '',
    items,
    subtotal: formatEstimateMoney(subtotal),
    total: formatEstimateMoney(subtotal),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function refreshEstimateBuilder(estimateId = '') {
  const draft = collectEstimateFromForm(estimateId);
  renderEstimateForm(draft.id || estimateId, '', draft);
}

function addEstimateItemRow(estimateId = '') {
  const draft = collectEstimateFromForm(estimateId) || { id: estimateId || '', items: [] };
  draft.items = normalizeEstimateItems(draft.items || []);
  draft.items.push({ category: '', partNumber: '', equipment: '', qty: '1', unitPrice: '', note: '' });
  renderEstimateForm(draft.id || estimateId, '', draft);
}

function removeEstimateItemRow(estimateId = '', index = 0) {
  const draft = collectEstimateFromForm(estimateId) || { id: estimateId || '', items: [] };
  draft.items = normalizeEstimateItems(draft.items || []).filter((_, itemIndex) => itemIndex !== index);
  if (!draft.items.length) {
    draft.items = [{}];
  }
  renderEstimateForm(draft.id || estimateId, '', draft);
}

async function saveEstimateSheet(estimateId = '', shareAfterSave = false) {
  if (!auth.isAdmin()) {
    showToast('Only admins can create estimate sheets');
    return;
  }

  const estimate = collectEstimateFromForm(estimateId);
  if (!estimate.clientId) {
    alert('Please select a client.');
    return;
  }
  if (!estimate.date) {
    alert('Please enter an estimate date.');
    return;
  }

  const estimates = getEstimateSheets();
  const existingIndex = estimates.findIndex(item => item.id === estimate.id);
  if (existingIndex >= 0) {
    estimates[existingIndex] = estimate;
  } else {
    estimates.unshift(estimate);
  }
  saveEstimateSheets(estimates);

  showToast(existingIndex >= 0 ? 'Estimate updated' : 'Estimate saved');

  if (shareAfterSave) {
    await saveEstimatePDF(estimate.id, 'share');
  }

  router.renderWorkOrders();
}

function deleteEstimateSheet(estimateId) {
  if (!auth.isAdmin()) {
    showToast('Only admins can delete estimates');
    return;
  }
  if (!confirm('Delete this estimate sheet?')) return;
  saveEstimateSheets(getEstimateSheets().filter(item => item.id !== estimateId));
  showToast('Estimate deleted');
  router.renderWorkOrders();
}

async function saveEstimatePDF(estimateId, mode = 'save') {
  const estimate = getEstimateSheet(estimateId);
  if (!estimate) {
    showToast('Save this estimate first');
    return;
  }
  if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
    showToast('PDF library not loaded');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const subtotal = parseEstimateNumber(estimate.subtotal || estimate.total || 0);
  const total = parseEstimateNumber(estimate.total || subtotal);
  const items = normalizeEstimateItems(estimate.items || []);
  const clientName = estimate.clientName || 'Client';
  let y = applyOasisPdfBranding(doc, 'Client Estimate', 'Luxury Pool & Watershape Service');

  const ensureSpace = (needed = 16) => {
    if (y + needed > 265) {
      applyOasisPdfFooter(doc);
      doc.addPage();
      y = applyOasisPdfBranding(doc, 'Client Estimate', 'Luxury Pool & Watershape Service');
    }
  };

  doc.setFillColor(248, 245, 241);
  doc.roundedRect(15, y - 4, 180, 26, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('CLIENT', 18, y + 2);
  doc.text('ESTIMATE #', 110, y + 2);
  doc.text('ADDRESS', 18, y + 14);
  doc.text('VALID UNTIL', 110, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(55, 55, 55);
  doc.text(String(clientName || '—'), 18, y + 7);
  doc.text(String(estimate.estimateNumber || '—'), 110, y + 7);
  doc.text(String(estimate.address || '—'), 18, y + 19);
  doc.text(String(estimate.validUntil || '—'), 110, y + 19);
  y += 32;

  ensureSpace(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(13, 43, 69);
  doc.text(estimate.project || 'Pool Equipment Estimate', 15, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(55, 55, 55);
  const scopeLines = doc.splitTextToSize(estimate.scope || 'Supply and install the items listed below.', 180);
  doc.text(scopeLines, 15, y);
  y += (scopeLines.length * 4.5) + 5;

  const tableRows = items
    .filter(item => item.category || item.partNumber || item.equipment || item.note)
    .map(item => ([
      item.category || '—',
      item.equipment || item.partNumber || 'Equipment line',
      String(item.qty || '1'),
      `$${formatEstimateMoney(item.unitPrice || 0)}`,
      `$${formatEstimateMoney(item.subtotal || calculateEstimateItemSubtotal(item))}`
    ]));

  if (doc.autoTable) {
    doc.autoTable({
      startY: y,
      head: [['Category', 'Equipment', 'Qty', 'Unit Price', 'Line Total']],
      body: tableRows.length ? tableRows : [['—', 'No equipment lines entered', '', '', '']],
      theme: 'grid',
      margin: { left: 15, right: 15 },
      headStyles: { fillColor: [13, 43, 69], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: [248, 245, 241] },
      styles: { fontSize: 8, cellPadding: 2.5, textColor: [55, 55, 55], lineColor: [228, 228, 228], lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 78 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right' }
      }
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  ensureSpace(28);
  doc.setFillColor(248, 245, 241);
  doc.roundedRect(120, y, 75, 18, 3, 3, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(55, 55, 55);
  doc.text('Subtotal', 125, y + 7);
  doc.text(`$${formatEstimateMoney(subtotal)}`, 190, y + 7, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(13, 43, 69);
  doc.text('Grand Total', 125, y + 14);
  doc.text(`$${formatEstimateMoney(total)}`, 190, y + 14, { align: 'right' });
  y += 26;

  if (estimate.notes) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(13, 43, 69);
    doc.text('Notes', 15, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(55, 55, 55);
    const noteLines = doc.splitTextToSize(estimate.notes, 180);
    doc.text(noteLines, 15, y);
    y += (noteLines.length * 4.5) + 4;
  }

  ensureSpace(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(13, 43, 69);
  doc.text('Terms', 15, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(55, 55, 55);
  const termLines = doc.splitTextToSize(estimate.terms || 'Estimate valid for 30 days.', 180);
  doc.text(termLines, 15, y);

  applyOasisPdfFooter(doc);

  const safeClient = String(clientName || 'Client').replace(/[^a-z0-9]+/gi, '_');
  const filename = `OASIS_Estimate_${safeClient}_${estimate.date || getEstimateDefaultDate()}.pdf`;

  if (mode === 'share') {
    await sharePDF(doc, filename);
    return;
  }

  doc.save(filename);
  showToast('Estimate PDF downloaded');
}

function shareEstimatePDF(estimateId) {
  return saveEstimatePDF(estimateId, 'share');
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
const REPAIR_PHOTO_LABELS = ['Before', 'After', 'Equipment', 'Part', 'Repair Area', 'Photo 5', 'Photo 6'];

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
        <button type="button" class="btn btn-secondary btn-sm" onclick="takeNativePhoto('chem', '${orderId}', ${index}, 'CAMERA')">Camera</button>
        <label class="btn btn-secondary btn-sm" for="photo-gallery-${index}">Gallery</label>
      </div>
      <input id="photo-camera-${index}" name="photo-camera-${index}" class="photo-file-inp" type="file" accept="image/*" capture="environment" onchange="handleChemPhotoUpload('${orderId}', ${index}, event)">
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
      <div class="wo-sec-hd wo-photo-hd" onclick="toggleAccordion(this)">
        <span>Service Photos</span>
        <span class="wo-chev">▼</span>
      </div>
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
async function takeNativePhoto(type, orderId, slotIndex, preferredSource = 'CAMERA') {
  try {
    if (typeof Capacitor === 'undefined' || !Capacitor.Plugins.Camera) {
      const fallbackInputId = type === 'repair'
        ? (preferredSource === 'PHOTOS' ? `repair-photo-gallery-${slotIndex}` : `repair-photo-camera-${slotIndex}`)
        : (preferredSource === 'PHOTOS' ? `photo-gallery-${slotIndex}` : `photo-camera-${slotIndex}`);
      const fallbackInput = document.getElementById(fallbackInputId);
      if (fallbackInput) {
        fallbackInput.click();
        return;
      }

      showToast(preferredSource === 'CAMERA' ? 'Camera not available' : 'Photo library not available');
      return;
    }

    const image = await Capacitor.Plugins.Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: 'dataUrl',
      source: preferredSource
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
        slot.outerHTML = renderChemPhotoSlot(order.id, CHEM_PHOTO_LABELS[slotIndex], image.dataUrl, slotIndex);
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
      const idx = orders.findIndex(o => o.id === order.id);
      if (idx >= 0) {
        orders[idx] = order;
      } else {
        orders.unshift(order);
      }
      saveRepairOrders(orders);

      const slot = document.getElementById(`repair-photo-slot-${slotIndex}`);

      // Update DOM with new ID if it was previously empty
      if (!orderId) {
          const container = document.querySelector('[data-active-repair-id]');
          if (container) container.setAttribute('data-active-repair-id', order.id);
      }

      if (slot) {
        const label = REPAIR_PHOTO_LABELS[slotIndex];
        slot.outerHTML = renderRepairPhotoSlot(order.id, label, image.dataUrl, slotIndex);
        showToast('Repair photo added');
      } else {
        renderRepairOrderForm(order.id, '', order);
        showToast('Repair photo added');
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
      router.navigate('workorders');
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
    router.navigate('workorders');
  }

  showToast('Photo removed');
}

function promptShareChoice(itemLabel = 'report') {
  if (!auth.canShare()) return 'download';

  const choice = window.prompt(
    `Send this ${itemLabel} by:\n1. WhatsApp\n2. Email\n3. Download only\n\nType 1, 2, or 3.`,
    '1'
  );

  if (choice === null) return 'cancel';

  const normalized = String(choice).trim().toLowerCase();
  if (['1', 'whatsapp', 'wa'].includes(normalized)) return 'whatsapp';
  if (['2', 'email', 'mail', 'e-mail'].includes(normalized)) return 'email';
  if (['3', 'download', 'save'].includes(normalized)) return 'download';

  return 'whatsapp';
}

function downloadBase64File(base64Data, filename, contentType = 'application/octet-stream') {
  const link = document.createElement('a');
  link.href = `data:${contentType};base64,${base64Data}`;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function openWhatsAppShare(text = '') {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function openEmailShare(subject = 'OASIS Report', body = '') {
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function shareFile(base64Data, filename, contentType = 'application/octet-stream') {
  const isPdf = filename.toLowerCase().endsWith('.pdf');
  const shareTitle = filename.toLowerCase().endsWith('.xlsx') ? 'OASIS Bulk Export' : 'OASIS Report';
  const shareText = isPdf ? `OASIS PDF attached: ${filename}` : `OASIS file ready: ${filename}`;

  try {
    const plugins = (typeof Capacitor !== 'undefined' && Capacitor.Plugins) ? Capacitor.Plugins : {};
    const { Filesystem, Share } = plugins;

    if (Filesystem && Share) {
      const saveResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: 'CACHE'
      });

      await Share.share({
        title: shareTitle,
        text: shareText,
        files: [saveResult.uri],
        dialogTitle: isPdf
          ? 'Share the PDF with any app on this device'
          : 'Share the file with any app on this device'
      });

      showToast(isPdf ? 'PDF ready to share' : 'File ready to share');
      return;
    }
  } catch (error) {
    console.warn('Native sharing failed, trying web share:', error);
  }

  try {
    if (navigator.share && typeof File !== 'undefined' && typeof atob === 'function') {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }

      const file = new File([new Uint8Array(byteNumbers)], filename, { type: contentType });
      const shareData = { title: shareTitle, text: shareText, files: [file] };

      if (!navigator.canShare || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        showToast(isPdf ? 'PDF ready to share' : 'File ready to share');
        return;
      }
    }
  } catch (error) {
    console.warn('Web share failed, falling back to download:', error);
  }

  downloadBase64File(base64Data, filename, contentType);
  showToast(isPdf ? 'PDF downloaded to device' : 'File downloaded to device');
}

async function sharePDF(doc, filename) {
  const b64 = doc.output('datauristring').split(',')[1];
  await shareFile(b64, filename, 'application/pdf');
}

async function shareFileByEmail(base64Data, filename, contentType = 'application/octet-stream') {
  const subject = filename.toLowerCase().endsWith('.xlsx') ? 'OASIS Completed Orders Spreadsheet' : 'OASIS File';
  const body = `Please send the attached file:\n\n${filename}`;

  try {
    const plugins = (typeof Capacitor !== 'undefined' && Capacitor.Plugins) ? Capacitor.Plugins : {};
    const { Filesystem, Share } = plugins;

    if (Filesystem && Share) {
      const saveResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: 'CACHE'
      });

      await Share.share({
        title: subject,
        text: body,
        files: [saveResult.uri],
        dialogTitle: 'Choose Email to send the spreadsheet'
      });

      showToast('Choose Email to send the spreadsheet');
      return;
    }
  } catch (error) {
    console.warn('Native email share failed, using fallback:', error);
  }

  try {
    if (navigator.share && typeof File !== 'undefined' && typeof atob === 'function') {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }

      const file = new File([new Uint8Array(byteNumbers)], filename, { type: contentType });
      const shareData = { title: subject, text: body, files: [file] };

      if (!navigator.canShare || navigator.canShare(shareData)) {
        await navigator.share(shareData);
        showToast('Choose Email to send the spreadsheet');
        return;
      }
    }
  } catch (error) {
    console.warn('Web email share failed, downloading instead:', error);
  }

  downloadBase64File(base64Data, filename, contentType);
  openEmailShare(subject, `${body}\n\nThe spreadsheet has also been downloaded to your device if it needs attaching manually.`);
  showToast('Email draft opened with spreadsheet download ready');
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
  doc.setFont('helvetica', 'normal');
  doc.setCharSpace(1.8);
  doc.setFontSize(18);
  doc.text('OASIS', 45, 18);
  doc.setCharSpace(0);

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
  doc.setFont('helvetica', 'normal');
  doc.setCharSpace(1.5);
  doc.setFontSize(11);
  doc.text('OASIS', 40, y + 10);
  doc.setCharSpace(0);
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
          <input class="wo-fld-inp repair-part-qty" type="number" min="1" step="1" value="${escapeHtml(String(part.qty || '1'))}" oninput="updateRepairPartRowDetails(this)">
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Part Details</div>
          <div class="repair-part-details" style="font-size:12px; color:var(--gray-600); line-height:1.5; min-height:38px;">
            ${selectedItem ? `${escapeHtml(selectedItem.partNumber || '')}${selectedItem.price ? ` • $${Number(selectedItem.price).toFixed(2)}` : ''}` : 'Choose a category and equipment item.'}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="removeRepairPartRow('${orderId || ''}', ${index})">Remove</button>
        </div>
      </div>
    </div>
  `;
}

function updateRepairPartRowDetails(input) {
  const row = input.closest('.repair-part-row');
  const productSelect = row.querySelector('.repair-part-product');
  const detailsDiv = row.querySelector('.repair-part-details');
  const qty = parseInt(input.value) || 1;

  const selectedOption = productSelect.selectedOptions[0];
  if (selectedOption && selectedOption.value) {
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
    <div class="wo-sec">
      <div class="wo-sec-hd wo-photo-hd" onclick="toggleAccordion(this)">
        <span>Repair Photos</span>
        <span class="wo-chev">▼</span>
      </div>
      <div class="wo-sec-bd">
        <div class="photo-ba-row">${beforeAfter}</div>
        <div class="photo-extra-grid" style="margin-top:8px;">${extras}</div>
      </div>
    </div>
  `;
}

async function handleRepairPhotoUpload(orderId, slotIndex, event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  try {
    const order = collectRepairOrderFromForm(orderId);
    if (!order) {
      showToast('Repair work order not found');
      return;
    }

    showToast('Processing repair photo...');
    const dataUrl = await resizeImageForStorage(file);
    if (!dataUrl) throw new Error('Photo processing failed');

    const photos = normalizeRepairPhotos(order.photos);
    photos[slotIndex] = dataUrl;
    order.photos = photos;

    // Persist immediately
    const orders = getRepairOrders();
    const idx = orders.findIndex(o => o.id === order.id);
    if (idx >= 0) {
      orders[idx] = order;
    } else {
      orders.unshift(order);
    }
    saveRepairOrders(orders);

    const slot = document.getElementById(`repair-photo-slot-${slotIndex}`);

    // Update DOM with new ID if it was previously empty
    if (!orderId) {
        const container = document.querySelector('[data-active-repair-id]');
        if (container) container.setAttribute('data-active-repair-id', order.id);
    }

    if (slot) {
      const label = REPAIR_PHOTO_LABELS[slotIndex];
      slot.outerHTML = renderRepairPhotoSlot(order.id, label, dataUrl, slotIndex);
      showToast('Repair photo added');
    } else {
      renderRepairOrderForm(order.id, '', order);
      showToast('Repair photo added');
    }
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

  // Persist immediately
  const orders = getRepairOrders();
  const idx = orders.findIndex(o => o.id === order.id);
  if (idx >= 0) {
    orders[idx] = order;
    saveRepairOrders(orders);
  }

  const slot = document.getElementById(`repair-photo-slot-${slotIndex}`);

  // Ensure form is locked to this ID if it was a new order
  if (!orderId) {
      const container = document.querySelector('[data-active-repair-id]');
      if (container) container.setAttribute('data-active-repair-id', order.id);
  }

  if (slot) {
    const label = REPAIR_PHOTO_LABELS[slotIndex];
    slot.outerHTML = renderRepairPhotoSlot(order.id, label, '', slotIndex);
  } else {
    renderRepairOrderForm(order.id, '', order);
  }

  showToast('Repair photo removed');
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

// Route schedule import from XLSM file
function importRouteSchedule() {
  const content = document.getElementById('main-content');
  content.innerHTML = `
    <div class="wo-form">
      <div class="wo-bar">
        <button class="btn btn-secondary btn-sm" onclick="router.renderClients()">\u2190 Back</button>
        <div class="wo-bar-title">Import Route Sheet</div>
      </div>
      <div class="wo-sec">
        <div class="wo-sec-hd">Upload Route Sheet (.xlsm / .xlsx)</div>
        <div class="wo-sec-bd">
          <p style="color:#666; font-size:13px; margin-bottom:12px;">Select your route schedule Excel file. The importer will read each ROUTE sheet tab and assign service days to matching clients.</p>
          <p style="color:#666; font-size:13px; margin-bottom:12px;">Expected format: Each sheet named "ROUTE #" with Row 1 = tech name, Row 2 = day headers (MONDAY-SATURDAY), then alternating time/client rows.</p>
          <div class="form-group">
            <input type="file" id="route-file-input" accept=".xlsx,.xlsm,.xls" class="form-control" onchange="processRouteFile(this)">
          </div>
          <div id="route-import-status" style="margin-top:12px;"></div>
        </div>
      </div>
    </div>
  `;
}

function processRouteFile(input) {
  const file = input.files[0];
  if (!file) return;

  const statusEl = document.getElementById('route-import-status');
  statusEl.innerHTML = '<p style="color:#2196F3;">Reading file...</p>';

  // Map route sheet tech names to app auth names
  const TECH_NAME_MAP = {
    'king': 'Kingsley',
    'stephon': 'Elvin'
  };
  function normalizeTechName(name) {
    const lower = (name || '').trim().toLowerCase();
    return TECH_NAME_MAP[lower] || (name || '').trim();
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

      let routeEntries = [];

      // Detect format: flat table (Day, Route #, Route Name, Client Name, Address) vs multi-tab
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const firstRow = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })[0] || [];
      const headers = firstRow.map(h => String(h).toLowerCase().trim());
      const isFlat = headers.includes('day') && headers.includes('client name');

      if (isFlat) {
        // Flat format: each row is one visit (day + tech + client + address)
        const rows = XLSX.utils.sheet_to_json(firstSheet);
        const clientMap = {};

        rows.forEach(row => {
          const day = (row['Day'] || '').trim();
          const routeNum = String(row['Route #'] || '').trim();
          const techRaw = (row['Route Name'] || '').trim();
          const tech = normalizeTechName(techRaw);
          const clientName = (row['Client Name'] || '').trim();
          const address = (row['Address'] || '').trim();
          if (!clientName || !day) return;

          // Normalize day name
          const normalDay = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
          const key = (tech + '|' + clientName + '|' + address).toUpperCase();

          if (!clientMap[key]) {
            clientMap[key] = {
              tech: tech,
              route: 'Route ' + routeNum,
              name: clientName,
              address: address,
              days: []
            };
          }
          if (!clientMap[key].days.includes(normalDay)) {
            clientMap[key].days.push(normalDay);
          }
        });

        // Sort days and build entries
        Object.values(clientMap).forEach(entry => {
          entry.days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
          routeEntries.push(entry);
        });
      } else {
        // Multi-tab format: each sheet is a route
        const techOverrides = {
          'ROUTE 1': 'Kadeem', 'ROUTE 2': 'Elvin', 'ROUTE 3': 'Jermaine',
          'ROUTE 4': 'Ace', 'ROUTE 5': 'Donald', 'ROUTE 6': 'Kingsley',
          'ROUTE 7': 'Ariel', 'ROUTE 8': 'Malik'
        };

        wb.SheetNames.filter(n => n.trim().toUpperCase().startsWith('ROUTE')).forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          const routeKey = sheetName.trim();
          const techName = techOverrides[routeKey] || normalizeTechName(routeKey.replace(/ROUTE\s*#?\d*\s*/i, ''));
          const days = (rows[1] || []).filter(d => typeof d === 'string' && d.trim());

          const clientMap = {};
          for (let row = 2; row < rows.length; row++) {
            const cells = rows[row] || [];
            const hasText = cells.some(c => typeof c === 'string' && c.trim().length > 0);
            if (!hasText) continue;
            cells.forEach((cell, colIdx) => {
              if (typeof cell === 'string' && cell.trim() && colIdx < days.length) {
                const lines = cell.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l);
                const firstName = lines[0].replace(/\s*-\s*$/, '').trim();
                const key = firstName.substring(0, 50).toUpperCase();
                if (!clientMap[key]) clientMap[key] = { name: firstName, address: lines.join(' '), days: [] };
                const day = days[colIdx];
                if (!clientMap[key].days.includes(day)) clientMap[key].days.push(day);
              }
            });
          }

          Object.values(clientMap).forEach(entry => {
            entry.days.sort((a, b) => DAY_ORDER.map(d=>d.toUpperCase()).indexOf(a.toUpperCase()) - DAY_ORDER.map(d=>d.toUpperCase()).indexOf(b.toUpperCase()));
            routeEntries.push({
              tech: techName,
              route: routeKey.replace('ROUTE ', 'Route ').trim(),
              name: entry.name,
              address: entry.address,
              days: entry.days.map(d => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase())
            });
          });
        });
      }

      // Clear old serviceDays from all clients first
      const clients = db.get('clients', []);
      clients.forEach(c => { c.serviceDays = []; c.route = ''; });

      let matched = 0, created = 0;

      routeEntries.forEach(entry => {
        // Match on name + address + tech to avoid collisions between same-name clients
        const eName = entry.name.toLowerCase().trim();
        const eAddr = entry.address.toLowerCase().trim();
        const eTech = entry.tech.toLowerCase().trim();
        let match = clients.find(c =>
          c.name && c.name.toLowerCase().trim() === eName &&
          c.address && c.address.toLowerCase().trim() === eAddr &&
          c.technician && c.technician.toLowerCase().trim() === eTech
        );

        if (match) {
          const existing = match.serviceDays || [];
          entry.days.forEach(d => { if (!existing.includes(d)) existing.push(d); });
          existing.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
          match.serviceDays = existing;
          match.route = entry.route;
          matched++;
        } else {
          clients.push({
            id: 'c_' + Math.random().toString(36).substr(2, 9),
            name: entry.name,
            address: entry.address,
            contact: '',
            technician: entry.tech,
            route: entry.route,
            serviceDays: entry.days
          });
          created++;
        }
      });

      db.set('clients', clients);

      // Count unique clients with schedule
      const scheduled = clients.filter(c => c.serviceDays && c.serviceDays.length > 0).length;

      statusEl.innerHTML = `
        <div style="background:#e8f5e9; padding:12px; border-radius:8px;">
          <p style="color:#2e7d32; font-weight:600; margin-bottom:8px;">Import Complete</p>
          <p style="color:#333; font-size:13px;">\ud83d\udcca ${routeEntries.length} unique route entries processed</p>
          <p style="color:#333; font-size:13px;">\u2705 ${matched} existing clients updated</p>
          <p style="color:#333; font-size:13px;">\u2795 ${created} new clients created</p>
          <p style="color:#333; font-size:13px;">\ud83d\udcc5 ${scheduled} clients now have scheduled service days</p>
          <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="router.setClientView('byRoute'); router.renderClients();">View By Route</button>
          <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="router.navigate('routes')">View Routes</button>
        </div>
      `;
    } catch (err) {
      statusEl.innerHTML = '<p style="color:#c62828;">Error reading file: ' + escapeHtml(err.message) + '</p>';
      console.error('Route import error:', err);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function exportCompletedToExcel() {
  const isCompleted = (status = '') => String(status || '').trim().toLowerCase() === 'completed';
  const sortByNewest = (items = []) => [...items].sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0));

  const completedChemSheets = sortByNewest(db.get('workorders', []).filter(wo => isCompleted(wo.status)));
  const completedRepairOrders = sortByNewest(getRepairOrders().filter(order => isCompleted(order.status)));

  if (completedChemSheets.length === 0 && completedRepairOrders.length === 0) {
    showToast('No completed chem sheets or repair orders to export');
    return;
  }

  showToast('Generating Excel report...');

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OASIS Service App';
    workbook.created = new Date();
    workbook.modified = new Date();

    const styleHeader = (sheet, columnCount) => {
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0D2B45' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columnCount }
      };
    };

    const formatBody = (sheet) => {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.alignment = { vertical: 'top', wrapText: true };
      });
    };

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

    const chemSheet = workbook.addWorksheet('Chem Sheets');
    const chemColumns = [
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

    chemKeys.forEach(ck => {
      chemColumns.push({ header: `Pool ${ck.label}`, key: `p_${ck.key}`, width: 15 });
    });

    chemColumns.push(
      { header: 'Spa Chlorine', key: 'sCl', width: 12 },
      { header: 'Spa pH', key: 'sph', width: 10 },
      { header: 'Spa Alk', key: 'salk', width: 10 }
    );

    chemKeys.forEach(ck => {
      chemColumns.push({ header: `Spa ${ck.label}`, key: `s_${ck.key}`, width: 15 });
    });

    chemColumns.push({ header: 'Service Notes', key: 'notes', width: 40 });
    chemSheet.columns = chemColumns;
    styleHeader(chemSheet, chemColumns.length);

    completedChemSheets.forEach(wo => {
      const rowData = {
        date: wo.date || '',
        client: wo.clientName || '',
        address: wo.address || '',
        tech: wo.technician || '',
        timeIn: wo.timeIn || wo.time || '',
        timeOut: wo.timeOut || '',
        pCl: wo.readings?.pool?.chlorine || '',
        pph: wo.readings?.pool?.ph || '',
        palk: wo.readings?.pool?.alkalinity || '',
        sCl: wo.readings?.spa?.chlorine || '',
        sph: wo.readings?.spa?.ph || '',
        salk: wo.readings?.spa?.alkalinity || '',
        notes: `${wo.workPerformed || ''} ${wo.followUpNotes || wo.notes || ''}`.trim()
      };

      chemKeys.forEach(ck => {
        rowData[`p_${ck.key}`] = wo.chemicalsAdded?.pool?.[ck.key] || '';
        rowData[`s_${ck.key}`] = wo.chemicalsAdded?.spa?.[ck.key] || '';
      });

      chemSheet.addRow(rowData);
    });

    if (chemSheet.rowCount === 1) {
      chemSheet.addRow({ client: 'No completed chem sheets' });
    }
    formatBody(chemSheet);

    const repairColumns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Address', key: 'address', width: 35 },
      { header: 'Technician', key: 'tech', width: 18 },
      { header: 'Job Type', key: 'jobType', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Time In', key: 'timeIn', width: 10 },
      { header: 'Time Out', key: 'timeOut', width: 10 },
      { header: 'Labour Hours', key: 'labourHours', width: 12 },
      { header: 'Materials', key: 'materials', width: 30 },
      { header: 'Parts Summary', key: 'partsSummary', width: 40 },
      { header: 'Work Summary', key: 'summary', width: 40 },
      { header: 'Notes', key: 'notes', width: 40 }
    ];

    const repairSheet = workbook.addWorksheet('Repair Orders');
    repairSheet.columns = repairColumns;
    styleHeader(repairSheet, repairColumns.length);

    completedRepairOrders.forEach(order => {
      repairSheet.addRow({
        date: order.date || '',
        client: order.clientName || '',
        address: order.address || '',
        tech: order.assignedTo || '',
        jobType: order.jobType || '',
        status: order.status || '',
        timeIn: order.timeIn || order.time || '',
        timeOut: order.timeOut || '',
        labourHours: order.labourHours || '',
        materials: order.materials || '',
        partsSummary: order.partsSummary || '',
        summary: order.summary || '',
        notes: order.notes || ''
      });
    });

    if (repairSheet.rowCount === 1) {
      repairSheet.addRow({ client: 'No completed repair orders' });
    }
    formatBody(repairSheet);

    const buffer = await workbook.xlsx.writeBuffer();

    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    const base64 = btoa(binary);
    const filename = `OASIS_Completed_Orders_${new Date().toISOString().split('T')[0]}.xlsx`;

    await shareFileByEmail(base64, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    showToast('Completed orders Excel ready to email');
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
  const route = document.getElementById('edit-client-route') ? document.getElementById('edit-client-route').value : '';
  const dayCheckboxes = document.querySelectorAll('#edit-client-days input[type=checkbox]');
  const serviceDays = Array.from(dayCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

  if (!name) {
    alert('Name is required');
    return;
  }

  const clients = db.get('clients', []);
  const index = clients.findIndex(c => c.id === clientId);
  if (index >= 0) {
    clients[index] = { ...clients[index], name, address, contact, technician: tech, route, serviceDays };
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
    { name: "Mystic Retreat", address: "John Greer Boulavard", tech: "Kadeem" },
    { name: "Brian Lonergan", address: "18 Paradise Close", tech: "Elvin" },
    { name: "South Bay Estates", address: "Bel Air Dr", tech: "Elvin" },
    { name: "Andy Marcher", address: "234 Drake Quay", tech: "Jermaine" },
    { name: "Andreas Haug", address: "359 North West Point Rd", tech: "Jermaine" },
    { name: "Dolce Vita", address: "Govenors Harbour", tech: "Jermaine" },
    { name: "Amber Stewart", address: "Dolce Vita 4", tech: "Jermaine" },
    { name: "Pleasant View", address: "West Bay", tech: "Jermaine" },
    { name: "Jack Leeland", address: "120 Oleander Dr", tech: "Ace" },
    { name: "Greg Swart", address: "182 Prospect Point Rd", tech: "Ace" },
    { name: "Kahlill Strachan", address: "27 Jump Link", tech: "Ace" },
    { name: "Loreen Stewart", address: "29 Galaxy Way", tech: "Ace" },
    { name: "Francia Lloyd", address: "30 Soto Lane", tech: "Ace" },
    { name: "Tom Balon", address: "37 Teal Island", tech: "Ace" },
    { name: "Charles Ebanks", address: "Bonnieview Av", tech: "Donald" },
    { name: "One Canal Point Gym", address: "Canal Point", tech: "Kingsley" },
    { name: "Colin Robinson", address: "130 Halkieth Rd", tech: "Malik" },
    { name: "Moon Bay", address: "Shamrock Rd", tech: "Malik" },
    { name: "Cayman Coves", address: "South Church Street", tech: "Kadeem" },
    { name: "Venetia", address: "South Sound", tech: "Kadeem" },
    { name: "Stephen Leontsinis", address: "1340 South Sound", tech: "Elvin" },
    { name: "Tim Dailyey", address: "North Webster Dr", tech: "Elvin" },
    { name: "Nicholas Lynn", address: "Sandlewood Crescent", tech: "Elvin" },
    { name: "Tom Newton", address: "304 South Sound", tech: "Elvin" },
    { name: "Joyce Follows", address: "35 Jacaranda Ct", tech: "Elvin" },
    { name: "Declean Magennis", address: "62 Ithmar Circle", tech: "Elvin" },
    { name: "Riyaz Norrudin", address: "63 Langton Way", tech: "Elvin" },
    { name: "Mangrove", address: "Bcqs", tech: "Elvin" },
    { name: "Quentin Creegan", address: "Villa Aramone", tech: "Elvin" },
    { name: "Jodie O'Mahony", address: "12 El Nathan", tech: "Jermaine" },
    { name: "Charles Motsinger", address: "124 Hillard", tech: "Jermaine" },
    { name: "Steve Daker", address: "33 Spurgeon Cr", tech: "Jermaine" },
    { name: "Laura Redman", address: "45 Yates Drive", tech: "Jermaine" },
    { name: "David Collins", address: "512 Yacht Dr", tech: "Jermaine" },
    { name: "Albert Schimdberger", address: "55 Elnathan Rd", tech: "Jermaine" },
    { name: "Jordan Constable", address: "60 Philip Crescent", tech: "Jermaine" },
    { name: "Blair Ebanks", address: "71 Spurgeon Crescent", tech: "Jermaine" },
    { name: "Bertrand Bagley", address: "91 El Nathan Drive", tech: "Jermaine" },
    { name: "Laura Egglishaw", address: "94 Park Side Close", tech: "Jermaine" },
    { name: "Hugo Munoz", address: "171 Leeward Dr", tech: "Ace" },
    { name: "Mitchell Demeter", address: "19 Whirlaway Close", tech: "Ace" },
    { name: "Habte Skale", address: "32 Trevor Close", tech: "Ace" },
    { name: "Paul Reynolds", address: "424 Prospect Point Rd", tech: "Ace" },
    { name: "Thomas Ponessa", address: "450 Prospect Point Rd", tech: "Ace" },
    { name: "Jim Brannon", address: "87 Royal Palms Drive", tech: "Ace" },
    { name: "Coastal Escape", address: "Omega Bay", tech: "Ace" },
    { name: "Inity Ridge", address: "Prospect Point Rd", tech: "Ace" },
    { name: "Ocean Reach", address: "Old Crewe Rd", tech: "Ace" },
    { name: "Scott Somerville", address: "Rum Point Rd", tech: "Donald" },
    { name: "Alexander McGarry", address: "2628 Bodden Town Rd", tech: "Donald" },
    { name: "67 On The Bay", address: "Queens Highway", tech: "Donald" },
    { name: "Hesham Sida", address: "824 Seaview Rd", tech: "Donald" },
    { name: "Peter Watler", address: "952 Seaview Rd", tech: "Donald" },
    { name: "Paradise Sur Mar", address: "Sand Cay Rd", tech: "Donald" },
    { name: "Rip Kai", address: "Rum Point Drive", tech: "Donald" },
    { name: "Sunrays", address: "Sand Cay Rd", tech: "Donald" },
    { name: "Greg Melehov", address: "16 Galway Quay", tech: "Kingsley" },
    { name: "William Jackman", address: "221 Crystal Dr", tech: "Kingsley" },
    { name: "Regant Court", address: "Brittania", tech: "Kingsley" },
    { name: "Solara Main", address: "Crystal Harbour", tech: "Kingsley" },
    { name: "Steven Joyce", address: "199 Crystal Drive", tech: "Ariel" },
    { name: "Rick Gorter", address: "33 Shoreview Point", tech: "Ariel" },
    { name: "Marcia Milgate", address: "34 Newhaven", tech: "Ariel" },
    { name: "Chad Horwitz", address: "49 Calico Quay", tech: "Ariel" },
    { name: "Malcom Swift", address: "Miramar", tech: "Ariel" },
    { name: "Roland Stewart", address: "Kimpton Seafire", tech: "Ariel" },
    { name: "Strata #70", address: "Boggy Sands rd", tech: "Ariel" },
    { name: "Tracey Kline", address: "108 Roxborough dr", tech: "Malik" },
    { name: "Debbie Ebanks", address: "Fischers Reef", tech: "Malik" },
    { name: "John Corallo", address: "3A Seahven", tech: "Malik" },
    { name: "Encompass", address: "3B Seahven", tech: "Malik" },
    { name: "Joseph Hurlston", address: "42 Monumnet Rd", tech: "Malik" },
    { name: "George McKenzie", address: "534 Rum Point Dr", tech: "Malik" },
    { name: "Twin Palms", address: "Rum Point Dr", tech: "Malik" },
    { name: "Bernie Bako", address: "#4 Venetia", tech: "Kadeem" },
    { name: "Cindy Conway", address: "#7 The Chimes", tech: "Kadeem" },
    { name: "Patricia Conroy", address: "58 Anne Bonney Crescent", tech: "Kadeem" },
    { name: "Park View Courts", address: "Spruce Lane", tech: "Kadeem" },
    { name: "The Bentley", address: "Crewe rd", tech: "Kadeem" },
    { name: "Jackie Murphy", address: "110 The lakes", tech: "Elvin" },
    { name: "Chris Turell", address: "127 Denham Thompson Way", tech: "Elvin" },
    { name: "Guy Locke", address: "1326 South Sound", tech: "Elvin" },
    { name: "Rena Streker", address: "1354 South Sound", tech: "Elvin" },
    { name: "Jennifer Bodden", address: "25 Ryan Road", tech: "Elvin" },
    { name: "Nicholas Gargaro", address: "538 South Sound Rd", tech: "Elvin" },
    { name: "Jessica Wright", address: "55 Edgmere Circle", tech: "Elvin" },
    { name: "Stewart Donald", address: "72 Conch Drive", tech: "Elvin" },
    { name: "Andre Ogle", address: "87 The Avenue", tech: "Elvin" },
    { name: "Jon Brosnihan", address: "#6 Shorewinds Trail", tech: "Jermaine" },
    { name: "Michael Bascina", address: "13 Victoria Dr", tech: "Jermaine" },
    { name: "Nigel Daily", address: "Snug Harbour", tech: "Jermaine" },
    { name: "Steven Manning", address: "61 Shoreline Dr", tech: "Jermaine" },
    { name: "Guy Cowan", address: "74 Shorecrest", tech: "Jermaine" },
    { name: "Kadi Pentney", address: "Kings Court", tech: "Jermaine" },
    { name: "Shoreway Townhomes", address: "Adonis Dr", tech: "Jermaine" },
    { name: "Randal Martin", address: "151 Shorecrest Circle", tech: "Jermaine" },
    { name: "Brandon Smith", address: "Victoria Villas", tech: "Jermaine" },
    { name: "David Guilmette", address: "183 Crystal Drive", tech: "Ace" },
    { name: "Stef Dimitrio", address: "266 Raleigh Quay", tech: "Ace" },
    { name: "Clive Harris", address: "516 Crighton Drive", tech: "Ace" },
    { name: "Chez Tschetter", address: "53 Marquise Quay", tech: "Ace" },
    { name: "Ross Fortune", address: "90 Prince Charles", tech: "Ace" },
    { name: "Simon Palmer", address: "Olivias Cove", tech: "Ace" },
    { name: "Caroline Moran", address: "197 Bimini Dr", tech: "Donald" },
    { name: "James Reeve", address: "215 Bimini Dr", tech: "Donald" },
    { name: "David Mullen", address: "23 Silver Thatch", tech: "Donald" },
    { name: "Sina Mirzale", address: "353 Bimini Dr", tech: "Donald" },
    { name: "Mike Kornegay", address: "40 Palm Island Circle", tech: "Donald" },
    { name: "Marlon Bispath", address: "519 Bimini Dr", tech: "Donald" },
    { name: "Margaret Fantasia", address: "526 Bimini Dr", tech: "Donald" },
    { name: "Kenny Rankin", address: "Grand Harbour", tech: "Donald" },
    { name: "James Mendes", address: "106 Olea", tech: "Ariel" },
    { name: "James O'Brien", address: "102 Olea", tech: "Ariel" },
    { name: "Lexi Pappadakis", address: "110 Olea", tech: "Ariel" },
    { name: "Manuela Lupu", address: "103 Olea", tech: "Ariel" },
    { name: "Mr Holland", address: "107 Olea", tech: "Ariel" },
    { name: "Nikki Harris", address: "213 olea", tech: "Ariel" },
    { name: "Scott Hughes", address: "111 Olea", tech: "Ariel" },
    { name: "Mr Kelly and Mrs Kahn", address: "112 Olea", tech: "Ariel" },
    { name: "Anu O'Driscoll", address: "23 Lalique Point", tech: "Malik" },
    { name: "Shelly Do Vale", address: "47 Marbel Drive", tech: "Malik" },
    { name: "Iman Shafiei", address: "53 Baquarat Quay", tech: "Malik" },
    { name: "Enrique Tasende", address: "65 Baccarat Quay", tech: "Malik" },
    { name: "David Wilson", address: "Boggy Sands", tech: "Malik" },
    { name: "Nina Irani", address: "Casa Oasis", tech: "Malik" },
    { name: "Sandy Lane Townhomes", address: "Boggy Sands Rd", tech: "Malik" },
    { name: "Valencia Heights", address: "Strata #536", tech: "Kadeem" },
    { name: "Jaime-Lee Eccles", address: "176 Conch Dr", tech: "Kadeem" },
    { name: "Mehdi Khosrow-Pour", address: "610 South Sound Rd", tech: "Kadeem" },
    { name: "Michelle Bryan", address: "65 Fairview Road", tech: "Kadeem" },
    { name: "Gareth thacker", address: "9 The Venetia", tech: "Kadeem" },
    { name: "Raoul Pal", address: "93 Marry read crescent", tech: "Kadeem" },
    { name: "Hilton Estates", address: "Fairbanks Rd", tech: "Kadeem" },
    { name: "Romell El Madhani", address: "117 Crystal Dr", tech: "Elvin" },
    { name: "Britni Strong", address: "150 Parkway Dr", tech: "Elvin" },
    { name: "Victoria Wheaton", address: "36 Whitehall Gardens", tech: "Elvin" },
    { name: "Prasanna Ketheeswaran", address: "46 Captian Currys Rd", tech: "Elvin" },
    { name: "Jaron Goldberg", address: "52 Parklands Close", tech: "Elvin" },
    { name: "Mitzi Callan", address: "Morganville Condos", tech: "Elvin" },
    { name: "Saphire", address: "Jec, Nwp Rd", tech: "Elvin" },
    { name: "The Sands", address: "Boggy Sand Rd", tech: "Elvin" },
    { name: "Turtle Breeze", address: "Conch Point Rd", tech: "Elvin" },
    { name: "Francois Du Toit", address: "Snug Harbour", tech: "Jermaine" },
    { name: "Paolo Pollini", address: "16 Stewart Ln", tech: "Jermaine" },
    { name: "Robert Morrison", address: "265 Jennifer Dr", tech: "Jermaine" },
    { name: "Johann Prinslo", address: "270 Jennifer Dr", tech: "Jermaine" },
    { name: "Andre Slabbert", address: "7 Victoria Dr", tech: "Jermaine" },
    { name: "Alicia McGill", address: "84 Andrew Drive", tech: "Jermaine" },
    { name: "Palm Heights Residence", address: "Seven Mile Beach", tech: "Jermaine" },
    { name: "Jean Mean", address: "211 Sea Spray Dr", tech: "Ace" },
    { name: "Paul Rowan", address: "265 Sea Spray Dr", tech: "Ace" },
    { name: "Charmaine Richter", address: "40 Natures Circle", tech: "Ace" },
    { name: "Rory Andrews", address: "44 Country Road", tech: "Ace" },
    { name: "Walker Romanica", address: "79 Riley Circle", tech: "Ace" },
    { name: "Craig Stewart", address: "88 Leeward Drive", tech: "Ace" },
    { name: "Grand Palmyra", address: "Seven Mile Beach", tech: "Ace" },
    { name: "Jay Easterbrook", address: "33 Cocoplum", tech: "Ace" },
    { name: "Harry Tee", address: "438 Water Cay Rd", tech: "Donald" },
    { name: "Sarah Dobbyn-Thomson", address: "441 Water Cay Rd", tech: "Donald" },
    { name: "Reg Williams", address: "Cliff House", tech: "Donald" },
    { name: "Gypsy", address: "1514 Rum Point Dr", tech: "Donald" },
    { name: "Kai Vista", address: "Rum Point Dr", tech: "Donald" },
    { name: "Ocean Vista", address: "Rum Point", tech: "Donald" },
    { name: "Stefan Marenzi", address: "Water Cay Rd", tech: "Donald" },
    { name: "Bella Rocca", address: "Queens Highway", tech: "Donald" },
    { name: "Sea 2 Inity", address: "Kiabo", tech: "Donald" },
    { name: "Guy Manning", address: "Diamonds Edge", tech: "Kingsley" },
    { name: "Kent Nickerson", address: "Salt Creek", tech: "Kingsley" },
    { name: "Grecia Iuculano", address: "133 Magellan Quay", tech: "Ariel" },
    { name: "Suzanne Correy", address: "394 Canal Point Rd", tech: "Ariel" },
    { name: "November Capitol", address: "One Canal Point", tech: "Ariel" },
    { name: "Safe Harbor", address: "West Bay", tech: "Ariel" },
    { name: "Bert Thacker", address: "West Bay", tech: "Ariel" },
    { name: "Izzy Akdeniz", address: "105 Solara", tech: "Malik" },
    { name: "Sandra Tobin", address: "108 Solara", tech: "Malik" },
    { name: "Philip Smyres", address: "Conch Point Villas", tech: "Malik" },
    { name: "Brandon Caruana", address: "Conch Point Villas", tech: "Malik" },
    { name: "Chelsea Pederson", address: "131 Conch Point", tech: "Malik" },
    { name: "Kate Ye", address: "17 Cypres Point", tech: "Malik" },
    { name: "Phillip Cadien", address: "312 Cypres Point", tech: "Malik" }
  ];

  // Map to store unique clients by name
  const uniqueClients = {};
  clients.forEach(c => {
    if (!uniqueClients[c.name]) {
      uniqueClients[c.name] = {
        id: `c_${Math.random().toString(36).substr(2, 9)}`,
        name: c.name,
        address: c.address,
        technician: c.tech
      };
    }
  });

  const clientArray = Object.values(uniqueClients);
  db.set('clients', clientArray);

  // Generate pending workorders for each client assigned to their tech
  const workorders = clientArray.map(c => ({
    id: `wo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    clientId: c.id,
    clientName: c.name,
    address: c.address,
    technician: c.technician,
    date: new Date().toISOString().split('T')[0],
    status: 'pending',
    readings: { pool: defaultChemReadings(), spa: defaultChemReadings() },
    chemicalsAdded: { pool: defaultChemicalAdditions(), spa: defaultChemicalAdditions() },
    photos: []
  }));

  db.set('workorders', workorders);
  db.set('masterScheduleLoaded', true);
}

function populateLoginTechOptions() {
  const select = document.getElementById('login-tech');
  if (!select) return;

  const entries = Object.entries(auth.users)
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  select.innerHTML = `
    <option value="" disabled selected>— Select your name —</option>
    ${entries.map(([id, user]) => `
      <option value="${id}">${user.name}${user.role === 'admin' ? ' (Admin)' : ''}</option>
    `).join('')}
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  // Start Firestore real-time sync
  db.startRealtimeSync();

  // Always force login screen on startup
  auth.logout();

  cleanupTestClients();
  initMasterSchedule();
  migrateLegacyRepairData();
  populateLoginTechOptions();

  // Android Back Button Handling
  if (typeof Capacitor !== 'undefined' && Capacitor.Plugins.App) {
    Capacitor.Plugins.App.addListener('backButton', () => {
      if (router.currentView === 'dashboard') {
        // Stop at home page, don't exit if logged in (though we force login above)
        return;
      }

      if (!auth.isLoggedIn()) {
        // If at login screen, maybe let it exit or do nothing
        return;
      }

      router.goBack();
    });
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      router.navigate(btn.dataset.view);
    });
  });

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const select = document.getElementById('login-tech');
    const pinInput = document.getElementById('login-pin');
    const username = select ? select.value : '';
    const pin = pinInput ? pinInput.value : '';
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app');
    const loginError = document.getElementById('login-error');

    console.log('Attempting login for:', username);

    if (auth.login(username, pin)) {
      console.log('Login successful');
      const loginScreen = document.getElementById('login-screen');
      const appShell = document.getElementById('app');

      if (loginScreen) {
        loginScreen.style.setProperty('display', 'none', 'important');
      }
      if (appShell) {
        appShell.classList.remove('hidden');
        appShell.style.setProperty('display', 'flex', 'important');
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
      console.warn('Login failed: invalid username or PIN');
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
  if (!auth.isAdmin()) {
    showToast('Only admins can add clients');
    return;
  }
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
  if (!auth.isAdmin()) {
    showToast('Only admins can delete clients');
    return;
  }
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
    status: getValue('wo-status', order.status || 'pending'),
    address: selectedClient?.address || getValue('wo-address', order.address),
    workPerformed: getValue('wo-work', order.workPerformed || ''),
    followUpNotes,
    notes: followUpNotes,
    photos: normalizeChemPhotos(order.photos), // Ensure photos are preserved from the original order
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

  order.status = document.getElementById('wo-status')?.value || order.status || 'pending';
  if (order.status !== 'completed') {
    showToast('Please set status to Completed before saving');
    return;
  }
  workOrderManager.saveOrder(order);
  router.navigate('workorders');
  showToast('Completed chem sheet saved');
}

function shareReport(orderId) {
  const order = collectWorkOrderForm(orderId);
  if (!order) {
    showToast('Work order not found');
    return;
  }

  order.status = document.getElementById('wo-status')?.value || order.status || 'pending';
  if (order.status !== 'completed') {
    showToast('Please set status to Completed before sharing');
    return;
  }
  workOrderManager.saveOrder(order);
  workOrderManager.generateReport(order);
}

function sendReport(orderId) {
  shareReport(orderId);
}

function getRepairOrders() {
  return db.get('repairOrders', []);
}

function saveRepairOrders(orders) {
  db.set('repairOrders', orders);
}

function renderRepairOrdersList(statusFilter = 'all') {
  const allOrders = getRepairOrders();
  const currentUser = auth.getCurrentUser();
  const isAdmin = auth.isAdmin();
  const canShare = auth.canShare();

  let orders = allOrders;

  if (statusFilter === 'completed') {
    orders = orders.filter(order => (order.status || '').toLowerCase() === 'completed');
  } else if (statusFilter === 'pending') {
    orders = orders.filter(order => (order.status || '').toLowerCase() !== 'completed');
  }

  if (!orders.length) {
    const emptyTitle = statusFilter === 'completed'
      ? 'No completed repair orders'
      : statusFilter === 'pending'
        ? 'No open or pending repair orders'
        : 'No repair work orders';

    return `
      <div class="empty-state">
        <div class="empty-icon">🛠️</div>
        <div class="empty-title">${emptyTitle}</div>
        <div class="empty-subtitle">Try a different filter or create a repair order</div>
      </div>
    `;
  }

  return [...orders].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).map(order => `
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
        <div class="detail-row"><div class="detail-label">Address</div><div class="detail-value">${escapeHtml(order.address || '')}</div></div>
      </div>
      <div class="job-card-footer">
        <button class="btn ${order.status === 'completed' ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="renderRepairOrderForm('${escapeHtml(order.id)}')">${order.status === 'completed' ? 'Completed' : 'Open'}</button>
        ${canShare ? `<button class="btn btn-primary btn-sm" onclick="shareRepairPDF('${escapeHtml(order.id)}')">Share</button>` : ''}
        ${currentUser.role === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteRepairOrder('${escapeHtml(order.id)}')">Delete</button>` : ''}
      </div>
    </div>
  `).join('');
}

function renderRepairOrderForm(orderId = '', presetClientId = '', draftOrder = null) {
  const content = document.getElementById('main-content');
  const existing = !draftOrder && orderId ? getRepairOrders().find(order => order.id === orderId) : null;
  const clients = db.get('clients', []);
  const order = draftOrder || existing || {
    id: orderId || `r${Date.now()}`,
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
    summary: '',
    materials: '',
    partsItems: [],
    partsSummary: '',
    labourHours: '',
    notes: '',
    photos: []
  };

  const activeOrderId = order.id;
  const timeIn = order.timeIn || order.time || '';
  const timeOut = order.timeOut || '';
  const timeSpent = calculateTimeSpent(timeIn, timeOut);

  content.innerHTML = `
    <div class="wo-form">
      <div class="wo-bar">
        <button class="btn btn-secondary btn-sm" onclick="router.renderWorkOrders()">← Back</button>
        <div id="repair-bar-title" class="wo-bar-title">${order.clientName || 'Repair Order'}</div>
        <button class="btn btn-primary btn-sm" onclick="saveRepairWorkOrder('${activeOrderId}')">Save</button>
      </div>

      <div class="wo-sec">
        <div class="wo-sec-hd" onclick="toggleAccordion(this)">
          <span>Customer & Job Details</span>
          <span class="wo-chev">▼</span>
        </div>
        <div class="wo-sec-bd" data-active-repair-id="${activeOrderId}">
          <div class="form-row" style="position:relative;">
            <label for="repair-client-search">Client</label>
            <input type="hidden" id="repair-client" value="${escapeHtml(order.clientId || presetClientId || '')}">
            <input type="text" id="repair-client-search" class="form-control" placeholder="Type to search clients..." value="${escapeHtml(order.clientName || '')}" autocomplete="off" oninput="filterRepairClientDropdown(this.value)" onfocus="filterRepairClientDropdown(this.value)">
            <div id="repair-client-dropdown" style="display:none; position:absolute; top:100%; left:0; right:0; z-index:100; max-height:200px; overflow-y:auto; background:#fff; border:1px solid #ddd; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15);"></div>
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
            <label for="repair-status">Status</label>
            <select id="repair-status">
              <option value="open" ${order.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="in-progress" ${order.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
              <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
            </select>
          </div>
        </div>
      </div>

      <div class="wo-sec">
        <div class="wo-sec-hd" onclick="toggleAccordion(this)">
          <span>Work Summary & Parts</span>
          <span class="wo-chev">▼</span>
        </div>
        <div class="wo-sec-bd">
          <div class="form-row">
            <label for="repair-summary">Summary of Work</label>
            <textarea id="repair-summary" placeholder="Describe the repair performed...">${escapeHtml(order.summary || '')}</textarea>
          </div>

          <div class="form-row">
            <label>Parts & Equipment Installed</label>
            ${renderRepairPartsBuilder(activeOrderId, order)}
          </div>

          <div class="form-row">
            <label for="repair-materials">Additional Parts Notes</label>
            <textarea id="repair-materials" placeholder="Materials used, part numbers not in catalog...">${escapeHtml(order.materials || '')}</textarea>
          </div>

          <div class="form-row">
            <label for="repair-labour">Labour Hours</label>
            <input id="repair-labour" type="number" step="0.25" value="${escapeHtml(order.labourHours || '')}">
          </div>

          <div class="form-row">
            <label for="repair-notes">Internal Office Notes</label>
            <textarea id="repair-notes" placeholder="Notes for billing or follow-up...">${escapeHtml(order.notes || '')}</textarea>
          </div>
        </div>
      </div>

      ${renderRepairPhotoSection(activeOrderId, order)}

      <div class="card" style="margin:12px;">
        <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="saveRepairWorkOrder('${escapeHtml(activeOrderId)}')">Save Changes</button>
          ${auth.canShare() ? `<button class="btn send-report-btn" onclick="saveRepairWorkOrder('${escapeHtml(activeOrderId)}', true)">Share Report</button>` : ''}
        </div>
      </div>
    </div>
  `;

  onRepairClientChange();
  attachRepairFormListeners();
}

function onRepairClientChange() {
  const hiddenInput = document.getElementById('repair-client');
  const searchInput = document.getElementById('repair-client-search');
  const address = document.getElementById('repair-address');
  const title = document.getElementById('repair-bar-title');
  if (!hiddenInput || !address) return;

  const client = db.get('clients', []).find(item => item.id === hiddenInput.value);
  if (client) {
    address.value = client.address || '';
    if (searchInput) searchInput.value = client.name || '';
    if (title) title.textContent = client.name || 'Repair Order';
  }
}

function collectRepairOrderFromForm(orderId = '') {
  // Use a stable identifier if this is a brand new order being filled out
  const formElement = document.getElementById('repair-client');
  if (formElement && !orderId) {
      // If we're in the form but don't have an ID yet, check if one was already assigned
      // to the form session to avoid duplicates on every photo take/upload.
      const existingIdField = document.querySelector('[data-active-repair-id]');
      if (existingIdField) {
          orderId = existingIdField.getAttribute('data-active-repair-id');
      }
  }

  const existing = orderId ? getRepairOrders().find(item => item.id === orderId) : null;
  const finalId = orderId || existing?.id || `r${Date.now()}`;

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

  const photos = REPAIR_PHOTO_LABELS.map((_, index) => {
    const preview = document.querySelector(`[data-repair-photo-index="${index}"]`);
    return preview?.getAttribute('src') || existing?.photos?.[index] || '';
  });

  return {
    id: finalId,
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
    summary: document.getElementById('repair-summary')?.value || '',
    materials: document.getElementById('repair-materials')?.value || '',
    partsItems: partItems,
    partsSummary: buildRepairPartsSummary(partItems),
    labourHours: document.getElementById('repair-labour')?.value || '',
    notes: document.getElementById('repair-notes')?.value || '',
    photos
  };
}

function saveRepairWorkOrder(orderId = '', shareAfterSave = false) {
  const order = collectRepairOrderFromForm(orderId);
  if (!order) return;

  order.status = document.getElementById('repair-status')?.value || order.status || 'open';
  if (order.status !== 'completed') {
    showToast('Please set status to Completed before saving');
    return;
  }

  const orders = getRepairOrders();
  const index = orders.findIndex(item => item.id === order.id);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }

  saveRepairOrders(orders);
  showToast('Completed work order saved');

  if (shareAfterSave) {
    shareRepairPDF(order.id);
    return;
  }

  router.renderWorkOrders();
}

function getImageDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function shareRepairPDF(orderId) {
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

  let logoData = null;
  try {
    logoData = await getImageDataUrl('oasis-logo.png');
  } catch (e) {
    console.warn('Logo load failed', e);
  }

  let y = 0;

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
    doc.text('REPAIR WORK ORDER', 195, 14, { align: 'right' });
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

  y = renderHeader();

  // Info Grid

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
  addField('Address', order.address, col1, gridY);
  addField('Job Type', order.jobType, col2, gridY);
  gridY += 12;
  addField('Assigned Tech', order.assignedTo, col1, gridY);
  addField('Status', order.status, col2, gridY);
  gridY += 12;
  addField('Time In / Out', `${order.timeIn || '—'} / ${order.timeOut || '—'}`, col1, gridY);
  addField('Labour Hours', order.labourHours || '—', col2, gridY);

  y += 50;

  // Work Summary
  doc.setFillColor(...navy);
  doc.rect(10, y, 190, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('WORK SUMMARY', 15, y + 5);
  y += 10;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const summaryLines = doc.splitTextToSize(order.summary || 'No summary provided.', 180);
  doc.text(summaryLines, 15, y);
  y += (summaryLines.length * 5) + 5;

  // Parts Table
  if (order.partsItems && order.partsItems.length > 0) {
    doc.setFillColor(...navy);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('PARTS & EQUIPMENT INSTALLED', 15, y + 5);
    doc.text('QTY', 170, y + 5);
    y += 7;

    order.partsItems.forEach((item, i) => {
      doc.setDrawColor(235, 235, 235);
      doc.line(10, y + 6, 200, y + 6);
      doc.setTextColor(...navy);
      doc.text(`${item.category}: ${item.product}` || 'Unknown Part', 15, y + 4.5);
      doc.text(String(item.qty || 1), 170, y + 4.5);
      y += 6;
    });
    y += 5;
  }

  // Office Notes
  if (order.notes) {
    doc.setFillColor(...navy);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('INTERNAL OFFICE NOTES', 15, y + 5);
    y += 10;
    doc.setTextColor(60, 60, 60);
    const notesLines = doc.splitTextToSize(order.notes, 180);
    doc.text(notesLines, 15, y);
    y += (notesLines.length * 5) + 5;
  }

  // Photos (Compact)
  const photos = normalizeRepairPhotos(order.photos || []);
  if (photos.some(p => p)) {
    doc.setFillColor(...navy);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('REPAIR PHOTOS', 15, y + 5);
    y += 10;

    const pW = 42;
    const pH = 32;
    let pX = 15;
    photos.forEach((p, i) => {
      if (p && i < 4) { // Max 4 photos to fit on one page
        try {
          doc.addImage(p, 'JPEG', pX, y, pW, pH);
          doc.setFontSize(6);
          doc.setTextColor(150, 150, 150);
          doc.text(REPAIR_PHOTO_LABELS[i], pX, y + pH + 4);
        } catch(e) {}
        pX += 48;
      }
    });
  }

  renderFooter();
  sharePDF(doc, filename);
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
          <input class="wo-fld-inp repair-part-qty" type="number" min="1" step="1" value="${escapeHtml(String(part.qty || '1'))}" oninput="updateRepairPartRowDetails(this)">
        </div>

        <div class="wo-fld">
          <div class="wo-fld-lbl">Part Details</div>
          <div class="repair-part-details" style="font-size:12px; color:var(--gray-600); line-height:1.5; min-height:38px;">
            ${selectedItem ? `${escapeHtml(selectedItem.partNumber || '')}${selectedItem.price ? ` • $${Number(selectedItem.price).toFixed(2)}` : ''}` : 'Choose a category and equipment item.'}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="removeRepairPartRow('${orderId || ''}', ${index})">Remove</button>
        </div>
      </div>
    </div>
  `;
}

function updateRepairPartRowDetails(input) {
  const row = input.closest('.repair-part-row');
  const productSelect = row.querySelector('.repair-part-product');
  const detailsDiv = row.querySelector('.repair-part-details');
  const qty = parseInt(input.value) || 1;

  const selectedOption = productSelect.selectedOptions[0];
  if (selectedOption && selectedOption.value) {
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
    <div class="wo-sec">
      <div class="wo-sec-hd wo-photo-hd" onclick="toggleAccordion(this)">
        <span>Repair Photos</span>
        <span class="wo-chev">▼</span>
      </div>
      <div class="wo-sec-bd">
        <div class="photo-ba-row">${beforeAfter}</div>
        <div class="photo-extra-grid" style="margin-top:8px;">${extras}</div>
      </div>
    </div>
  `;
}

async function handleRepairPhotoUpload(orderId, slotIndex, event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  try {
    const order = collectRepairOrderFromForm(orderId);
    if (!order) {
      showToast('Repair work order not found');
      return;
    }

    showToast('Processing repair photo...');
    const dataUrl = await resizeImageForStorage(file);
    if (!dataUrl) throw new Error('Photo processing failed');

    const photos = normalizeRepairPhotos(order.photos);
    photos[slotIndex] = dataUrl;
    order.photos = photos;

    // Persist immediately
    const orders = getRepairOrders();
    const idx = orders.findIndex(o => o.id === order.id);
    if (idx >= 0) {
      orders[idx] = order;
    } else {
      orders.unshift(order);
    }
    saveRepairOrders(orders);

    const slot = document.getElementById(`repair-photo-slot-${slotIndex}`);

    // Update DOM with new ID if it was previously empty
    if (!orderId) {
        const container = document.querySelector('[data-active-repair-id]');
        if (container) container.setAttribute('data-active-repair-id', order.id);
    }

    if (slot) {
      const label = REPAIR_PHOTO_LABELS[slotIndex];
      slot.outerHTML = renderRepairPhotoSlot(order.id, label, dataUrl, slotIndex);
      showToast('Repair photo added');
    } else {
      renderRepairOrderForm(order.id, '', order);
      showToast('Repair photo added');
    }
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

  // Persist immediately
  const orders = getRepairOrders();
  const idx = orders.findIndex(o => o.id === order.id);
  if (idx >= 0) {
    orders[idx] = order;
    saveRepairOrders(orders);
  }

  const slot = document.getElementById(`repair-photo-slot-${slotIndex}`);

  // Ensure form is locked to this ID if it was a new order
  if (!orderId) {
      const container = document.querySelector('[data-active-repair-id]');
      if (container) container.setAttribute('data-active-repair-id', order.id);
  }

  if (slot) {
    const label = REPAIR_PHOTO_LABELS[slotIndex];
    slot.outerHTML = renderRepairPhotoSlot(order.id, label, '', slotIndex);
  } else {
    renderRepairOrderForm(order.id, '', order);
  }

  showToast('Repair photo removed');
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

// Route schedule import from XLSM file
function importRouteSchedule() {
  const content = document.getElementById('main-content');
  content.innerHTML = `
    <div class="wo-form">
      <div class="wo-bar">
        <button class="btn btn-secondary btn-sm" onclick="router.renderClients()">\u2190 Back</button>
        <div class="wo-bar-title">Import Route Sheet</div>
      </div>
      <div class="wo-sec">
        <div class="wo-sec-hd">Upload Route Sheet (.xlsm / .xlsx)</div>
        <div class="wo-sec-bd">
          <p style="color:#666; font-size:13px; margin-bottom:12px;">Select your route schedule Excel file. The importer will read each ROUTE sheet tab and assign service days to matching clients.</p>
          <p style="color:#666; font-size:13px; margin-bottom:12px;">Expected format: Each sheet named "ROUTE #" with Row 1 = tech name, Row 2 = day headers (MONDAY-SATURDAY), then alternating time/client rows.</p>
          <div class="form-group">
            <input type="file" id="route-file-input" accept=".xlsx,.xlsm,.xls" class="form-control" onchange="processRouteFile(this)">
          </div>
          <div id="route-import-status" style="margin-top:12px;"></div>
        </div>
      </div>
    </div>
  `;
}

function processRouteFile(input) {
  const file = input.files[0];
  if (!file) return;

  const statusEl = document.getElementById('route-import-status');
  statusEl.innerHTML = '<p style="color:#2196F3;">Reading file...</p>';

  // Map route sheet tech names to app auth names
  const TECH_NAME_MAP = {
    'king': 'Kingsley',
    'stephon': 'Elvin'
  };
  function normalizeTechName(name) {
    const lower = (name || '').trim().toLowerCase();
    return TECH_NAME_MAP[lower] || (name || '').trim();
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

      let routeEntries = [];

      // Detect format: flat table (Day, Route #, Route Name, Client Name, Address) vs multi-tab
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const firstRow = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })[0] || [];
      const headers = firstRow.map(h => String(h).toLowerCase().trim());
      const isFlat = headers.includes('day') && headers.includes('client name');

      if (isFlat) {
        // Flat format: each row is one visit (day + tech + client + address)
        const rows = XLSX.utils.sheet_to_json(firstSheet);
        const clientMap = {};

        rows.forEach(row => {
          const day = (row['Day'] || '').trim();
          const routeNum = String(row['Route #'] || '').trim();
          const techRaw = (row['Route Name'] || '').trim();
          const tech = normalizeTechName(techRaw);
          const clientName = (row['Client Name'] || '').trim();
          const address = (row['Address'] || '').trim();
          if (!clientName || !day) return;

          // Normalize day name
          const normalDay = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
          const key = (tech + '|' + clientName + '|' + address).toUpperCase();

          if (!clientMap[key]) {
            clientMap[key] = {
              tech: tech,
              route: 'Route ' + routeNum,
              name: clientName,
              address: address,
              days: []
            };
          }
          if (!clientMap[key].days.includes(normalDay)) {
            clientMap[key].days.push(normalDay);
          }
        });

        // Sort days and build entries
        Object.values(clientMap).forEach(entry => {
          entry.days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
          routeEntries.push(entry);
        });
      } else {
        // Multi-tab format: each sheet is a route
        const techOverrides = {
          'ROUTE 1': 'Kadeem', 'ROUTE 2': 'Elvin', 'ROUTE 3': 'Jermaine',
          'ROUTE 4': 'Ace', 'ROUTE 5': 'Donald', 'ROUTE 6': 'Kingsley',
          'ROUTE 7': 'Ariel', 'ROUTE 8': 'Malik'
        };

        wb.SheetNames.filter(n => n.trim().toUpperCase().startsWith('ROUTE')).forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          const routeKey = sheetName.trim();
          const techName = techOverrides[routeKey] || normalizeTechName(routeKey.replace(/ROUTE\s*#?\d*\s*/i, ''));
          const days = (rows[1] || []).filter(d => typeof d === 'string' && d.trim());

          const clientMap = {};
          for (let row = 2; row < rows.length; row++) {
            const cells = rows[row] || [];
            const hasText = cells.some(c => typeof c === 'string' && c.trim().length > 0);
            if (!hasText) continue;
            cells.forEach((cell, colIdx) => {
              if (typeof cell === 'string' && cell.trim() && colIdx < days.length) {
                const lines = cell.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l);
                const firstName = lines[0].replace(/\s*-\s*$/, '').trim();
                const key = firstName.substring(0, 50).toUpperCase();
                if (!clientMap[key]) clientMap[key] = { name: firstName, address: lines.join(' '), days: [] };
                const day = days[colIdx];
                if (!clientMap[key].days.includes(day)) clientMap[key].days.push(day);
              }
            });
          }

          Object.values(clientMap).forEach(entry => {
            entry.days.sort((a, b) => DAY_ORDER.map(d=>d.toUpperCase()).indexOf(a.toUpperCase()) - DAY_ORDER.map(d=>d.toUpperCase()).indexOf(b.toUpperCase()));
            routeEntries.push({
              tech: techName,
              route: routeKey.replace('ROUTE ', 'Route ').trim(),
              name: entry.name,
              address: entry.address,
              days: entry.days.map(d => d.charAt(0).toUpperCase() + d.slice(1).toLowerCase())
            });
          });
        });
      }

      // Clear old serviceDays from all clients first
      const clients = db.get('clients', []);
      clients.forEach(c => { c.serviceDays = []; c.route = ''; });

      let matched = 0, created = 0;

      routeEntries.forEach(entry => {
        // Match on name + address + tech to avoid collisions between same-name clients
        const eName = entry.name.toLowerCase().trim();
        const eAddr = entry.address.toLowerCase().trim();
        const eTech = entry.tech.toLowerCase().trim();
        let match = clients.find(c =>
          c.name && c.name.toLowerCase().trim() === eName &&
          c.address && c.address.toLowerCase().trim() === eAddr &&
          c.technician && c.technician.toLowerCase().trim() === eTech
        );

        if (match) {
          const existing = match.serviceDays || [];
          entry.days.forEach(d => { if (!existing.includes(d)) existing.push(d); });
          existing.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
          match.serviceDays = existing;
          match.route = entry.route;
          matched++;
        } else {
          clients.push({
            id: 'c_' + Math.random().toString(36).substr(2, 9),
            name: entry.name,
            address: entry.address,
            contact: '',
            technician: entry.tech,
            route: entry.route,
            serviceDays: entry.days
          });
          created++;
        }
      });

      db.set('clients', clients);

      // Count unique clients with schedule
      const scheduled = clients.filter(c => c.serviceDays && c.serviceDays.length > 0).length;

      statusEl.innerHTML = `
        <div style="background:#e8f5e9; padding:12px; border-radius:8px;">
          <p style="color:#2e7d32; font-weight:600; margin-bottom:8px;">Import Complete</p>
          <p style="color:#333; font-size:13px;">\ud83d\udcca ${routeEntries.length} unique route entries processed</p>
          <p style="color:#333; font-size:13px;">\u2705 ${matched} existing clients updated</p>
          <p style="color:#333; font-size:13px;">\u2795 ${created} new clients created</p>
          <p style="color:#333; font-size:13px;">\ud83d\udcc5 ${scheduled} clients now have scheduled service days</p>
          <button class="btn btn-primary btn-sm" style="margin-top:12px;" onclick="router.setClientView('byRoute'); router.renderClients();">View By Route</button>
          <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="router.navigate('routes')">View Routes</button>
        </div>
      `;
    } catch (err) {
      statusEl.innerHTML = '<p style="color:#c62828;">Error reading file: ' + escapeHtml(err.message) + '</p>';
      console.error('Route import error:', err);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function exportCompletedToExcel() {
  const isCompleted = (status = '') => String(status || '').trim().toLowerCase() === 'completed';
  const sortByNewest = (items = []) => [...items].sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0));

  const completedChemSheets = sortByNewest(db.get('workorders', []).filter(wo => isCompleted(wo.status)));
  const completedRepairOrders = sortByNewest(getRepairOrders().filter(order => isCompleted(order.status)));

  if (completedChemSheets.length === 0 && completedRepairOrders.length === 0) {
    showToast('No completed chem sheets or repair orders to export');
    return;
  }

  showToast('Generating Excel report...');

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OASIS Service App';
    workbook.created = new Date();
    workbook.modified = new Date();

    const styleHeader = (sheet, columnCount) => {
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0D2B45' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columnCount }
      };
    };

    const formatBody = (sheet) => {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.alignment = { vertical: 'top', wrapText: true };
      });
    };

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

    const chemSheet = workbook.addWorksheet('Chem Sheets');
    const chemColumns = [
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

    chemKeys.forEach(ck => {
      chemColumns.push({ header: `Pool ${ck.label}`, key: `p_${ck.key}`, width: 15 });
    });

    chemColumns.push(
      { header: 'Spa Chlorine', key: 'sCl', width: 12 },
      { header: 'Spa pH', key: 'sph', width: 10 },
      { header: 'Spa Alk', key: 'salk', width: 10 }
    );

    chemKeys.forEach(ck => {
      chemColumns.push({ header: `Spa ${ck.label}`, key: `s_${ck.key}`, width: 15 });
    });

    chemColumns.push({ header: 'Service Notes', key: 'notes', width: 40 });
    chemSheet.columns = chemColumns;
    styleHeader(chemSheet, chemColumns.length);

    completedChemSheets.forEach(wo => {
      const rowData = {
        date: wo.date || '',
        client: wo.clientName || '',
        address: wo.address || '',
        tech: wo.technician || '',
        timeIn: wo.timeIn || wo.time || '',
        timeOut: wo.timeOut || '',
        pCl: wo.readings?.pool?.chlorine || '',
        pph: wo.readings?.pool?.ph || '',
        palk: wo.readings?.pool?.alkalinity || '',
        sCl: wo.readings?.spa?.chlorine || '',
        sph: wo.readings?.spa?.ph || '',
        salk: wo.readings?.spa?.alkalinity || '',
        notes: `${wo.workPerformed || ''} ${wo.followUpNotes || wo.notes || ''}`.trim()
      };

      chemKeys.forEach(ck => {
        rowData[`p_${ck.key}`] = wo.chemicalsAdded?.pool?.[ck.key] || '';
        rowData[`s_${ck.key}`] = wo.chemicalsAdded?.spa?.[ck.key] || '';
      });

      chemSheet.addRow(rowData);
    });

    if (chemSheet.rowCount === 1) {
      chemSheet.addRow({ client: 'No completed chem sheets' });
    }
    formatBody(chemSheet);

    const repairColumns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Client', key: 'client', width: 25 },
      { header: 'Address', key: 'address', width: 35 },
      { header: 'Technician', key: 'tech', width: 18 },
      { header: 'Job Type', key: 'jobType', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Time In', key: 'timeIn', width: 10 },
      { header: 'Time Out', key: 'timeOut', width: 10 },
      { header: 'Labour Hours', key: 'labourHours', width: 12 },
      { header: 'Materials', key: 'materials', width: 30 },
      { header: 'Parts Summary', key: 'partsSummary', width: 40 },
      { header: 'Work Summary', key: 'summary', width: 40 },
      { header: 'Notes', key: 'notes', width: 40 }
    ];

    const repairSheet = workbook.addWorksheet('Repair Orders');
    repairSheet.columns = repairColumns;
    styleHeader(repairSheet, repairColumns.length);

    completedRepairOrders.forEach(order => {
      repairSheet.addRow({
        date: order.date || '',
        client: order.clientName || '',
        address: order.address || '',
        tech: order.assignedTo || '',
        jobType: order.jobType || '',
        status: order.status || '',
        timeIn: order.timeIn || order.time || '',
        timeOut: order.timeOut || '',
        labourHours: order.labourHours || '',
        materials: order.materials || '',
        partsSummary: order.partsSummary || '',
        summary: order.summary || '',
        notes: order.notes || ''
      });
    });

    if (repairSheet.rowCount === 1) {
      repairSheet.addRow({ client: 'No completed repair orders' });
    }
    formatBody(repairSheet);

    const buffer = await workbook.xlsx.writeBuffer();

    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    const base64 = btoa(binary);
    const filename = `OASIS_Completed_Orders_${new Date().toISOString().split('T')[0]}.xlsx`;

    await shareFileByEmail(base64, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    showToast('Completed orders Excel ready to email');
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
  const route = document.getElementById('edit-client-route') ? document.getElementById('edit-client-route').value : '';
  const dayCheckboxes = document.querySelectorAll('#edit-client-days input[type=checkbox]');
  const serviceDays = Array.from(dayCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

  if (!name) {
    alert('Name is required');
    return;
  }

  const clients = db.get('clients', []);
  const index = clients.findIndex(c => c.id === clientId);
  if (index >= 0) {
    clients[index] = { ...clients[index], name, address, contact, technician: tech, route, serviceDays };
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
    { name: "Mystic Retreat", address: "John Greer Boulavard", tech: "Kadeem" },
    { name: "Brian Lonergan", address: "18 Paradise Close", tech: "Elvin" },
    { name: "South Bay Estates", address: "Bel Air Dr", tech: "Elvin" },
    { name: "Andy Marcher", address: "234 Drake Quay", tech: "Jermaine" },
    { name: "Andreas Haug", address: "359 North West Point Rd", tech: "Jermaine" },
    { name: "Dolce Vita", address: "Govenors Harbour", tech: "Jermaine" },
    { name: "Amber Stewart", address: "Dolce Vita 4", tech: "Jermaine" },
    { name: "Pleasant View", address: "West Bay", tech: "Jermaine" },
    { name: "Jack Leeland", address: "120 Oleander Dr", tech: "Ace" },
    { name: "Greg Swart", address: "182 Prospect Point Rd", tech: "Ace" },
    { name: "Kahlill Strachan", address: "27 Jump Link", tech: "Ace" },
    { name: "Loreen Stewart", address: "29 Galaxy Way", tech: "Ace" },
    { name: "Francia Lloyd", address: "30 Soto Lane", tech: "Ace" },
    { name: "Tom Balon", address: "37 Teal Island", tech: "Ace" },
    { name: "Charles Ebanks", address: "Bonnieview Av", tech: "Donald" },
    { name: "One Canal Point Gym", address: "Canal Point", tech: "Kingsley" },
    { name: "Colin Robinson", address: "130 Halkieth Rd", tech: "Malik" },
    { name: "Moon Bay", address: "Shamrock Rd", tech: "Malik" },
    { name: "Cayman Coves", address: "South Church Street", tech: "Kadeem" },
    { name: "Venetia", address: "South Sound", tech: "Kadeem" },
    { name: "Stephen Leontsinis", address: "1340 South Sound", tech: "Elvin" },
    { name: "Tim Dailyey", address: "North Webster Dr", tech: "Elvin" },
    { name: "Nicholas Lynn", address: "Sandlewood Crescent", tech: "Elvin" },
    { name: "Tom Newton", address: "304 South Sound", tech: "Elvin" },
    { name: "Joyce Follows", address: "35 Jacaranda Ct", tech: "Elvin" },
    { name: "Declean Magennis", address: "62 Ithmar Circle", tech: "Elvin" },
    { name: "Riyaz Norrudin", address: "63 Langton Way", tech: "Elvin" },
    { name: "Mangrove", address: "Bcqs", tech: "Elvin" },
    { name: "Quentin Creegan", address: "Villa Aramone", tech: "Elvin" },
    { name: "Jodie O'Mahony", address: "12 El Nathan", tech: "Jermaine" },
    { name: "Charles Motsinger", address: "124 Hillard", tech: "Jermaine" },
    { name: "Steve Daker", address: "33 Spurgeon Cr", tech: "Jermaine" },
    { name: "Laura Redman", address: "45 Yates Drive", tech: "Jermaine" },
    { name: "David Collins", address: "512 Yacht Dr", tech: "Jermaine" },
    { name: "Albert Schimdberger", address: "55 Elnathan Rd", tech: "Jermaine" },
    { name: "Jordan Constable", address: "60 Philip Crescent", tech: "Jermaine" },
    { name: "Blair Ebanks", address: "71 Spurgeon Crescent", tech: "Jermaine" },
    { name: "Bertrand Bagley", address: "91 El Nathan Drive", tech: "Jermaine" },
    { name: "Laura Egglishaw", address: "94 Park Side Close", tech: "Jermaine" },
    { name: "Hugo Munoz", address: "171 Leeward Dr", tech: "Ace" },
    { name: "Mitchell Demeter", address: "19 Whirlaway Close", tech: "Ace" },
    { name: "Habte Skale", address: "32 Trevor Close", tech: "Ace" },
    { name: "Paul Reynolds", address: "424 Prospect Point Rd", tech: "Ace" },
    { name: "Thomas Ponessa", address: "450 Prospect Point Rd", tech: "Ace" },
    { name: "Jim Brannon", address: "87 Royal Palms Drive", tech: "Ace" },
    { name: "Coastal Escape", address: "Omega Bay", tech: "Ace" },
    { name: "Inity Ridge", address: "Prospect Point Rd", tech: "Ace" },
    { name: "Ocean Reach", address: "Old Crewe Rd", tech: "Ace" },
    { name: "Scott Somerville", address: "Rum Point Rd", tech: "Donald" },
    { name: "Alexander McGarry", address: "2628 Bodden Town Rd", tech: "Donald" },
    { name: "67 On The Bay", address: "Queens Highway", tech: "Donald" },
    { name: "Hesham Sida", address: "824 Seaview Rd", tech: "Donald" },
    { name: "Peter Watler", address: "952 Seaview Rd", tech: "Donald" },
    { name: "Paradise Sur Mar", address: "Sand Cay Rd", tech: "Donald" },
    { name: "Rip Kai", address: "Rum Point Drive", tech: "Donald" },
    { name: "Sunrays", address: "Sand Cay Rd", tech: "Donald" },
    { name: "Greg Melehov", address: "16 Galway Quay", tech: "Kingsley" },
    { name: "William Jackman", address: "221 Crystal Dr", tech: "Kingsley" },
    { name: "Regant Court", address: "Brittania", tech: "Kingsley" },
    { name: "Solara Main", address: "Crystal Harbour", tech: "Kingsley" },
    { name: "Steven Joyce", address: "199 Crystal Drive", tech: "Ariel" },
    { name: "Rick Gorter", address: "33 Shoreview Point", tech: "Ariel" },
    { name: "Marcia Milgate", address: "34 Newhaven", tech: "Ariel" },
    { name: "Chad Horwitz", address: "49 Calico Quay", tech: "Ariel" },
    { name: "Malcom Swift", address: "Miramar", tech: "Ariel" },
    { name: "Roland Stewart", address: "Kimpton Seafire", tech: "Ariel" },
    { name: "Strata #70", address: "Boggy Sands rd", tech: "Ariel" },
    { name: "Tracey Kline", address: "108 Roxborough dr", tech: "Malik" },
    { name: "Debbie Ebanks", address: "Fischers Reef", tech: "Malik" },
    { name: "John Corallo", address: "3A Seahven", tech: "Malik" },
    { name: "Encompass", address: "3B Seahven", tech: "Malik" },
    { name: "Joseph Hurlston", address: "42 Monumnet Rd", tech: "Malik" },
    { name: "George McKenzie", address: "534 Rum Point Dr", tech: "Malik" },
    { name: "Twin Palms", address: "Rum Point Dr", tech: "Malik" },
    { name: "Bernie Bako", address: "#4 Venetia", tech: "Kadeem" },
    { name: "Cindy Conway", address: "#7 The Chimes", tech: "Kadeem" },
    { name: "Patricia Conroy", address: "58 Anne Bonney Crescent", tech: "Kadeem" },
    { name: "Park View Courts", address: "Spruce Lane", tech: "Kadeem" },
    { name: "The Bentley", address: "Crewe rd", tech: "Kadeem" },
    { name: "Jackie Murphy", address: "110 The lakes", tech: "Elvin" },
    { name: "Chris Turell", address: "127 Denham Thompson Way", tech: "Elvin" },
    { name: "Guy Locke", address: "1326 South Sound", tech: "Elvin" },
    { name: "Rena Streker", address: "1354 South Sound", tech: "Elvin" },
    { name: "Jennifer Bodden", address: "25 Ryan Road", tech: "Elvin" },
    { name: "Nicholas Gargaro", address: "538 South Sound Rd", tech: "Elvin" },
    { name: "Jessica Wright", address: "55 Edgmere Circle", tech: "Elvin" },
    { name: "Stewart Donald", address: "72 Conch Drive", tech: "Elvin" },
    { name: "Andre Ogle", address: "87 The Avenue", tech: "Elvin" },
    { name: "Jon Brosnihan", address: "#6 Shorewinds Trail", tech: "Jermaine" },
    { name: "Michael Bascina", address: "13 Victoria Dr", tech: "Jermaine" },
    { name: "Nigel Daily", address: "Snug Harbour", tech: "Jermaine" },
    { name: "Steven Manning", address: "61 Shoreline Dr", tech: "Jermaine" },
    { name: "Guy Cowan", address: "74 Shorecrest", tech: "Jermaine" },
    { name: "Kadi Pentney", address: "Kings Court", tech: "Jermaine" },
    { name: "Shoreway Townhomes", address: "Adonis Dr", tech: "Jermaine" },
    { name: "Randal Martin", address: "151 Shorecrest Circle", tech: "Jermaine" },
    { name: "Brandon Smith", address: "Victoria Villas", tech: "Jermaine" },
    { name: "David Guilmette", address: "183 Crystal Drive", tech: "Ace" },
    { name: "Stef Dimitrio", address: "266 Raleigh Quay", tech: "Ace" },
    { name: "Clive Harris", address: "516 Crighton Drive", tech: "Ace" },
    { name: "Chez Tschetter", address: "53 Marquise Quay", tech: "Ace" },
    { name: "Ross Fortune", address: "90 Prince Charles", tech: "Ace" },
    { name: "Simon Palmer", address: "Olivias Cove", tech: "Ace" },
    { name: "Caroline Moran", address: "197 Bimini Dr", tech: "Donald" },
    { name: "James Reeve", address: "215 Bimini Dr", tech: "Donald" },
    { name: "David Mullen", address: "23 Silver Thatch", tech: "Donald" },
    { name: "Sina Mirzale", address: "353 Bimini Dr", tech: "Donald" },
    { name: "Mike Kornegay", address: "40 Palm Island Circle", tech: "Donald" },
    { name: "Marlon Bispath", address: "519 Bimini Dr", tech: "Donald" },
    { name: "Margaret Fantasia", address: "526 Bimini Dr", tech: "Donald" },
    { name: "Kenny Rankin", address: "Grand Harbour", tech: "Donald" },
    { name: "James Mendes", address: "106 Olea", tech: "Ariel" },
    { name: "James O'Brien", address: "102 Olea", tech: "Ariel" },
    { name: "Lexi Pappadakis", address: "110 Olea", tech: "Ariel" },
    { name: "Manuela Lupu", address: "103 Olea", tech: "Ariel" },
    { name: "Mr Holland", address: "107 Olea", tech: "Ariel" },
    { name: "Nikki Harris", address: "213 olea", tech: "Ariel" },
    { name: "Scott Hughes", address: "111 Olea", tech: "Ariel" },
    { name: "Mr Kelly and Mrs Kahn", address: "112 Olea", tech: "Ariel" },
    { name: "Anu O'Driscoll", address: "23 Lalique Point", tech: "Malik" },
    { name: "Shelly Do Vale", address: "47 Marbel Drive", tech: "Malik" },
    { name: "Iman Shafiei", address: "53 Baquarat Quay", tech: "Malik" },
    { name: "Enrique Tasende", address: "65 Baccarat Quay", tech: "Malik" },
    { name: "David Wilson", address: "Boggy Sands", tech: "Malik" },
    { name: "Nina Irani", address: "Casa Oasis", tech: "Malik" },
    { name: "Sandy Lane Townhomes", address: "Boggy Sands Rd", tech: "Malik" },
    { name: "Valencia Heights", address: "Strata #536", tech: "Kadeem" },
    { name: "Jaime-Lee Eccles", address: "176 Conch Dr", tech: "Kadeem" },
    { name: "Mehdi Khosrow-Pour", address: "610 South Sound Rd", tech: "Kadeem" },
    { name: "Michelle Bryan", address: "65 Fairview Road", tech: "Kadeem" },
    { name: "Gareth thacker", address: "9 The Venetia", tech: "Kadeem" },
    { name: "Raoul Pal", address: "93 Marry read crescent", tech: "Kadeem" },
    { name: "Hilton Estates", address: "Fairbanks Rd", tech: "Kadeem" },
    { name: "Romell El Madhani", address: "117 Crystal Dr", tech: "Elvin" },
    { name: "Britni Strong", address: "150 Parkway Dr", tech: "Elvin" },
    { name: "Victoria Wheaton", address: "36 Whitehall Gardens", tech: "Elvin" },
    { name: "Prasanna Ketheeswaran", address: "46 Captian Currys Rd", tech: "Elvin" },
    { name: "Jaron Goldberg", address: "52 Parklands Close", tech: "Elvin" },
    { name: "Mitzi Callan", address: "Morganville Condos", tech: "Elvin" },
    { name: "Saphire", address: "Jec, Nwp Rd", tech: "Elvin" },
    { name: "The Sands", address: "Boggy Sand Rd", tech: "Elvin" },
    { name: "Turtle Breeze", address: "Conch Point Rd", tech: "Elvin" },
    { name: "Francois Du Toit", address: "Snug Harbour", tech: "Jermaine" },
    { name: "Paolo Pollini", address: "16 Stewart Ln", tech: "Jermaine" },
    { name: "Robert Morrison", address: "265 Jennifer Dr", tech: "Jermaine" },
    { name: "Johann Prinslo", address: "270 Jennifer Dr", tech: "Jermaine" },
    { name: "Andre Slabbert", address: "7 Victoria Dr", tech: "Jermaine" },
    { name: "Alicia McGill", address: "84 Andrew Drive", tech: "Jermaine" },
    { name: "Palm Heights Residence", address: "Seven Mile Beach", tech: "Jermaine" },
    { name: "Jean Mean", address: "211 Sea Spray Dr", tech: "Ace" },
    { name: "Paul Rowan", address: "265 Sea Spray Dr", tech: "Ace" },
    { name: "Charmaine Richter", address: "40 Natures Circle", tech: "Ace" },
    { name: "Rory Andrews", address: "44 Country Road", tech: "Ace" },
    { name: "Walker Romanica", address: "79 Riley Circle", tech: "Ace" },
    { name: "Craig Stewart", address: "88 Leeward Drive", tech: "Ace" },
    { name: "Grand Palmyra", address: "Seven Mile Beach", tech: "Ace" },
    { name: "Jay Easterbrook", address: "33 Cocoplum", tech: "Ace" },
    { name: "Harry Tee", address: "438 Water Cay Rd", tech: "Donald" },
    { name: "Sarah Dobbyn-Thomson", address: "441 Water Cay Rd", tech: "Donald" },
    { name: "Reg Williams", address: "Cliff House", tech: "Donald" },
    { name: "Gypsy", address: "1514 Rum Point Dr", tech: "Donald" },
    { name: "Kai Vista", address: "Rum Point Dr", tech: "Donald" },
    { name: "Ocean Vista", address: "Rum Point", tech: "Donald" },
    { name: "Stefan Marenzi", address: "Water Cay Rd", tech: "Donald" },
    { name: "Bella Rocca", address: "Queens Highway", tech: "Donald" },
    { name: "Sea 2 Inity", address: "Kiabo", tech: "Donald" },
    { name: "Guy Manning", address: "Diamonds Edge", tech: "Kingsley" },
    { name: "Kent Nickerson", address: "Salt Creek", tech: "Kingsley" },
    { name: "Grecia Iuculano", address: "133 Magellan Quay", tech: "Ariel" },
    { name: "Suzanne Correy", address: "394 Canal Point Rd", tech: "Ariel" },
    { name: "November Capitol", address: "One Canal Point", tech: "Ariel" },
    { name: "Safe Harbor", address: "West Bay", tech: "Ariel" },
    { name: "Bert Thacker", address: "West Bay", tech: "Ariel" },
    { name: "Izzy Akdeniz", address: "105 Solara", tech: "Malik" },
    { name: "Sandra Tobin", address: "108 Solara", tech: "Malik" },
    { name: "Philip Smyres", address: "Conch Point Villas", tech: "Malik" },
    { name: "Brandon Caruana", address: "Conch Point Villas", tech: "Malik" },
    { name: "Chelsea Pederson", address: "131 Conch Point", tech: "Malik" },
    { name: "Kate Ye", address: "17 Cypres Point", tech: "Malik" },
    { name: "Phillip Cadien", address: "312 Cypres Point", tech: "Malik" }
  ];

  // Map to store unique clients by name
  const uniqueClients = {};
  clients.forEach(c => {
    if (!uniqueClients[c.name]) {
      uniqueClients[c.name] = {
        id: `c_${Math.random().toString(36).substr(2, 9)}`,
        name: c.name,
        address: c.address,
        technician: c.tech
      };
    }
  });

  const clientArray = Object.values(uniqueClients);
  db.set('clients', clientArray);

  // Generate pending workorders for each client assigned to their tech
  const workorders = clientArray.map(c => ({
    id: `wo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    clientId: c.id,
    clientName: c.name,
    address: c.address,
    technician: c.technician,
    date: new Date().toISOString().split('T')[0],
    status: 'pending',
    readings: { pool: defaultChemReadings(), spa: defaultChemReadings() },
    chemicalsAdded: { pool: defaultChemicalAdditions(), spa: defaultChemicalAdditions() },
    photos: []
  }));

  db.set('workorders', workorders);
  db.set('masterScheduleLoaded', true);
}

function populateLoginTechOptions() {
  const select = document.getElementById('login-tech');
  if (!select) return;

  const entries = Object.entries(auth.users)
    .sort((a, b) => a[1].name.localeCompare(b[1].name));

  select.innerHTML = `
    <option value="" disabled selected>— Select your name —</option>
    ${entries.map(([id, user]) => `
      <option value="${id}">${user.name}${user.role === 'admin' ? ' (Admin)' : ''}</option>
    `).join('')}
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  // Start Firestore real-time sync
  db.startRealtimeSync();

  // Always force login screen on startup
  auth.logout();

  cleanupTestClients();
  initMasterSchedule();
  migrateLegacyRepairData();
  populateLoginTechOptions();

  // Android Back Button Handling
  if (typeof Capacitor !== 'undefined' && Capacitor.Plugins.App) {
    Capacitor.Plugins.App.addListener('backButton', () => {
      if (router.currentView === 'dashboard') {
        // Stop at home page, don't exit if logged in (though we force login above)
        return;
      }

      if (!auth.isLoggedIn()) {
        // If at login screen, maybe let it exit or do nothing
        return;
      }

      router.goBack();
    });
  }

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      router.navigate(btn.dataset.view);
    });
  });

  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const select = document.getElementById('login-tech');
    const pinInput = document.getElementById('login-pin');
    const username = select ? select.value : '';
    const pin = pinInput ? pinInput.value : '';
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app');
    const loginError = document.getElementById('login-error');

    console.log('Attempting login for:', username);

    if (auth.login(username, pin)) {
      console.log('Login successful');
      const loginScreen = document.getElementById('login-screen');
      const appShell = document.getElementById('app');

      if (loginScreen) {
        loginScreen.style.setProperty('display', 'none', 'important');
      }
      if (appShell) {
        appShell.classList.remove('hidden');
        appShell.style.setProperty('display', 'flex', 'important');
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
      console.warn('Login failed: invalid username or PIN');
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
  if (!auth.isAdmin()) {
    showToast('Only admins can add clients');
    return;
  }
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
  if (!auth.isAdmin()) {
    showToast('Only admins can delete clients');
    return;
  }
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
    status: getValue('wo-status', order.status || 'pending'),
    address: selectedClient?.address || getValue('wo-address', order.address),
    workPerformed: getValue('wo-work', order.workPerformed || ''),
    followUpNotes,
    notes: followUpNotes,
    photos: normalizeChemPhotos(order.photos), // Ensure photos are preserved from the original order
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

  order.status = document.getElementById('wo-status')?.value || order.status || 'pending';
  if (order.status !== 'completed') {
    showToast('Please set status to Completed before saving');
    return;
  }
  workOrderManager.saveOrder(order);
  router.navigate('workorders');
  showToast('Completed chem sheet saved');
}

function shareReport(orderId) {
  const order = collectWorkOrderForm(orderId);
  if (!order) {
    showToast('Work order not found');
    return;
  }

  order.status = document.getElementById('wo-status')?.value || order.status || 'pending';
  if (order.status !== 'completed') {
    showToast('Please set status to Completed before sharing');
    return;
  }
  workOrderManager.saveOrder(order);
  workOrderManager.generateReport(order);
}

function sendReport(orderId) {
  shareReport(orderId);
}

function getSavedAppLink() {
  const savedLink = String(db.get('apk_download_link') || '').trim();
  if (!savedLink || /oasis-app\.apk$/i.test(savedLink)) {
    return 'https://millzy7665-beep.github.io/oasis-service/';
  }
  return savedLink;
}

function saveApkLink() {
  const input = document.getElementById('apk-link-input');
  if (!input) return;

  const rawLink = input.value.trim();
  const link = (!rawLink || /oasis-app\.apk$/i.test(rawLink))
    ? 'https://millzy7665-beep.github.io/oasis-service/'
    : rawLink;
  db.set('apk_download_link', link);

  // Re-render the settings view to update the QR code
  if (router.currentView === 'settings') {
    router.renderSettings();
  }

  showToast(link ? 'App link saved' : 'App link cleared');
}

async function shareAppLink() {
  const link = getSavedAppLink();
  if (!link) {
    showToast('No link to share');
    return;
  }

  const shareTitle = 'Download Oasis App';
  const shareText = 'Open the latest Oasis app here:';
  const shareChoice = promptShareChoice('app link');

  if (shareChoice === 'cancel') {
    showToast('Share cancelled');
    return;
  }

  if (shareChoice === 'whatsapp') {
    openWhatsAppShare(`${shareText}\n${link}`);
    showToast('WhatsApp opened');
    return;
  }

  if (shareChoice === 'email') {
    openEmailShare(shareTitle, `${shareText}\n\n${link}`);
    showToast('Email draft opened');
    return;
  }

  const shareData = {
    title: shareTitle,
    text: shareText,
    url: link,
    dialogTitle: 'Share Oasis App Link'
  };

  try {
    if (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.Share) {
      await Capacitor.Plugins.Share.share(shareData);
    } else if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(link);
      showToast('Link copied to clipboard');
    }
  } catch (err) {
    console.error('Error sharing:', err);
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copied to clipboard');
    } catch (clipboardErr) {
      showToast('Could not share or copy link');
    }
  }
}

async function copyApkLink() {
  const link = getSavedAppLink();
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

function quickAddClient() {
  if (!auth.isAdmin()) {
    showToast('Only admins can add clients');
    return;
  }

  const techOptions = getTechnicianNames().map(n => `<option value="${n}">${n}</option>`).join('');

  const content = document.getElementById('main-content');
  content.innerHTML = `
    <div class="section-header">
      <div class="section-title">Add New Client</div>
      <button class="btn btn-secondary btn-sm" onclick="router.renderClients()">Cancel</button>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="form-row"><label>Client Name</label><input id="new-client-name" class="form-control" type="text" placeholder="Enter client name" required></div>
        <div class="form-row"><label>Address</label><input id="new-client-address" class="form-control" type="text" placeholder="Enter address"></div>
        <div class="form-row"><label>Contact</label><input id="new-client-contact" class="form-control" type="text" placeholder="Contact name"></div>
        <div class="form-row"><label>Assign Technician</label><select id="new-client-tech" class="form-control"><option value="">— Select technician —</option>${techOptions}</select></div>
        <button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="submitNewClient()">Save Client</button>
      </div>
    </div>
  `;
}

function submitNewClient() {
  const name = (document.getElementById('new-client-name')?.value || '').trim();
  const address = (document.getElementById('new-client-address')?.value || '').trim();
  const contact = (document.getElementById('new-client-contact')?.value || '').trim();
  const technician = normalizeTechnicianName(document.getElementById('new-client-tech')?.value || '');

  if (!name) { showToast('Please enter a client name'); return; }
  if (!technician) { showToast('Please select a technician'); return; }

  const clients = db.get('clients', []);
  const clientId = `c${Date.now()}`;
  clients.unshift({ id: clientId, name, address, contact, technician });
  db.set('clients', clients);

  notificationManager.create({
    type: 'client',
    title: 'New client from Admin',
    message: `${name} has been added and assigned to ${technician}.`,
    recipients: [...getTechnicianNames(), ...getAdminRecipients()],
    targetView: 'clients',
    targetId: clientId,
    actionLabel: 'Open Clients'
  });

  showToast(`Client added and sent to ${technician}`);
  router.renderClients();
}

function onChemClientChange() {
  const select = document.getElementById('wo-client');
  const addressField = document.getElementById('wo-address');
  const title = document.getElementById('wo-client-name');
  const techField = document.getElementById('wo-tech');
  if (!select) return;

  const client = db.get('clients', []).find(item => item.id === select.value);
  if (client) {
    if (addressField) addressField.value = client.address || '';
    if (title) title.textContent = client.name || 'Chem Sheet';
    if (techField && client.technician) techField.value = client.technician;
  }
}

function saveWorkOrderForm(orderId) {
  const previousOrder = workOrderManager.getOrder(orderId);
  const order = collectWorkOrderForm(orderId);
  if (!order) {
    showToast('Work order not found');
    return;
  }

  const currentUser = auth.getCurrentUser();
  const previousStatus = (previousOrder?.status || '').toLowerCase();
  order.status = document.getElementById('wo-status')?.value || order.status || 'pending';
  order.updatedAt = new Date().toISOString();
  order.updatedBy = currentUser?.name || '';

  workOrderManager.saveOrder(order);

  if (currentUser?.username === 'admin' || currentUser?.username === 'admin2') {
    const assignmentChanged = !previousOrder || previousOrder.technician !== order.technician || previousStatus !== (order.status || '').toLowerCase();
    if (assignmentChanged) {
      notificationManager.create({
        type: 'chem',
        title: 'New chem sheet from Admin',
        message: `${order.clientName || 'A chem sheet'} has been assigned to ${order.technician || 'a technician'}.`,
        recipients: [order.technician, ...getAdminRecipients(currentUser.name)],
        targetView: 'chem',
        targetId: order.id,
        actionLabel: 'Open Chem Sheet'
      });
    }
  } else if (currentUser && currentUser.username !== 'admin' && currentUser.username !== 'admin2') {
    const shouldNotifyAdmin = !previousOrder?.updatedAt || previousStatus !== (order.status || '').toLowerCase();
    if (shouldNotifyAdmin) {
      notificationManager.create({
        type: 'chem',
        title: order.status === 'completed' ? 'Completed chem sheet received' : 'Chem sheet received from technician',
        message: `${currentUser.name} ${order.status === 'completed' ? 'completed' : 'updated'} ${order.clientName || 'a chem sheet'}.`,
        recipients: getAdminRecipients(currentUser?.name),
        targetView: 'chem',
        targetId: order.id,
        actionLabel: 'Open Chem Sheet'
      });
    }
  }

  router.navigate('workorders');
  showToast(order.status === 'completed'
    ? 'Completed chem sheet saved for admin export'
    : 'Chem sheet saved');
}

function onRepairClientChange() {
  const select = document.getElementById('repair-client');
  const address = document.getElementById('repair-address');
  const title = document.getElementById('repair-bar-title');
  const techField = document.getElementById('repair-tech');
  if (!select || !address) return;

  const client = db.get('clients', []).find(item => item.id === select.value);
  if (client) {
    address.value = client.address || '';
    if (title) title.textContent = client.name || 'Repair Order';
    if (techField && client.technician) techField.value = client.technician;
  }
}

function saveRepairWorkOrder(orderId = '', shareAfterSave = false) {
  const order = collectRepairOrderFromForm(orderId);
  if (!order) return;

  const currentUser = auth.getCurrentUser();
  const orders = getRepairOrders();
  const previousOrder = orders.find(item => item.id === order.id);
  const previousStatus = (previousOrder?.status || '').toLowerCase();

  order.status = document.getElementById('repair-status')?.value || order.status || 'open';
  order.updatedAt = new Date().toISOString();
  order.updatedBy = currentUser?.name || '';

  const index = orders.findIndex(item => item.id === order.id);
  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }

  saveRepairOrders(orders);

  if (currentUser?.username === 'admin' || currentUser?.username === 'admin2') {
    const assignmentChanged = !previousOrder || previousOrder.assignedTo !== order.assignedTo || previousStatus !== (order.status || '').toLowerCase();
    if (assignmentChanged) {
      notificationManager.create({
        type: 'repair',
        title: 'New repair order from Admin',
        message: `${order.clientName || 'A repair order'} has been assigned to ${order.assignedTo || 'a technician'}.`,
        recipients: [order.assignedTo, ...getAdminRecipients(currentUser.name)],
        targetView: 'repair',
        targetId: order.id,
        actionLabel: 'Open Repair Order'
      });
    }
  } else if (currentUser && currentUser.username !== 'admin' && currentUser.username !== 'admin2') {
    const shouldNotifyAdmin = !previousOrder?.updatedAt || previousStatus !== (order.status || '').toLowerCase();
    if (shouldNotifyAdmin) {
      notificationManager.create({
        type: 'repair',
        title: order.status === 'completed' ? 'Completed repair order received' : 'Repair order received from technician',
        message: `${currentUser.name} ${order.status === 'completed' ? 'completed' : 'updated'} ${order.clientName || 'a repair order'}.`,
        recipients: getAdminRecipients(currentUser?.name),
        targetView: 'repair',
        targetId: order.id,
        actionLabel: 'Open Repair Order'
      });
    }
  }

  showToast(order.status === 'completed'
    ? 'Completed repair order saved for admin export'
    : 'Repair work order saved');

  if (shareAfterSave) {
    shareRepairPDF(order.id);
    return;
  }

  router.renderWorkOrders();
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
        <button type="button" class="btn btn-secondary btn-sm" onclick="takeNativePhoto('repair', '${orderId || ''}', ${index}, 'CAMERA')">Camera</button>
        <label class="btn btn-secondary btn-sm" for="repair-photo-gallery-${index}">Gallery</label>
      </div>
      <input id="repair-photo-camera-${index}" name="repair-photo-camera-${index}" class="photo-file-inp" type="file" accept="image/*" capture="environment" onchange="handleRepairPhotoUpload('${orderId || ''}', ${index}, event)">
      <input id="repair-photo-gallery-${index}" name="repair-photo-gallery-${index}" class="photo-file-inp" type="file" accept="image/*" onchange="handleRepairPhotoUpload('${orderId || ''}', ${index}, event)">
    </div>
  `;
}
