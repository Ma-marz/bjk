const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup() {
  const users = [{ id: 'a', name: 'Markus Martin', role: 'admin' }, { id: 'b', name: 'Friend', role: 'user' }];
  const c = vm.createContext({ ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) } });
  vm.runInContext(fs.readFileSync('google-sheet-backend.gs', 'utf8'), c);
  Object.assign(c, {
    migrateJsonDatabase() {}, validateSession: token => users.find(user => user.id === token),
    getSheetRows: name => name === 'Users' ? users : [],
    callWithLock: (_, fn) => fn(),
    updateUserRecord: (id, changes) => Object.assign(users.find(user => user.id === id), changes)
  });
  return { c, users, request: (action, token, payload = {}) => c.doPost({ postData: { contents: JSON.stringify({ action, token, payload }) } }) };
}
test('prayer activity validates choice and saves only the authenticated user', () => {
  const { request, users } = setup();
  assert.equal(request('setPrayerActivity', '', { prayerActivity: 'fuego' }).success, false);
  assert.equal(request('setPrayerActivity', 'b', { prayerActivity: 'invalid' }).success, false);
  for (const prayerActivity of ['fuego', 'steady', 'paused']) {
    const result = request('setPrayerActivity', 'b', { userId: 'a', prayerActivity });
    assert.equal(result.success, true);
    assert.equal(result.data.user.prayerActivity, prayerActivity);
    assert.equal(users[1].prayerActivity, prayerActivity);
    assert.equal(users[0].prayerActivity, undefined);
  }
});
test('admin overview includes unset users and regular/public user lists omit choices', () => {
  const { request, c } = setup();
  request('setPrayerActivity', 'b', { prayerActivity: 'paused' });
  assert.equal(request('getPrayerActivities', 'b').success, false);
  assert.equal(request('getPrayerActivities', '').success, false);
  const result = request('getPrayerActivities', 'a');
  assert.equal(result.success, true);
  assert.equal(result.data.users[0].prayerActivity, '');
  assert.equal(result.data.users[1].prayerActivity, 'paused');
  assert.equal(c.getUsersList().some(user => Object.hasOwn(user, 'prayerActivity')), false);
});
test('saved frontend identity preserves prayer activity', () => {
  const source = fs.readFileSync('script.js', 'utf8');
  const c = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function safeUser('), source.indexOf('function showMessage(')), c);
  assert.equal(c.safeUser({ id: 'b', prayerActivity: 'fuego' }).prayerActivity, 'fuego');
});
