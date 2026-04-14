// OASIS Service and Repair App - Unified Version
// Features: Login, Dashboard, Clients, Chem Sheets, Work Orders, Settings
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

const DEFAULT_FCM_VAPID_KEY = 'ABLdoFsNyMaq5RSKg0M0lPdlvFOy43A3wonCNbBWkr8';

const firebaseApp = typeof firebase !== 'undefined'
  ? (firebase.apps?.length ? firebase.app() : firebase.initializeApp(firebaseConfig))
  : null;
const firestore = firebaseApp?.firestore ? firebaseApp.firestore() : null;

// Collections that sync across all devices via Firestore.
const SYNCED_KEYS = ['clients', 'workorders', 'repairOrders', 'oasis_notifications', 'notification_device_registry', 'estimates'];
const PUSH_TOKEN_COLLECTION = 'push_tokens';
const PUSH_DISPATCH_COLLECTION = 'push_dispatch_queue';

// ==========================================
// DATA MANAGEMENT (DB)
// ==========================================
class DB {
  constructor() {
    this.storage = window.localStorage;
    this._realtimeSyncStarted = false;
    this._remoteWritesEnabled = false;
    this._storageListenerBound = false;
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
    let serialized;
    try {
      serialized = JSON.stringify(value);
      this.storage.setItem(key, serialized);
    } catch (e) {
      return false;
    }

    if (this._remoteWritesEnabled && firestore && SYNCED_KEYS.includes(key)) {
      firestore.collection('app_data').doc(key).set({
        data: JSON.parse(serialized),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(err => console.warn('Firestore write failed for', key, err));
    }

    return true;
  }

  remove(key) {
    this.storage.removeItem(key);

    if (this._remoteWritesEnabled && firestore && SYNCED_KEYS.includes(key)) {
      firestore.collection('app_data').doc(key).delete()
        .catch(err => console.warn('Firestore delete failed for', key, err));
    }
  }

  clear() {
    this.storage.clear();
  }

  refreshLiveViews(key = '') {
    if (typeof router === 'undefined' || !router.currentView) return;

    try {
      if (router.currentView === 'dashboard') {
        router.renderDashboard();
      } else if (router.currentView === 'routes' && typeof router.renderRoutes === 'function') {
        router.renderRoutes();
      } else if (router.currentView === 'clients' && document.getElementById('clients-list')) {
        router.renderClients();
      } else if (router.currentView === 'workorders' && document.getElementById('workorders-list')) {
        router.renderWorkOrders();
      } else if (router.currentView === 'quotes' && typeof router.renderQuotes === 'function' && document.getElementById('quotes-list')) {
        router.renderQuotes();
      }

      if (typeof router.updateNav === 'function') {
        router.updateNav();
      }
    } catch (error) {
      console.warn('Live view refresh failed for', key, error);
    }
  }

  bindStorageListener() {
    if (this._storageListenerBound || typeof window === 'undefined') return;

    this._storageListenerBound = true;
    window.addEventListener('storage', event => {
      if (!event.key || !SYNCED_KEYS.includes(event.key)) return;
      this.refreshLiveViews(event.key);
    });
  }

  startRealtimeSync() {
    if (this._realtimeSyncStarted) return;

    this._realtimeSyncStarted = true;
    this.bindStorageListener();

    if (!firestore) {
      console.warn('Firestore unavailable; shared live sync disabled');
      return;
    }

    const clone = value => JSON.parse(JSON.stringify(value));
    const hasMeaningfulValue = value => value !== null && value !== undefined && (!(Array.isArray(value)) || value.length > 0);
    let knownNotificationIds = new Set((this.get('oasis_notifications', []) || []).map(item => item.id));

    Promise.all(SYNCED_KEYS.map(async key => {
      const docRef = firestore.collection('app_data').doc(key);
      const remoteDoc = await docRef.get();
      const localData = this.get(key, null);

      if (remoteDoc.exists) {
        const remoteData = remoteDoc.data()?.data ?? null;
        if (remoteData !== null && JSON.stringify(remoteData) !== JSON.stringify(localData)) {
          this.storage.setItem(key, JSON.stringify(remoteData));
        }
        return;
      }

      if (hasMeaningfulValue(localData)) {
        await docRef.set({
          data: clone(localData),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    })).catch(error => {
      console.warn('Initial Firestore sync failed', error);
    }).finally(() => {
      knownNotificationIds = new Set((this.get('oasis_notifications', []) || []).map(item => item.id));
      this._remoteWritesEnabled = true;

      SYNCED_KEYS.forEach(key => {
        firestore.collection('app_data').doc(key).onSnapshot(snapshot => {
          if (!snapshot.exists) return;

          const remoteData = snapshot.data()?.data ?? null;
          const localData = this.get(key, null);

          if (JSON.stringify(remoteData) === JSON.stringify(localData)) {
            return;
          }

          this.storage.setItem(key, JSON.stringify(remoteData));
          console.log(`[Sync] ${key} updated from Firestore`);

          if (key === 'oasis_notifications' && typeof notificationManager !== 'undefined') {
            const newItems = (remoteData || []).filter(item => item?.id && !knownNotificationIds.has(item.id));
            newItems.forEach(item => {
              knownNotificationIds.add(item.id);
              notificationManager.presentLiveNotification(item);
            });
          }

          this.refreshLiveViews(key);
        }, error => {
          console.warn('Firestore listener error for', key, error);
        });
      });

      // Permission requests are deferred to the explicit post-login flow on supported devices.
    });
  }
}

const db = new DB();
const DATA_VERSION = 'v207'; // Bump this to force-refresh all master schedule clients

// ==========================================
// AUTHENTICATION
// ==========================================
class Auth {
  constructor() {
    this.currentUser = null;
    this.users = {
      't1': { role: 'technician', name: 'Service - Ace' },
      't2': { role: 'technician', name: 'Service - Ariel' },
      't3': { role: 'technician', name: 'Service - Donald' },
      't4': { role: 'technician', name: 'Service - Elvin' },
      't5': { role: 'technician', name: 'Service - Jermaine' },
      't6': { role: 'technician', name: 'Service - Kadeem' },
      't7': { role: 'technician', name: 'Service - Kingsley' },
      't8': { role: 'technician', name: 'Service - Malik' },
      't9': { role: 'technician', name: 'Tech - Jet' },
      't10': { role: 'technician', name: 'Tech - Mark' },
      'admin': { role: 'admin', name: 'Chris Mills' },
      'admin2': { role: 'admin', name: 'James Bussey', disableNotifications: true }
    };
  }

  login(username, pin) {
    const user = this.users[username];
    if (user) {
      // Jet and Mark specific PIN
      if ((username === 't9' || username === 't10') && pin === '1234') {
        this.currentUser = { ...user, username };
        db.set('currentUser', this.currentUser);
        if (shouldAutoClaimAlertDevice()) {
          markCurrentDeviceAsPreferred(this.currentUser);
        }
        return true;
      }

      // Default PINs
      const requiredPin = (user.role === 'admin') ? '0000' : '1111';
      if (pin === requiredPin) {
        this.currentUser = { ...user, username };
        db.set('currentUser', this.currentUser);
        if (shouldAutoClaimAlertDevice()) {
          markCurrentDeviceAsPreferred(this.currentUser);
        }
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

async function enqueuePushDispatch(item = {}) {
  if (!firestore || !item?.recipient) return;

  const currentUser = auth.getCurrentUser?.() || {};
  const payload = {
    notificationId: item.id || '',
    type: item.type || 'update',
    title: item.title || 'New OASIS update',
    body: item.message || 'You have a new update.',
    recipient: item.recipient || '',
    canonicalRecipient: item.recipient === 'all' ? '' : canonicalUserName(item.recipient),
    broadcast: item.recipient === 'all',
    targetView: item.targetView || '',
    targetId: item.targetId || '',
    targetDeviceId: item.targetDeviceId || getPreferredNotificationDeviceId(item.recipient || ''),
    senderUsername: currentUser.username || '',
    senderName: currentUser.name || '',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'queued'
  };

  await firestore.collection(PUSH_DISPATCH_COLLECTION).add(payload)
    .catch(error => console.warn('Failed to queue push dispatch', error));
}

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
    const currentDeviceId = getCurrentDeviceId();
    return this.getAll().filter(item => {
      const recipientMatches = userNamesMatch(item.recipient, userName) || item.recipient === 'all';
      const deviceMatches = !item.targetDeviceId || item.targetDeviceId === currentDeviceId;
      return recipientMatches && deviceMatches;
    });
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
    const currentDeviceId = getCurrentDeviceId();
    if (!currentUser || !userNamesMatch(item.recipient, currentUser.name)) return;
    if (item.targetDeviceId && item.targetDeviceId !== currentDeviceId) return;

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

  async create({ type = 'update', title = 'New update', message = '', recipients = [], targetView = '', targetId = '', actionLabel = 'Open', targetDeviceId = '' }) {
    const list = this.getAll();
    const createdAt = new Date().toISOString();
    const targetRecipients = [...new Set((Array.isArray(recipients) ? recipients : [recipients]).filter(Boolean))];

    for (const recipient of targetRecipients) {
      const resolvedTargetDeviceId = targetDeviceId || getPreferredNotificationDeviceId(recipient);
      const item = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        title,
        message,
        recipient,
        createdAt,
        targetView,
        targetId,
        targetDeviceId: resolvedTargetDeviceId,
        actionLabel,
        read: false
      };

      list.unshift(item);
      await this.presentLiveNotification(item);
      await enqueuePushDispatch(item);
    }

    this.saveAll(list);
  }

  markRead(noteId, user = auth.getCurrentUser()) {
    const userName = user?.name || '';
    let updatedNote = null;

    const updated = this.getAll().map(item => {
      if (item.id === noteId && (!userName || userNamesMatch(item.recipient, userName) || item.recipient === 'all')) {
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
      userNamesMatch(item.recipient, userName) ? { ...item, read: true } : item
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
            <div class="empty-subtitle">New clients, chem sheets, and work orders from Admin will appear here offline on this device.</div>
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
    .filter(user => user.role === 'admin' && !user.disableNotifications)
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

function getCurrentDeviceId() {
  try {
    const existing = localStorage.getItem('oasis_device_id');
    if (existing) return existing;

    const created = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('oasis_device_id', created);
    return created;
  } catch (error) {
    return 'device_unknown';
  }
}

function getNotificationDeviceRegistry() {
  return db.get('notification_device_registry', {});
}

function getPreferredNotificationDeviceId(userName = '') {
  const key = canonicalUserName(userName);
  const registry = getNotificationDeviceRegistry();
  return String(registry?.[key]?.deviceId || '').trim();
}

function markCurrentDeviceAsPreferred(user = auth?.getCurrentUser?.()) {
  if (!user?.name) return '';

  const deviceId = getCurrentDeviceId();
  const key = canonicalUserName(user.name);
  const registry = getNotificationDeviceRegistry();
  registry[key] = {
    userName: user.name,
    deviceId,
    updatedAt: new Date().toISOString()
  };
  db.set('notification_device_registry', registry);
  return deviceId;
}

function shouldAutoClaimAlertDevice() {
  if (typeof navigator === 'undefined') return false;
  return isIosLikeDevice() || /android/i.test(navigator.userAgent || '') || isStandaloneDisplayMode();
}

function canonicalUserName(name = '') {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^(service|tech)\s*-\s*/i, '');
}

function userNamesMatch(a = '', b = '') {
  if (!a || !b) return false;
  return canonicalUserName(a) === canonicalUserName(b);
}

let pushInitInFlight = null;

function getFirebaseMessagingInstance() {
  if (typeof firebase === 'undefined' || typeof firebase.messaging !== 'function') return null;
  try {
    return firebase.messaging();
  } catch (error) {
    console.warn('Firebase messaging unavailable', error);
    return null;
  }
}

function isIosLikeDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  return /iphone|ipad|ipod/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplayMode() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch (error) {
    return false;
  }
}

function browserSupportsPushNotifications() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!window.isSecureContext) return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (typeof Notification === 'undefined') return false;
  if (isIosLikeDevice() && !isStandaloneDisplayMode()) return false;
  return true;
}

function shouldResetPushSubscription() {
  try {
    return new URLSearchParams(window.location.search).get('resetPush') === '1';
  } catch (error) {
    return false;
  }
}

async function resetPushSubscriptionState(messaging, serviceWorkerRegistration) {
  try {
    const subscription = await serviceWorkerRegistration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
    }
  } catch (error) {
    console.warn('Push subscription cleanup skipped', error);
  }

  try {
    if (typeof messaging.deleteToken === 'function') {
      await messaging.deleteToken();
    }
  } catch (error) {
    console.warn('FCM token cleanup skipped', error);
  }
}

async function getMessagingTokenWithRecovery(messaging, serviceWorkerRegistration, vapidKey) {
  const tokenOptions = vapidKey
    ? { vapidKey, serviceWorkerRegistration }
    : { serviceWorkerRegistration };

  if (shouldResetPushSubscription()) {
    await resetPushSubscriptionState(messaging, serviceWorkerRegistration);
  }

  try {
    return await messaging.getToken(tokenOptions);
  } catch (error) {
    const message = String(error?.message || error || '').toLowerCase();
    const shouldRetry = message.includes('410') || message.includes('gone');
    if (!shouldRetry) throw error;

    console.warn('Retrying push token fetch after stale subscription reset', error);
    await resetPushSubscriptionState(messaging, serviceWorkerRegistration);
    return await messaging.getToken(tokenOptions);
  }
}

async function initializePushNotificationsForUser() {
  if (pushInitInFlight) return pushInitInFlight;

  pushInitInFlight = (async () => {
    const currentUser = auth.getCurrentUser();
    if (!currentUser) return false;
    if (!browserSupportsPushNotifications()) return false;

    await notificationManager.requestPermission().catch(() => {});

    if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
    if (Notification.permission !== 'granted') return false;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;

    const messaging = getFirebaseMessagingInstance();
    if (!messaging) return false;

    const serviceWorkerRegistration = await navigator.serviceWorker.ready;
    if (typeof messaging.useServiceWorker === 'function') {
      messaging.useServiceWorker(serviceWorkerRegistration);
    }

    const vapidKey = String(db.get('fcmVapidKey') || DEFAULT_FCM_VAPID_KEY || '').trim();
    let token = '';

    try {
      token = await getMessagingTokenWithRecovery(messaging, serviceWorkerRegistration, vapidKey);
    } catch (error) {
      console.warn('FCM token fetch failed', error);
      return false;
    }

    if (!token) return false;

    // Register token server-side via CORS-enabled Cloud Function
    try {
      const response = await fetch('https://us-central1-oasis-service-app-69def.cloudfunctions.net/registerPushToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          username: currentUser.username || '',
          userName: currentUser.name || '',
          platform: /android/i.test(navigator.userAgent) ? 'android-pwa' : 'web',
          permission: Notification.permission
        })
      });

      if (!response.ok) {
        throw new Error(`Token registration failed: ${response.status}`);
      }
    } catch (error) {
      console.warn('Failed to register push token', error);
    }

    if (!window.__oasisMessagingOnMessageBound) {
      messaging.onMessage(payload => {
        const data = payload?.data || {};
        const notification = payload?.notification || {};
        const title = notification.title || data.title || 'New OASIS update';
        const message = notification.body || data.body || data.message || 'You have a new update.';

        notificationManager.presentLiveNotification({
          title,
          message,
          recipient: auth.getCurrentUser()?.name || ''
        });
      });

      window.__oasisMessagingOnMessageBound = true;
    }

    return true;
  })();

  try {
    return await pushInitInFlight;
  } finally {
    pushInitInFlight = null;
  }
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
      'quotes': this.renderQuotes.bind(this),
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
        const mc = document.getElementById('main-content');
        if (mc) { mc.classList.remove('page-fade'); void mc.offsetWidth; mc.classList.add('page-fade'); }
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
    const isAdmin = auth.isAdmin();
    const isJetOrMark = !isAdmin && user && (user.username === 't9' || user.username === 't10');
    const canSeeClientsAndWO = isAdmin || isJetOrMark;

    // Routes: visible for everyone except Jet/Mark
    const routesBtn = document.querySelector('.nav-item[data-view="routes"]');
    if (routesBtn) routesBtn.style.display = isJetOrMark ? 'none' : '';

    // Clients and Work Orders: only visible for admin and Jet/Mark
    const clientsBtn = document.querySelector('.nav-item[data-view="clients"]');
    const woBtn = document.querySelector('.nav-item[data-view="workorders"]');
    if (clientsBtn) clientsBtn.style.display = canSeeClientsAndWO ? '' : 'none';
    if (woBtn) woBtn.style.display = canSeeClientsAndWO ? '' : 'none';

    // Quotes: admin only
    const quotesBtn = document.querySelector('.nav-item[data-view="quotes"]');
    if (quotesBtn) quotesBtn.style.display = isAdmin ? '' : 'none';
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
      : items.filter(item => userNamesMatch(item?.[technicianField] || '', currentUser.name));
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
    const isOfficeUser = isAdmin || (user && (user.username === 't9' || user.username === 't10'));
    const visibleWorkorders = this.getVisibleJobs(db.get('workorders', []), 'technician');
    const visibleRepairOrders = this.getVisibleJobs(typeof getRepairOrders === 'function' ? getRepairOrders() : [], 'assignedTo');
    const unreadNotifications = notificationManager.getUnreadForUser(user).length;

    const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const todayDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const allClients = db.get('clients', []);
    const myRouteClients = isAdmin
      ? allClients.filter(c => c.serviceDays && c.serviceDays.includes(todayDay))
      : allClients.filter(c => userNamesMatch(c.technician || '', userName) && c.serviceDays && c.serviceDays.includes(todayDay));
    const myTechClients = isAdmin ? allClients : allClients.filter(c => userNamesMatch(c.technician || '', userName));
    const myTotalClients = myTechClients.reduce((sum, c) => sum + (c.serviceDays ? c.serviceDays.length : 0), 0);

    // Open and pending work orders
    const myRepairOrders = visibleRepairOrders.filter(r => {
      const s = (r.status || 'open');
      return s !== 'completed' && s !== 'pending';
    }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const myPendingOrders = visibleRepairOrders.filter(r => (r.status || 'open') === 'pending')
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    // Completion stats for Jet/Mark
    const todayDateStr = new Date().toISOString().split('T')[0];
    const todayCompletedOrders = visibleRepairOrders.filter(r => r.status === 'completed' && r.date === todayDateStr);
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - mondayOffset);
    weekStart.setHours(0, 0, 0, 0);
    const weeklyCompletedOrders = visibleRepairOrders.filter(r => {
      if (r.status !== 'completed' || !r.date) return false;
      const d = new Date(r.date + 'T00:00:00');
      return d >= weekStart && d <= now;
    });

    content.innerHTML = `
      <div class="wave-banner">
        <div class="wave-banner-eyebrow">Welcome back</div>
        <div class="wave-banner-title">${userName}</div>
        <div class="wave-banner-sub">${todayStr}${isOfficeUser && !isAdmin ? '' : ` • ${myRouteClients.length} stops today`}</div>
      </div>

      <div class="stats-grid">
        ${isOfficeUser && !isAdmin ? `
        <div class="stat-card">
          <div class="stat-icon">✅</div>
          <div class="stat-value">${todayCompletedOrders.length}</div>
          <div class="stat-label">Today's Completed</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-value">${weeklyCompletedOrders.length}</div>
          <div class="stat-label">Weekly Completed</div>
        </div>
        ` : `
        <div class="stat-card" onclick="router.navigate('routes')">
          <div class="stat-icon">🗺️</div>
          <div class="stat-value">${myRouteClients.length}</div>
          <div class="stat-label">Today's Visits</div>
        </div>
        <div class="stat-card" onclick="router.navigate('clients')">
          <div class="stat-icon">👥</div>
          <div class="stat-value">${myTotalClients}</div>
          <div class="stat-label">Weekly Visits</div>
        </div>
        `}
        ${isOfficeUser ? `
        <div class="stat-card">
          <div class="stat-icon">🛠️</div>
          <div class="stat-value">${myRepairOrders.length}</div>
          <div class="stat-label">Open Work Orders</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">⏳</div>
          <div class="stat-value">${myPendingOrders.length}</div>
          <div class="stat-label">Pending Orders</div>
        </div>
        ` : ''}
      </div>

      ${isOfficeUser && myPendingOrders.length > 0 ? `
      <div class="section-header">
        <div class="section-title">${isAdmin ? 'All Pending Work Orders' : 'My Pending Work Orders'}</div>
      </div>
      ${myPendingOrders.map(order => `
        <div class="list-item" onclick="renderRepairOrderForm('${escapeHtml(order.id)}')" style="cursor:pointer;">
          <div class="list-item-avatar" style="background:#fff8e1; color:#f57f17;">⏳</div>
          <div class="list-item-info">
            <div class="list-item-name">${escapeHtml(order.clientName || 'Repair Job')}</div>
            <div class="list-item-sub">${escapeHtml(order.jobType || 'General Repair')} • ${escapeHtml(order.date || 'No date')}</div>
            <div class="list-item-sub" style="font-size:11px; color:#666;">📍 ${escapeHtml(order.address || '')}${!isAdmin && order.assignedTo ? '' : ` • 👤 ${escapeHtml(order.assignedTo || 'Unassigned')}`}</div>
          </div>
          <div class="list-item-actions">
            <span style="font-size:11px; padding:3px 8px; border-radius:12px; background:#fff8e1; color:#f57f17;">pending</span>
          </div>
        </div>
      `).join('')}
      ` : ''}

      ${isOfficeUser ? (myRepairOrders.length > 0 ? `
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
            <span style="font-size:11px; padding:3px 8px; border-radius:12px; background:${order.status === 'in-progress' ? '#fff3e0' : '#e3f2fd'}; color:${order.status === 'in-progress' ? '#e65100' : '#1565c0'};">${ escapeHtml(order.status || 'open')}</span>
          </div>
        </div>
      `).join('')}
      ` : `
      <div class="card" style="margin:16px;"><div class="card-body"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No open work orders</div></div></div></div>
      `) : ''}

      ${!isOfficeUser ? `
      <div class="section-header">
        <div class="section-title">Today's Route · ${todayDay}</div>
        <button class="btn btn-secondary btn-sm" onclick="router.navigate('routes')">Full Route →</button>
      </div>
      <div id="today-route">
        ${myRouteClients.length > 0
          ? myRouteClients.sort((a, b) => a.name.localeCompare(b.name)).map(c => `
            <div class="list-item" onclick="router.editClient('${escapeHtml(c.id)}')" style="cursor:pointer;">
              <div class="list-item-avatar" style="background:#e3f2fd; color:#1565c0;">📍</div>
              <div class="list-item-info">
                <div class="list-item-name">${escapeHtml(c.name)}</div>
                <div class="list-item-sub">${escapeHtml(c.address)}</div>
              </div>
              <div class="list-item-actions">
                <button class="btn btn-icon" onclick="event.stopPropagation(); openMap('${escapeHtml(c.address)}')" title="Navigate">📍</button>
              </div>
            </div>
          `).join('')
          : `<div class="card" style="margin:0 16px 12px;"><div class="card-body"><div class="empty-title">No route stops for ${todayDay}</div><div class="empty-subtitle">Import a route sheet to see your daily schedule</div></div></div>`
        }
      </div>
      ` : ''}

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
      clientName: order.clientName || 'Work Order',
      address: order.address || '',
      time: order.timeIn || order.time || 'TBD',
      status: order.status || 'open',
      kind: order.jobType || 'Work Order',
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

    // Jet and Mark have no Routes tab — redirect to work orders
    if (!isAdmin && user && (user.username === 't9' || user.username === 't10')) {
      return this.renderWorkOrders();
    }

    const allClients = db.get('clients', []);
    const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    // Admin: can filter by any tech. Field tech: shows only their own clients.
    let techFilter = isAdmin ? (this._routeTechFilter || 'all') : (user ? user.name : '');
    const techClients = techFilter === 'all'
      ? allClients.filter(c => c.serviceDays && c.serviceDays.length)
      : allClients.filter(c => c.technician === techFilter && c.serviceDays && c.serviceDays.length);

    const techs = [...new Set(allClients.filter(c => c.technician).map(c => c.technician))].sort();

    this._routeDayFilter = this._routeDayFilter || today;
    const dayFilter = this._routeDayFilter;

    const dayClients = dayFilter === 'all'
      ? techClients
      : techClients.filter(c => c.serviceDays && c.serviceDays.includes(dayFilter));

    content.innerHTML = `
      <div class="section-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="btn btn-icon" onclick="router.goBack()" style="font-size:20px; padding:0 4px;">←</button>
          <div class="section-title">${isAdmin ? 'All Routes' : (user ? user.name + "'s Route" : 'My Route')}</div>
        </div>
        <div style="font-size:12px; color:#666;">${dayClients.length} client${dayClients.length !== 1 ? 's' : ''} shown</div>
      </div>

      ${isAdmin ? `
      <div style="padding:0 16px 8px;">
        <select class="form-control" onchange="router._routeTechFilter=this.value; router._routeDayFilter=null; router.renderRoutes();" style="font-size:14px;">
          <option value="all" ${techFilter === 'all' ? 'selected' : ''}>All Technicians</option>
          ${techs.map(t => `<option value="${escapeHtml(t)}" ${techFilter === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>` : ''}

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
          <div class="empty-subtitle">${dayFilter === 'all' ? 'No route clients found' : 'No visits scheduled for ' + dayFilter}</div>
        </div>
      `;
    }
    return clients.map(c => this.renderRouteCard(c)).join('');
  }

  renderRouteCard(client) {
    const daysLabel = (client.serviceDays || []).map(d => d.substring(0, 3)).join(', ');
    const _rcUser = auth.getCurrentUser();
    const _rcIsAdmin = auth.isAdmin();
    const _rcIsJetOrMark = !_rcIsAdmin && (_rcUser?.username === 't9' || _rcUser?.username === 't10');
    const _rcIsFieldTech = !_rcIsAdmin && !_rcIsJetOrMark;
    return `
      <div class="list-item" style="cursor:pointer;">
        <div class="list-item-avatar" style="background:#e3f2fd; color:#1565c0;">📍</div>
        <div class="list-item-info">
          <div class="list-item-name">${escapeHtml(client.name)}</div>
          <div class="list-item-sub">${escapeHtml(client.address)}</div>
          ${daysLabel ? `<div class="list-item-sub" style="font-size:11px; color:#2196F3;">${escapeHtml(daysLabel)}</div>` : ''}
        </div>
        <div class="list-item-actions">
          <button class="btn btn-icon" onclick="event.stopPropagation(); openMap('${escapeHtml(client.address)}')" title="Navigate">📍</button>
          ${_rcIsFieldTech ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); router.createWorkOrder('${escapeHtml(client.id)}')">+ Chem Sheet</button>` : ''}
        </div>
      </div>
    `;
  }

  renderRoutesList() {
    return this.renderRouteClients([], 'all', '');
  }

  renderClients() {
    const content = document.getElementById('main-content');
    const user = auth.getCurrentUser();
    const isAdmin = auth.isAdmin();
    const isMainAdmin = user && user.role === 'admin';

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
    const currentUser = auth.getCurrentUser();
    const isJetOrMark = !isAdmin && (currentUser?.username === 't9' || currentUser?.username === 't10');
    const canManageClients = isAdmin || isJetOrMark;
    const scopedClients = canManageClients
      ? allClients
      : allClients.filter(client => (client.technician || '') === (currentUser?.name || ''));

    const clients = (query
      ? scopedClients.filter(c =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.address.toLowerCase().includes(query.toLowerCase())
        )
      : scopedClients).slice().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

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
          ${canManageClients ? `<button class="btn btn-secondary btn-sm" onclick="router.editClient('${client.id}')">Edit</button>` : ''}
          ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deleteClient('${client.id}')">Delete</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  renderWorkOrders() {
    const content = document.getElementById('main-content');
    const isAdmin = auth.isAdmin();
    const canShare = auth.canShare();

    const completedWOs = (typeof getRepairOrders === 'function' ? getRepairOrders() : []).filter(o => (o.status || '').toLowerCase() === 'completed');

    content.innerHTML = `
      <div class="section-header">
        <div class="section-title">Work Orders</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="router.createWorkOrder()">+ New Chem Sheet</button>
          ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="renderRepairOrderForm()">+ Work Order</button>` : ''}
        </div>
      </div>

      ${isAdmin ? `
      <div class="card" style="margin: 0 16px 12px;">
        <div class="card-body">
          <div class="form-row" style="margin-bottom:0;">
            <label for="admin-job-status-filter">Filter jobs by status</label>
            <select id="admin-job-status-filter" onchange="router.setAdminJobStatusFilter(this.value)">
              <option value="all" ${this.adminJobStatusFilter === 'all' ? 'selected' : ''}>All jobs</option>
              <option value="pending" ${this.adminJobStatusFilter === 'pending' ? 'selected' : ''}>Pending / Open</option>
              <option value="completed" ${this.adminJobStatusFilter === 'completed' ? 'selected' : ''}>Completed only</option>
            </select>
          </div>
        </div>
      </div>
      ` : ''}

      ${isAdmin && completedWOs.length > 0 ? `
      <div class="card" style="margin: 0 16px 12px; border-left: 4px solid #4CAF50;">
        <div class="card-body">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="font-weight:600; font-size:15px;">✅ Completed Work Orders Ready</div>
              <div style="font-size:13px; color:#555; margin-top:2px;">${completedWOs.length} completed work order${completedWOs.length !== 1 ? 's' : ''} from Jet &amp; Mark available for download</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="exportCompletedToExcel()">📥 Bulk Download Excel</button>
          </div>
        </div>
      </div>
      ` : ''}

      ${isAdmin ? renderAdminDailyRouteSummary() : ''}

      <div class="section-header" style="margin-top:4px">
        <div class="section-title">Chem Sheets</div>
      </div>
      <div id="workorders-list">
        ${this.renderWorkOrdersList()}
      </div>

      <div class="section-header" style="margin-top:10px">
        <div class="section-title">Repair Work Orders</div>
      </div>

      <div class="card">
        <div class="card-body">
          ${renderRepairOrdersList(this.adminJobStatusFilter)}
        </div>
      </div>
    `;
  }

  renderWorkOrdersList() {
    const allWorkorders = db.get('workorders', []);
    const currentUser = auth.getCurrentUser();
    const isAdmin = auth.isAdmin();
    const canShare = auth.canShare();

    let workorders = (currentUser && currentUser.role === 'admin')
      ? allWorkorders
      : allWorkorders.filter(wo => userNamesMatch(wo.technician || '', currentUser.name));

    if (isAdmin) {
      workorders = this.applyStatusFilter(workorders);
    }

    if (workorders.length === 0) {
      if (isAdmin && this.adminJobStatusFilter === 'completed') return '';
      const emptyTitle = isAdmin && this.adminJobStatusFilter === 'pending'
        ? 'No pending or open jobs found'
        : 'No jobs found';

      return `
        <div class="empty-state">
          <div class="empty-icon">🧪</div>
          <div class="empty-title">${emptyTitle}</div>
          <div class="empty-subtitle">${isAdmin ? 'Try a different filter or create a new job' : 'Check back later for your assigned jobs'}</div>
        </div>
      `;
    }

    const sortedWorkorders = isAdmin
      ? sortOrdersByUpcomingDate(workorders)
      : [...workorders].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
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

  renderQuotes() {
    if (!auth.isAdmin()) { this.navigate('dashboard'); return; }
    const content = document.getElementById('main-content');
    const allEstimates = [...getEstimateSheets()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const sentQuotes     = allEstimates.filter(e => (e.status || '').toLowerCase() === 'sent');
    const approvedQuotes = allEstimates.filter(e => (e.status || '').toLowerCase() === 'approved');
    const clients = db.get('clients', []);

    const renderQuoteCard = (estimate, showConvert = false) => {
      const client = clients.find(c => c.id === estimate.clientId);
      const clientName = client?.name || estimate.clientName || 'Client';
      const total = formatEstimateMoney(estimate.total || estimate.subtotal || 0);
      return `
        <div class="job-card">
          <div class="job-card-header">
            <div>
              <div class="job-card-title">${escapeHtml(clientName)}</div>
              <div class="job-card-customer">${escapeHtml(estimate.project || 'Client Estimate')}</div>
              <div class="job-meta">
                <div class="job-meta-item">&#x1F9FE; ${escapeHtml(estimate.estimateNumber || 'Draft')}</div>
                <div class="job-meta-item">&#x1F4C5; ${escapeHtml(estimate.date || '')}</div>
                <div class="job-meta-item">&#x1F4B2; $${escapeHtml(total)}</div>
              </div>
            </div>
            <div class="badge badge-${getEstimateStatusBadgeClass(estimate.status)}">${escapeHtml(estimate.status || 'Draft')}</div>
          </div>
          ${estimate.scope ? `<div class="detail-row"><div class="detail-label">Scope</div><div class="detail-value">${escapeHtml(estimate.scope)}</div></div>` : ''}
          <div class="job-card-footer">
            <button class="btn btn-secondary btn-sm" onclick="router.viewEstimate('${escapeHtml(estimate.id)}')" >Open</button>
            <button class="btn btn-secondary btn-sm" onclick="saveEstimatePDF('${escapeHtml(estimate.id)}')">PDF</button>
            ${auth.canShare() ? `<button class="btn btn-primary btn-sm" onclick="shareEstimatePDF('${escapeHtml(estimate.id)}')">Share</button>` : ''}
            ${showConvert ? `<button class="btn btn-primary btn-sm" onclick="convertQuoteToWorkOrder('${escapeHtml(estimate.id)}')">Convert to WO</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="deleteEstimateSheet('${escapeHtml(estimate.id)}')">Delete</button>
          </div>
        </div>
      `;
    };

    content.innerHTML = `
      <div class="section-header">
        <div class="section-title">Quotes</div>
        <button class="btn btn-primary btn-sm" onclick="router.createEstimate()">+ Create Estimate</button>
      </div>

      <div class="section-header" style="margin-top:16px;">
        <div class="section-title" style="font-size:15px;">&#x1F4E4; Sent Quotes</div>
      </div>
      ${sentQuotes.length ? sentQuotes.map(e => renderQuoteCard(e)).join('') : `
        <div class="empty-state" style="margin:0 16px 16px; padding:16px;">
          <div class="empty-icon">&#x1F4E4;</div>
          <div class="empty-title">No sent quotes</div>
          <div class="empty-subtitle">Quotes will appear here after being shared with a client.</div>
        </div>`}

      <div class="section-header" style="margin-top:16px;">
        <div class="section-title" style="font-size:15px;">&#x2705; Approved Quotes</div>
      </div>
      ${approvedQuotes.length ? approvedQuotes.map(e => renderQuoteCard(e, true)).join('') : `
        <div class="empty-state" style="margin:0 16px 16px; padding:16px;">
          <div class="empty-icon">&#x2705;</div>
          <div class="empty-title">No approved quotes</div>
          <div class="empty-subtitle">Mark a quote as Approved and it will appear here ready to convert to a work order.</div>
        </div>`}
    `;
  }

  renderSettings() {
    const content = document.getElementById('main-content');
    const user = auth.getCurrentUser();
    const isAdmin = auth.isAdmin();
    const isMainAdmin = user && user.role === 'admin';
    const appLink = getSavedAppLink();
    const encodedAppLink = encodeURIComponent(appLink);

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

      <div class="card" style="margin-top: 10px;">
        <div class="card-body">
          <div style="font-weight:600; font-size:15px; margin-bottom:8px;">🔔 Notification Test</div>
          <p style="font-size:13px; color:var(--gray-600); margin-bottom:10px;">Send a visible test notification to this device for the current signed-in user.</p>
          <button class="btn btn-primary" onclick="sendTestNotification()" style="width: 100%;">Send Test Notification</button>
          <button class="btn btn-secondary" onclick="useThisDeviceForAlerts()" style="width: 100%; margin-top: 8px;">Use This Device For Alerts</button>
          <button class="btn btn-secondary" onclick="enablePhoneNotifications()" style="width: 100%; margin-top: 8px;">Enable Phone Notifications</button>
        </div>
      </div>

      ${isMainAdmin ? `
      <div class="section-header" style="margin-top: 20px;">
        <div class="section-title">Team Distribution</div>
      </div>
      <div class="card">
        <div class="card-body">
          <p style="font-size: 13px; color: var(--gray-600); margin-bottom: 12px;">
            To share the app with your team, copy the live link below or scan the QR code.
          </p>
          <div class="form-group" style="padding:0; margin-bottom:12px;">
            <label class="form-label">Live App Link</label>
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <input type="text" id="apk-link-input" class="form-control" placeholder="Paste your app link here..." value="${appLink}" style="flex:1; min-width:220px;">
              <button class="btn btn-secondary btn-sm" onclick="saveApkLink()">Save</button>
              <button class="btn btn-secondary btn-sm" onclick="useLatestAppLink()">Use Latest</button>
            </div>
          </div>

          <div id="qr-container" style="text-align: center; margin-top: 15px;">
            <div style="background: white; padding: 10px; display: inline-block; border-radius: 8px;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodedAppLink}" alt="Scan to Open">
            </div>
            <p style="font-size: 11px; margin-top: 8px; color: var(--champagne-dk);">Scan with technician phone to open the latest live app</p>
            <div style="margin-top: 12px; display: flex; justify-content: center; gap: 8px;">
              <input type="text" id="apk-link-display" class="form-control form-control-sm" value="${appLink}" readonly>
              <button class="btn btn-secondary btn-sm" onclick="copyApkLink()">Copy</button>
            </div>
            <div style="margin-top: 10px; display:flex; justify-content:center; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" onclick="shareAppLink()">Share Link</button>
            </div>
          </div>
        </div>
      </div>
      ` : ''}

      ${isMainAdmin ? `
      <div class="section-header" style="margin-top: 20px;">
        <div class="section-title">Export &amp; Billing</div>
      </div>
      <div class="card">
        <div class="card-body">
          <div style="font-weight:600; font-size:15px; margin-bottom:8px;">📋 Daily Work Orders</div>
          <p style="font-size:13px; color:var(--gray-600); margin-bottom:10px;">Download completed work orders for a specific date for billing.</p>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input type="date" id="wo-export-date" class="form-control" style="flex:1; min-width:140px;" value="${new Date().toISOString().split('T')[0]}">
            <button class="btn btn-primary" onclick="exportDailyWorkOrders()">📥 Download Work Orders</button>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:10px;">
        <div class="card-body">
          <div style="font-weight:600; font-size:15px; margin-bottom:8px;">🧪 Monthly Chem Sheets</div>
          <p style="font-size:13px; color:var(--gray-600); margin-bottom:10px;">Download all completed chem sheets for a specific month.</p>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <input type="month" id="chem-export-month" class="form-control" style="flex:1; min-width:140px;" value="${new Date().toISOString().slice(0, 7)}">
            <button class="btn btn-secondary" onclick="exportMonthlyChemSheets()">📥 Download Bulk Chem Sheets</button>
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
    const _woCurUser = auth.getCurrentUser();
    const _woIsAdmin = auth.isAdmin();
    const _woIsJetOrMark = !_woIsAdmin && (_woCurUser?.username === 't9' || _woCurUser?.username === 't10');
    const chemClientList = (_woIsAdmin || _woIsJetOrMark) ? clients : clients.filter(c => (c.technician || '') === (_woCurUser?.name || ''));
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
                ${chemClientList.map(client => `<option value="${client.id}" ${client.id === order.clientId ? 'selected' : ''}>${client.name}</option>`).join('')}
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
    const _ecUser = auth.getCurrentUser();
    const _ecIsAdmin = auth.isAdmin();
    const _ecIsJetOrMark = !_ecIsAdmin && (_ecUser?.username === 't9' || _ecUser?.username === 't10');
    if (!_ecIsAdmin && !_ecIsJetOrMark) {
      showToast('Only admins and office staff can edit client details');
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

    let y = await applyOasisPdfBranding(doc, 'Service Report', 'Luxury Pool & Watershape Design');

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

    await applyOasisPdfFooter(doc);
    sharePDF(doc, filename);
  }

}

const workOrderManager = new WorkOrderManager();

function rollOverPendingJobs() {
  const todayStr = new Date().toISOString().split('T')[0];
  let woUpdated = false;
  const workorders = db.get('workorders', []);
  
  workorders.forEach(wo => {
    if (wo.date && wo.date < todayStr && wo.status !== 'completed' && wo.status !== 'closed') {
      wo.date = todayStr;
      woUpdated = true;
    }
  });
  if (woUpdated) db.set('workorders', workorders);

  let roUpdated = false;
  const repairOrders = db.get('repairOrders', []);
  
  repairOrders.forEach(ro => {
    if (ro.date && ro.date < todayStr && ro.status !== 'completed' && ro.status !== 'Closed') {
      ro.date = todayStr;
      roUpdated = true;
    }
  });
  if (roUpdated) db.set('repairOrders', repairOrders);
}

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
      console.warn('Legacy work orders migration failed', error);
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
  const isCompleted = (status = '') => String(status || '').trim().toLowerCase() === 'completed';
  const sortByNewest = (items = []) => [...items].sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0));

  const completedChemSheets = sortByNewest(db.get('workorders', []).filter(wo => isCompleted(wo.status)));
  const completedRepairOrders = sortByNewest(getRepairOrders().filter(order => isCompleted(order.status)));

  if (completedChemSheets.length === 0 && completedRepairOrders.length === 0) {
    showToast('No completed chem sheets or work orders to export');
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

    const repairSheet = workbook.addWorksheet('Work Orders');
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
      repairSheet.addRow({ client: 'No completed work orders' });
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
    { name: "236 Sunshine Properties", address: "54 Galway Quay", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Abraham Burak", address: "Salt Creek, Yacht Drive", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Albert Schimdberger", address: "55 Elnathan Rd - Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Alexander McGarry", address: "2628 Bodden Town Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Alicia McGill", address: "84 Andrew Drive", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Alison Nolan", address: "129 Nelson Quay", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Amber Stewart", address: "Dolce Vita 4, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Andre Ogle", address: "87 The Avenue", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Andre Slabbert", address: "7 Victoria Dr., Snug Harbour.", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Andreas Haug", address: "359 North West Point Rd", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Andrew Muir", address: "318 Yacht Drive, Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Andy Albray", address: "17 The Deck House, Ritz Carlton Dr", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Andy Marcher", address: "234 Drake Quay, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Anthoney Reid", address: "88 Mallard Drive, Patricks Island", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Anu O'Driscoll", address: "23 Lalique Point", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Ash Lavine", address: "404 Orchid Drive", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Avata", address: "Coastal Escape - Omega Bay Estates", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Avata", address: "South Palms #1, Glen Eden Rd", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "172 Vienna Circle", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "67 On The Bay, Queens Highway, Michael Baulk", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Bcqs", address: "Caribbean Courts, (Th)", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Caribbean Paradise - South Sound, (Rw)", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Bcqs", address: "Hilton Estates #1 - Fairbanks Rd", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "Hilton Estates #2 - Fairbanks Rd", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "Indigo Bay, Shamrock Rd", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "L'Ambience #1, Fairbanks Rd, (Rw)", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Bcqs", address: "L'Ambience #2, Fairbanks Rd, (Rw)", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Bcqs", address: "Lakeland Villas #1, Old Crewe Rd, (Rw)", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Mangrove #1, (Rw)", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Bcqs", address: "Mangrove #2, (Rw)", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Bcqs", address: "Palm Heights Residence, (Rw)", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "Park View Courts, Phase 2, Spruce Lane", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Plymouth, Canal Point Dr", tech: "Service - Ariel", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Savannah Grand", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Shoreway Townhomes, Adonis Dr, (Mb)", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Snug Harbour Villas - Sung Harbour, (Rw)", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Snug Harbour Villas, Sung Harbour, (Rw)", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Bcqs", address: "Southern Skies, South Sound, (Rw)", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "The Bentley Crewe rd", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "The Palms At, Patricks Island, (Rw)", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Bcqs", address: "Venetia - South Sound", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Venetia, South Sound", tech: "Service - Kadeem", serviceDays: ["Thursday"] },
    { name: "Bernie Bako", address: "#4 Venetia.", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bert Thacker", address: "West Bay", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Bertrand Bagley", address: "91 El Nathan Drive", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Blair Ebanks", address: "71 Spurgeon Crescent - Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Boggy Sands Rd", address: "Sandy Lane Townhomes", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Brandon Caruana", address: "#9 Conch Point Villas", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Brandon Smith", address: "Victoria Villas", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Brian Lonergan", address: "18 Paradise Close", tech: "Service - Elvin", serviceDays: ["Monday"] },
    { name: "Britni Strong", address: "150 Parkway Dr.", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Caroline Moran", address: "197 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Chad Horwitz", address: "49 Calico Quay, Canal Point", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Charles Ebanks", address: "65 Bonnieview Av, Patricks Island", tech: "Service - Donald", serviceDays: ["Monday"] },
    { name: "Charles Motsinger", address: "124 Hillard, High Lands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Charmaine Richter", address: "40 Natures Circle, Beach Bay", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Chelsea Pederson", address: "131 Conch Point", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Chez Tschetter", address: "53 Marquise Quay", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Chris Turell", address: "127 Denham Thompson Way", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Cindy Conway", address: "#7 The Chimes", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Claudia Subiotto", address: "531 South Church Street", tech: "Service - Elvin", serviceDays: ["Friday"] },
    { name: "Clive Harris", address: "516 Crighton Drive, Crystal Harbour", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Coleen Martin", address: "122 Belaire Drive", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Colin Robinson", address: "130 Halkieth Rd", tech: "Service - Malik", serviceDays: ["Monday"] },
    { name: "Correy Williams", address: "16 Cypress Point, Crystal Harbour", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Cph Limited", address: "Paradise Sur Mar, Sand Cay Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Cph Limited", address: "Villa Mare, Vista Del Mar", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Craig Stewart", address: "88 Leeward Drive", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Csh Design Studios", address: "Dolce Vita 1, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Csh Design Studios", address: "Dolce Vita 2, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Csh Design Studios", address: "Dolce Vita 3, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "David Collins", address: "512 Yacht Dr", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "David Guilmette", address: "183 Crystal Drive", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "David Mullen", address: "23 Silver Thatch", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "David Wilson", address: "Boggy Sands", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Debbie Ebanks", address: "Fischers Reef 1482 Rum Point Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Declean Magennis", address: "62 Ithmar Circle", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Emile VanderBol", address: "694 South Sound", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Emily Evans", address: "The Beachcomber", tech: "Service - Kingsley", serviceDays: ["Friday", "Tuesday"] },
    { name: "Encompass", address: "3B Seahven, Roxborough Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Enrique Tasende", address: "65 Baccarat Quay, Safe", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Fin Strata", address: "Fin South Church Street", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Fin Strata", address: "Inity Ridge - Prospect Point Rd, Angus Davison", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Fin Strata", address: "South Church Street, Gear, #25/35 Hot tub service", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Francia Lloyd", address: "30 Soto Lane", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Francois Du Toit", address: "115 Jennifer Drive, Snug Harbour", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Gareth thacker", address: "9 The Venetia", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Gary Gibbs", address: "306 Yacht Club dr., Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Gcpsl", address: "1124 Rum Point Dr, North Pointe", tech: "Service - Malik", serviceDays: ["Monday"] },
    { name: "Gcpsl", address: "54 Crighton Dr, Crystal Harbor, Mala Malde", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Ncb", address: "Coral Bay Village", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Ncb", address: "Coral Bay Village, Shamrock Rd", tech: "Service - Donald", serviceDays: ["Monday"] },
    { name: "Ncb", address: "Gypsy 1514 Rum Point Dr", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Kai Vista, Rum Point Dr", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Mystic Retreat 1, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Ncb", address: "Mystic Retreat 2, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Ncb", address: "Mystic Retreat 3, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Ncb", address: "Mystic Retreat 4, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Gcpsl", address: "Point Of View, Property", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Gcpsl", address: "Point Of View, South Sound", tech: "Service - Elvin", serviceDays: ["Friday"] },
    { name: "Alice - Lom", address: "Queens Highway, Bella Rocca", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Rip Kai, Rum Point Drive", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Hitchcock", address: "Sea 2 Infinity, Kiabo", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Sea View, South Church Street, (Aw)", tech: "Service - Kadeem", serviceDays: ["Friday", "Tuesday"] },
    { name: "Ncb", address: "Sunrays, Sand Cay Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Gcpsl", address: "The Sands, Boggy Sand Rd", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Gcpsl", address: "Turtle Breeze, Conch Point Rd", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Gcpsl", address: "Twin Palms, Rum Point Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Gcpsl Phillip Cadien", address: "312 Cypres Point", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "George McKenzie", address: "534 Rum Point Dr.", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Glen Kennedy", address: "Salt Creek, Yatch Club", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Grecia Iuculano", address: "133 Magellan Quay", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Greg Melehov", address: "16 Galway Quay", tech: "Service - Kingsley", serviceDays: ["Thursday"] },
    { name: "Greg Swart", address: "182 Prospect Point Rd", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Guy Cowan", address: "74 Shorecrest", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Guy Locke", address: "1326 South Sound", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Guy Manning", address: "Diamonds Edge, Safe Haven", tech: "Service - Kingsley", serviceDays: ["Wednesday"] },
    { name: "Gwenda Ebanks", address: "Silver Sands", tech: "Service - Ariel", serviceDays: ["Friday", "Monday", "Wednesday"] },
    { name: "Habte Skale", address: "32 Trevor Close", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Harbor walk Strata", address: "Harbor Walk", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Haroon Pandhoie", address: "24 Chariot Dr", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Harry Tee", address: "438 Water Cay Rd", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Hesham Sida", address: "824 Seaview Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Hugo Munoz", address: "171 Leeward Dr", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Iman Shafiei", address: "53 Baquarat Quay, Safe Haven", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Izzy Akdeniz", address: "105 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jack Leeland", address: "120 Oleander Dr", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Jackie Murphy", address: "110 The lakes", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Jaime-Lee Eccles", address: "176 Conch Dr, The Boulevard", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "James Mendes", address: "106 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "James O'Brien", address: "102 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "James Reeve", address: "215 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Jaron Goldberg", address: "52 Parklands Close", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Jason Butcher", address: "44 Grand Estates, Grand Harbour", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Jay Easterbrook", address: "33 Cocoplum", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Jean Mean", address: "211 Sea Spray Dr.", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "107 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "109 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "123 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "Cayman Coves, South Church Street", tech: "Service - Kadeem", serviceDays: ["Thursday", "Tuesday"] },
    { name: "Jec", address: "Ocean Pointe Villas", tech: "Service - Jermaine", serviceDays: ["Friday", "Monday"] },
    { name: "Jec", address: "Regant Court, Brittania", tech: "Service - Kingsley", serviceDays: ["Thursday", "Tuesday"] },
    { name: "Jec", address: "Saphire, Nwp Rd", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "Solara Main Pool / Spa", tech: "Service - Kingsley", serviceDays: ["Thursday", "Tuesday"] },
    { name: "Jec", address: "Sunset Point Condos, North West Point Rd", tech: "Service - Ace", serviceDays: ["Friday", "Tuesday"] },
    { name: "Jec", address: "Vivi Townhomes, 275 Fairbanks Rd", tech: "Service - Kadeem", serviceDays: ["Friday", "Monday"] },
    { name: "Jenna Wong", address: "59 Shorecrest Circle", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Jennifer Bodden", address: "25 Ryan Road", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Jenny Frizzle", address: "302 Windswept Drive, Patricks Island", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Jessica Wright", address: "55 Edgmere Circle", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Jim Brannon", address: "87 Royal Palms Drive", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Jim Owen", address: "229 Andrew Dr, Sung Harbour", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Joanna Robson", address: "27 Teal Island", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Joanne Akdeniz", address: "42 Hoya Quay, Crystal Harbor", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Jodie O'Mahony", address: "12 El Nathan - Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Johann Prinslo", address: "270 Jennifer Dr.", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "John Corallo", address: "3A Seahven, Roxborough Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "John Ferarri", address: "30 Orchid Drive, Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Jon Brosnihan", address: "#6 Shorewinds Trail", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Jordan Constable", address: "60 Philip Crescent", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Joseph Hurlston", address: "42 Monumnet Rd.", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Joyce Follows", address: "35 Jacaranda Ct", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Julie O'Hara", address: "56 Grand Estates Grand Harbour", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Juliett Austin", address: "134 Abbey Way", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Kadi Pentney", address: "Kings Court", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Kahlill Strachan", address: "27 Jump Link", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Kate Ye", address: "17 Cypres Point", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Kenny Rankin", address: "Cascade Drive", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Kent Nickerson", address: "Yatch Club., Salt Creek", tech: "Service - Kingsley", serviceDays: ["Wednesday"] },
    { name: "Kimpton Splash Pad", address: "Kimpton Seafire", tech: "Service - Ariel", serviceDays: ["Friday", "Monday", "Saturday", "Thursday", "Tuesday", "Wednesday"] },
    { name: "Kirsten Buttenhoff", address: "Seas the day, South Sound", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Kuavo", address: "Grand Palmyra", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Kuavo", address: "Grapetree Condos", tech: "Service - Malik", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo", address: "Moon Bay, Shamrock Rd", tech: "Service - Malik", serviceDays: ["Monday", "Thursday"] },
    { name: "Kuavo", address: "Ocean Reach., Old Crewe Rd", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Kuavo", address: "One Canal Point, Gym Pool", tech: "Service - Kingsley", serviceDays: ["Friday"] },
    { name: "Kuavo", address: "One Canal Point, Gym Pool Chem Check", tech: "Service - Kingsley", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "One Canal Point, Main Pool And Spa", tech: "Service - Kingsley", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo", address: "One Canal Point, Main Pool And Spa - Chem Check", tech: "Service - Kingsley", serviceDays: ["Wednesday"] },
    { name: "Kuavo", address: "Periwinkle: Pool/Spa, Edgewater Way Full Service", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo", address: "Pleasant View Appartments", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "Poinsettia", tech: "Service - Kingsley", serviceDays: ["Friday", "Monday", "Wednesday"] },
    { name: "Kuavo", address: "South Bay Estates, Bel Air Dr", tech: "Service - Elvin", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "South Bay Residence, Bel Air Dr", tech: "Service - Elvin", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "South Shore, Shamrock Rd", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo - Barry Yetton", address: "13 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Denise Hooks", address: "12 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - James Kattan", address: "5 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Jozef Vogel", address: "10 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Manuale Lupu", address: "9 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - November Capitol", address: "16 One Canal Point", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Kuavo - Sam Shalaby", address: "11 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Stacey Ottenbreit", address: "7 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Vernon Flynn", address: "15 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Wesley Cullum", address: "8 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Laura Egglishaw", address: "94 Park Side Close", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Laura Redman", address: "45 Yates Drive", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Lexi Pappadakis", address: "110 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Loreen Stewart", address: "29 Galaxy Way", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Malcom Swift", address: "Miramar Vista Del Mar - Yatch Club", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Manuela Lupu", address: "103 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Marcia Milgate", address: "34 Newhaven", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Marcia Milgate", address: "95 Prince Charles Quay", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Margaret Fantasia", address: "526 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Mark Vandevelde", address: "Salt Creek, Yatch Club", tech: "Service - Ariel", serviceDays: ["Friday", "Wednesday"] },
    { name: "Marlon Bispath", address: "519 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Max Jones", address: "Cocoloba Condos", tech: "Service - Elvin", serviceDays: ["Friday"] },
    { name: "Mehdi Khosrow-Pour", address: "610 South Sound Rd", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Merryl Jackson", address: "535 Canal Point Dr", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Michael Bascina", address: "13 Victoria Dr", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Michelle Bryan", address: "65 Fairview Road", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Mike Gibbs", address: "78 Grand Estates- Grand Harbour", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Mike Kornegay", address: "40 Palm Island Circle", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Mike Stroh", address: "64 Waterford Quay, Safe Haven", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Mitchell Demeter", address: "19 Whirlaway Close, Patricks Island", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Mitzi Callan", address: "Morganville Condos", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Mr Holland", address: "107 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Mr Kelly and Mrs Kahn", address: "112 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Nicholas Gargaro", address: "538 South Sound Rd", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Nicholas Lynn", address: "28 Sandlewood Crescent", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Nigel Daily", address: "183 Andrew Drive", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Nikki Harris", address: "213 olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Nina Irani", address: "Casa Oasis, Boggy Sands", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Ocean Vista Strata", address: "Ocean Vista", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Olea Main Pool", address: "Minerva Way", tech: "Service - Kingsley", serviceDays: ["Friday"] },
    { name: "Olea Main Pool", address: "Minerva way", tech: "Service - Kingsley", serviceDays: ["Saturday", "Thursday", "Tuesday", "Wednesday"] },
    { name: "Olea Main Pool", address: "Olea, Minerva Way", tech: "Service - Kingsley", serviceDays: ["Monday"] },
    { name: "Paolo Pollini", address: "16 Stewart Ln", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Patricia Conroy", address: "58 Anne Bonney Crescent", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Paul Reynolds", address: "424 Prospect Point Rd", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Paul Rowan", address: "265 Sea Spray Dr.", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Paul Skinner", address: "50 Orchid Drive", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Peter Goddard", address: "Brittania Kings Court", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Peter Watler", address: "952 Seaview Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Philip Smyres", address: "#7 Conch Point Villas", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Plum", address: "Mandalay, Seven Mile", tech: "Service - Jermaine", serviceDays: ["Friday", "Monday"] },
    { name: "Prasanna Ketheeswaran", address: "46 Captian Currys Rd.", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Quentin Creegan", address: "Villa Aramone 472 South Sound Rd", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Randal Martin", address: "151 Shorecrest Circle", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Raoul Pal", address: "93 Marry read crescent", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Reg Williams", address: "Cliff House, 2702 Austin Connolly", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Rem", address: "49 Mary Read Crescent, Jeey Bomford", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Rem", address: "Sunrise Phase 3, Old Crewe Rd", tech: "Service - Kadeem", serviceDays: ["Friday", "Tuesday"] },
    { name: "Rena Streker", address: "1354 South Sound", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Rich Merlo", address: "276 Yacht Club Drive", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Rick Gorter", address: "33 Shoreview Point", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Rick Gorter", address: "70 Shoreview Point", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Riyaz Norrudin", address: "63 Langton Way, The Lakes", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Robert Morrison", address: "265 Jennifer Dr", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Roland Stewart", address: "Kimpton Seafire", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Romell El Madhani", address: "117 Crystal Dr", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Rory Andrews", address: "44 Country Road, Savannah", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Ross Fortune", address: "90 Prince Charles-Govenors Harbour.", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Safe Harbor strata #48", address: "Safe Harbor Condos", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Sandra Tobin", address: "108 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Sarah Dobbyn-Thomson", address: "441 Water Cay Rd", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Scott Hughes", address: "111 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Scott Somerville", address: "2078 Rum Point Rd.", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Scott Somerville", address: "40 Dunlop Dr", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Scott Somerville", address: "40 Orchid Drive, Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Shelly Do Vale", address: "47 Marbel Drive", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Simon Palmer", address: "Olivias Cove, Govenors Harbour", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Sina Mirzale", address: "353 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Stef Dimitrio", address: "266 Raleigh Quay", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Stefan Marenzi", address: "Old Danube, 316 Water Cay Rd", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Stephen Leontsinis", address: "1340 South Sound", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Steve Daker", address: "33 Spurgeon Cr., Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Steven Joyce", address: "199 Crystal Drive", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Steven Manning", address: "61 Shoreline Dr", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Stewart Donald", address: "72 Conch Drive", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Strata #536", address: "Valencia Heights", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Strata #70", address: "171 Boggy Sands rd", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Suzanne Bothwell", address: "227 Smith Road", tech: "Service - Kadeem", serviceDays: ["Monday"] },
    { name: "Suzanne Correy", address: "394 Canal Point Rd.", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "The Colonial Club", address: "The Colonial Club", tech: "Service - Malik", serviceDays: ["Friday", "Tuesday"] },
    { name: "Thomas Ponessa", address: "450 Prospect Point Rd", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Tim Bradley", address: "66 Baquarat Quay, Safe Haven", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Tim Dailyey", address: "177/179 North Webster Dr", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Tom Balon", address: "37 Teal Island", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Tom Newton", address: "304 South Sound", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Tom Wye", address: "800 South Sound", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Tracey Kline", address: "108 Roxborough dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Tracey Kline", address: "108 Roxborough dr", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Victoria Wheaton", address: "36 Whitehall Gardens", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Vlad Aldea", address: "474 Yacht Club Dr., Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Walker Romanica", address: "79 Riley Circle, Newlands", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "William Jackman", address: "221 Crystal Dr", tech: "Service - Kingsley", serviceDays: ["Thursday"] },
    { name: "Zoe Foster", address: "47 Latana Way", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] }

  ];
  const existingClients = db.get('clients', []);
  // Migrate existing stored technician names to new prefix format
  const _techNameRemap = {
    'Ace': 'Service - Ace', 'Ariel': 'Service - Ariel', 'Donald': 'Service - Donald',
    'Elvin': 'Service - Elvin', 'Jermaine': 'Service - Jermaine', 'Kadeem': 'Service - Kadeem',
    'Kingsley': 'Service - Kingsley', 'Malik': 'Service - Malik',
    'Jet': 'Tech - Jet', 'Mark': 'Tech - Mark'
  };
  existingClients.forEach(c => { if (c.technician && _techNameRemap[c.technician]) c.technician = _techNameRemap[c.technician]; });

    const mergedClients = [...existingClients];

  clients.forEach(c => {
    const existingIdx = mergedClients.findIndex(
      e => e.address === c.address && e.technician === c.tech
    );
    if (existingIdx >= 0) {
      // Update name and serviceDays so master data corrections take effect
      mergedClients[existingIdx].name = c.name;
      mergedClients[existingIdx].serviceDays = c.serviceDays;
    } else {
      mergedClients.push({
        id: `c_${Math.random().toString(36).substr(2, 9)}`,
        name: c.name,
        address: c.address,
        technician: c.tech,
        serviceDays: c.serviceDays
      });
    }
  });

  db.set('clients', mergedClients);
  db.set('masterScheduleLoaded', true);
}

function populateLoginTechOptions() {
  const select = document.getElementById('login-tech');
  if (!select) return;
  // If the HTML already has options populated (hardcoded in index.html), skip to avoid jump
  if (select.options.length > 1) return;

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
  // Always force login screen on startup
  auth.logout();
  db.startRealtimeSync();

  cleanupTestClients();
  // Data version check: if version changed, wipe & reseed all master-schedule clients
  if (db.get('dataVersion') !== DATA_VERSION) {
    const existingClients = db.get('clients', []);
    // Master schedule clients have ids starting with 'c_'; user-created use 'c' + timestamp
    const userClients = existingClients.filter(c => !String(c.id || '').startsWith('c_'));
    db.set('clients', userClients);
    db.set('masterScheduleLoaded', false);
    db.set('dataVersion', DATA_VERSION);
  } else {
    db.set('masterScheduleLoaded', false);
  }
  initMasterSchedule();
  migrateLegacyRepairData();
  rollOverPendingJobs();
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
      initializePushNotificationsForUser().catch(() => {});
      const loginScreen = document.getElementById('login-screen');
      const appShell = document.getElementById('app');

      if (loginError) loginError.style.display = 'none';
      curtainTransition(() => {
        if (loginScreen) loginScreen.style.setProperty('display', 'none', 'important');
        if (appShell) {
          appShell.classList.remove('hidden');
          appShell.style.setProperty('display', 'flex', 'important');
        }
        try { router.navigate('dashboard'); } catch (err) { location.reload(); }
      });
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

// Dark curtain transition — prevents white flash between login and app
function curtainTransition(callback, duration = 320) {
  const curtain = document.getElementById('transition-curtain');
  if (!curtain) { callback(); return; }
  curtain.classList.add('active');
  setTimeout(() => {
    callback();
    requestAnimationFrame(() => requestAnimationFrame(() => curtain.classList.remove('active')));
  }, duration / 2);
}

function signOut() {
  curtainTransition(() => {
    auth.logout();
    const appShell = document.getElementById('app');
    const loginScreen = document.getElementById('login-screen');
    if (appShell) { appShell.classList.add('hidden'); appShell.style.display = 'none'; }
    if (loginScreen) { loginScreen.style.display = 'flex'; }
    router.navigate('dashboard');
  });
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
    technician: canonicalUserName(getValue('wo-tech', order.technician || auth.getCurrentUser()?.name || '')),
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
  workOrderManager.saveOrder(order);
  router.navigate('workorders');
  showToast(order.status === 'completed'
    ? 'Completed chem sheet saved for admin export'
    : 'Chem sheet saved');
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

function getRepairOrders() {
  return db.get('repairOrders', []);
}

function saveRepairOrders(orders) {
  db.set('repairOrders', orders);
}

function getWorkOrderAssigneeOptions() {
  const preferredUsernames = ['t9', 't10'];
  const officeAssignees = preferredUsernames
    .map(username => auth.users?.[username]?.name)
    .filter(Boolean);
  const adminAssignees = getAdminNames();
  const assignees = [...new Set([...officeAssignees, ...adminAssignees])];

  return assignees.length ? assignees : [...new Set([...getTechnicianNames(), ...adminAssignees])];
}

function isOfficeWorkOrderAssignee(name = '') {
  return ['Tech - Jet', 'Tech - Mark', ...getAdminNames()].some(candidate => userNamesMatch(name, candidate));
}

function getRepairClientDisplay(client = {}) {
  const name = String(client.name || '').trim();
  const address = String(client.address || '').trim();
  return address ? `${name} — ${address}` : name;
}

function findClientByRepairSearch(searchValue = '', clients = db.get('clients', [])) {
  const term = String(searchValue || '').trim().toLowerCase();
  if (!term) return null;

  const exactDisplayMatch = clients.find(client => getRepairClientDisplay(client).toLowerCase() === term);
  if (exactDisplayMatch) return exactDisplayMatch;

  const exactNameMatch = clients.find(client => String(client.name || '').trim().toLowerCase() === term);
  if (exactNameMatch) return exactNameMatch;

  return null;
}

function sortOrdersByUpcomingDate(items = []) {
  const todayKey = new Date().toISOString().split('T')[0];

  return [...items].sort((a, b) => {
    const aDate = String(a?.date || '');
    const bDate = String(b?.date || '');
    const aUpcoming = aDate >= todayKey;
    const bUpcoming = bDate >= todayKey;

    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    if (aDate !== bDate) return aDate.localeCompare(bDate);

    return String(a?.clientName || '').localeCompare(String(b?.clientName || ''));
  });
}

function renderAdminDailyRouteSummary() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const clients = db.get('clients', []).filter(client =>
    Array.isArray(client.serviceDays) && client.serviceDays.includes(today)
  );

  if (!clients.length) {
    return `
      <div class="card" style="margin: 0 16px 12px;">
        <div class="card-body">
          <div style="font-weight:600; font-size:14px; margin-bottom:4px;">Daily Chem Sheets by Route</div>
          <div style="font-size:12px; color:#666;">No route clients are scheduled for ${escapeHtml(today)}.</div>
        </div>
      </div>
    `;
  }

  const grouped = clients.reduce((acc, client) => {
    const key = client.technician || 'Unassigned Route';
    if (!acc[key]) acc[key] = [];
    acc[key].push(client);
    return acc;
  }, {});

  const techBlocks = Object.entries(grouped)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([techName, techClients]) => {
      const preview = techClients.slice(0, 3).map(item => item.name).join(', ');
      const extraCount = techClients.length > 3 ? ` +${techClients.length - 3} more` : '';
      return `
        <div class="detail-row" style="align-items:flex-start;">
          <div>
            <div class="detail-value" style="text-align:left; font-weight:700;">${escapeHtml(techName)}</div>
            <div class="detail-label" style="margin-top:3px; max-width:230px;">${escapeHtml(preview)}${escapeHtml(extraCount)}</div>
          </div>
          <span class="badge badge-in-progress">${techClients.length} route ${techClients.length === 1 ? 'stop' : 'stops'}</span>
        </div>
      `;
    }).join('');

  return `
    <div class="card" style="margin: 0 16px 12px;">
      <div class="card-body">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
          <div style="font-weight:600; font-size:14px;">Daily Chem Sheets by Route</div>
          <button class="btn btn-secondary btn-sm" onclick="router.navigate('routes')">Open Routes</button>
        </div>
        <div style="font-size:12px; color:#666; margin-bottom:6px;">${escapeHtml(today)} route schedule grouped by technician.</div>
        ${techBlocks}
      </div>
    </div>
  `;
}

function renderRepairOrdersList(statusFilter = 'all') {
  const allOrders = getRepairOrders();
  const currentUser = auth.getCurrentUser();
  const isAdmin = auth.isAdmin();
  const canShare = auth.canShare();

  let orders = (currentUser && currentUser.role === 'admin')
    ? allOrders
    : allOrders.filter(o => userNamesMatch(o.assignedTo || '', currentUser.name));

  if (isAdmin) {
    if (statusFilter === 'completed') {
      orders = orders.filter(order => (order.status || '').toLowerCase() === 'completed');
    } else if (statusFilter === 'pending') {
      orders = orders.filter(order => (order.status || '').toLowerCase() !== 'completed');
    }
  }

  if (!orders.length) {
    if (isAdmin && statusFilter === 'completed') return '';
    const emptyTitle = isAdmin && statusFilter === 'pending'
      ? 'No pending or open work orders'
      : 'No repair work orders';

    return `
      <div class="empty-state">
        <div class="empty-icon">🛠️</div>
        <div class="empty-title">${emptyTitle}</div>
        <div class="empty-subtitle">${isAdmin ? 'Try a different filter or create a work order' : 'Create one to manage service jobs in the same app'}</div>
      </div>
    `;
  }

  const sortedOrders = isAdmin
    ? sortOrdersByUpcomingDate(orders)
    : [...orders].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return sortedOrders.map(order => `
    <div class="job-card" style="margin-bottom:12px;">
      <div class="job-card-header">
        <div>
          <div class="job-card-title">${escapeHtml(order.clientName || 'Work Order')}</div>
          <div class="job-card-customer">${escapeHtml(order.jobType || 'Work Order')}</div>
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
  const assigneeOptions = getWorkOrderAssigneeOptions();
  const currentAssignee = normalizeTechnicianName((draftOrder || existing)?.assignedTo || auth.getCurrentUser()?.name || assigneeOptions[0] || '');
  const selectedClientId = (draftOrder || existing)?.clientId || presetClientId || '';
  const selectedClient = clients.find(client => client.id === selectedClientId) || null;
  const selectedClientDisplay = selectedClient
    ? getRepairClientDisplay(selectedClient)
    : (((draftOrder || existing)?.clientName || '') && ((draftOrder || existing)?.address || '')
      ? `${(draftOrder || existing).clientName} — ${(draftOrder || existing).address}`
      : ((draftOrder || existing)?.clientName || ''));
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
        <div id="repair-bar-title" class="wo-bar-title">${order.clientName || 'Work Order'}</div>
        <button class="btn btn-primary btn-sm" onclick="saveRepairWorkOrder('${activeOrderId}')">Save</button>
      </div>

      <div class="wo-sec">
        <div class="wo-sec-hd" onclick="toggleAccordion(this)">
          <span>Customer & Job Details</span>
          <span class="wo-chev">▼</span>
        </div>
        <div class="wo-sec-bd" data-active-repair-id="${activeOrderId}">
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
  const select = document.getElementById('repair-client');
  const address = document.getElementById('repair-address');
  const title = document.getElementById('repair-bar-title');
  if (!select || !address) return;

  const client = db.get('clients', []).find(item => item.id === select.value);
  if (client) {
    address.value = client.address || '';
    if (title) title.textContent = client.name || 'Work Order';
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

  const orders = getRepairOrders();
  const index = orders.findIndex(item => item.id === order.id);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }

  saveRepairOrders(orders);
  showToast(order.status === 'completed'
    ? 'Completed work order saved for admin export'
    : 'Work order saved');

  if (shareAfterSave) {
    shareRepairPDF(order.id);
    return;
  }

  router.renderWorkOrders();
}

function getImageDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
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

  let y = await applyOasisPdfBranding(doc, 'Repair Work Order', 'Luxury Pool & Watershape Design');

  const gridY_start = y + 5;
  let gridY = gridY_start;
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

  await applyOasisPdfFooter(doc);
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
  showToast('Work order deleted');
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
              ${clients.map(client => `<option value="${escapeHtml(client.id)}" ${client.id === selectedClientId ? 'selected' : ''}>${escapeHtml(client.name)}</option>`).join('')}
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

  router.navigate('quotes');
}

function deleteEstimateSheet(estimateId) {
  if (!auth.isAdmin()) {
    showToast('Only admins can delete estimates');
    return;
  }
  if (!confirm('Delete this estimate sheet?')) return;
  saveEstimateSheets(getEstimateSheets().filter(item => item.id !== estimateId));
  showToast('Estimate deleted');
  router.navigate('quotes');
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
  let y = await applyOasisPdfBranding(doc, 'Client Estimate', 'Luxury Pool & Watershape Service');

  const ensureSpace = async (needed = 16) => {
    if (y + needed > 265) {
      await applyOasisPdfFooter(doc);
      doc.addPage();
      y = await applyOasisPdfBranding(doc, 'Client Estimate', 'Luxury Pool & Watershape Service');
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

  await ensureSpace(20);
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

  await ensureSpace(28);
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
    await ensureSpace(20);
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

  await ensureSpace(20);
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

  await applyOasisPdfFooter(doc);

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
    showToast('Work order not found');
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

async function applyOasisPdfBranding(doc, title, subtitle = 'LUXURY POOL & WATERSHAPE DESIGN') {
  const navy = [13, 43, 69];
  const gold = [201, 168, 124];
  const white = [255, 255, 255];

  // Transparent logo — dark pixels stripped via canvas pixel processing
  const logoData = await getImageDataUrl('oasis-logo.png');

  // Full navy header band
  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 32, 'F');
  // Gold rule at bottom of header
  doc.setFillColor(...gold);
  doc.rect(0, 32, 210, 1, 'F');

  // Logo — lighten-composited JPEG, dark bg becomes navy
  if (logoData) {
    doc.addImage(logoData, 'PNG', 9, 3, 20, 20);
  }

  // OASIS wordmark — gold, italic (not bold), spaced letters
  doc.setTextColor(...gold);
  doc.setFont('times', 'italic');
  doc.setCharSpace(4);
  doc.setFontSize(12);
  doc.text('OASIS', logoData ? 32 : 12, 26);
  doc.setCharSpace(0);

  // Thin vertical gold separator
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.3);
  doc.line(62, 4, 62, 29);

  // Document title — white, right of separator
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...white);
  doc.text(title.toUpperCase(), 198, 14, { align: 'right' });

  // Subtitle — gold
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...gold);
  doc.text(subtitle.toUpperCase(), 198, 21, { align: 'right' });

  // Date — light gray
  doc.setFontSize(6.5);
  doc.setTextColor(180, 180, 180);
  doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), 198, 28, { align: 'right' });

  return 42;
}

async function applyOasisPdfFooter(doc) {
  const navy = [13, 43, 69];
  const gold = [201, 168, 124];
  const white = [255, 255, 255];
  const y = 274;

  // Transparent logo — dark pixels stripped via canvas pixel processing
  const logoData = await getImageDataUrl('oasis-logo.png');

  // Full navy footer band
  doc.setFillColor(...navy);
  doc.rect(0, y, 210, 23, 'F');
  // Gold rule at top of footer
  doc.setFillColor(...gold);
  doc.rect(0, y, 210, 0.8, 'F');

  // Logo — lighten-composited JPEG, dark bg becomes navy
  if (logoData) {
    doc.addImage(logoData, 'PNG', 10, y + 5, 12, 12);
  }

  // OASIS wordmark — gold, italic (not bold)
  doc.setTextColor(...gold);
  doc.setFont('times', 'italic');
  doc.setCharSpace(3.5);
  doc.setFontSize(9);
  doc.text('OASIS', logoData ? 25 : 10, y + 13);
  doc.setCharSpace(0);

  // Tagline
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(180, 180, 180);
  doc.text('Luxury Pool & Watershape Design, Construction & Maintenance', logoData ? 25 : 10, y + 18);

  // Contact info right — white
  doc.setTextColor(...white);
  doc.setFontSize(7);
  doc.text('Harbour Walk, 2nd Floor — Grand Cayman', 198, y + 8, { align: 'right' });
  doc.text('+1 345-945-7665  ·  oasis.ky', 198, y + 13, { align: 'right' });
  doc.text(`Generated ${new Date().toLocaleDateString()}`, 198, y + 18, { align: 'right' });
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
      showToast('Work order not found');
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
    showToast('Work order not found');
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

async function exportCompletedToExcel() {
  const isCompleted = (status = '') => String(status || '').trim().toLowerCase() === 'completed';
  const sortByNewest = (items = []) => [...items].sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0));

  const completedChemSheets = sortByNewest(db.get('workorders', []).filter(wo => isCompleted(wo.status)));
  const completedRepairOrders = sortByNewest(getRepairOrders().filter(order => isCompleted(order.status)));

  if (completedChemSheets.length === 0 && completedRepairOrders.length === 0) {
    showToast('No completed chem sheets or work orders to export');
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

    const repairSheet = workbook.addWorksheet('Work Orders');
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
      repairSheet.addRow({ client: 'No completed work orders' });
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
    { name: "236 Sunshine Properties", address: "54 Galway Quay", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Abraham Burak", address: "Salt Creek, Yacht Drive", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Albert Schimdberger", address: "55 Elnathan Rd - Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Alexander McGarry", address: "2628 Bodden Town Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Alicia McGill", address: "84 Andrew Drive", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Alison Nolan", address: "129 Nelson Quay", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Amber Stewart", address: "Dolce Vita 4, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Andre Ogle", address: "87 The Avenue", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Andre Slabbert", address: "7 Victoria Dr., Snug Harbour.", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Andreas Haug", address: "359 North West Point Rd", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Andrew Muir", address: "318 Yacht Drive, Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Andy Albray", address: "17 The Deck House, Ritz Carlton Dr", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Andy Marcher", address: "234 Drake Quay, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Anthoney Reid", address: "88 Mallard Drive, Patricks Island", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Anu O'Driscoll", address: "23 Lalique Point", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Ash Lavine", address: "404 Orchid Drive", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Avata", address: "Coastal Escape - Omega Bay Estates", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Avata", address: "South Palms #1, Glen Eden Rd", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "172 Vienna Circle", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "67 On The Bay, Queens Highway, Michael Baulk", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Bcqs", address: "Caribbean Courts, (Th)", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Caribbean Paradise - South Sound, (Rw)", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Bcqs", address: "Hilton Estates #1 - Fairbanks Rd", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "Hilton Estates #2 - Fairbanks Rd", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "Indigo Bay, Shamrock Rd", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "L'Ambience #1, Fairbanks Rd, (Rw)", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Bcqs", address: "L'Ambience #2, Fairbanks Rd, (Rw)", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Bcqs", address: "Lakeland Villas #1, Old Crewe Rd, (Rw)", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Mangrove #1, (Rw)", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Bcqs", address: "Mangrove #2, (Rw)", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Bcqs", address: "Palm Heights Residence, (Rw)", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "Park View Courts, Phase 2, Spruce Lane", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Plymouth, Canal Point Dr", tech: "Service - Ariel", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Savannah Grand", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Shoreway Townhomes, Adonis Dr, (Mb)", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Snug Harbour Villas - Sung Harbour, (Rw)", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Snug Harbour Villas, Sung Harbour, (Rw)", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Bcqs", address: "Southern Skies, South Sound, (Rw)", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "The Bentley Crewe rd", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "The Palms At, Patricks Island, (Rw)", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Bcqs", address: "Venetia - South Sound", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Venetia, South Sound", tech: "Service - Kadeem", serviceDays: ["Thursday"] },
    { name: "Bernie Bako", address: "#4 Venetia.", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bert Thacker", address: "West Bay", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Bertrand Bagley", address: "91 El Nathan Drive", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Blair Ebanks", address: "71 Spurgeon Crescent - Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Boggy Sands Rd", address: "Sandy Lane Townhomes", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Brandon Caruana", address: "#9 Conch Point Villas", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Brandon Smith", address: "Victoria Villas", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Brian Lonergan", address: "18 Paradise Close", tech: "Service - Elvin", serviceDays: ["Monday"] },
    { name: "Britni Strong", address: "150 Parkway Dr.", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Caroline Moran", address: "197 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Chad Horwitz", address: "49 Calico Quay, Canal Point", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Charles Ebanks", address: "65 Bonnieview Av, Patricks Island", tech: "Service - Donald", serviceDays: ["Monday"] },
    { name: "Charles Motsinger", address: "124 Hillard, High Lands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Charmaine Richter", address: "40 Natures Circle, Beach Bay", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Chelsea Pederson", address: "131 Conch Point", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Chez Tschetter", address: "53 Marquise Quay", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Chris Turell", address: "127 Denham Thompson Way", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Cindy Conway", address: "#7 The Chimes", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Claudia Subiotto", address: "531 South Church Street", tech: "Service - Elvin", serviceDays: ["Friday"] },
    { name: "Clive Harris", address: "516 Crighton Drive, Crystal Harbour", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Coleen Martin", address: "122 Belaire Drive", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Colin Robinson", address: "130 Halkieth Rd", tech: "Service - Malik", serviceDays: ["Monday"] },
    { name: "Correy Williams", address: "16 Cypress Point, Crystal Harbour", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Cph Limited", address: "Paradise Sur Mar, Sand Cay Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Cph Limited", address: "Villa Mare, Vista Del Mar", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Craig Stewart", address: "88 Leeward Drive", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Csh Design Studios", address: "Dolce Vita 1, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Csh Design Studios", address: "Dolce Vita 2, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Csh Design Studios", address: "Dolce Vita 3, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "David Collins", address: "512 Yacht Dr", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "David Guilmette", address: "183 Crystal Drive", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "David Mullen", address: "23 Silver Thatch", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "David Wilson", address: "Boggy Sands", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Debbie Ebanks", address: "Fischers Reef 1482 Rum Point Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Declean Magennis", address: "62 Ithmar Circle", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Emile VanderBol", address: "694 South Sound", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Emily Evans", address: "The Beachcomber", tech: "Service - Kingsley", serviceDays: ["Friday", "Tuesday"] },
    { name: "Encompass", address: "3B Seahven, Roxborough Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Enrique Tasende", address: "65 Baccarat Quay, Safe", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Fin Strata", address: "Fin South Church Street", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Fin Strata", address: "Inity Ridge - Prospect Point Rd, Angus Davison", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Fin Strata", address: "South Church Street, Gear, #25/35 Hot tub service", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Francia Lloyd", address: "30 Soto Lane", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Francois Du Toit", address: "115 Jennifer Drive, Snug Harbour", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Gareth thacker", address: "9 The Venetia", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Gary Gibbs", address: "306 Yacht Club dr., Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Gcpsl", address: "1124 Rum Point Dr, North Pointe", tech: "Service - Malik", serviceDays: ["Monday"] },
    { name: "Gcpsl", address: "54 Crighton Dr, Crystal Harbor, Mala Malde", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Ncb", address: "Coral Bay Village", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Ncb", address: "Coral Bay Village, Shamrock Rd", tech: "Service - Donald", serviceDays: ["Monday"] },
    { name: "Ncb", address: "Gypsy 1514 Rum Point Dr", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Kai Vista, Rum Point Dr", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Mystic Retreat 1, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Ncb", address: "Mystic Retreat 2, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Ncb", address: "Mystic Retreat 3, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Ncb", address: "Mystic Retreat 4, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Gcpsl", address: "Point Of View, Property", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Gcpsl", address: "Point Of View, South Sound", tech: "Service - Elvin", serviceDays: ["Friday"] },
    { name: "Alice - Lom", address: "Queens Highway, Bella Rocca", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Rip Kai, Rum Point Drive", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Hitchcock", address: "Sea 2 Infinity, Kiabo", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Sea View, South Church Street, (Aw)", tech: "Service - Kadeem", serviceDays: ["Friday", "Tuesday"] },
    { name: "Ncb", address: "Sunrays, Sand Cay Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Gcpsl", address: "The Sands, Boggy Sand Rd", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Gcpsl", address: "Turtle Breeze, Conch Point Rd", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Gcpsl", address: "Twin Palms, Rum Point Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Gcpsl Phillip Cadien", address: "312 Cypres Point", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "George McKenzie", address: "534 Rum Point Dr.", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Glen Kennedy", address: "Salt Creek, Yatch Club", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Grecia Iuculano", address: "133 Magellan Quay", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Greg Melehov", address: "16 Galway Quay", tech: "Service - Kingsley", serviceDays: ["Thursday"] },
    { name: "Greg Swart", address: "182 Prospect Point Rd", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Guy Cowan", address: "74 Shorecrest", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Guy Locke", address: "1326 South Sound", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Guy Manning", address: "Diamonds Edge, Safe Haven", tech: "Service - Kingsley", serviceDays: ["Wednesday"] },
    { name: "Gwenda Ebanks", address: "Silver Sands", tech: "Service - Ariel", serviceDays: ["Friday", "Monday", "Wednesday"] },
    { name: "Habte Skale", address: "32 Trevor Close", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Harbor walk Strata", address: "Harbor Walk", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Haroon Pandhoie", address: "24 Chariot Dr", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Harry Tee", address: "438 Water Cay Rd", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Hesham Sida", address: "824 Seaview Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Hugo Munoz", address: "171 Leeward Dr", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Iman Shafiei", address: "53 Baquarat Quay, Safe Haven", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Izzy Akdeniz", address: "105 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jack Leeland", address: "120 Oleander Dr", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Jackie Murphy", address: "110 The lakes", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Jaime-Lee Eccles", address: "176 Conch Dr, The Boulevard", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "James Mendes", address: "106 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "James O'Brien", address: "102 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "James Reeve", address: "215 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Jaron Goldberg", address: "52 Parklands Close", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Jason Butcher", address: "44 Grand Estates, Grand Harbour", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Jay Easterbrook", address: "33 Cocoplum", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Jean Mean", address: "211 Sea Spray Dr.", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "107 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "109 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "123 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "Cayman Coves, South Church Street", tech: "Service - Kadeem", serviceDays: ["Thursday", "Tuesday"] },
    { name: "Jec", address: "Ocean Pointe Villas", tech: "Service - Jermaine", serviceDays: ["Friday", "Monday"] },
    { name: "Jec", address: "Regant Court, Brittania", tech: "Service - Kingsley", serviceDays: ["Thursday", "Tuesday"] },
    { name: "Jec", address: "Saphire, Nwp Rd", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "Solara Main Pool / Spa", tech: "Service - Kingsley", serviceDays: ["Thursday", "Tuesday"] },
    { name: "Jec", address: "Sunset Point Condos, North West Point Rd", tech: "Service - Ace", serviceDays: ["Friday", "Tuesday"] },
    { name: "Jec", address: "Vivi Townhomes, 275 Fairbanks Rd", tech: "Service - Kadeem", serviceDays: ["Friday", "Monday"] },
    { name: "Jenna Wong", address: "59 Shorecrest Circle", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Jennifer Bodden", address: "25 Ryan Road", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Jenny Frizzle", address: "302 Windswept Drive, Patricks Island", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Jessica Wright", address: "55 Edgmere Circle", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Jim Brannon", address: "87 Royal Palms Drive", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Jim Owen", address: "229 Andrew Dr, Sung Harbour", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Joanna Robson", address: "27 Teal Island", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Joanne Akdeniz", address: "42 Hoya Quay, Crystal Harbor", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Jodie O'Mahony", address: "12 El Nathan - Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Johann Prinslo", address: "270 Jennifer Dr.", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "John Corallo", address: "3A Seahven, Roxborough Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "John Ferarri", address: "30 Orchid Drive, Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Jon Brosnihan", address: "#6 Shorewinds Trail", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Jordan Constable", address: "60 Philip Crescent", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Joseph Hurlston", address: "42 Monumnet Rd.", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Joyce Follows", address: "35 Jacaranda Ct", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Julie O'Hara", address: "56 Grand Estates Grand Harbour", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Juliett Austin", address: "134 Abbey Way", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Kadi Pentney", address: "Kings Court", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Kahlill Strachan", address: "27 Jump Link", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Kate Ye", address: "17 Cypres Point", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Kenny Rankin", address: "Cascade Drive", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Kent Nickerson", address: "Yatch Club., Salt Creek", tech: "Service - Kingsley", serviceDays: ["Wednesday"] },
    { name: "Kimpton Splash Pad", address: "Kimpton Seafire", tech: "Service - Ariel", serviceDays: ["Friday", "Monday", "Saturday", "Thursday", "Tuesday", "Wednesday"] },
    { name: "Kirsten Buttenhoff", address: "Seas the day, South Sound", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Kuavo", address: "Grand Palmyra", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Kuavo", address: "Grapetree Condos", tech: "Service - Malik", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo", address: "Moon Bay, Shamrock Rd", tech: "Service - Malik", serviceDays: ["Monday", "Thursday"] },
    { name: "Kuavo", address: "Ocean Reach., Old Crewe Rd", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Kuavo", address: "One Canal Point, Gym Pool", tech: "Service - Kingsley", serviceDays: ["Friday"] },
    { name: "Kuavo", address: "One Canal Point, Gym Pool Chem Check", tech: "Service - Kingsley", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "One Canal Point, Main Pool And Spa", tech: "Service - Kingsley", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo", address: "One Canal Point, Main Pool And Spa - Chem Check", tech: "Service - Kingsley", serviceDays: ["Wednesday"] },
    { name: "Kuavo", address: "Periwinkle: Pool/Spa, Edgewater Way Full Service", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo", address: "Pleasant View Appartments", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "Poinsettia", tech: "Service - Kingsley", serviceDays: ["Friday", "Monday", "Wednesday"] },
    { name: "Kuavo", address: "South Bay Estates, Bel Air Dr", tech: "Service - Elvin", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "South Bay Residence, Bel Air Dr", tech: "Service - Elvin", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "South Shore, Shamrock Rd", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo - Barry Yetton", address: "13 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Denise Hooks", address: "12 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - James Kattan", address: "5 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Jozef Vogel", address: "10 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Manuale Lupu", address: "9 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - November Capitol", address: "16 One Canal Point", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Kuavo - Sam Shalaby", address: "11 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Stacey Ottenbreit", address: "7 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Vernon Flynn", address: "15 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Wesley Cullum", address: "8 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Laura Egglishaw", address: "94 Park Side Close", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Laura Redman", address: "45 Yates Drive", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Lexi Pappadakis", address: "110 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Loreen Stewart", address: "29 Galaxy Way", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Malcom Swift", address: "Miramar Vista Del Mar - Yatch Club", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Manuela Lupu", address: "103 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Marcia Milgate", address: "34 Newhaven", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Marcia Milgate", address: "95 Prince Charles Quay", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Margaret Fantasia", address: "526 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Mark Vandevelde", address: "Salt Creek, Yatch Club", tech: "Service - Ariel", serviceDays: ["Friday", "Wednesday"] },
    { name: "Marlon Bispath", address: "519 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Max Jones", address: "Cocoloba Condos", tech: "Service - Elvin", serviceDays: ["Friday"] },
    { name: "Mehdi Khosrow-Pour", address: "610 South Sound Rd", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Merryl Jackson", address: "535 Canal Point Dr", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Michael Bascina", address: "13 Victoria Dr", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Michelle Bryan", address: "65 Fairview Road", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Mike Gibbs", address: "78 Grand Estates- Grand Harbour", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Mike Kornegay", address: "40 Palm Island Circle", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Mike Stroh", address: "64 Waterford Quay, Safe Haven", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Mitchell Demeter", address: "19 Whirlaway Close, Patricks Island", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Mitzi Callan", address: "Morganville Condos", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Mr Holland", address: "107 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Mr Kelly and Mrs Kahn", address: "112 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Nicholas Gargaro", address: "538 South Sound Rd", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Nicholas Lynn", address: "28 Sandlewood Crescent", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Nigel Daily", address: "183 Andrew Drive", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Nikki Harris", address: "213 olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Nina Irani", address: "Casa Oasis, Boggy Sands", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Ocean Vista Strata", address: "Ocean Vista", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Olea Main Pool", address: "Minerva Way", tech: "Service - Kingsley", serviceDays: ["Friday"] },
    { name: "Olea Main Pool", address: "Minerva way", tech: "Service - Kingsley", serviceDays: ["Saturday", "Thursday", "Tuesday", "Wednesday"] },
    { name: "Olea Main Pool", address: "Olea, Minerva Way", tech: "Service - Kingsley", serviceDays: ["Monday"] },
    { name: "Paolo Pollini", address: "16 Stewart Ln", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Patricia Conroy", address: "58 Anne Bonney Crescent", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Paul Reynolds", address: "424 Prospect Point Rd", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Paul Rowan", address: "265 Sea Spray Dr.", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Paul Skinner", address: "50 Orchid Drive", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Peter Goddard", address: "Brittania Kings Court", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Peter Watler", address: "952 Seaview Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Philip Smyres", address: "#7 Conch Point Villas", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Plum", address: "Mandalay, Seven Mile", tech: "Service - Jermaine", serviceDays: ["Friday", "Monday"] },
    { name: "Prasanna Ketheeswaran", address: "46 Captian Currys Rd.", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Quentin Creegan", address: "Villa Aramone 472 South Sound Rd", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Randal Martin", address: "151 Shorecrest Circle", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Raoul Pal", address: "93 Marry read crescent", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Reg Williams", address: "Cliff House, 2702 Austin Connolly", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Rem", address: "49 Mary Read Crescent, Jeey Bomford", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Rem", address: "Sunrise Phase 3, Old Crewe Rd", tech: "Service - Kadeem", serviceDays: ["Friday", "Tuesday"] },
    { name: "Rena Streker", address: "1354 South Sound", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Rich Merlo", address: "276 Yacht Club Drive", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Rick Gorter", address: "33 Shoreview Point", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Rick Gorter", address: "70 Shoreview Point", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Riyaz Norrudin", address: "63 Langton Way, The Lakes", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Robert Morrison", address: "265 Jennifer Dr", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Roland Stewart", address: "Kimpton Seafire", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Romell El Madhani", address: "117 Crystal Dr", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Rory Andrews", address: "44 Country Road, Savannah", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Ross Fortune", address: "90 Prince Charles-Govenors Harbour.", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Safe Harbor strata #48", address: "Safe Harbor Condos", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Sandra Tobin", address: "108 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Sarah Dobbyn-Thomson", address: "441 Water Cay Rd", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Scott Hughes", address: "111 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Scott Somerville", address: "2078 Rum Point Rd.", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Scott Somerville", address: "40 Dunlop Dr", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Scott Somerville", address: "40 Orchid Drive, Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Shelly Do Vale", address: "47 Marbel Drive", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Simon Palmer", address: "Olivias Cove, Govenors Harbour", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Sina Mirzale", address: "353 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Stef Dimitrio", address: "266 Raleigh Quay", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Stefan Marenzi", address: "Old Danube, 316 Water Cay Rd", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Stephen Leontsinis", address: "1340 South Sound", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Steve Daker", address: "33 Spurgeon Cr., Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Steven Joyce", address: "199 Crystal Drive", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Steven Manning", address: "61 Shoreline Dr", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Stewart Donald", address: "72 Conch Drive", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Strata #536", address: "Valencia Heights", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Strata #70", address: "171 Boggy Sands rd", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Suzanne Bothwell", address: "227 Smith Road", tech: "Service - Kadeem", serviceDays: ["Monday"] },
    { name: "Suzanne Correy", address: "394 Canal Point Rd.", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "The Colonial Club", address: "The Colonial Club", tech: "Service - Malik", serviceDays: ["Friday", "Tuesday"] },
    { name: "Thomas Ponessa", address: "450 Prospect Point Rd", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Tim Bradley", address: "66 Baquarat Quay, Safe Haven", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Tim Dailyey", address: "177/179 North Webster Dr", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Tom Balon", address: "37 Teal Island", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Tom Newton", address: "304 South Sound", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Tom Wye", address: "800 South Sound", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Tracey Kline", address: "108 Roxborough dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Tracey Kline", address: "108 Roxborough dr", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Victoria Wheaton", address: "36 Whitehall Gardens", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Vlad Aldea", address: "474 Yacht Club Dr., Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Walker Romanica", address: "79 Riley Circle, Newlands", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "William Jackman", address: "221 Crystal Dr", tech: "Service - Kingsley", serviceDays: ["Thursday"] },
    { name: "Zoe Foster", address: "47 Latana Way", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] }

  ];
  const existingClients = db.get('clients', []);
  const mergedClients = [...existingClients];

  clients.forEach(c => {
    const existingIdx = mergedClients.findIndex(
      e => e.address === c.address && e.technician === c.tech
    );
    if (existingIdx >= 0) {
      // Update name and serviceDays so master data corrections take effect
      mergedClients[existingIdx].name = c.name;
      mergedClients[existingIdx].serviceDays = c.serviceDays;
    } else {
      mergedClients.push({
        id: `c_${Math.random().toString(36).substr(2, 9)}`,
        name: c.name,
        address: c.address,
        technician: c.tech,
        serviceDays: c.serviceDays
      });
    }
  });

  db.set('clients', mergedClients);
  db.set('masterScheduleLoaded', true);
}

function populateLoginTechOptions() {
  const select = document.getElementById('login-tech');
  if (!select) return;
  // If the HTML already has options populated (hardcoded in index.html), skip to avoid jump
  if (select.options.length > 1) return;

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
  // Always force login screen on startup
  auth.logout();
  db.startRealtimeSync();

  cleanupTestClients();
  // Data version check: if version changed, wipe & reseed all master-schedule clients
  if (db.get('dataVersion') !== DATA_VERSION) {
    const existingClients = db.get('clients', []);
    // Master schedule clients have ids starting with 'c_'; user-created use 'c' + timestamp
    const userClients = existingClients.filter(c => !String(c.id || '').startsWith('c_'));
    db.set('clients', userClients);
    db.set('masterScheduleLoaded', false);
    db.set('dataVersion', DATA_VERSION);
  } else {
    db.set('masterScheduleLoaded', false);
  }
  initMasterSchedule();
  migrateLegacyRepairData();
  rollOverPendingJobs();
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
      initializePushNotificationsForUser().catch(() => {});
      const loginScreen = document.getElementById('login-screen');
      const appShell = document.getElementById('app');

      if (loginError) loginError.style.display = 'none';
      curtainTransition(() => {
        if (loginScreen) loginScreen.style.setProperty('display', 'none', 'important');
        if (appShell) {
          appShell.classList.remove('hidden');
          appShell.style.setProperty('display', 'flex', 'important');
        }
        try { router.navigate('dashboard'); } catch (err) { location.reload(); }
      });
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
  curtainTransition(() => {
    auth.logout();
    const appShell = document.getElementById('app');
    const loginScreen = document.getElementById('login-screen');
    if (appShell) { appShell.classList.add('hidden'); appShell.style.display = 'none'; }
    if (loginScreen) { loginScreen.style.display = 'flex'; }
    router.navigate('dashboard');
  });
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
  workOrderManager.saveOrder(order);
  router.navigate('workorders');
  showToast(order.status === 'completed'
    ? 'Completed chem sheet saved for admin export'
    : 'Chem sheet saved');
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

  let orders = (currentUser && currentUser.role === 'admin')
    ? allOrders
    : allOrders.filter(o => userNamesMatch(o.assignedTo || '', currentUser.name));

  if (isAdmin) {
    if (statusFilter === 'completed') {
      orders = orders.filter(order => (order.status || '').toLowerCase() === 'completed');
    } else if (statusFilter === 'pending') {
      orders = orders.filter(order => (order.status || '').toLowerCase() !== 'completed');
    }
  }

  if (!orders.length) {
    if (isAdmin && statusFilter === 'completed') return '';
    const emptyTitle = isAdmin && statusFilter === 'pending'
      ? 'No pending or open work orders'
      : 'No repair work orders';

    return `
      <div class="empty-state">
        <div class="empty-icon">🛠️</div>
        <div class="empty-title">${emptyTitle}</div>
        <div class="empty-subtitle">${isAdmin ? 'Try a different filter or create a work order' : 'Create one to manage service jobs in the same app'}</div>
      </div>
    `;
  }

  return [...orders].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).map(order => `
    <div class="job-card" style="margin-bottom:12px;">
      <div class="job-card-header">
        <div>
          <div class="job-card-title">${escapeHtml(order.clientName || 'Work Order')}</div>
          <div class="job-card-customer">${escapeHtml(order.jobType || 'Work Order')}</div>
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
  const assigneeOptions = getWorkOrderAssigneeOptions();
  const currentAssignee = normalizeTechnicianName((draftOrder || existing)?.assignedTo || auth.getCurrentUser()?.name || assigneeOptions[0] || '');
  const selectedClientId = (draftOrder || existing)?.clientId || presetClientId || '';
  const selectedClient = clients.find(client => client.id === selectedClientId) || null;
  const selectedClientDisplay = selectedClient
    ? getRepairClientDisplay(selectedClient)
    : (((draftOrder || existing)?.clientName || '') && ((draftOrder || existing)?.address || '')
      ? `${(draftOrder || existing).clientName} — ${(draftOrder || existing).address}`
      : ((draftOrder || existing)?.clientName || ''));
  const order = draftOrder || existing || {
    id: orderId || `r${Date.now()}`,
    clientId: presetClientId,
    clientName: '',
    address: '',
    date: new Date().toISOString().split('T')[0],
    time: '',
    timeIn: '',
    timeOut: '',
    assignedTo: currentAssignee,
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
        <div id="repair-bar-title" class="wo-bar-title">${order.clientName || 'Work Order'}</div>
        <button class="btn btn-primary btn-sm" onclick="saveRepairWorkOrder('${activeOrderId}')">Save</button>
      </div>

      <div class="wo-sec">
        <div class="wo-sec-hd" onclick="toggleAccordion(this)">
          <span>Customer & Job Details</span>
          <span class="wo-chev">▼</span>
        </div>
        <div class="wo-sec-bd" data-active-repair-id="${activeOrderId}">
          <div class="form-row">
            <label for="repair-client-search">Client (Search)</label>
            <input id="repair-client-search" type="text" list="repair-client-options" value="${escapeHtml(selectedClientDisplay)}" oninput="onRepairClientChange()" placeholder="Type client name or address">
            <datalist id="repair-client-options">
              ${clients.map(client => `<option value="${escapeHtml(getRepairClientDisplay(client))}"></option>`).join('')}
            </datalist>
            <input id="repair-client" type="hidden" value="${escapeHtml(selectedClientId)}">
            <div style="margin-top:8px;">
              <button class="btn btn-secondary btn-sm" type="button" onclick="quickAddClientFromWorkOrder()">+ New Client</button>
            </div>
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
                ${assigneeOptions
                  .map(name => `<option value="${name}" ${userNamesMatch(name, currentAssignee) ? 'selected' : ''}>${name}</option>`).join('')}
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
  const searchInput = document.getElementById('repair-client-search');
  const hiddenClientId = document.getElementById('repair-client');
  const address = document.getElementById('repair-address');
  const title = document.getElementById('repair-bar-title');
  if (!searchInput || !address) return;

  const clients = db.get('clients', []);
  const client = findClientByRepairSearch(searchInput.value, clients);
  if (client) {
    if (hiddenClientId) hiddenClientId.value = client.id;
    searchInput.value = getRepairClientDisplay(client);
    address.value = client.address || '';
    if (title) title.textContent = client.name || 'Work Order';
    return;
  }

  if (hiddenClientId) hiddenClientId.value = '';
  if (title) title.textContent = (searchInput.value || 'Work Order').split(' — ')[0];
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
  const typedClient = (document.getElementById('repair-client-search')?.value || '').trim();
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
    clientName: client?.name || typedClient.split(' — ')[0] || existing?.clientName || 'Unassigned Client',
    address: document.getElementById('repair-address')?.value || '',
    date: document.getElementById('repair-date')?.value || '',
    time: timeIn,
    timeIn,
    timeOut,
    assignedTo: normalizeTechnicianName(document.getElementById('repair-tech')?.value || ''),
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

  const orders = getRepairOrders();
  const index = orders.findIndex(item => item.id === order.id);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }

  saveRepairOrders(orders);
  showToast(order.status === 'completed'
    ? 'Completed work order saved for admin export'
    : 'Work order saved');

  if (shareAfterSave) {
    shareRepairPDF(order.id);
    return;
  }

  router.renderWorkOrders();
}

function getImageDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
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

  let y = await applyOasisPdfBranding(doc, 'Repair Work Order', 'Luxury Pool & Watershape Design');

  const gridY_start = y + 5;
  let gridY = gridY_start;
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

  await applyOasisPdfFooter(doc);
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
      showToast('Work order not found');
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
    showToast('Work order not found');
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

async function exportCompletedToExcel() {
  const isCompleted = (status = '') => String(status || '').trim().toLowerCase() === 'completed';
  const sortByNewest = (items = []) => [...items].sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0));

  const completedChemSheets = sortByNewest(db.get('workorders', []).filter(wo => isCompleted(wo.status)));
  const completedRepairOrders = sortByNewest(getRepairOrders().filter(order => isCompleted(order.status)));

  if (completedChemSheets.length === 0 && completedRepairOrders.length === 0) {
    showToast('No completed chem sheets or work orders to export');
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

    const repairSheet = workbook.addWorksheet('Work Orders');
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
      repairSheet.addRow({ client: 'No completed work orders' });
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
    { name: "236 Sunshine Properties", address: "54 Galway Quay", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Abraham Burak", address: "Salt Creek, Yacht Drive", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Albert Schimdberger", address: "55 Elnathan Rd - Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Alexander McGarry", address: "2628 Bodden Town Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Alicia McGill", address: "84 Andrew Drive", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Alison Nolan", address: "129 Nelson Quay", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Amber Stewart", address: "Dolce Vita 4, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Andre Ogle", address: "87 The Avenue", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Andre Slabbert", address: "7 Victoria Dr., Snug Harbour.", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Andreas Haug", address: "359 North West Point Rd", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Andrew Muir", address: "318 Yacht Drive, Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Andy Albray", address: "17 The Deck House, Ritz Carlton Dr", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Andy Marcher", address: "234 Drake Quay, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Anthoney Reid", address: "88 Mallard Drive, Patricks Island", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Anu O'Driscoll", address: "23 Lalique Point", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Ash Lavine", address: "404 Orchid Drive", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Avata", address: "Coastal Escape - Omega Bay Estates", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Avata", address: "South Palms #1, Glen Eden Rd", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "172 Vienna Circle", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "67 On The Bay, Queens Highway, Michael Baulk", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Bcqs", address: "Caribbean Courts, (Th)", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Caribbean Paradise - South Sound, (Rw)", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Bcqs", address: "Hilton Estates #1 - Fairbanks Rd", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "Hilton Estates #2 - Fairbanks Rd", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "Indigo Bay, Shamrock Rd", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "L'Ambience #1, Fairbanks Rd, (Rw)", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Bcqs", address: "L'Ambience #2, Fairbanks Rd, (Rw)", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Bcqs", address: "Lakeland Villas #1, Old Crewe Rd, (Rw)", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Mangrove #1, (Rw)", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Bcqs", address: "Mangrove #2, (Rw)", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Bcqs", address: "Palm Heights Residence, (Rw)", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Bcqs", address: "Park View Courts, Phase 2, Spruce Lane", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Plymouth, Canal Point Dr", tech: "Service - Ariel", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Savannah Grand", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "Shoreway Townhomes, Adonis Dr, (Mb)", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Snug Harbour Villas - Sung Harbour, (Rw)", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Snug Harbour Villas, Sung Harbour, (Rw)", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Bcqs", address: "Southern Skies, South Sound, (Rw)", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Bcqs", address: "The Bentley Crewe rd", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "The Palms At, Patricks Island, (Rw)", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Bcqs", address: "Venetia - South Sound", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bcqs", address: "Venetia, South Sound", tech: "Service - Kadeem", serviceDays: ["Thursday"] },
    { name: "Bernie Bako", address: "#4 Venetia.", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Bert Thacker", address: "West Bay", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Bertrand Bagley", address: "91 El Nathan Drive", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Blair Ebanks", address: "71 Spurgeon Crescent - Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Boggy Sands Rd", address: "Sandy Lane Townhomes", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Brandon Caruana", address: "#9 Conch Point Villas", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Brandon Smith", address: "Victoria Villas", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Brian Lonergan", address: "18 Paradise Close", tech: "Service - Elvin", serviceDays: ["Monday"] },
    { name: "Britni Strong", address: "150 Parkway Dr.", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Caroline Moran", address: "197 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Chad Horwitz", address: "49 Calico Quay, Canal Point", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Charles Ebanks", address: "65 Bonnieview Av, Patricks Island", tech: "Service - Donald", serviceDays: ["Monday"] },
    { name: "Charles Motsinger", address: "124 Hillard, High Lands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Charmaine Richter", address: "40 Natures Circle, Beach Bay", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Chelsea Pederson", address: "131 Conch Point", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Chez Tschetter", address: "53 Marquise Quay", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Chris Turell", address: "127 Denham Thompson Way", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Cindy Conway", address: "#7 The Chimes", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Claudia Subiotto", address: "531 South Church Street", tech: "Service - Elvin", serviceDays: ["Friday"] },
    { name: "Clive Harris", address: "516 Crighton Drive, Crystal Harbour", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Coleen Martin", address: "122 Belaire Drive", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Colin Robinson", address: "130 Halkieth Rd", tech: "Service - Malik", serviceDays: ["Monday"] },
    { name: "Correy Williams", address: "16 Cypress Point, Crystal Harbour", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Cph Limited", address: "Paradise Sur Mar, Sand Cay Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Cph Limited", address: "Villa Mare, Vista Del Mar", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Craig Stewart", address: "88 Leeward Drive", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Csh Design Studios", address: "Dolce Vita 1, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Csh Design Studios", address: "Dolce Vita 2, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Csh Design Studios", address: "Dolce Vita 3, Govenors Harbour", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "David Collins", address: "512 Yacht Dr", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "David Guilmette", address: "183 Crystal Drive", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "David Mullen", address: "23 Silver Thatch", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "David Wilson", address: "Boggy Sands", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Debbie Ebanks", address: "Fischers Reef 1482 Rum Point Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Declean Magennis", address: "62 Ithmar Circle", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Emile VanderBol", address: "694 South Sound", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Emily Evans", address: "The Beachcomber", tech: "Service - Kingsley", serviceDays: ["Friday", "Tuesday"] },
    { name: "Encompass", address: "3B Seahven, Roxborough Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Enrique Tasende", address: "65 Baccarat Quay, Safe", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Fin Strata", address: "Fin South Church Street", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Fin Strata", address: "Inity Ridge - Prospect Point Rd, Angus Davison", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Fin Strata", address: "South Church Street, Gear, #25/35 Hot tub service", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] },
    { name: "Francia Lloyd", address: "30 Soto Lane", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Francois Du Toit", address: "115 Jennifer Drive, Snug Harbour", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Gareth thacker", address: "9 The Venetia", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Gary Gibbs", address: "306 Yacht Club dr., Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Gcpsl", address: "1124 Rum Point Dr, North Pointe", tech: "Service - Malik", serviceDays: ["Monday"] },
    { name: "Gcpsl", address: "54 Crighton Dr, Crystal Harbor, Mala Malde", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Ncb", address: "Coral Bay Village", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Ncb", address: "Coral Bay Village, Shamrock Rd", tech: "Service - Donald", serviceDays: ["Monday"] },
    { name: "Ncb", address: "Gypsy 1514 Rum Point Dr", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Kai Vista, Rum Point Dr", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Mystic Retreat 1, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Ncb", address: "Mystic Retreat 2, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Ncb", address: "Mystic Retreat 3, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Ncb", address: "Mystic Retreat 4, John Greer Boulavard", tech: "Service - Kadeem", serviceDays: ["Monday", "Thursday"] },
    { name: "Gcpsl", address: "Point Of View, Property", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Gcpsl", address: "Point Of View, South Sound", tech: "Service - Elvin", serviceDays: ["Friday"] },
    { name: "Alice - Lom", address: "Queens Highway, Bella Rocca", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Rip Kai, Rum Point Drive", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Hitchcock", address: "Sea 2 Infinity, Kiabo", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Ncb", address: "Sea View, South Church Street, (Aw)", tech: "Service - Kadeem", serviceDays: ["Friday", "Tuesday"] },
    { name: "Ncb", address: "Sunrays, Sand Cay Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Gcpsl", address: "The Sands, Boggy Sand Rd", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Gcpsl", address: "Turtle Breeze, Conch Point Rd", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Gcpsl", address: "Twin Palms, Rum Point Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Gcpsl Phillip Cadien", address: "312 Cypres Point", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "George McKenzie", address: "534 Rum Point Dr.", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Glen Kennedy", address: "Salt Creek, Yatch Club", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Grecia Iuculano", address: "133 Magellan Quay", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Greg Melehov", address: "16 Galway Quay", tech: "Service - Kingsley", serviceDays: ["Thursday"] },
    { name: "Greg Swart", address: "182 Prospect Point Rd", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Guy Cowan", address: "74 Shorecrest", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Guy Locke", address: "1326 South Sound", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Guy Manning", address: "Diamonds Edge, Safe Haven", tech: "Service - Kingsley", serviceDays: ["Wednesday"] },
    { name: "Gwenda Ebanks", address: "Silver Sands", tech: "Service - Ariel", serviceDays: ["Friday", "Monday", "Wednesday"] },
    { name: "Habte Skale", address: "32 Trevor Close", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Harbor walk Strata", address: "Harbor Walk", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Haroon Pandhoie", address: "24 Chariot Dr", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Harry Tee", address: "438 Water Cay Rd", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Hesham Sida", address: "824 Seaview Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Hugo Munoz", address: "171 Leeward Dr", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Iman Shafiei", address: "53 Baquarat Quay, Safe Haven", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Izzy Akdeniz", address: "105 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jack Leeland", address: "120 Oleander Dr", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Jackie Murphy", address: "110 The lakes", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Jaime-Lee Eccles", address: "176 Conch Dr, The Boulevard", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "James Mendes", address: "106 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "James O'Brien", address: "102 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "James Reeve", address: "215 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Jaron Goldberg", address: "52 Parklands Close", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Jason Butcher", address: "44 Grand Estates, Grand Harbour", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Jay Easterbrook", address: "33 Cocoplum", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Jean Mean", address: "211 Sea Spray Dr.", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "107 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "109 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "123 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "Cayman Coves, South Church Street", tech: "Service - Kadeem", serviceDays: ["Thursday", "Tuesday"] },
    { name: "Jec", address: "Ocean Pointe Villas", tech: "Service - Jermaine", serviceDays: ["Friday", "Monday"] },
    { name: "Jec", address: "Regant Court, Brittania", tech: "Service - Kingsley", serviceDays: ["Thursday", "Tuesday"] },
    { name: "Jec", address: "Saphire, Nwp Rd", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Jec", address: "Solara Main Pool / Spa", tech: "Service - Kingsley", serviceDays: ["Thursday", "Tuesday"] },
    { name: "Jec", address: "Sunset Point Condos, North West Point Rd", tech: "Service - Ace", serviceDays: ["Friday", "Tuesday"] },
    { name: "Jec", address: "Vivi Townhomes, 275 Fairbanks Rd", tech: "Service - Kadeem", serviceDays: ["Friday", "Monday"] },
    { name: "Jenna Wong", address: "59 Shorecrest Circle", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Jennifer Bodden", address: "25 Ryan Road", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Jenny Frizzle", address: "302 Windswept Drive, Patricks Island", tech: "Service - Donald", serviceDays: ["Friday"] },
    { name: "Jessica Wright", address: "55 Edgmere Circle", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Jim Brannon", address: "87 Royal Palms Drive", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Jim Owen", address: "229 Andrew Dr, Sung Harbour", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Joanna Robson", address: "27 Teal Island", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Joanne Akdeniz", address: "42 Hoya Quay, Crystal Harbor", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Jodie O'Mahony", address: "12 El Nathan - Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Johann Prinslo", address: "270 Jennifer Dr.", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "John Corallo", address: "3A Seahven, Roxborough Dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "John Ferarri", address: "30 Orchid Drive, Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Jon Brosnihan", address: "#6 Shorewinds Trail", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Jordan Constable", address: "60 Philip Crescent", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Joseph Hurlston", address: "42 Monumnet Rd.", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Joyce Follows", address: "35 Jacaranda Ct", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Julie O'Hara", address: "56 Grand Estates Grand Harbour", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Juliett Austin", address: "134 Abbey Way", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Kadi Pentney", address: "Kings Court", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Kahlill Strachan", address: "27 Jump Link", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Kate Ye", address: "17 Cypres Point", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Kenny Rankin", address: "Cascade Drive", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Kent Nickerson", address: "Yatch Club., Salt Creek", tech: "Service - Kingsley", serviceDays: ["Wednesday"] },
    { name: "Kimpton Splash Pad", address: "Kimpton Seafire", tech: "Service - Ariel", serviceDays: ["Friday", "Monday", "Saturday", "Thursday", "Tuesday", "Wednesday"] },
    { name: "Kirsten Buttenhoff", address: "Seas the day, South Sound", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Kuavo", address: "Grand Palmyra", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Kuavo", address: "Grapetree Condos", tech: "Service - Malik", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo", address: "Moon Bay, Shamrock Rd", tech: "Service - Malik", serviceDays: ["Monday", "Thursday"] },
    { name: "Kuavo", address: "Ocean Reach., Old Crewe Rd", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Kuavo", address: "One Canal Point, Gym Pool", tech: "Service - Kingsley", serviceDays: ["Friday"] },
    { name: "Kuavo", address: "One Canal Point, Gym Pool Chem Check", tech: "Service - Kingsley", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "One Canal Point, Main Pool And Spa", tech: "Service - Kingsley", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo", address: "One Canal Point, Main Pool And Spa - Chem Check", tech: "Service - Kingsley", serviceDays: ["Wednesday"] },
    { name: "Kuavo", address: "Periwinkle: Pool/Spa, Edgewater Way Full Service", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo", address: "Pleasant View Appartments", tech: "Service - Jermaine", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "Poinsettia", tech: "Service - Kingsley", serviceDays: ["Friday", "Monday", "Wednesday"] },
    { name: "Kuavo", address: "South Bay Estates, Bel Air Dr", tech: "Service - Elvin", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "South Bay Residence, Bel Air Dr", tech: "Service - Elvin", serviceDays: ["Monday"] },
    { name: "Kuavo", address: "South Shore, Shamrock Rd", tech: "Service - Donald", serviceDays: ["Friday", "Monday"] },
    { name: "Kuavo - Barry Yetton", address: "13 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Denise Hooks", address: "12 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - James Kattan", address: "5 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Jozef Vogel", address: "10 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Manuale Lupu", address: "9 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - November Capitol", address: "16 One Canal Point", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Kuavo - Sam Shalaby", address: "11 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Stacey Ottenbreit", address: "7 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Vernon Flynn", address: "15 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Kuavo - Wesley Cullum", address: "8 One Canal Point", tech: "Service - Ariel", serviceDays: ["Monday"] },
    { name: "Laura Egglishaw", address: "94 Park Side Close", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Laura Redman", address: "45 Yates Drive", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Lexi Pappadakis", address: "110 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Loreen Stewart", address: "29 Galaxy Way", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Malcom Swift", address: "Miramar Vista Del Mar - Yatch Club", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Manuela Lupu", address: "103 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Marcia Milgate", address: "34 Newhaven", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Marcia Milgate", address: "95 Prince Charles Quay", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Margaret Fantasia", address: "526 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Mark Vandevelde", address: "Salt Creek, Yatch Club", tech: "Service - Ariel", serviceDays: ["Friday", "Wednesday"] },
    { name: "Marlon Bispath", address: "519 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Max Jones", address: "Cocoloba Condos", tech: "Service - Elvin", serviceDays: ["Friday"] },
    { name: "Mehdi Khosrow-Pour", address: "610 South Sound Rd", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Merryl Jackson", address: "535 Canal Point Dr", tech: "Service - Ariel", serviceDays: ["Friday"] },
    { name: "Michael Bascina", address: "13 Victoria Dr", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Michelle Bryan", address: "65 Fairview Road", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Mike Gibbs", address: "78 Grand Estates- Grand Harbour", tech: "Service - Malik", serviceDays: ["Friday"] },
    { name: "Mike Kornegay", address: "40 Palm Island Circle", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Mike Stroh", address: "64 Waterford Quay, Safe Haven", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Mitchell Demeter", address: "19 Whirlaway Close, Patricks Island", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Mitzi Callan", address: "Morganville Condos", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Mr Holland", address: "107 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Mr Kelly and Mrs Kahn", address: "112 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Nicholas Gargaro", address: "538 South Sound Rd", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Nicholas Lynn", address: "28 Sandlewood Crescent", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Nigel Daily", address: "183 Andrew Drive", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Nikki Harris", address: "213 olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Nina Irani", address: "Casa Oasis, Boggy Sands", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Ocean Vista Strata", address: "Ocean Vista", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Olea Main Pool", address: "Minerva Way", tech: "Service - Kingsley", serviceDays: ["Friday"] },
    { name: "Olea Main Pool", address: "Minerva way", tech: "Service - Kingsley", serviceDays: ["Saturday", "Thursday", "Tuesday", "Wednesday"] },
    { name: "Olea Main Pool", address: "Olea, Minerva Way", tech: "Service - Kingsley", serviceDays: ["Monday"] },
    { name: "Paolo Pollini", address: "16 Stewart Ln", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Patricia Conroy", address: "58 Anne Bonney Crescent", tech: "Service - Kadeem", serviceDays: ["Tuesday"] },
    { name: "Paul Reynolds", address: "424 Prospect Point Rd", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Paul Rowan", address: "265 Sea Spray Dr.", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Paul Skinner", address: "50 Orchid Drive", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Peter Goddard", address: "Brittania Kings Court", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Peter Watler", address: "952 Seaview Rd", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Philip Smyres", address: "#7 Conch Point Villas", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Plum", address: "Mandalay, Seven Mile", tech: "Service - Jermaine", serviceDays: ["Friday", "Monday"] },
    { name: "Prasanna Ketheeswaran", address: "46 Captian Currys Rd.", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Quentin Creegan", address: "Villa Aramone 472 South Sound Rd", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Randal Martin", address: "151 Shorecrest Circle", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Raoul Pal", address: "93 Marry read crescent", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Reg Williams", address: "Cliff House, 2702 Austin Connolly", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Rem", address: "49 Mary Read Crescent, Jeey Bomford", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Rem", address: "Sunrise Phase 3, Old Crewe Rd", tech: "Service - Kadeem", serviceDays: ["Friday", "Tuesday"] },
    { name: "Rena Streker", address: "1354 South Sound", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Rich Merlo", address: "276 Yacht Club Drive", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Rick Gorter", address: "33 Shoreview Point", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Rick Gorter", address: "70 Shoreview Point", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Riyaz Norrudin", address: "63 Langton Way, The Lakes", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Robert Morrison", address: "265 Jennifer Dr", tech: "Service - Jermaine", serviceDays: ["Wednesday"] },
    { name: "Roland Stewart", address: "Kimpton Seafire", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Romell El Madhani", address: "117 Crystal Dr", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Rory Andrews", address: "44 Country Road, Savannah", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Ross Fortune", address: "90 Prince Charles-Govenors Harbour.", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Safe Harbor strata #48", address: "Safe Harbor Condos", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "Sandra Tobin", address: "108 Solara", tech: "Service - Malik", serviceDays: ["Wednesday"] },
    { name: "Sarah Dobbyn-Thomson", address: "441 Water Cay Rd", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Scott Hughes", address: "111 Olea", tech: "Service - Ariel", serviceDays: ["Tuesday"] },
    { name: "Scott Somerville", address: "2078 Rum Point Rd.", tech: "Service - Donald", serviceDays: ["Thursday"] },
    { name: "Scott Somerville", address: "40 Dunlop Dr", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Scott Somerville", address: "40 Orchid Drive, Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Shelly Do Vale", address: "47 Marbel Drive", tech: "Service - Malik", serviceDays: ["Tuesday"] },
    { name: "Simon Palmer", address: "Olivias Cove, Govenors Harbour", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Sina Mirzale", address: "353 Bimini Dr, Grand Harbour", tech: "Service - Donald", serviceDays: ["Tuesday"] },
    { name: "Stef Dimitrio", address: "266 Raleigh Quay", tech: "Service - Ace", serviceDays: ["Tuesday"] },
    { name: "Stefan Marenzi", address: "Old Danube, 316 Water Cay Rd", tech: "Service - Donald", serviceDays: ["Wednesday"] },
    { name: "Stephen Leontsinis", address: "1340 South Sound", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Steve Daker", address: "33 Spurgeon Cr., Highlands", tech: "Service - Jermaine", serviceDays: ["Thursday"] },
    { name: "Steven Joyce", address: "199 Crystal Drive", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Steven Manning", address: "61 Shoreline Dr", tech: "Service - Jermaine", serviceDays: ["Tuesday"] },
    { name: "Stewart Donald", address: "72 Conch Drive", tech: "Service - Elvin", serviceDays: ["Tuesday"] },
    { name: "Strata #536", address: "Valencia Heights", tech: "Service - Kadeem", serviceDays: ["Wednesday"] },
    { name: "Strata #70", address: "171 Boggy Sands rd", tech: "Service - Ariel", serviceDays: ["Thursday"] },
    { name: "Suzanne Bothwell", address: "227 Smith Road", tech: "Service - Kadeem", serviceDays: ["Monday"] },
    { name: "Suzanne Correy", address: "394 Canal Point Rd.", tech: "Service - Ariel", serviceDays: ["Wednesday"] },
    { name: "The Colonial Club", address: "The Colonial Club", tech: "Service - Malik", serviceDays: ["Friday", "Tuesday"] },
    { name: "Thomas Ponessa", address: "450 Prospect Point Rd", tech: "Service - Ace", serviceDays: ["Thursday"] },
    { name: "Tim Bradley", address: "66 Baquarat Quay, Safe Haven", tech: "Service - Jermaine", serviceDays: ["Friday"] },
    { name: "Tim Dailyey", address: "177/179 North Webster Dr", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Tom Balon", address: "37 Teal Island", tech: "Service - Ace", serviceDays: ["Monday"] },
    { name: "Tom Newton", address: "304 South Sound", tech: "Service - Elvin", serviceDays: ["Thursday"] },
    { name: "Tom Wye", address: "800 South Sound", tech: "Service - Kadeem", serviceDays: ["Friday"] },
    { name: "Tracey Kline", address: "108 Roxborough dr", tech: "Service - Malik", serviceDays: ["Thursday"] },
    { name: "Tracey Kline", address: "108 Roxborough dr", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "Victoria Wheaton", address: "36 Whitehall Gardens", tech: "Service - Elvin", serviceDays: ["Wednesday"] },
    { name: "Vlad Aldea", address: "474 Yacht Club Dr., Yacht Club", tech: "Service - Ace", serviceDays: ["Friday"] },
    { name: "Walker Romanica", address: "79 Riley Circle, Newlands", tech: "Service - Ace", serviceDays: ["Wednesday"] },
    { name: "William Jackman", address: "221 Crystal Dr", tech: "Service - Kingsley", serviceDays: ["Thursday"] },
    { name: "Zoe Foster", address: "47 Latana Way", tech: "Service - Elvin", serviceDays: ["Friday", "Monday"] }

  ];
  const existingClients = db.get('clients', []);
  const mergedClients = [...existingClients];

  clients.forEach(c => {
    const existingIdx = mergedClients.findIndex(
      e => e.address === c.address && e.technician === c.tech
    );
    if (existingIdx >= 0) {
      // Update name and serviceDays so master data corrections take effect
      mergedClients[existingIdx].name = c.name;
      mergedClients[existingIdx].serviceDays = c.serviceDays;
    } else {
      mergedClients.push({
        id: `c_${Math.random().toString(36).substr(2, 9)}`,
        name: c.name,
        address: c.address,
        technician: c.tech,
        serviceDays: c.serviceDays
      });
    }
  });

  db.set('clients', mergedClients);
  db.set('masterScheduleLoaded', true);
}

function populateLoginTechOptions() {
  const select = document.getElementById('login-tech');
  if (!select) return;
  // If the HTML already has options populated (hardcoded in index.html), skip to avoid jump
  if (select.options.length > 1) return;

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
  // Always force login screen on startup
  auth.logout();
  db.startRealtimeSync();

  cleanupTestClients();
  // Data version check: if version changed, wipe & reseed all master-schedule clients
  if (db.get('dataVersion') !== DATA_VERSION) {
    const existingClients = db.get('clients', []);
    // Master schedule clients have ids starting with 'c_'; user-created use 'c' + timestamp
    const userClients = existingClients.filter(c => !String(c.id || '').startsWith('c_'));
    db.set('clients', userClients);
    db.set('masterScheduleLoaded', false);
    db.set('dataVersion', DATA_VERSION);
  } else {
    db.set('masterScheduleLoaded', false);
  }
  initMasterSchedule();
  migrateLegacyRepairData();
  rollOverPendingJobs();
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

      initializePushNotificationsForUser().catch(error => {
        console.warn('Push initialization failed', error);
      });

      if (loginError) loginError.style.display = 'none';
      curtainTransition(() => {
        if (loginScreen) loginScreen.style.setProperty('display', 'none', 'important');
        if (appShell) {
          appShell.classList.remove('hidden');
          appShell.style.setProperty('display', 'flex', 'important');
        }
        try { router.navigate('dashboard'); } catch (err) { location.reload(); }
      });
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
  curtainTransition(() => {
    auth.logout();
    const appShell = document.getElementById('app');
    const loginScreen = document.getElementById('login-screen');
    if (appShell) { appShell.classList.add('hidden'); appShell.style.display = 'none'; }
    if (loginScreen) { loginScreen.style.display = 'flex'; }
    router.navigate('dashboard');
  });
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

function quickAddClientFromWorkOrder() {
  if (!auth.isAdmin()) {
    showToast('Only admins can add clients from work orders');
    return;
  }

  const name = prompt('New client name');
  if (!name) return;

  const address = prompt('Client address') || '';
  const contact = prompt('Client contact') || '';
  const technicianInput = prompt(
    `Assign route technician (optional):\n\n${getTechnicianNames().join(', ')}`,
    getTechnicianNames()[0] || ''
  ) || '';
  const technician = normalizeTechnicianName(technicianInput);

  const clients = db.get('clients', []);
  const clientId = `c${Date.now()}`;
  const newClient = { id: clientId, name, address, contact, technician };
  clients.unshift(newClient);
  db.set('clients', clients);

  const clientSearch = document.getElementById('repair-client-search');
  const hiddenClientId = document.getElementById('repair-client');
  const addressField = document.getElementById('repair-address');
  if (clientSearch) clientSearch.value = getRepairClientDisplay(newClient);
  if (hiddenClientId) hiddenClientId.value = newClient.id;
  if (addressField) addressField.value = newClient.address || '';
  onRepairClientChange();
  showToast('New client created and selected');
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
  workOrderManager.saveOrder(order);
  router.navigate('workorders');
  showToast(order.status === 'completed'
    ? 'Completed chem sheet saved for admin export'
    : 'Chem sheet saved');
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

function getDefaultAppLink() {
  const versionNumber = String(DATA_VERSION || 'v200').replace(/^v/i, '');
  return `https://millzy7665-beep.github.io/oasis-service/?v=${versionNumber}`;
}

function getSavedAppLink() {
  const savedLink = String(db.get('apk_download_link') || '').trim();
  if (
    !savedLink ||
    /oasis-app\.apk$/i.test(savedLink) ||
    /^https:\/\/millzy7665-beep\.github\.io\/oasis-service\/?$/i.test(savedLink)
  ) {
    return getDefaultAppLink();
  }
  return savedLink;
}

function saveApkLink() {
  const input = document.getElementById('apk-link-input');
  if (!input) return;

  const rawLink = input.value.trim();
  const link = (!rawLink || /oasis-app\.apk$/i.test(rawLink))
    ? getDefaultAppLink()
    : rawLink;
  db.set('apk_download_link', link);

  // Re-render the settings view to update the QR code
  if (router.currentView === 'settings') {
    router.renderSettings();
  }

  showToast(link ? 'App link saved' : 'App link cleared');
}

function useLatestAppLink() {
  const input = document.getElementById('apk-link-input');
  if (!input) return;
  input.value = getDefaultAppLink();
  saveApkLink();
}

function useThisDeviceForAlerts() {
  const user = auth.getCurrentUser();
  if (!user?.name) {
    showToast('Sign in required');
    return;
  }
  markCurrentDeviceAsPreferred(user);
  showToast('This device is now selected for your alerts');
}

async function enablePhoneNotifications() {
  const user = auth.getCurrentUser();
  if (!user?.name) {
    showToast('Sign in required');
    return false;
  }

  markCurrentDeviceAsPreferred(user);

  if (isIosLikeDevice() && !isStandaloneDisplayMode()) {
    alert('On iPhone or iPad, first add Oasis to your Home Screen, then reopen it there and tap Enable Phone Notifications again.');
    return false;
  }

  await notificationManager.requestPermission();
  const enabled = await initializePushNotificationsForUser(true);
  showToast(enabled ? 'Phone notifications enabled' : 'Phone notifications are not available in this browser yet');
  return enabled;
}

async function sendTestNotification() {
  const user = auth.getCurrentUser();
  if (!user?.name) {
    showToast('Sign in required');
    return;
  }

  const targetDeviceId = getPreferredNotificationDeviceId(user.name) || markCurrentDeviceAsPreferred(user);
  const item = {
    type: 'update',
    title: 'OASIS Test Sheet',
    message: 'This is a visible in-app test notification.',
    recipient: user.name,
    targetView: 'dashboard',
    targetId: '',
    targetDeviceId,
    actionLabel: 'Open'
  };

  await notificationManager.presentLiveNotification(item);
  await notificationManager.create({
    ...item,
    recipients: [user.name]
  });

  showToast('Test notification sent to this device');
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

  const name = prompt('Client name');
  if (!name) return;

  const address = prompt('Client address') || '';
  const contact = prompt('Contact name') || '';
  const technicianInput = prompt(
    `Assign this client to which technician?\n\n${getTechnicianNames().join(', ')}`,
    getTechnicianNames()[0] || ''
  );
  const technician = normalizeTechnicianName(technicianInput);

  if (!technician) {
    showToast('Please select the technician for this client');
    return;
  }

  const clients = db.get('clients', []);
  const clientId = `c${Date.now()}`;
  clients.unshift({
    id: clientId,
    name,
    address,
    contact,
    technician
  });

  db.set('clients', clients);

  notificationManager.create({
    type: 'client',
    title: 'New client from Admin',
    message: `${name} has been added and sent to ${technician}.`,
    recipients: [technician, ...getAdminRecipients()],
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

  if (auth.isAdmin() && order.technician && !userNamesMatch(order.technician, currentUser?.name || '')) {
    const assignmentChanged = !previousOrder || previousOrder.technician !== order.technician || previousStatus !== (order.status || '').toLowerCase();
    if (assignmentChanged) {
      notificationManager.create({
        type: 'chem',
        title: 'New chem sheet from Admin',
        message: `${order.clientName || 'A chem sheet'} has been sent directly to you.`,
        recipients: [order.technician],
        targetView: 'chem',
        targetId: order.id,
        actionLabel: 'Open Chem Sheet'
      });
    }
  } else if (currentUser && !auth.isAdmin()) {
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
  const searchInput = document.getElementById('repair-client-search');
  const hiddenClientId = document.getElementById('repair-client');
  const address = document.getElementById('repair-address');
  const title = document.getElementById('repair-bar-title');
  if (!searchInput || !address) return;

  const clients = db.get('clients', []);
  const client = findClientByRepairSearch(searchInput.value, clients);
  if (client) {
    if (hiddenClientId) hiddenClientId.value = client.id;
    searchInput.value = getRepairClientDisplay(client);
    address.value = client.address || '';
    if (title) title.textContent = client.name || 'Work Order';
    return;
  }

  if (hiddenClientId) hiddenClientId.value = '';
  if (title) title.textContent = (searchInput.value || 'Work Order').split(' — ')[0];
}

async function saveRepairWorkOrder(orderId = '', shareAfterSave = false) {
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

  if (auth.isAdmin() && order.assignedTo) {
    const assignmentChanged = !previousOrder || !userNamesMatch(previousOrder.assignedTo || '', order.assignedTo || '');
    const statusChanged = previousStatus !== (order.status || '').toLowerCase();
    const dateChanged = (previousOrder?.date || '') !== (order.date || '');
    const shouldNotifyAssignedTech = isOfficeWorkOrderAssignee(order.assignedTo) && (assignmentChanged || statusChanged || dateChanged || !previousOrder);

    if (shouldNotifyAssignedTech) {
      const scheduledDate = order.date || 'the scheduled date';
      const targetDeviceId = getPreferredNotificationDeviceId(order.assignedTo || '');
      await notificationManager.create({
        type: 'repair',
        title: 'Work order assigned',
        message: `${order.clientName || 'A work order'} is assigned to you for ${scheduledDate}.`,
        recipients: [order.assignedTo],
        targetView: 'repair',
        targetId: order.id,
        targetDeviceId,
        actionLabel: 'Open Work Order'
      });
    }
  } else if (currentUser && !auth.isAdmin()) {
    const shouldNotifyAdmin = !previousOrder?.updatedAt || previousStatus !== (order.status || '').toLowerCase();
    if (shouldNotifyAdmin) {
      await notificationManager.create({
        type: 'repair',
        title: order.status === 'completed' ? 'Completed work order received' : 'Work order received from technician',
        message: `${currentUser.name} ${order.status === 'completed' ? 'completed' : 'updated'} ${order.clientName || 'a work order'}.`,
        recipients: getAdminRecipients(currentUser?.name),
        targetView: 'repair',
        targetId: order.id,
        actionLabel: 'Open Work Order'
      });
    }
  }

  showToast(order.status === 'completed'
    ? 'Completed work order saved for admin export'
    : 'Work order saved');

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

function convertQuoteToWorkOrder(estimateId) {
  if (!auth.isAdmin()) { showToast('Only admins can convert quotes'); return; }
  const estimate = getEstimateSheet(estimateId);
  if (!estimate) { showToast('Estimate not found'); return; }

  const itemsSummary = (estimate.items || [])
    .filter(item => item.equipment || item.partNumber)
    .map(item => `${item.equipment || item.partNumber}${item.qty && item.qty !== '1' ? ` x${item.qty}` : ''}`)
    .join(', ');

  const newOrder = {
    id: `r${Date.now()}`,
    clientId: estimate.clientId || '',
    clientName: estimate.clientName || '',
    address: estimate.address || '',
    date: new Date().toISOString().split('T')[0],
    time: '', timeIn: '', timeOut: '',
    assignedTo: '',
    status: 'open',
    jobType: estimate.project || 'Pool Equipment Installation',
    summary: estimate.scope || '',
    materials: itemsSummary,
    partsItems: [],
    partsSummary: itemsSummary,
    labourHours: '',
    notes: `Converted from Estimate ${estimate.estimateNumber || ''}. Total: $${formatEstimateMoney(estimate.total || estimate.subtotal || 0)}`,
    photos: [],
    sourceEstimateId: estimate.id
  };

  const orders = getRepairOrders();
  orders.unshift(newOrder);
  saveRepairOrders(orders);
  showToast(`Work order created from ${estimate.estimateNumber || 'estimate'} — assign a technician`);
  renderRepairOrderForm(newOrder.id);
}

async function exportDailyWorkOrders() {
  const dateInput = document.getElementById('wo-export-date');
  const selectedDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
  const isCompleted = (status = '') => String(status || '').trim().toLowerCase() === 'completed';
  const orders = getRepairOrders().filter(o => isCompleted(o.status) && o.date === selectedDate);
  if (orders.length === 0) { showToast(`No completed work orders for ${selectedDate}`); return; }
  showToast('Generating Work Orders Excel...');
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OASIS Service App'; workbook.created = new Date();
    const applyHeader = (sheet, count) => {
      const row = sheet.getRow(1);
      row.font = { bold: true, color: { argb: 'FFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0D2B45' } };
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: count } };
    };
    const columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Client', key: 'client', width: 25 },
      { header: 'Address', key: 'address', width: 35 }, { header: 'Technician', key: 'tech', width: 18 },
      { header: 'Job Type', key: 'jobType', width: 20 }, { header: 'Status', key: 'status', width: 12 },
      { header: 'Time In', key: 'timeIn', width: 10 }, { header: 'Time Out', key: 'timeOut', width: 10 },
      { header: 'Labour Hours', key: 'labourHours', width: 12 }, { header: 'Materials', key: 'materials', width: 30 },
      { header: 'Parts Summary', key: 'partsSummary', width: 40 }, { header: 'Work Summary', key: 'summary', width: 40 },
      { header: 'Notes', key: 'notes', width: 40 }
    ];
    const sheet = workbook.addWorksheet('Work Orders');
    sheet.columns = columns; applyHeader(sheet, columns.length);
    orders.forEach(order => sheet.addRow({
      date: order.date || '', client: order.clientName || '', address: order.address || '',
      tech: order.assignedTo || '', jobType: order.jobType || '', status: order.status || '',
      timeIn: order.timeIn || order.time || '', timeOut: order.timeOut || '',
      labourHours: order.labourHours || '', materials: order.materials || '',
      partsSummary: order.partsSummary || '', summary: order.summary || '', notes: order.notes || ''
    }));
    sheet.eachRow((row, n) => { if (n > 1) row.alignment = { vertical: 'top', wrapText: true }; });
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `OASIS_Work_Orders_${selectedDate}.xlsx`;
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast(`${orders.length} work order${orders.length !== 1 ? 's' : ''} for ${selectedDate} saved`);
  } catch (error) { console.error('Work orders export failed:', error); showToast('Work orders export failed'); }
}

async function exportMonthlyChemSheets() {
  const monthInput = document.getElementById('chem-export-month');
  const selectedMonth = monthInput ? monthInput.value : new Date().toISOString().slice(0, 7);
  const isCompleted = (status = '') => String(status || '').trim().toLowerCase() === 'completed';
  const sorted = [...db.get('workorders', []).filter(wo => isCompleted(wo.status) && (wo.date || '').startsWith(selectedMonth))]
    .sort((a, b) => new Date(a?.date || 0) - new Date(b?.date || 0));
  if (sorted.length === 0) { showToast(`No completed chem sheets found for ${selectedMonth}`); return; }
  showToast('Generating Chem Sheets Excel...');
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OASIS Service App'; workbook.created = new Date();
    const styleHeader = (sheet, count) => {
      const row = sheet.getRow(1);
      row.font = { bold: true, color: { argb: 'FFFFFF' } };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0D2B45' } };
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: count } };
    };
    const chemKeys = [
      { key: 'tabs', label: 'Tabs' }, { key: 'shock', label: 'Shock/Oxidizer' },
      { key: 'muriaticAcid', label: 'Muriatic Acid' }, { key: 'sodaAsh', label: 'Soda Ash' },
      { key: 'sodiumBicarb', label: 'Sodium Bicarb' }, { key: 'calcium', label: 'Calcium Increaser' },
      { key: 'stabilizer', label: 'Stabilizer' }, { key: 'salt', label: 'Salt' },
      { key: 'phosphateRemover', label: 'Phosphate Remover' }, { key: 'algaecide', label: 'Algaecide' }
    ];
    const columns = [
      { header: 'Date', key: 'date', width: 12 }, { header: 'Client', key: 'client', width: 25 },
      { header: 'Address', key: 'address', width: 35 }, { header: 'Technician', key: 'tech', width: 15 },
      { header: 'Time In', key: 'timeIn', width: 10 }, { header: 'Time Out', key: 'timeOut', width: 10 },
      { header: 'Pool Chlorine', key: 'pCl', width: 12 }, { header: 'Pool pH', key: 'pph', width: 10 },
      { header: 'Pool Alk', key: 'palk', width: 10 }
    ];
    chemKeys.forEach(ck => columns.push({ header: `Pool ${ck.label}`, key: `p_${ck.key}`, width: 15 }));
    columns.push({ header: 'Spa Chlorine', key: 'sCl', width: 12 }, { header: 'Spa pH', key: 'sph', width: 10 }, { header: 'Spa Alk', key: 'salk', width: 10 });
    chemKeys.forEach(ck => columns.push({ header: `Spa ${ck.label}`, key: `s_${ck.key}`, width: 15 }));
    columns.push({ header: 'Service Notes', key: 'notes', width: 40 });
    const sheet = workbook.addWorksheet('Chem Sheets');
    sheet.columns = columns; styleHeader(sheet, columns.length);
    sorted.forEach(wo => {
      const rowData = {
        date: wo.date || '', client: wo.clientName || '', address: wo.address || '',
        tech: wo.technician || '', timeIn: wo.timeIn || wo.time || '', timeOut: wo.timeOut || '',
        pCl: wo.readings?.pool?.chlorine || '', pph: wo.readings?.pool?.ph || '', palk: wo.readings?.pool?.alkalinity || '',
        sCl: wo.readings?.spa?.chlorine || '', sph: wo.readings?.spa?.ph || '', salk: wo.readings?.spa?.alkalinity || '',
        notes: `${wo.workPerformed || ''} ${wo.followUpNotes || wo.notes || ''}`.trim()
      };
      chemKeys.forEach(ck => { rowData[`p_${ck.key}`] = wo.chemicalsAdded?.pool?.[ck.key] || ''; rowData[`s_${ck.key}`] = wo.chemicalsAdded?.spa?.[ck.key] || ''; });
      sheet.addRow(rowData);
    });
    sheet.eachRow((row, n) => { if (n > 1) row.alignment = { vertical: 'top', wrapText: true }; });
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `OASIS_Chem_Sheets_${selectedMonth}.xlsx`;
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast(`${sorted.length} chem sheet${sorted.length !== 1 ? 's' : ''} for ${selectedMonth} saved`);
  } catch (error) { console.error('Chem sheets export failed:', error); showToast('Chem sheets export failed'); }
}
