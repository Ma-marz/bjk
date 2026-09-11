const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('script.js', 'utf8');
test('account refresh starts independent reads together and ignores responses after logout', async () => {
  const pending = [];
  const state = { currentUser: { id: 'a' }, sessionToken: 'a', users: [] };
  const c = vm.createContext({ appState: state, renderMessages() {}, renderMembers() {}, renderLeaderboard() {},
    callAppsScript: (action) => new Promise(resolve => pending.push({ action, resolve })) });
  vm.runInContext(source.slice(source.indexOf('async function loadUserDependentData'), source.indexOf('async function handleLogin')), c);
  const request = c.loadUserDependentData();
  assert.equal(pending.length, 4);
  state.sessionToken = '';
  pending.forEach(({resolve}) => resolve({ success: true, data: { users: ['stale'], messages: [], leaderboard: [] } }));
  await request;
  assert.deepEqual(state.users, []);
});
test('duplicate reads share one request and surface failures', async () => {
  let resolve, calls = 0;
  const outcomes = [];
  const c = vm.createContext({ appState: { sessionToken: 'a' },
    beginDataActivity: () => failed => outcomes.push(failed), updateDbTimestamp() {},
    performAppsScriptRequest: () => { calls++; return new Promise(r => resolve = r); } });
  vm.runInContext(source.slice(source.indexOf('const requestLabels'), source.indexOf('async function performAppsScriptRequest')), c);
  const a = c.callAppsScript('getInbox');
  const b = c.callAppsScript('getInbox');
  assert.equal(calls, 1);
  resolve({success: false});
  await Promise.all([a, b]);
  assert.deepEqual(outcomes, [true]);
});
