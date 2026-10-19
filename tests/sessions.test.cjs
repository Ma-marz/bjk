const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const backend = fs.readFileSync('google-sheet-backend.gs', 'utf8');
const frontend = fs.readFileSync('script.js', 'utf8');

function server() {
  const sessions = [];
  const user = { id: 'user-a', name: 'Test', passwordHash: 'hash:password' };
  let nextToken = 0, locked = false;
  const c = vm.createContext({
    Utilities: { getUuid: () => `token-${++nextToken}` },
    LockService: { getScriptLock: () => ({
      waitLock() { assert.equal(locked, false); locked = true; },
      releaseLock() { assert.equal(locked, true); locked = false; }
    }) },
    SpreadsheetApp: { flush() { assert.equal(locked, true); } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({
      setMimeType: () => JSON.parse(text)
    }) }
  });
  vm.runInContext(backend, c);
  Object.assign(c, {
    migrateJsonDatabase() {},
    hashPassword: password => `hash:${password}`,
    getUserById: id => id === user.id ? user : null,
    getUsersList: () => [c.toSafeUser(user)],
    getLeaderboard: () => [],
    getSheetRows: name => name === 'Sessions' ? sessions.map(row => ({ ...row })) : name === 'Users' ? [user] : [],
    appendRow(name, record) { assert.equal(locked, true); sessions.push({ ...record }); },
    ensureSchema: () => ({ deleteRow(number) {
      assert.equal(locked, true);
      sessions.splice(number - 2, 1);
    } }),
    updateUserRecord: (_, changes) => Object.assign(user, changes)
  });
  const request = (action, payload = {}) => c.doPost({ postData: { contents: JSON.stringify({ action, ...payload }) } });
  const login = () => {
    const response = request('login', { name: user.name, password: 'password' });
    assert.equal(response.success, true, response.error);
    return response.data.token;
  };
  return { c, sessions, request, login };
}

test('multiple device logins and repeat logins all remain authenticated', () => {
  const s = server();
  const tokens = [s.login(), s.login(), s.login()];
  assert.equal(new Set(tokens).size, 3);
  for (const token of tokens) assert.equal(s.request('getCurrentUser', { token }).success, true);
});

test('logging out one device leaves the other devices working', () => {
  const s = server();
  const a = s.login(), b = s.login(), c = s.login();
  assert.equal(s.request('logout', { token: b }).success, true);
  assert.equal(s.request('getCurrentUser', { token: b }).success, false);
  for (const token of [a, c]) assert.equal(s.request('getCurrentUser', { token }).success, true);
  s.request('logout', { token: b });
  assert.equal(s.sessions.length, 2);
});

test('expired or malformed sessions are rejected without deleting neighboring rows', () => {
  const s = server();
  const a = s.login(), b = s.login();
  for (const expiresAt of ['2000-01-01', '', 'invalid']) {
    s.sessions[0].expiresAt = expiresAt;
    assert.equal(s.request('getCurrentUser', { token: a }).success, false);
    assert.equal(s.request('getCurrentUser', { token: b }).success, true);
    assert.equal(s.sessions.length, 2);
  }
});

test('password change preserves the requesting device and revokes other devices', () => {
  const s = server();
  const a = s.login(), b = s.login();
  assert.equal(s.request('changePassword', { token: a, currentPassword: 'password', newPassword: 'new-password' }).success, true);
  assert.equal(s.request('getCurrentUser', { token: a }).success, true);
  assert.equal(s.request('getCurrentUser', { token: b }).success, false);
});

test('public GET does not expose session tokens', () => {
  const s = server();
  const token = s.login();
  const response = s.c.doGet();
  assert.equal(Object.hasOwn(response, 'sessions'), false);
  assert.equal(JSON.stringify(response).includes(token), false);
});

test('requests keep the active identity instead of importing another tabs stored token', async () => {
  const bodies = [];
  const state = { sessionToken: 'active-device' };
  const c = vm.createContext({
    appState: state, getAppsScriptEndpoint: async () => 'https://example.test', AbortSignal, AbortController,
    setTimeout, clearTimeout, window: { BJKGameSecurity: {} },
    readSessionState: () => ({ token: 'another-account' }),
    fetch: async (_, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ success: true }) };
    }
  });
  vm.runInContext(frontend.slice(frontend.indexOf('async function performAppsScriptRequest'), frontend.indexOf('// Persist before sending')), c);
  await c.performAppsScriptRequest('getInbox');
  await c.performAppsScriptRequest('logout', { token: 'captured-token' });
  state.sessionToken = '';
  await c.performAppsScriptRequest('getInbox');
  assert.deepEqual(bodies.map(body => body.token), ['active-device', 'captured-token', '']);
  assert.equal(state.sessionToken, '');
});

test('rejected saved sessions return to login instead of leaving an empty portal', async () => {
  for (const error of ['Invalid session.', 'Authentication required.']) {
    const state = { sessionToken: 'expired-token' };
    let cleared = 0, rendered = 0, notice;
    const c = vm.createContext({
      appState: state, getAppsScriptEndpoint: async () => 'https://example.test', AbortController,
      setTimeout, clearTimeout, window: { BJKGameSecurity: {} },
      fetch: async () => ({ ok: true, json: async () => ({ success: false, error }) }),
      clearSession() { state.sessionToken = ''; cleared++; },
      renderAuthenticatedState() { rendered++; }, showMessage(...args) { notice = args; }
    });
    vm.runInContext(frontend.slice(frontend.indexOf('async function performAppsScriptRequest'), frontend.indexOf('// Persist before sending')), c);
    await c.performAppsScriptRequest('getInbox');
    assert.equal(cleared, 1);
    assert.equal(rendered, 1);
    assert.equal(notice[0], 'error');
    assert.equal(state.sessionToken, '');
  }
});

test('a late authentication failure cannot log out a newly signed-in account', async () => {
  const state = { sessionToken: 'new-token' };
  const c = vm.createContext({
    appState: state, getAppsScriptEndpoint: async () => 'https://example.test', AbortController,
    setTimeout, clearTimeout, window: { BJKGameSecurity: {} },
    fetch: async () => ({ ok: true, json: async () => ({ success: false, error: 'Invalid session.' }) }),
    clearSession() { assert.fail('Must preserve new session'); }
  });
  vm.runInContext(frontend.slice(frontend.indexOf('async function performAppsScriptRequest'), frontend.indexOf('// Persist before sending')), c);
  await c.performAppsScriptRequest('getInbox', { token: 'old-token' });
  assert.equal(state.sessionToken, 'new-token');
});


test('login ignores username casing and whitespace but preserves password casing and display name', () => {
  const s = server();
  for (const name of ['Test', 'test', 'TEST', 'tEsT', '  test  ']) {
    const response = s.request('login', { name, password: 'password' });
    assert.equal(response.success, true, response.error);
    assert.equal(response.data.user.name, 'Test');
    assert.equal(response.data.user.id, 'user-a');
  }
  assert.equal(s.request('login', { name: 'TEST', password: 'PASSWORD' }).success, false);
  assert.equal(s.request('login', { name: 'unknown', password: 'password' }).success, false);
  assert.equal(s.request('login', { name: '   ', password: 'password' }).success, false);
});
