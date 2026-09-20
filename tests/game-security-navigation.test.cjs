const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 500 });
      const page = await context.newPage();
      const errors = [], saves = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://script.google.com/**', async route => {
        const body = route.request().postDataJSON();
        if (body.action === 'saveScore') saves.push(body);
        await route.fulfill({ json: { success: true, data: {
          user: { id: 'a', name: 'Test', image: '11.png' }, leaderboard: []
        } } });
      });
      await page.goto('http://localhost:8000');
      await page.evaluate(() => {
        setSessionState('test-token', { id: 'a', name: 'Test', image: '11.png' });
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
        showView('games'); openGameSubView('bjk-memory');
      });
      await page.waitForSelector('.memory-card');
      async function healthy(label) {
        const state = await page.evaluate(() => ({ blocked: BJKGameSecurity.blocked, reason: BJKGameSecurity.reason }));
        assert.equal(state.blocked, false, `${label}: ${state.reason}`);
      }
      const cards = await page.locator('.memory-card').evaluateAll(nodes => nodes.map(node => ({
        id: node.dataset.id, src: node.querySelector('img').getAttribute('src')
      })));
      const first = cards[0], match = cards.find(card => card.id !== first.id && card.src === first.src);
      const mismatch = cards.find(card => card.src !== first.src);
      await page.locator(`.memory-card[data-id="${first.id}"]`).click();
      await page.locator(`.memory-card[data-id="${mismatch.id}"]`).click();
      // Let the mismatch animation and timer finish on a different page.
      await page.evaluate(() => showView('messages'));
      await page.waitForTimeout(850);
      await healthy('Memory mismatch resolves while hidden');
      assert.equal(await page.locator('.game-security-message:visible').count(), 0);
      await page.evaluate(() => { showView('games'); openGameSubView('bjk-memory'); });
      await healthy('Reopening an existing board');
      assert.equal(await page.locator('.memory-card.flipped').count(), 0);
      await page.locator(`.memory-card[data-id="${first.id}"]`).click();
      await page.locator(`.memory-card[data-id="${match.id}"]`).click();
      await page.evaluate(() => showGamesList());
      await page.waitForTimeout(450);
      await healthy('Matched pair resolves on games list');
      await page.locator('.play-game-button[data-game="bjk-memory"]').click();
      assert.equal(await page.locator('.memory-card.matched').count(), 2);
      await page.setViewportSize({ width: width < 500 ? 900 : 390, height: 800 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(200);
      await healthy('Resize and reduced motion');
      // Rebuild, then leave before asynchronous board rendering settles.
      await page.locator('#memoryRestart').click();
      await page.evaluate(() => showView('settings'));
      await page.waitForTimeout(400);
      await healthy('Board rebuild completes on another page');
      for (const game of ['bjker-mario', 'bjk-flappy', 'bjk-memory']) {
        await page.evaluate(game => { showView('games'); openGameSubView(game); }, game);
        await page.waitForTimeout(200);
        await healthy(`Switching to ${game}`);
        await page.evaluate(() => showView('messages'));
        await page.waitForTimeout(200);
        await healthy(`Leaving ${game}`);
      }
      await page.evaluate(() => { showView('games'); openGameSubView('bjk-memory'); });
      // Actual tampering still blocks and cannot save a score.
      await page.evaluate(() => { document.getElementById('memoryTime').textContent = '0.01'; });
      await page.waitForFunction(() => BJKGameSecurity.blocked);
      assert.equal(await page.locator('#subview-bjk-memory > #gameSecurityMessage').isVisible(), true);
      for (const view of ['messages', 'settings', 'members', 'prayers']) {
        await page.evaluate(view => showView(view), view);
        assert.equal(await page.locator('#gameSecurityMessage').isVisible(), false, view);
      }
      await page.evaluate(() => { showView('games'); showGamesList(); });
      assert.equal(await page.locator('#gameSecurityMessage').isVisible(), false, 'Games list');
      for (const game of ['bjker-mario', 'bjk-flappy', 'bjk-memory']) {
        await page.locator(`.play-game-button[data-game="${game}"]`).click();
        assert.equal(await page.locator(`#subview-${game} > #gameSecurityMessage`).isVisible(), true, game);
        assert.equal(await page.locator('.game-security-message').count(), 1);
        await page.evaluate(() => showGamesList());
        assert.equal(await page.locator('#gameSecurityMessage').isVisible(), false);
      }
      assert.equal(await page.evaluate(() => BJKGameSecurity.blocked), true);
      assert.equal(saves.length, 0);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS: Memory hidden animations/rebuild, navigation, responsive layout and scoped blocked UI (${width}px)`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
