const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve('index.html')).href);
    await page.evaluate(() => {
      appState.currentUser = { id: 'scroll-test', name: 'Test' };
      document.getElementById('loginScreen').classList.add('hidden');
      document.getElementById('appScreen').classList.remove('hidden');
      showView('journal');
    });
    await page.fill('#journalText', Array.from({ length: 60 }, (_, i) => `Notebook line ${i + 1}`).join('\n'));
    await page.locator('#journalText').evaluate(input => { input.scrollTop = 0; });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('journalText')).backgroundPositionY === '0px');
    for (const scrollTop of [13, 43, 120, 0]) {
      await page.locator('#journalText').evaluate((input, top) => { input.scrollTop = top; }, scrollTop);
      await page.waitForFunction(top => getComputedStyle(document.getElementById('journalText')).backgroundPositionY === `${-(top % 28)}px`, scrollTop);
      const result = await page.locator('#journalText').evaluate(input => ({ top: input.scrollTop, attachment: getComputedStyle(input).backgroundAttachment }));
      assert.equal(result.top, scrollTop);
      assert.equal(result.attachment, 'scroll', 'explicit offset avoids double-scrolling the background');
    }
    assert.equal(await page.locator('#journalText').evaluate(input => getComputedStyle(input).overscrollBehaviorY), 'none');
    console.log('PASS: notebook ruling moves with text during partial-line scrolling and resets at the top');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
