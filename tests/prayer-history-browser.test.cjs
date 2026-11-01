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
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [];
      let failHistory = false;
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
      if (mode === 'http') await page.route('http://prayer-history.test/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/tools/prayer-generator/history.json') {
          await route.fulfill(failHistory ? { status: 503, body: 'Unavailable' } : { json: history }); return;
        }
        const target = path.join(process.cwd(), pathname === '/' ? 'index.html' : pathname);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { await route.fulfill({ status: 404, body: '' }); return; }
        const types = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.png': 'image/png' };
        await route.fulfill({ contentType: types[path.extname(target)] || 'application/octet-stream', body: fs.readFileSync(target) });
      });
      await page.goto(mode === 'file' ? pathToFileURL(path.resolve('index.html')).href : 'http://prayer-history.test/');
      await page.evaluate(async data => {
        window.BJK_PRAYER_HISTORY = data;
        appState.currentUser = { id: 'leo', name: 'Leo' };
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
        await renderPrayerHistory();
      }, history);
      assert.equal(await page.locator('#currentPrayerName').textContent(), history.weeks['31'].assignments['Leo Kask']);
      await page.click('#currentPrayer');
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
      await page.click('#prayerHistoryBack');
      assert.equal(await page.locator('#view-prayers').isVisible(), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS: current assignment, past/future privacy, week dates, history navigation, retry and mobile layout in file and HTTP modes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
