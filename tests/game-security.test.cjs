// Run with a local static server on port 8000. All API requests are mocked.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    async function open(game = 'bjk-memory', save = 'ok') {
      const context = await browser.newContext({ hasTouch: true });
      const page = await context.newPage();
      const calls = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://script.google.com/**', async route => {
        const body = route.request().postDataJSON(); calls.push(body);
        const data = body.action === 'getCurrentUser' ? { user: { id: 'a', name: 'Test', image: '11.png' } } :
          body.action === 'saveScore' ? { bestScore: body.score, leaderboard: [{ userId: 'a', userName: 'Test', bestScore: body.score }] } : { leaderboard: [] };
        await route.fulfill({ json: { success: body.action !== 'saveScore' || save === 'ok', data } });
      });
      await page.goto('http://localhost:8000');
      await page.evaluate(game => {
        setSessionState('test-token', { id: 'a', name: 'Test', image: '11.png' });
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
        showView('games'); openGameSubView(game);
      }, game);
      if (game === 'bjk-memory') await page.waitForFunction(() => document.querySelectorAll('.memory-card').length === 16);
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => BJKGameSecurity.blocked), false);
      return { page, calls };
    }
    const attacks = [
      ['Mario collision position', 'bjker-mario', () => { document.getElementById('character').style.bottom = '150px'; }],
      ['Mario obstacle removal', 'bjker-mario', () => { document.getElementById('obstacle').remove(); }],
      ['Mario CSSOM collision rule', 'bjker-mario', () => {
        const sheet = [...document.styleSheets].find(sheet => sheet.href?.includes('game-styles.css'));
        [...sheet.cssRules].find(rule => rule.selectorText === '.character').style.left = '-100px';
      }],
      ['Memory completion class', 'bjk-memory', () => { document.querySelector('.memory-card').classList.add('matched'); }],
      ['Memory card removal', 'bjk-memory', () => { document.querySelector('.memory-card').remove(); }],
      ['Memory broad CSS reveal', 'bjk-memory', () => {
        const sheet = [...document.styleSheets].find(sheet => sheet.href?.includes('memory.css'));
        sheet.insertRule('* { backface-visibility: visible !important; }', sheet.cssRules.length);
      }],
      ['Memory stylesheet disabled', 'bjk-memory', () => {
        [...document.styleSheets].find(sheet => sheet.href?.includes('memory.css')).disabled = true;
      }],
      ['Memory timer', 'bjk-memory', () => { document.getElementById('memoryTime').textContent = '0.01'; }],
      ['Flappy collision function', 'bjk-flappy', () => { try { BJKFlappyEngine.Flight.prototype.step = () => {}; } catch (_) {} }],
      ['Flappy constants', 'bjk-flappy', () => { try { Object.defineProperty(BJKFlappyEngine, 'RADIUS', { value: 0 }); } catch (_) {} }],
      ['Flappy canvas attributes', 'bjk-flappy', () => { document.getElementById('flappyCanvas').width = 100; }],
      ['Shared clock', 'bjk-memory', () => { Date.now = () => 1; }],
      ['Forged completion event', 'bjker-mario', () => { window.dispatchEvent(new CustomEvent('bjk-best-score', { detail: { user: 'Test', score: 99999 } })); }],
      ['Direct score API', 'bjk-memory', () => callAppsScript('saveScore', { game: 'bjk-memory', score: -1 })],
      ['Forged queued result', 'bjk-memory', () => { localStorage.setItem('bjkPendingScoresV2', JSON.stringify([{ id:'fake', userId:'a', game:'bjker-mario', score:999 }])); processPendingScores(); }]
    ];
    for (const [label, game, attack] of attacks) {
      const { page, calls } = await open(game);
      if (game === 'bjker-mario') { await page.locator('#game').click(); await page.waitForTimeout(600); }
      if (game === 'bjk-memory') await page.locator('.memory-card').first().click();
      if (game === 'bjk-flappy') await page.locator('#flappyAction').click();
      await page.evaluate(attack);
      await page.waitForFunction(() => BJKGameSecurity.blocked);
      await page.evaluate(async () => {
        await saveScoreWithFallback('bjker-mario', 99999);
        showGamesList(); openGameSubView('bjk-memory');
        BJKMemory.init(); BJKFlappy.init();
        try { BJKGameSecurity.blocked = false; } catch (_) {}
      });
      const frozen = await page.evaluate(() => [
        document.querySelector('#obstacle')?.style.left,
        document.getElementById('memoryTime').textContent,
        document.getElementById('flappyCanvas').toDataURL()
      ]);
      await page.waitForTimeout(220);
      assert.deepEqual(await page.evaluate(() => [
        document.querySelector('#obstacle')?.style.left,
        document.getElementById('memoryTime').textContent,
        document.getElementById('flappyCanvas').toDataURL()
      ]), frozen, `${label}: all game rendering/timers stop`);
      assert.equal(await page.evaluate(() => BJKGameSecurity.blocked), true, label);
      assert.equal(calls.filter(call => call.action === 'saveScore').length, 0, label);
      assert.ok(await page.locator('#gameSecurityMessage').isVisible(), label);
      assert.equal(await page.evaluate(() => appState.currentUser.bestScore || 0), 0, label);
      await page.context().close();
      console.log(`PASS: ${label}`);
    }
    // Complete a real board using ordinary clicks; no model or clock changes.
    async function completeMemory(page) {
      const pairs = await page.locator('.memory-card').evaluateAll(cards => {
        const groups = {};
        cards.forEach(card => (groups[card.querySelector('img').getAttribute('src')] ||= []).push(card.dataset.id));
        return Object.values(groups);
      });
      for (const [first, second] of pairs) {
        await page.locator(`.memory-card[data-id="${first}"]`).click();
        await page.locator(`.memory-card[data-id="${second}"]`).click();
        await page.waitForTimeout(370);
      }
    }
    const normal = await open();
    const secondTab = await normal.page.context().newPage();
    await secondTab.route('https://script.google.com/**', route => route.fulfill({ json: { success: true, data: { leaderboard: [] } } }));
    await secondTab.goto('http://localhost:8000');
    await normal.page.bringToFront();
    await completeMemory(normal.page);
    assert.equal(await secondTab.evaluate(() => BJKGameSecurity.blocked), false, 'Other tabs may save normally');
    await secondTab.close();
    assert.equal(await normal.page.evaluate(() => BJKGameSecurity.blocked), false);
    assert.equal(normal.calls.filter(call => call.action === 'saveScore').length, 1);
    assert.ok(await normal.page.locator('#leaderboard-bjk-memory').textContent().then(text => text.includes('8 katset')));
    await normal.page.locator('#memoryRestart').click();
    await normal.page.waitForFunction(() => document.querySelectorAll('.memory-card').length === 16 && !document.querySelector('.memory-card.flipped'));
    assert.equal(await normal.page.evaluate(() => BJKGameSecurity.blocked), false);
    await normal.page.context().close();
    console.log('PASS: legitimate Memory completion, score acknowledgement and restart');

    const mario = await open('bjker-mario');
    await mario.page.locator('#game').click();
    // Jump using the same input as a player, only until one obstacle is passed.
    await mario.page.evaluate(() => new Promise(resolve => {
      let jumped = false;
      const timer = setInterval(() => {
        const left = document.getElementById('obstacle').offsetLeft;
        if (Number(document.getElementById('scoreBoard').textContent) > 0) {
          clearInterval(timer); resolve(); return;
        }
        if (left < 95 && left > 65 && !jumped) {
          document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
          jumped = true;
        }
      }, 20);
      setTimeout(() => { clearInterval(timer); resolve(); }, 8000);
    }));
    await mario.page.waitForFunction(() => Number(document.getElementById('bestScoreBoard').textContent) > 0);
    assert.equal(await mario.page.evaluate(() => BJKGameSecurity.blocked), false);
    assert.equal(mario.calls.filter(call => call.action === 'saveScore').length, 1);
    await mario.page.context().close();
    console.log('PASS: ordinary Mario jump, collision and acknowledged score');

    const offline = await open('bjk-memory', 'offline');
    await completeMemory(offline.page);
    assert.equal(await offline.page.evaluate(() => JSON.parse(localStorage.getItem('bjkPendingScoresV2')).length), 1);
    await offline.page.evaluate(() => { document.getElementById('memoryTime').textContent = '1'; });
    await offline.page.waitForFunction(() => BJKGameSecurity.blocked);
    assert.equal(await offline.page.evaluate(() => JSON.parse(localStorage.getItem('bjkPendingScoresV2')).length), 0);
    await offline.page.reload();
    assert.equal(await offline.page.evaluate(() => BJKGameSecurity.blocked), false);
    await offline.page.context().close();
    console.log('PASS: compromise discards pending page results; only reload clears the block');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
