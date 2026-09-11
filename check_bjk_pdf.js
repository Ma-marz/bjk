const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });

  page.on('pageerror', err => console.log('PAGEERROR:', err.message));
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));

  await page.goto('http://localhost:8000/index.html');
  await page.fill('input[id="name"]', 'Markus');
  await page.fill('input[id="password"]', 'linnu');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  const canvas = await page.$('#pdfCanvas');
  const dataUrl = canvas ? await canvas.evaluate(c => c.toDataURL()) : null;
  console.log('HAS_CANVAS', !!canvas);
  console.log('DATAURL_PREFIX', dataUrl ? dataUrl.slice(0, 80) : 'none');
  console.log('ERROR_TEXT', await page.locator('#error').textContent().catch(() => ''));
  console.log('PRAYER_BUTTONS', await page.locator('.prayer-week-button').count());
  console.log('CANVAS_DIMENSIONS', canvas ? await canvas.evaluate(c => ({ w: c.width, h: c.height })) : null);
  console.log('PDFJS_GLOBAL', await page.evaluate(() => typeof window.pdfjsLib));

  await browser.close();
})();
