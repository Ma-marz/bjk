const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('script.js', 'utf8');
function setup() {
  const timers = new Map(); let timerId = 0;
  const el = { dataset: {}, textContent: '', classList: { toggle(_, hidden) { el.hidden = hidden; } }, setAttribute() {} };
  const button = { disabled: false, classList: { toggle(_, hidden) { button.hidden = hidden; } } };
  const c = vm.createContext({ appState: { currentUser: { id: 'a' }, currentView: 'games' }, window: {},
    document: { getElementById: id => id === 'retryDataButton' ? button : el }, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(source.slice(source.indexOf('const dataActivities'), source.indexOf('function updateDbTimestamp')), c);
  return { c, el, button, expire() { for (const [id, fn] of timers) { timers.delete(id); fn(); } } };
}
test('concurrent game loads and score save produce one concise notice', () => {
  const { c, el } = setup();
  const end = c.beginDataActivity('games', 'Edetabelit laaditakse…');
  c.window.reportScoreStatus('bjk-memory', 'saving', 'Tulemust salvestatakse…');
  assert.equal(el.textContent, 'Andmeid uuendatakse…');
  end();
  assert.equal(el.dataset.state, 'loading');
  c.window.reportScoreStatus('bjk-memory', 'saved', 'Tulemus salvestatud.');
  assert.equal(el.dataset.state, 'ready');
  assert.equal(el.hidden, true);
});
test('success is immediately hidden; failed and pending saves remain visible', () => {
  const { c, el, expire } = setup();
  c.beginDataActivity('games', 'Loading…')();
  assert.equal(el.hidden, true);
  expire();
  assert.equal(el.hidden, true);
  c.beginDataActivity('games', 'Loading…')(true);
  expire();
  assert.equal(el.dataset.state, 'error');
  assert.equal(el.hidden, false);
  c.window.reportScoreStatus('bjk-memory', 'pending', 'Waiting');
  expire();
  assert.equal(el.dataset.state, 'pending');
});
test('hidden page activity does not appear on the current page', () => {
  const { c, el } = setup();
  c.beginDataActivity('messages', 'Inbox…');
  assert.equal(el.hidden, true);
  c.appState.currentView = 'messages';
  c.renderDataActivity();
  assert.equal(el.textContent, 'Inbox…');
});

test('failed load exposes retry; starting retry hides the button', async () => {
  const { c, button } = setup();
  let retried = false;
  c.beginDataActivity('games', 'Loading…', () => {
    retried = true;
    const finish = c.beginDataActivity('games', 'Loading…');
    assert.equal(button.hidden, true);
    finish();
  })(true);
  assert.equal(button.hidden, false);
  await button.onclick();
  assert.equal(retried, true);
  assert.equal(button.hidden, true);
});

test('dismissal survives rerenders without cancelling work and new results appear', () => {
  const { c, el } = setup();
  const finish = c.beginDataActivity('games', 'Loading…');
  c.dismissDataActivity();
  c.renderDataActivity();
  assert.equal(el.hidden, true);
  finish(true);
  assert.equal(el.hidden, false);
  assert.equal(el.dataset.state, 'error');
  c.dismissDataActivity();
  c.setActivityResult('games', true, 'Andmete uuendamine ebaõnnestus. Proovi uuesti.');
  assert.equal(el.hidden, false);
});
