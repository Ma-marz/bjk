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
      if (body.action === 'getUsers') data = { users };
      if (body.action === 'getInbox') data = { messages: inbox, readStates: [...readStates].map(([peerId, lastReadAt]) => ({ peerId, lastReadAt })) };
      if (body.action === 'markChatRead') {
        const message = inbox.find(message => message.id === body.messageId);
        readStates.set(body.peerId, message.createdAt);
        data = { peerId: body.peerId, lastReadAt: message.createdAt };
      }
      if (body.action === 'getSentMessages') data = { messages: sent };
      if (body.action === 'addJournalEntry') {
        if (!fail) {
          const message = { id: 'journal-' + inbox.length, sourceMessageIds: body.sourceMessageIds || [], senderId: 'me', receiverId: 'me', message: body.message, createdAt: new Date().toISOString() };
          inbox.push(message);
          data = { message };
        }
      }
      if (body.action === 'deleteJournalEntry' && !fail) {
        const index = inbox.findIndex(message => message.id === body.id);
        inbox.splice(index, 1);
        data = { id: body.id };
      }
      if (body.action === 'editJournalEntry' && !fail) {
        const message = inbox.find(message => message.id === body.id);
        message.message = body.message;
        message.sourceMessageIds = body.sourceMessageIds || message.sourceMessageIds || [];
        data = { message };
      }
      if (body.action === 'sendMessage') {
        await new Promise(resolve => setTimeout(resolve, 150));
        if (!fail) { const message = { id: String(sent.length + 10), senderId: 'me', receiverId: body.receiverId, message: body.message, createdAt: new Date().toISOString() }; sent.push(message); data = { message }; }
      }
      await route.fulfill({ json: { success: !(['sendMessage', 'addJournalEntry', 'editJournalEntry', 'deleteJournalEntry'].includes(body.action) && fail), data } });
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
    assert.equal(await page.locator('.chat-unread-divider').count(), 1);
    assert.equal(await page.locator('.chat-unread-divider + .chat-bubble .chat-body').textContent(), '<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('.chat-body img').count(), 0);
    assert.equal(await page.locator('.outgoing').count(), 1);
    await page.fill('#messageText', 'Draft for Anett');
    await page.click('[data-user-id="b"]');
    assert.equal(await page.inputValue('#messageText'), '');
    await page.fill('#messageText', 'Draft for Paul');
    await page.click('[data-user-id="a"]');
    assert.equal(await page.inputValue('#messageText'), 'Draft for Anett');
    assert.equal(await page.locator('.chat-unread-divider').count(), 0, 'read conversation has no divider when reopened');
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
    assert.equal(await page.locator('.chat-sidebar input[type=search]').count(), 0);
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
    await page.click('[data-view="journal"]');
    await page.fill('#journalText', 'A private thought <b>kept as text</b>');
    fail = true;
    await page.click('#saveJournal');
    await page.waitForSelector('#journalError:not(.hidden)');
    assert.equal(await page.inputValue('#journalText'), 'A private thought <b>kept as text</b>');
    fail = false;
    await page.click('#saveJournal');
    await page.waitForSelector('.journal-entry');
    assert.equal(await page.inputValue('#journalText'), '');
    assert.equal(await page.locator('.journal-body').textContent(), 'A private thought <b>kept as text</b>');
    assert.equal(await page.locator('.journal-body b').count(), 0);
    await page.evaluate(() => refreshChatMessages());
    assert.equal(await page.locator('.journal-entry').count(), 1);
    assert.equal(await page.locator('.conversation').count(), 3, 'notes do not create a self-chat');
    assert.equal(await page.locator('[data-view="messages"]').evaluate(el => el.classList.contains('has-unread')), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const originalDate = await page.locator('.journal-date').textContent();
    await page.click('#journalNewPage');
    assert.equal(await page.locator('#journalNext').isDisabled(), true);
    await page.fill('#journalText', 'Draft of a new note');
    assert.equal(await page.locator('#journalPrevious').isDisabled(), true);
    assert.equal(await page.locator('.journal-entry').count(), 0, 'draft hides previous entries');
    await page.click('#cancelJournalEdit');
    await page.click('#journalPrevious');
    await page.click('.journal-edit');
    assert.equal(await page.inputValue('#journalText'), 'A private thought <b>kept as text</b>');
    await page.fill('#journalText', 'Cancelled edit');
    await page.click('#cancelJournalEdit');
    assert.equal(await page.inputValue('#journalText'), '');
    await page.click('.journal-edit');
    await page.fill('#journalText', 'Updated thought');
    await page.evaluate(() => refreshChatMessages());
    assert.equal(await page.inputValue('#journalText'), 'Updated thought', 'polling preserves edit draft');
    fail = true;
    await page.click('#saveJournal');
    await page.waitForSelector('#journalError:not(.hidden)');
    assert.equal(await page.inputValue('#journalText'), 'Updated thought');
    fail = false;
    await page.click('#saveJournal');
    await page.waitForFunction(() => document.querySelector('.journal-body')?.textContent === 'Updated thought');
    assert.equal(await page.locator('.journal-date').textContent(), originalDate);
    assert.equal(await page.locator('.journal-entry').count(), 1);
    assert.equal(await page.inputValue('#journalText'), '');

    await page.click('#journalNewPage');
    await page.fill('#journalText', 'Existing unsaved thought');
    await page.click('[data-view="messages"]');
    await page.evaluate(() => openConversation('a'));
    const firstBubble = page.locator('.chat-bubble').filter({ hasText: 'Old outgoing' });
    await firstBubble.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, clientX: 10, clientY: 10 });
    await page.waitForTimeout(600);
    await firstBubble.dispatchEvent('pointerup', { pointerType: 'touch', button: 0, clientX: 10, clientY: 10 });
    assert.equal(await page.locator('#messageActions').evaluate(dialog => dialog.open), false, 'long hold does not open journal actions');
    assert.equal(await firstBubble.evaluate(bubble => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      bubble.dispatchEvent(event);
      return event.defaultPrevented;
    }), false, 'native copy menu is not blocked');
    assert.equal(await firstBubble.evaluate(bubble => {
      const range = document.createRange();
      range.selectNodeContents(bubble.querySelector('.chat-body'));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      return window.getSelection().toString();
    }), 'Old outgoing', 'message text remains selectable');
    await firstBubble.dblclick();
    await page.waitForSelector('#messageActions[open]');
    await page.click('#copyMessageToJournal');
    assert.equal(await page.locator('#view-journal').isVisible(), true);
    assert.match(await page.inputValue('#journalText'), /Existing unsaved thought[\s\S]*Old outgoing/);
    assert.equal(await page.locator('.journal-entry').count(), 0);
    assert.equal(inbox.filter(message => message.senderId === 'me' && message.receiverId === 'me').length, 1, 'copy only creates a draft');
    await page.click('[data-view="messages"]');
    assert.equal(await firstBubble.locator('.message-journal-link').count(), 1);
    await firstBubble.locator('.message-journal-link').click();
    assert.equal((await page.inputValue('#journalText')).split('Old outgoing').length - 1, 1, 'copy cannot duplicate a message');
    await page.click('[data-view="messages"]');
    const incoming = page.locator('.chat-bubble').filter({ hasText: '<img src=x onerror=alert(1)>' });
    for (let tap = 0; tap < 2; tap++) {
      await incoming.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, clientX: 20, clientY: 20 });
      await incoming.dispatchEvent('pointerup', { pointerType: 'touch', button: 0, clientX: 20, clientY: 20 });
    }
    await page.waitForSelector('#messageActions[open]');
    await page.click('#copyMessageToJournal');
    const copiedDraft = await page.inputValue('#journalText');
    assert.match(copiedDraft, /Old outgoing[\s\S]*<img src=x onerror=alert\(1\)>/);
    await page.reload();
    await page.waitForSelector('#appScreen:not(.hidden)');
    await page.waitForFunction(() => pendingReads.size === 0);
    await page.click('[data-view="journal"]');
    assert.equal(await page.inputValue('#journalText'), copiedDraft, 'draft survives reload');
    assert.equal(await page.locator('.journal-entry').count(), 0, 'draft still locks older entries');
    await page.fill('#journalText', copiedDraft + 'My thoughts about these messages');
    await page.click('#saveJournal');
    await page.waitForSelector('.journal-entry');
    assert.equal(await page.locator('.journal-entry').count(), 1, 'only one saved entry per page');
    assert.equal(await page.locator('#journalPageNumber').textContent(), 'Leht 2 / 3');
    await page.click('[data-view="messages"]');
    await page.evaluate(() => openConversation('a'));
    assert.equal(await page.locator('.message-journal-link').count(), 2);
    await page.locator('.message-journal-link').first().click();
    assert.match(await page.locator('.journal-body').textContent(), /My thoughts about these messages/);
    assert.equal(await page.locator('#journalForm').isVisible(), false, 'linked notes open for reading');
    assert.equal(await page.locator('#journalPageNumber').textContent(), 'Leht 2 / 3');
    await page.click('#journalPrevious');
    assert.equal(await page.locator('.journal-body').textContent(), 'Updated thought');
    assert.equal(await page.locator('#journalPrevious').isDisabled(), true);
    const notebook = page.locator('#journalNotebook');
    await notebook.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 280, clientY: 450 });
    await notebook.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 120, clientY: 460 });
    assert.equal(await page.locator('#journalPageNumber').textContent(), 'Leht 2 / 3', 'swipe left moves forward');
    await notebook.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 120, clientY: 450 });
    await notebook.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 280, clientY: 455 });
    assert.equal(await page.locator('#journalPageNumber').textContent(), 'Leht 1 / 3', 'swipe right moves backward');
    await notebook.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 180, clientY: 500 });
    await notebook.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 190, clientY: 350 });
    assert.equal(await page.locator('#journalPageNumber').textContent(), 'Leht 1 / 3', 'vertical scrolling does not turn a page');
    await page.click('#journalNewPage');
    assert.equal(await page.locator('#journalPageNumber').textContent(), 'Leht 3 / 3');
    assert.equal(await page.locator('#journalNext').isDisabled(), true);
    assert.equal(await page.locator('#journalForm').isVisible(), true);
    await page.fill('#journalText', 'A page draft');
    await notebook.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 450 });
    await notebook.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 280, clientY: 455 });
    assert.equal(await page.locator('.journal-entry').count(), 0, 'unfinished draft blocks swiping');
    await page.click('#cancelJournalEdit');
    await page.click('#journalPrevious');
    await page.click('.journal-edit');
    const beforeDelete = await page.inputValue('#journalText');
    page.once('dialog', dialog => dialog.dismiss());
    await page.click('#deleteJournalEntry');
    assert.equal(await page.inputValue('#journalText'), beforeDelete, 'cancel keeps entry and draft');
    fail = true;
    page.once('dialog', dialog => dialog.accept());
    await page.click('#deleteJournalEntry');
    await page.waitForSelector('#journalError:not(.hidden)');
    assert.equal(await page.inputValue('#journalText'), beforeDelete, 'failed delete preserves draft');
    fail = false;
    page.once('dialog', dialog => dialog.accept());
    await page.click('#deleteJournalEntry');
    await page.waitForFunction(() => document.getElementById('journalText').value === '');
    assert.equal(await page.locator('#journalPageNumber').textContent(), 'Leht 2 / 2');
    assert.equal(await page.locator('#deleteJournalEntry').isVisible(), false);
    await page.click('[data-view="messages"]');
    await page.evaluate(() => openConversation('a'));
    assert.equal(await page.locator('.message-journal-link').count(), 0, 'deleting entry removes chat links');
    await page.click('#logoutButton');
    await page.waitForSelector('#appScreen.hidden', { state: 'attached' });
    assert.equal(await page.inputValue('#messageText'), '');
    assert.equal(await page.locator('.journal-entry').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: legacy threads, safe text, per-person drafts, failed/successful send, refresh, former members, mobile navigation, layout and logout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
