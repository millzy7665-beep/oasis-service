const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const fail = async (msg, details) => {
    console.error('TEST_FAILED:', msg);
    if (details) console.error(details);
    await browser.close();
    process.exit(1);
  };

  try {
    await page.goto('file:///Users/chrismills/pool-service-app/index.html');
    await page.waitForFunction(() => typeof window.renderRepairOrderForm === 'function' && typeof window.auth !== 'undefined');

    const setup = await page.evaluate(() => {
      try {
        localStorage.clear();

        const testClient = {
          id: 'test_client_mark_001',
          name: 'Test Client Mark',
          address: '123 Test Lane',
          technician: 'Service - Ace',
          serviceDays: ['Monday']
        };

        db.set('clients', [testClient]);
        auth.login('admin', '0000');

        const loginScreen = document.getElementById('login-screen');
        const app = document.getElementById('app');
        if (loginScreen) loginScreen.style.display = 'none';
        if (app) {
          app.classList.remove('hidden');
          app.style.display = 'flex';
        }

        renderRepairOrderForm('', testClient.id);

        const activeContainer = document.querySelector('[data-active-repair-id]');
        const repairId = activeContainer ? activeContainer.getAttribute('data-active-repair-id') : '';

        document.getElementById('repair-client-search').value = `${testClient.name} — ${testClient.address}`;
        onRepairClientChange();
        document.getElementById('repair-date').value = '2026-04-14';
        document.getElementById('repair-tech').value = 'Tech - Mark';
        document.getElementById('repair-type').value = 'Pump inspection';
        document.getElementById('repair-summary').value = 'Automation local test for Tech Mark';
        document.getElementById('repair-status').value = 'open';

        return { ok: true, repairId };
      } catch (error) {
        return { ok: false, message: String(error) };
      }
    });

    if (!setup.ok || !setup.repairId) {
      await fail('setup failed', setup);
      return;
    }

    const result = await page.evaluate(async ({ repairId }) => {
      try {
        await saveRepairWorkOrder(repairId, false);

        const orders = db.get('repairOrders', []);
        const savedOrder = orders.find(item => item.id === repairId) || null;
        const notes = db.get('oasis_notifications', []);
        const targetNote = notes.find(item => item.targetId === repairId && item.type === 'repair') || null;

        return { ok: true, savedOrder, targetNote, orderCount: orders.length, noteCount: notes.length };
      } catch (error) {
        return { ok: false, message: String(error) };
      }
    }, { repairId: setup.repairId });

    if (!result.ok) {
      await fail('save failed', result);
      return;
    }

    if (!result.savedOrder) await fail('no saved order found', result);
    if (result.savedOrder.assignedTo !== 'Tech - Mark') await fail('assigned tech mismatch', result.savedOrder);
    if (result.savedOrder.clientName !== 'Test Client Mark') await fail('client name mismatch', result.savedOrder);
    if (result.savedOrder.date !== '2026-04-14') await fail('date mismatch', result.savedOrder);

    if (!result.targetNote) await fail('no notification found for saved order', result);
    if (result.targetNote.recipient !== 'Tech - Mark') await fail('notification recipient mismatch', result.targetNote);

    console.log('TEST_PASSED');
    console.log(JSON.stringify({
      repairOrderId: result.savedOrder.id,
      assignedTo: result.savedOrder.assignedTo,
      clientName: result.savedOrder.clientName,
      date: result.savedOrder.date,
      notificationTitle: result.targetNote.title,
      notificationRecipient: result.targetNote.recipient,
      orderCount: result.orderCount,
      noteCount: result.noteCount
    }, null, 2));

    await browser.close();
  } catch (error) {
    await fail('unexpected error', String(error));
  }
})();
