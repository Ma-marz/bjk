const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const memory = fs.readFileSync('games/memory/memory.js', 'utf8');
const c = vm.createContext({});
vm.runInContext(memory.slice(memory.indexOf('const MEMORY_ATTEMPT_SCALE'), memory.indexOf('function listImages')), c);
const encode = c.encodeMemoryScore;
const decode = c.decodeMemoryScore;
test('time and attempts survive numeric JSON and storage round trips', () => {
  for (const time of [10, 12340, 60000, 3600000, 86400000]) {
    for (const attempts of [8, 12, 100, 999999]) {
      const score = Number(JSON.parse(JSON.stringify(encode(time, attempts))));
      assert.equal(decode(score).milliseconds, time);
      assert.equal(decode(score).attempts, attempts);
    }
  }
});
test('existing larger-is-better backend ranks time before attempts', () => {
  assert.ok(encode(10000, 999999) > encode(10001, 8));
  assert.ok(encode(12000, 8) > encode(12000, 12));
  assert.ok(encode(12000, 12) > -12000);
  assert.ok(-11999 > encode(12000, 8));
  assert.equal(decode(-12000).attempts, null);
  assert.equal(decode(-12000).milliseconds, 12000);
});
test('backend saves fewer attempts for an equal-time personal best', () => {
  const backend = fs.readFileSync('google-sheet-backend.gs', 'utf8');
  const existing = { id: 'score', userId: 'a', game: 'bjk-memory', bestScore: encode(12000, 12) };
  const server = vm.createContext({ getSheetRows: () => [existing], updateRowById: (_, id, data) => Object.assign(existing, data) });
  vm.runInContext(backend.slice(backend.indexOf('function saveBestScore('), backend.indexOf('function getLeaderboard(')), server);
  assert.equal(server.saveBestScore('a', 'bjk-memory', encode(12000, 8)).data.updated, true);
  assert.equal(server.saveBestScore('a', 'bjk-memory', encode(12000, 10)).data.updated, false);
  assert.equal(server.saveBestScore('a', 'bjk-memory', encode(11000, 20)).data.updated, true);
});
test('leaderboard uses native rank numbers and shows time and attempts', () => {
  c.document = { createElement: () => ({ textContent: '', classList: { add() {} } }) };
  c.appState = { currentUser: { id: 'a' } };
  vm.runInContext(memory.slice(memory.indexOf('function fmtSeconds'), memory.indexOf('// Existing scores')), c);
  vm.runInContext(memory.slice(memory.indexOf('function renderLeaderboardList'), memory.indexOf('function resetState')), c);
  const rows = [];
  const el = { replaceChildren() { rows.length = 0; }, appendChild(row) { rows.push(row); } };
  c.renderLeaderboardList([
    { userName: 'More', bestScore: encode(12000, 12) },
    { userName: 'Old', bestScore: -12000 },
    { userName: 'Fewer', bestScore: encode(12000, 8) }
  ], el);
  assert.deepEqual(rows.map(row => row.textContent), ['Fewer — 12.00 s · 8 katset', 'More — 12.00 s · 12 katset', 'Old — 12.00 s · katsete arv teadmata']);
});
