const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('script.js', 'utf8');
const queue = source.slice(source.indexOf('// Persist before sending'), source.indexOf('function setUpEventBindings'));
function setup(send, storageFails = false) {
    const storage = new Map();
    const context = vm.createContext({
        appState: { currentUser: { id: 'a', bestScore: 0 }, sessionToken: 'token-a' },
        localStorage: { getItem: k => storage.get(k), setItem: (k,v) => { if (storageFails) throw Error('disabled'); storage.set(k,v); } },
        document: { querySelector: () => null, getElementById: () => null },
        window: { addEventListener() {} }, setInterval() {}, console,
        callAppsScript: send, setSessionState() {}, renderLeaderboard() {}, updateDbTimestamp() {}
    });
    vm.runInContext(queue, context);
    return context;
}
const ok = score => ({ success: true, data: { bestScore: score, leaderboard: [] } });
test('persists before sending and preserves overlapping saves', async () => {
    let release;
    const calls = [];
    const c = setup(async (_, item) => {
        calls.push(item.score);
        if (calls.length === 1) await new Promise(r => release = r);
        return ok(item.score);
    });
    const first = c.saveScoreWithFallback('bjker-mario', 100);
    assert.equal(c.readPendingScores().length, 1);
    const second = c.saveScoreWithFallback('bjker-mario', 200);
    assert.equal(c.readPendingScores().length, 2);
    release();
    await Promise.all([first, second]);
    assert.deepEqual(calls, [100, 200]);
    assert.equal(c.readPendingScores().length, 0);
    assert.equal(c.appState.currentUser.bestScore, 200);
});
test('failed saves survive retry and cannot be sent as another user', async () => {
    let fail = true;
    const calls = [];
    const c = setup(async (_, item) => { calls.push(item); if (fail) throw Error('offline'); return ok(item.score); });
    assert.equal((await c.saveScoreWithFallback('bjker-mario', 300)).queued, true);
    c.appState.currentUser = { id: 'b' };
    c.appState.sessionToken = 'token-b';
    await c.processPendingScores();
    assert.equal(calls.length, 1);
    c.appState.currentUser = { id: 'a', bestScore: 0 };
    c.appState.sessionToken = 'token-a';
    fail = false;
    await c.processPendingScores();
    assert.equal(c.readPendingScores().length, 0);
    assert.equal(calls[1].token, 'token-a');
});
test('memory results do not overwrite Mario best', async () => {
    const c = setup(async () => ok(-12000));
    c.appState.currentUser.bestScore = 500;
    await c.saveScoreWithFallback('bjk-memory', -12000);
    assert.equal(c.appState.currentUser.bestScore, 500);
});
test('storage failures retain pending scores in memory', async () => {
    const c = setup(async () => ({ success: false }), true);
    await c.saveScoreWithFallback('bjker-mario', 100);
    assert.equal(c.readPendingScores().length, 1);
});
