const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    const calls = [];
    let failSend = false;
    let failLeaderboard = true;
    page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
    await page.route('https://ui-avatars.com/**', route => route.abort());
    await page.route('**/game/img/*.png', route => route.fulfill({
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64')
    }));
    await page.route('https://script.google.com/**', async route => {
      const body = route.request().postDataJSON();
      calls.push(body.action);
      await new Promise(resolve => setTimeout(resolve, 250));
      const data = body.action === 'login'
        ? { token: 'test-token', user: { id: 'test', name: 'Leo', active: true }, users: [{ id: 'other', name: 'Other', active: true }], leaderboard: [] }
        : { messages: [], leaderboard: body.game === 'bjk-memory' ? [{ userId: 'test', userName: 'Leo', bestScore: -11999.000008 }] : [], bestScore: body.score || 0 };
      await route.fulfill({ json: { success: !((body.action === 'sendMessage' && failSend) || (body.action === 'getLeaderboard' && failLeaderboard)), data } });
    });
    await page.goto('http://localhost:8000');
    await page.screenshot({ path: '/tmp/bjk-login-desktop.png', fullPage: true });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Login fits ${width}`);
    }
    await page.screenshot({ path: '/tmp/bjk-login-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.fill('#name', 'Leo');
    await page.fill('#password', 'test');
    await page.click('#loginButton');
    await page.waitForFunction(() => document.getElementById('pageActivity').dataset.state === 'loading');
    assert.equal(await page.locator('#loginButton').isDisabled(), true);
    await page.waitForSelector('#appScreen:not(.hidden)');
    await page.waitForFunction(() => pendingReads.size === 0);
    assert.equal(calls.filter(a => a === 'getUsers' || a === 'getLeaderboard').length, 0);
    assert.equal(calls.filter(a => a === 'getInbox').length, 1);
    await page.click('[data-view="messages"]');
    await page.selectOption('#recipientSelect', 'other');
    await page.fill('#messageText', 'Preserve this draft');
    failSend = true;
    await page.click('#sendMessageButton');
    await page.waitForSelector('#messageFormError:not(.hidden)');
    assert.equal(await page.inputValue('#messageText'), 'Preserve this draft');
    assert.equal(await page.locator('#pageActivity').getAttribute('data-state'), 'error');
    await page.click('[data-view="games"]');
    await page.click('.play-game-button[data-game="bjk-memory"]');
    await page.waitForSelector('.memory-card');
    await page.waitForSelector('#retryDataButton:not(.hidden)');
    failLeaderboard = false;
    await page.click('#retryDataButton');
    await page.waitForFunction(() => document.getElementById('pageActivity').dataset.state === 'ready');
    assert.equal(await page.locator('#retryDataButton').isVisible(), false);
    assert.equal(await page.locator('#leaderboard-bjk-memory li').first().textContent(), 'Leo — 12.00 s · 8 katset');
    assert.equal(await page.locator('.memory-card').count(), 16);
    await page.click('#memoryRestart');
    await page.waitForFunction(() => !document.getElementById('memoryRestart').disabled);
    assert.equal(await page.locator('.memory-card').count(), 16);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ['prayers', 'messages', 'games', 'settings']) {
        await page.click(`[data-view="${view}"]`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No overflow: ${view} at ${width}`);
        assert.equal(await page.locator('.data-activity').count(), 1);
      }
      await page.click('[data-view="games"]');
      await page.screenshot({ path: `/tmp/bjk-games-${width}.png`, fullPage: true });
      await page.click('.play-game-button[data-game="bjk-memory"]');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Memory fits ${width}`);
      if (width === 390) await page.screenshot({ path: '/tmp/bjk-memory-mobile.png', fullPage: true });
    }
    await page.evaluate(() => { const end = beginDataActivity('games', 'Test…'); end(); });
    await page.waitForFunction(() => document.getElementById('pageActivity').classList.contains('hidden'), null, { timeout: 6000 });
    await page.evaluate(() => window.reportScoreStatus('bjk-memory', 'pending', 'Salvestamine ootel.'));
    assert.equal(await page.locator('#pageActivity').isVisible(), true);
    await page.click('[data-view="settings"]');
    assert.equal(await page.locator('#pageActivity').isVisible(), false, 'Other-page score status is hidden');
    assert.deepEqual(errors, []);
    console.log('PASS: mobile/desktop layouts at 320–1440px, one scoped status, success auto-hide, login, failed drafts, memory restart; no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
