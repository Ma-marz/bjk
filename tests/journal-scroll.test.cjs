const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1280, height: 844 }, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage();
      await page.goto(pathToFileURL(path.resolve('index.html')).href);
      await page.evaluate(() => {
        appState.currentUser = { id: 'scroll-test', name: 'Test' };
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
        showView('journal');
      });
      const text = page.locator('#journalText');
      const initial = await text.evaluate(input => input.clientHeight);
      await text.fill(Array.from({ length: 60 }, (_, i) => `Notebook line ${i + 1}: thoughts for the day.`).join('\n'));
      const size = await text.evaluate(input => ({ height: input.clientHeight, content: input.scrollHeight, resize: getComputedStyle(input).resize, top: input.scrollTop }));
      assert.ok(size.height > initial);
      assert.ok(size.content <= size.height + 1, 'editor fits all text');
      assert.equal(size.resize, 'none');
      assert.equal(size.top, 0);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (mobile) {
        const client = await context.newCDPSession(page);
        const box = await text.boundingBox();
        const x = box.x + box.width / 2;
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: 600 }] });
        for (let y = 580; y >= 300; y -= 20) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        const box = await text.boundingBox();
        await page.mouse.move(box.x + box.width / 2, Math.min(box.y + 100, 500));
        await page.mouse.wheel(0, 350);
      }
      await page.waitForFunction(() => window.scrollY > 50);
      assert.equal(await text.evaluate(input => input.scrollTop), 0, 'page scrolls rather than the editor');
      await text.fill('Short note');
      assert.ok(await text.evaluate(input => input.clientHeight) < size.height, 'editor shrinks after deleting text');
      await page.setViewportSize({ width: mobile ? 320 : 800, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await context.close();
    }
    console.log('PASS: journal auto-grows and shrinks; manual resizing disabled; wheel and touch gestures over text scroll the page');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
