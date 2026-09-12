const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:8000');
    await page.addStyleTag({ content: '.view-panel { min-height: 1800px; }' });
    await page.evaluate(() => {
      appState.currentUser = { id: 'test', name: 'Test' };
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('appScreen').classList.remove('hidden');
    });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => showView('messages'));
      await page.evaluate(() => window.scrollTo(0, 600));
      assert.ok(await page.evaluate(() => scrollY > 0));
      await page.locator('[data-view="games"]').click();
      assert.equal(await page.evaluate(() => scrollY), 0);

      for (const dx of [-110, 110]) {
        await page.evaluate(() => setActivityResult('games', true, 'Test notification'));
        const banner = page.locator('#pageActivity');
        const box = await banner.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 20);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + dx, box.y + 20, { steps: 8 });
        await page.mouse.up();
        assert.equal(await banner.isVisible(), false);
        await page.evaluate(() => renderDataActivity());
        assert.equal(await banner.isVisible(), false);
      }
      await page.evaluate(() => setActivityResult('games', true, 'Another notification'));
      const banner = page.locator('#pageActivity');
      const box = await banner.boundingBox();
      await page.mouse.move(box.x + 100, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 105, box.y + 120, { steps: 8 });
      await page.mouse.up();
      assert.equal(await banner.isVisible(), true, 'Vertical gestures do not dismiss');
      await page.locator('#dismissActivityButton').focus();
      await page.keyboard.press('Enter');
      assert.equal(await banner.isVisible(), false);
    }
    console.log('PASS: tab scroll reset, left/right swipe, persistent dismissal, vertical gestures, and keyboard close at mobile/desktop widths');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
