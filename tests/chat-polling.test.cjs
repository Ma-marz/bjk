const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('script.js', 'utf8');
test('open conversations refresh after 5 seconds; other views after 15 seconds', () => {
  let now = 4999, visible = true, calls = 0;
  const state = { selectedId: 'a', lastRefreshAt: 0 };
  const c = vm.createContext({ chatState: state, Date: { now: () => now }, chatIsVisible: () => visible,
    refreshChatMessages() { calls++; state.lastRefreshAt = now; } });
  vm.runInContext(source.slice(source.indexOf('function pollChatMessages'), source.indexOf('async function refreshChatMessages')), c);
  c.pollChatMessages(); assert.equal(calls, 0);
  now = 5000; c.pollChatMessages(); assert.equal(calls, 1);
  visible = false; now = 19999; c.pollChatMessages(); assert.equal(calls, 1);
  now = 20000; c.pollChatMessages(); assert.equal(calls, 2);
  visible = true; state.selectedId = ''; now = 25000; c.pollChatMessages(); assert.equal(calls, 2);
  now = 35000; c.pollChatMessages(); assert.equal(calls, 3);
});
test('switching conversation immediately requests fresh messages', () => {
  let refreshed = 0;
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { value: '', classList: { add() {} } });
    return elements.get(id);
  } };
  const c = vm.createContext({ document, chatState: { selectedId: '', drafts: new Map() },
    hideMessage() {}, renderMessages() {}, markVisibleChatRead() {}, refreshChatMessages() { refreshed++; } });
  vm.runInContext(source.slice(source.indexOf('function openConversation'), source.indexOf('function renderMessages')), c);
  c.openConversation('a'); c.openConversation('b');
  assert.equal(refreshed, 2);
});
