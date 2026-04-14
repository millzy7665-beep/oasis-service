const { test, expect } = require('@playwright/test');

test('create local test work order assigned to Tech - Mark', async ({ page }) => {
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

  expect(setup.ok).toBeTruthy();

  const saveResult = await page.evaluate(async ({ repairId }) => {
    try {
      await saveRepairWorkOrder(repairId, false);

      const orders = db.get('repairOrders', []);
      const savedOrder = orders.find(item => item.id === repairId) || null;
      const notes = db.get('oasis_notifications', []);
      const targetNote = notes.find(item => item.targetId === repairId && item.type === 'repair') || null;

      return {
        ok: true,
        savedOrder,
        targetNote,
        orderCount: orders.length,
        noteCount: notes.length
      };
    } catch (error) {
      return { ok: false, message: String(error) };
    }
  }, { repairId: setup.repairId });

  expect(saveResult.ok).toBeTruthy();
  expect(saveResult.savedOrder).toBeTruthy();
  expect(saveResult.savedOrder.assignedTo).toBe('Tech - Mark');
  expect(saveResult.savedOrder.clientName).toBe('Test Client Mark');
  expect(saveResult.savedOrder.date).toBe('2026-04-14');

  expect(saveResult.targetNote).toBeTruthy();
  expect(saveResult.targetNote.recipient).toBe('Tech - Mark');
  expect(saveResult.targetNote.title).toContain('Work order assigned');
});
