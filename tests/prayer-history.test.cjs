const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const c = vm.createContext({ Intl, Date });
vm.runInContext(fs.readFileSync('prayer/history-ui.js', 'utf8'), c);
const actual = JSON.parse(fs.readFileSync('tools/prayer-generator/history.json', 'utf8'));
const history = { weeks: {
  25: { week: 25, date: '2026-09-13', assignments: { 'Leo Kask': 'Anett Marvet', 'Anett Marvet': 'Leo Kask' } },
  31: { week: 31, date: '2026-10-24', assignments: { 'Leo Kask': 'Anett Marvet', 'Anett Marvet': 'Paul Kask', 'Paul Kask': 'Leo Kask' } },
  32: { week: 32, date: '2026-11-01', assignments: { 'Leo Kask': 'Paul Kask', 'Paul Kask': 'Anett Marvet', 'Anett Marvet': 'Leo Kask' } }
} };
test('current week is Monday–Sunday, future assignments are omitted and incoming assignment is hidden', () => {
  const rows = c.prayerHistoryRows(history, 'leo', new Date('2026-11-01T12:00:00Z'));
  assert.deepEqual(Array.from(rows, row => row.week), [31, 25]);
  assert.equal(rows[0].start, Date.parse('2026-10-26T00:00:00Z'));
  assert.equal(rows[0].end, Date.parse('2026-11-01T00:00:00Z'));
  assert.equal(rows[0].current, true);
  assert.equal(rows[0].prayingFor, 'Anett Marvet');
  assert.equal(Object.hasOwn(rows[0], 'prayedForBy'), false);
  assert.equal(rows[1].prayedForBy, 'Anett Marvet');
});
test('Tallinn midnight advances the week, revealing previous incoming assignments', () => {
  const before = c.prayerHistoryRows(history, 'Leo Kask', new Date('2026-11-01T21:59:59Z'));
  const after = c.prayerHistoryRows(history, 'Leo Kask', new Date('2026-11-01T22:00:00Z'));
  assert.equal(before[0].week, 31);
  assert.equal(after[0].week, 32);
  assert.equal(after[0].current, true);
  assert.equal(Object.hasOwn(after[0], 'prayedForBy'), false);
  assert.equal(after[1].prayedForBy, 'Paul Kask');
  assert.equal(after[1].current, false);
});
test('real history preserves the weekly calendar despite Saturday and Monday generation dates', () => {
  const rows = c.prayerHistoryRows(actual, 'Markus', new Date('2026-11-01T12:00:00Z'));
  assert.equal(rows[0].week, 31);
  assert.equal(rows[0].start, Date.parse('2026-10-26T00:00:00Z'));
  assert.equal(rows.find(row => row.week === 27).start, Date.parse('2026-09-28T00:00:00Z'));
  assert.equal(rows.find(row => row.week === 29).start, Date.parse('2026-10-12T00:00:00Z'));
  assert.equal(c.prayerHistoryRows(actual, 'unknown', new Date()).length, 0);
});
test('ambiguous first names never select another person', () => {
  const data = { weeks: { 1: { week: 1, date: '2026-01-05', assignments: { 'Leo One': 'Leo Two', 'Leo Two': 'Leo One' } } } };
  assert.equal(c.prayerHistoryRows(data, 'Leo', new Date('2026-01-06')).length, 0);
  assert.equal(c.prayerHistoryRows(data, 'Leo One', new Date('2026-01-06'))[0].prayingFor, 'Leo Two');
});
test('direct-file history is kept synchronized with history.json', () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync('prayer/history.js', 'utf8'), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.BJK_PRAYER_HISTORY.weeks)), actual.weeks);
});
