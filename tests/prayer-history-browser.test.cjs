const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const history = JSON.parse(fs.readFileSync('tools/prayer-generator/history.json', 'utf8'));
history.weeks['32'] = { ...history.weeks['31'], week: 32, date: '2026-11-01' };
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ['file', 'http']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const errors = [];
      let failHistory = false;
      page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR', mode, error.message); });
      await page.addInitScript(() => {
        localStorage.setItem('bjkCurrentUser', JSON.stringify({ token: 'mobile-history-session', user: { id: 'leo', name: 'Leo', active: true } }));
      });
      await page.route('https://script.google.com/**', async route => {
        const action = route.request().postDataJSON().action;
        const data = action === 'getUsers' ? { users: [{ id: 'leo', name: 'Leo', active: true }] }
          : action === 'getLeaderboard' ? { leaderboard: [] } : { messages: [], readStates: [] };
        await route.fulfill({ json: { success: true, data } });
      });
      await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
      if (mode === 'http') await page.route('http://prayer-history.test/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/tools/prayer-generator/history.json') {
          await route.fulfill(failHistory ? { status: 503, body: 'Unavailable' } : { json: history }); return;
        }
        const target = path.join(process.cwd(), pathname === '/' ? 'index.html' : pathname);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { await route.fulfill({ status: 404, body: '' }); return; }
        const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.png': 'image/png' };
        await route.fulfill({ contentType: types[path.extname(target)] || 'application/octet-stream', body: fs.readFileSync(target) });
      });
      await page.goto(mode === 'file' ? pathToFileURL(path.resolve('index.html')).href : 'http://prayer-history.test/');
      try { await page.waitForFunction(() => document.getElementById('currentPrayerName').textContent !== 'Laadin…', null, { timeout: 8000 }); } catch (error) { console.error('STARTUP', mode, await page.evaluate(() => ({ user: typeof appState !== 'undefined' ? appState.currentUser : null, session: localStorage.getItem('bjkCurrentUser'), ready: document.readyState, historyFunction: typeof renderPrayerHistory, initFunction: typeof initializeApp }))); throw error; }
      assert.equal(await page.locator('#currentPrayerName').textContent(), history.weeks['31'].assignments['Leo Kask']);
      await page.tap('#currentPrayer');
      assert.equal(await page.locator('#view-prayer-history').isVisible(), true);
      assert.equal(await page.locator('.prayer-history-week').count(), 7);
      const current = page.locator('.prayer-history-week.current');
      assert.match(await current.textContent(), /Nädal 31/);
      assert.equal(await current.locator('strong').count(), 1);
      assert.equal(await current.locator('.prayer-week-dates').textContent(), '26.10.2026 – 01.11.2026');
      assert.equal(await page.locator('.prayer-history-week').filter({ hasText: 'Nädal 32' }).count(), 0);
      assert.equal(await page.locator('.prayer-history-week').nth(1).locator('strong').count(), 2);
      assert.equal(await page.locator('[data-view="prayers"]').getAttribute('aria-current'), 'page');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (mode === 'http') {
        failHistory = true;
        await page.evaluate(async () => { prayerHistoryPromise = undefined; await renderPrayerHistory(); });
        assert.equal(await page.locator('#prayerHistoryError').isVisible(), true);
        failHistory = false;
        await page.click('#prayerHistoryRetry');
        await page.waitForSelector('#prayerHistoryError.hidden', { state: 'attached' });
      }
      const pausedHistory = structuredClone(history);
      for (const week of ['30', '31']) Object.assign(pausedHistory.weeks[week], {
        assignments: { 'Leo Kask': 'Linnea Süvari', 'Linnea Süvari': '', 'Ott Rahuvarm': 'Leo Kask' },
        paused: ['Linnea Süvari'], extra_assignments: { 'Leo Kask': ['Ott Rahuvarm'] }
      });
      await page.evaluate(async data => { prayerHistoryPromise = Promise.resolve(data); await renderPrayerHistory(); }, pausedHistory);
      assert.equal(await page.locator('#currentPrayerName').textContent(), 'Linnea Süvari');
      assert.equal(await page.locator('#currentPrayerExtras strong').textContent(), 'Ott Rahuvarm');
      await page.evaluate(() => document.querySelector('#currentPrayerExtras details').open = true);
      assert.match(await page.locator('#currentPrayerExtras details').textContent(), /kiire aeg/);
      assert.equal(await page.locator('.prayer-history-week.current .prayer-extra-field strong').textContent(), 'Ott Rahuvarm');
      await page.evaluate(async () => { appState.currentUser.name = 'Linnea'; await renderPrayerHistory(); });
      assert.match(await page.locator('#currentPrayerName').textContent(), /puhka rahulikult/);
      assert.equal(await page.locator('#currentPrayerExtras').getAttribute('class').then(value => value.includes('hidden')), true);
      assert.match(await page.locator('.prayer-history-week').filter({ hasText: 'Nädal 30' }).textContent(), /olid sellel nädalal pausil/);
      assert.equal(await page.locator('.prayer-history-week').filter({ hasText: 'Nädal 30' }).locator('strong').textContent(), 'Leo Kask');
      assert.equal(await page.locator('.prayer-history-week.current .prayer-history-label').count(), 0);
      await page.click('#prayerHistoryBack');
      assert.equal(await page.locator('#view-prayers').isVisible(), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: current assignment, past/future privacy, week dates, history navigation, retry and mobile layout in file and HTTP modes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
