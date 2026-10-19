const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const users = [{ id: 'me', name: 'Leo' }, { id: 'a', name: 'Anett' }, { id: 'b', name: 'Paul' }];
    const sent = [{ id: '1', senderId: 'me', receiverId: 'a', message: 'Old outgoing', createdAt: '2025-01-01T10:00:00Z' }];
    const inbox = [{ id: '2', senderId: 'a', receiverId: 'me', message: '<img src=x onerror=alert(1)>', createdAt: '2025-01-01T11:00:00Z' }, { id: '3', senderId: 'gone', senderName: 'Former member', receiverId: 'me', message: 'Archived message', createdAt: '2024-01-01T11:00:00Z' }];
    let fail = false;
    const readStates = new Map();
    await page.route('https://script.google.com/**', async route => {
      const body = route.request().postDataJSON();
      let data = {};
      if (body.action === 'login') data = { token: 'chat-test', user: users[0], users, leaderboard: [] };
      if (body.action === 'getInbox') data = { messages: inbox, readStates: [...readStates].map(([peerId, lastReadAt]) => ({ peerId, lastReadAt })) };
      if (body.action === 'markChatRead') {
        const message = inbox.find(message => message.id === body.messageId);
        readStates.set(body.peerId, message.createdAt);
        data = { peerId: body.peerId, lastReadAt: message.createdAt };
      }
      if (body.action === 'getSentMessages') data = { messages: sent };
      if (body.action === 'sendMessage') {
        await new Promise(resolve => setTimeout(resolve, 150));
        if (!fail) { const message = { id: String(sent.length + 10), senderId: 'me', receiverId: body.receiverId, message: body.message, createdAt: new Date().toISOString() }; sent.push(message); data = { message }; }
      }
      await route.fulfill({ json: { success: !(body.action === 'sendMessage' && fail), data } });
    });
    await page.goto(process.env.BJK_TEST_URL || 'http://localhost:8000');
    await page.fill('#name', 'Leo'); await page.fill('#password', 'test'); await page.click('#loginButton');
    await page.waitForSelector('#appScreen:not(.hidden)');
    await page.waitForFunction(() => pendingReads.size === 0);
    assert.equal(await page.locator('[data-view="messages"]').evaluate(el => el.classList.contains('has-unread')), true);
    await page.click('[data-view="messages"]');
    assert.equal(await page.locator('.conversation').count(), 3);
    assert.equal(await page.locator('[data-user-id="a"].unread').count(), 1);
    await page.click('[data-user-id="a"]');
    await page.waitForFunction(() => !document.querySelector('[data-user-id="a"]').classList.contains('unread'));
    assert.deepEqual(await page.locator('.chat-body').allTextContents(), ['Old outgoing', '<img src=x onerror=alert(1)>']);
    assert.equal(await page.locator('.chat-body img').count(), 0);
    assert.equal(await page.locator('.outgoing').count(), 1);
    await page.fill('#messageText', 'Draft for Anett');
    await page.click('[data-user-id="b"]');
    assert.equal(await page.inputValue('#messageText'), '');
    await page.fill('#messageText', 'Draft for Paul');
    await page.click('[data-user-id="a"]');
    assert.equal(await page.inputValue('#messageText'), 'Draft for Anett');
    fail = true; await page.click('#sendMessageButton');
    await page.waitForSelector('#messageFormError:not(.hidden)');
    assert.equal(await page.inputValue('#messageText'), 'Draft for Anett');
    fail = false; await page.click('#sendMessageButton');
    await page.waitForFunction(() => document.getElementById('messageText').value === '');
    assert.equal(await page.locator('.chat-body').last().textContent(), 'Draft for Anett');
    await page.click('#refreshChats'); await page.waitForFunction(() => !document.getElementById('refreshChats').disabled);
    assert.equal(await page.locator('.chat-body').count(), 3, 'server message has no duplicate after refresh');
    inbox.push({ id: 'new-incoming', senderId: 'a', receiverId: 'me', message: 'New reply', createdAt: new Date().toISOString() });
    await page.evaluate(() => refreshChatMessages());
    assert.equal(await page.locator('.chat-body').last().textContent(), 'New reply');
    await page.fill('#chatSearch', 'Paul'); assert.equal(await page.locator('.conversation').count(), 1);
    await page.fill('#chatSearch', '');
    await page.click('[data-user-id="gone"]');
    await page.waitForFunction(() => !document.querySelector('[data-view="messages"]').classList.contains('has-unread'));
    assert.equal(await page.locator('.chat-body').textContent(), 'Archived message');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width < 700) {
        await page.click('#chatBack'); assert.equal(await page.locator('.chat-sidebar').isVisible(), true);
        await page.click('[data-user-id="a"]'); assert.equal(await page.locator('.chat-sidebar').isVisible(), false);
      }
    }
    await page.screenshot({ path: '/tmp/bjk-chat-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/tmp/bjk-chat-mobile.png', fullPage: true });
    const composer = await page.locator('.chat-composer').boundingBox();
    const nav = await page.locator('.main-nav').boundingBox();
    assert.ok(composer.y + composer.height <= nav.y, 'composer stays above mobile navigation');
    await page.evaluate(() => showView('prayers'));
    inbox.push({ id: 'off-page', senderId: 'b', receiverId: 'me', message: 'Unread on another page', createdAt: new Date().toISOString() });
    await page.evaluate(() => refreshChatMessages());
    assert.equal(await page.locator('[data-view="messages"]').evaluate(el => el.classList.contains('has-unread')), true);
    await page.click('[data-view="messages"]');
    await page.click('#chatBack');
    assert.equal(await page.locator('[data-user-id="b"].unread').count(), 1);
    await page.click('[data-user-id="b"]');
    await page.waitForFunction(() => !document.querySelector('[data-view="messages"]').classList.contains('has-unread'));
    await page.click('#logoutButton');
    await page.waitForSelector('#appScreen.hidden', { state: 'attached' });
    assert.equal(await page.inputValue('#messageText'), '');
    assert.deepEqual(errors, []);
    console.log('PASS: legacy threads, safe text, per-person drafts, failed/successful send, refresh, former members, mobile navigation, layout and logout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
