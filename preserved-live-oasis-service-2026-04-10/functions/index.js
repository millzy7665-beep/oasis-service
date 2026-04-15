const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Temporary test helper — sends a push notification to a named recipient
exports.sendTestPush = functions.https.onRequest(async (req, res) => {
  const secret = req.query.secret || '';
  if (secret !== 'oasis-test-2026') {
    res.status(403).send('Forbidden');
    return;
  }
  const recipient = String(req.query.recipient || 'Chris Mills');
  const title = String(req.query.title || 'OASIS Test Notification');
  const body = String(req.query.body || 'Push notifications working. Arrived while app was closed.');
  const docRef = await admin.firestore().collection('push_dispatch_queue').add({
    notificationId: 'test_' + Date.now(),
    type: 'update',
    title,
    body,
    recipient,
    canonicalRecipient: canonicalUserName(recipient),
    broadcast: false,
    targetView: 'dashboard',
    targetId: '',
    senderUsername: 'system',
    senderName: 'OASIS System',
    status: 'queued',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  res.send('Queued: ' + docRef.id);
});

exports.debugPushStatus = functions.https.onRequest(async (req, res) => {
  if (req.method === 'POST') {
    const secret = req.query.secret || req.body?.secret || '';
    if (secret !== 'oasis-test-2026') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const body = req.body || {};
    const token = String(body.token || '').trim();
    const userName = String(body.userName || '').trim();
    const username = String(body.username || '').trim();
    const platform = String(body.platform || 'web').trim();
    const permission = String(body.permission || 'granted').trim();
    const deviceId = String(body.deviceId || '').trim();

    if (!token || !userName) {
      res.status(400).json({ error: 'token and userName required' });
      return;
    }

    await admin.firestore().collection('push_tokens').doc(token).set({
      token,
      username,
      userName,
      canonicalUserName: canonicalUserName(userName),
      platform,
      permission,
      deviceId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({ ok: true, canonicalUserName: canonicalUserName(userName) });
    return;
  }

  const secret = req.query.secret || '';
  if (secret !== 'oasis-test-2026') {
    res.status(403).send('Forbidden');
    return;
  }

  const recipient = String(req.query.recipient || 'Chris Mills');
  const canonicalRecipient = canonicalUserName(recipient);

  const tokenSnap = await admin.firestore()
    .collection('push_tokens')
    .where('canonicalUserName', '==', canonicalRecipient)
    .get();

  const queueSnap = await admin.firestore()
    .collection('push_dispatch_queue')
    .where('canonicalRecipient', '==', canonicalRecipient)
    .get();

  const queueItems = queueSnap.docs.map(doc => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      title: data.title || '',
      status: data.status || '',
      attempted: data.attempted || 0,
      successCount: data.successCount || 0,
      failureCount: data.failureCount || 0,
      dispatchedAt: data.dispatchedAt || null,
      createdAt: data.createdAt || null
    };
  }).sort((a, b) => {
    const aSec = a.createdAt?.seconds || 0;
    const bSec = b.createdAt?.seconds || 0;
    return bSec - aSec;
  }).slice(0, 5);

  res.json({
    recipient,
    canonicalRecipient,
    tokenCount: tokenSnap.size,
    tokens: tokenSnap.docs.map(doc => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        platform: data.platform || '',
        permission: data.permission || '',
        deviceId: data.deviceId || '',
        updatedAt: data.updatedAt || null
      };
    }),
    recentQueue: queueItems
  });
});

// Client calls this to register its FCM token server-side (bypasses Firestore security rules)
exports.registerPushToken = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const body = req.body || {};
  const token = String(body.token || '').trim();
  const userName = String(body.userName || '').trim();
  const username = String(body.username || '').trim();
  const platform = String(body.platform || 'web').trim();
  const permission = String(body.permission || 'granted').trim();
  const deviceId = String(body.deviceId || '').trim();

  if (!token || !userName) {
    res.status(400).json({ error: 'token and userName required' });
    return;
  }

  await admin.firestore().collection('push_tokens').doc(token).set({
    token,
    username,
    userName,
    canonicalUserName: canonicalUserName(userName),
    platform,
    permission,
    deviceId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  res.json({ ok: true, canonicalUserName: canonicalUserName(userName) });
});

function canonicalUserName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^(service|tech)\s*-\s*/i, '');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTechnicianName(name) {
  const value = String(name || '').trim();
  if (!value) return '';

  const knownNames = [
    'Service - Ace',
    'Service - Ariel',
    'Service - Donald',
    'Service - Elvin',
    'Service - Jermaine',
    'Service - Kadeem',
    'Service - Kingsley',
    'Service - Malik',
    'Tech - Jet',
    'Tech - Mark'
  ];

  const canonical = canonicalUserName(value);
  return knownNames.find(item => canonicalUserName(item) === canonical) || value;
}

function normalizeServiceDays(value) {
  const rawDays = Array.isArray(value)
    ? value
    : String(value || '').split(',');

  const dayMap = {
    mon: 'Monday', monday: 'Monday',
    tue: 'Tuesday', tues: 'Tuesday', tuesday: 'Tuesday',
    wed: 'Wednesday', weds: 'Wednesday', wednesday: 'Wednesday',
    thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday', thursday: 'Thursday',
    fri: 'Friday', friday: 'Friday',
    sat: 'Saturday', saturday: 'Saturday',
    sun: 'Sunday', sunday: 'Sunday'
  };

  return [...new Set(rawDays
    .map(day => String(day || '').trim())
    .filter(Boolean)
    .map(day => dayMap[day.toLowerCase()] || day))];
}

exports.repairClientRoutes = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const secret = String(req.query.secret || req.body?.secret || '').trim();
  if (secret !== 'oasis-test-2026') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const repairs = Array.isArray(req.body?.repairs) ? req.body.repairs : [];
  if (!repairs.length) {
    res.status(400).json({ error: 'repairs array required' });
    return;
  }

  const clientsRef = admin.firestore().collection('app_data').doc('clients');
  const snapshot = await clientsRef.get();
  if (!snapshot.exists) {
    res.status(404).json({ error: 'clients document not found' });
    return;
  }

  const currentClients = Array.isArray(snapshot.data()?.data) ? snapshot.data().data : [];
  const repairMap = new Map();
  repairs.forEach(item => {
    const technician = normalizeTechnicianName(item?.technician || item?.tech || '');
    const address = normalizeText(item?.address || '');
    const serviceDays = normalizeServiceDays(item?.serviceDays || item?.serviceDay || []);
    if (!technician || !address || !serviceDays.length) return;
    repairMap.set(`${address}__${canonicalUserName(technician)}`, {
      technician,
      serviceDays,
      name: String(item?.name || '').trim()
    });
  });

  let updatedCount = 0;
  let alreadyCorrectCount = 0;
  let missingMatchCount = 0;
  const matchedKeys = new Set();

  const nextClients = currentClients.map(client => {
    const technician = normalizeTechnicianName(client?.technician || client?.tech || '');
    const address = normalizeText(client?.address || '');
    const key = `${address}__${canonicalUserName(technician)}`;
    const repair = repairMap.get(key);

    if (!repair) {
      missingMatchCount += 1;
      return client;
    }

    matchedKeys.add(key);
    const currentDays = normalizeServiceDays(client?.serviceDays || client?.serviceDay || []);
    const nextDays = repair.serviceDays;
    const currentSignature = JSON.stringify(currentDays);
    const nextSignature = JSON.stringify(nextDays);

    if (currentSignature === nextSignature && technician === repair.technician) {
      alreadyCorrectCount += 1;
      return { ...client, technician: repair.technician, serviceDays: nextDays };
    }

    updatedCount += 1;
    return {
      ...client,
      technician: repair.technician,
      serviceDays: nextDays
    };
  });

  const unmatchedRepairs = repairs.filter(item => {
    const technician = normalizeTechnicianName(item?.technician || item?.tech || '');
    const address = normalizeText(item?.address || '');
    const key = `${address}__${canonicalUserName(technician)}`;
    return key && !matchedKeys.has(key);
  }).length;

  await clientsRef.set({
    data: nextClients,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    routeRepair: {
      updatedCount,
      alreadyCorrectCount,
      unmatchedRepairs,
      executedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  }, { merge: true });

  res.json({
    ok: true,
    clientCount: nextClients.length,
    updatedCount,
    alreadyCorrectCount,
    missingMatchCount,
    unmatchedRepairs
  });
});

exports.dispatchQueuedPush = functions.firestore
  .document('push_dispatch_queue/{dispatchId}')
  .onCreate(async (snapshot) => {
    const data = snapshot.data() || {};
    const recipient = String(data.recipient || '').trim();
    const canonicalRecipient = String(data.canonicalRecipient || canonicalUserName(recipient)).trim();
    const broadcast = !!data.broadcast;

    const title = String(data.title || 'New OASIS update');
    const body = String(data.body || 'You have a new update.');
    const targetView = String(data.targetView || 'dashboard');
    const targetId = String(data.targetId || '');
    const targetDeviceId = String(data.targetDeviceId || '').trim();

    let tokenDocs = [];

    if (broadcast) {
      const allTokensSnap = await admin.firestore().collection('push_tokens').get();
      tokenDocs = allTokensSnap.docs;
    } else if (canonicalRecipient) {
      const tokenSnap = await admin.firestore()
        .collection('push_tokens')
        .where('canonicalUserName', '==', canonicalRecipient)
        .get();
      tokenDocs = tokenSnap.docs;
    }

    if (targetDeviceId) {
      tokenDocs = tokenDocs.filter(doc => String(doc.get('deviceId') || '').trim() === targetDeviceId);
    }

    const tokens = tokenDocs
      .map(doc => String(doc.get('token') || '').trim())
      .filter(Boolean);

    if (!tokens.length) {
      await snapshot.ref.set({
        status: 'no-target-tokens',
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return null;
    }

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: {
        title,
        body,
        targetView,
        targetId,
        notificationId: String(data.notificationId || ''),
        type: String(data.type || 'update')
      },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png'
        },
        fcmOptions: {
          link: '/index.html'
        }
      }
    });

    const failedTokens = [];
    response.responses.forEach((result, index) => {
      if (!result.success) {
        failedTokens.push(tokens[index]);
      }
    });

    if (failedTokens.length) {
      const batch = admin.firestore().batch();
      failedTokens.forEach(token => {
        batch.delete(admin.firestore().collection('push_tokens').doc(token));
      });
      await batch.commit();
    }

    await snapshot.ref.set({
      status: response.failureCount ? 'partial' : 'sent',
      attempted: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      dispatchedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return null;
  });
