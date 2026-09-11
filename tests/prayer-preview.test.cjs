const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://script.google.com/**', route => route.fulfill({ json: { success: true, data: {} } }));
    await page.goto('http://localhost:8000');
    await page.evaluate(async () => {
      setSessionState('preview-test', { id: 'test', name: 'Leo' });
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('appScreen').classList.remove('hidden');
      showView('prayers');
      await loadPDF(buildPrayerUrl('Leo', 21));
    });
    await page.waitForSelector('#prayerImage:not(.hidden)');
    assert.equal(await page.locator('iframe:visible').count(), 0);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.locator('#prayerImage').evaluate(img => ({
        width: img.clientWidth, height: img.clientHeight, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
        pageFits: document.documentElement.scrollWidth <= innerWidth
      }));
      assert.ok(dimensions.naturalWidth > 1000);
      assert.ok(dimensions.pageFits);
      assert.ok(Math.abs(dimensions.width / dimensions.height - dimensions.naturalWidth / dimensions.naturalHeight) < .01);
      const image = await page.locator('#prayerImage').boundingBox();
      const button = await page.locator('#openPDFButton').boundingBox();
      assert.ok(button.y >= image.y + image.height);
      await page.screenshot({ path: `/tmp/bjk-prayer-image-${width}.png`, fullPage: true });
    }
    // One failed PDF request can be retried without losing the external link.
    let fail = true;
    await page.route('**/prayer/Leo/*20.pdf', async route => {
      if (fail) { fail = false; await route.fulfill({ status: 503, body: 'Unavailable' }); }
      else await route.continue();
    });
    await page.evaluate(() => loadPDF(buildPrayerUrl('Leo', 20)));
    assert.equal(await page.locator('#retryDataButton').isVisible(), true);
    assert.equal(await page.locator('#openPDFButton').isVisible(), true);
    await page.click('#retryDataButton');
    await page.waitForSelector('#prayerImage:not(.hidden)');
    await page.evaluate(() => { window.open = (...args) => { window.openedPdf = args; return null; }; });
    await page.click('#openPDFButton');
    const opened = await page.evaluate(() => window.openedPdf);
    assert.ok(opened[0].endsWith('20.pdf'));
    assert.equal(opened[1], '_blank');
    assert.equal(opened[2], 'noopener,noreferrer');
    assert.deepEqual(errors, []);
    console.log('PASS: real single-page PDF rendered as full image at mobile/desktop widths, retry recovery, external PDF button');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
