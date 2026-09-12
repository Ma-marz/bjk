const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let incomplete = true;
    await page.route('https://script.google.com/**', route => route.fulfill({ json: { success: true, data: {} } }));
    await page.route('**/game/img/*.png', route => {
      const number = Number(route.request().url().match(/\/(\d+)\.png$/)?.[1]);
      return incomplete && number >= 8 ? route.abort() : route.continue();
    });
    await page.goto('http://localhost:8000');
    await page.evaluate(() => {
      appState.currentUser = { id: 'test', name: 'Leo' };
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('appScreen').classList.remove('hidden');
      showView('games'); openGameSubView('bjk-memory');
    });
    await page.waitForSelector('#memoryBoard .message.error');
    assert.equal(await page.locator('.memory-card').count(), 0);
    assert.equal(await page.locator('#memoryTime').textContent(), '0.00');
    incomplete = false;
    await page.locator('#memoryRestart').click();
    await page.waitForFunction(() => document.querySelectorAll('.memory-card').length === 16);
    await page.evaluate(() => document.querySelector('.memory-card').remove());
    await page.locator('.memory-card').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.memory-card').length === 16);
    assert.equal(await page.locator('#memoryAttempts').textContent(), '0');
    assert.equal(await page.locator('#memoryTime').textContent(), '0.00');
    const modes = await page.evaluate(() => [0, 4999, 5000, 9999, 10000].map(value => {
      score = value; updateSkyCycle(); return game.classList.contains('night');
    }));
    assert.deepEqual(modes, [false, false, true, true, false]);
    const cloud = await page.locator('.game-cloud').first().evaluate(el => getComputedStyle(el).backgroundColor);
    assert.ok(cloud.includes('110, 100, 88'));
    let pdfLoads = 0;
    page.on('request', request => { if (/\/prayer\/Leo\/.*\.pdf$/.test(request.url())) pdfLoads++; });
    await page.evaluate(() => showView('prayers'));
    await page.waitForSelector('#prayerImage:not(.hidden)');
    const selected = await page.locator('#prayerSelect').inputValue();
    const initialLoads = pdfLoads;
    await page.evaluate(() => { showView('messages'); showView('prayers'); });
    await page.waitForFunction(() => document.getElementById('prayerImage').getAttribute('aria-busy') === 'false');
    assert.equal(pdfLoads, initialLoads, 'Returning to latest PDF reuses the visible preview');
    assert.equal(await page.locator('#prayerSelect').inputValue(), selected);
    assert.equal(await page.locator('#prayerImage').isVisible(), true);
    const older = await page.locator('#prayerSelect option').nth(1).getAttribute('value');
    await page.selectOption('#prayerSelect', older);
    await page.waitForFunction(() => document.getElementById('prayerImage').getAttribute('aria-busy') === 'false');
    const olderLoads = pdfLoads;
    await page.evaluate(() => { showView('messages'); showView('prayers'); });
    await page.waitForFunction(() => document.getElementById('prayerImage').getAttribute('aria-busy') === 'false');
    assert.ok(pdfLoads > olderLoads, 'Returning from an older PDF loads the latest');
    assert.equal(await page.locator('#prayerSelect').inputValue(), selected);
    console.log('PASS: incomplete memory boards retry without starting; Mario sky switches at 5000; latest PDF is reused and older PDFs switch to latest on tab return');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
