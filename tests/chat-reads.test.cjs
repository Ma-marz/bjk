const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function server() {
  const c = vm.createContext({ Utilities: { getUuid: () => 'read-id' } });
  vm.runInContext(fs.readFileSync('google-sheet-backend.gs', 'utf8'), c);
  const rows = { ChatReads: [], Messages: [
    { id: 'old', senderId: 'a', receiverId: 'b', createdAt: '2026-01-01T10:00:00Z' },
    { id: 'new', senderId: 'a', receiverId: 'b', createdAt: '2026-01-02T10:00:00Z' },
    { id: 'other', senderId: 'a', receiverId: 'c', createdAt: '2026-01-03T10:00:00Z' }
  ] };
  c.getSheetRows = name => rows[name];
  c.appendRow = (name, row) => rows[name].push(row);
  c.updateRowById = (name, id, update) => Object.assign(rows[name].find(row => row.id === id), update);
  return { c, rows };
}
test('read checkpoints belong to the recipient and conversation, and never move backward', () => {
  const { c, rows } = server();
  assert.equal(c.markChatRead('b', 'a', 'new').success, true);
  assert.equal(c.markChatRead('b', 'a', 'old').success, true);
  assert.equal(rows.ChatReads.length, 1);
  assert.equal(rows.ChatReads[0].lastReadAt, '2026-01-02T10:00:00.000Z');
  assert.equal(c.getChatReads('a').length, 0);
  assert.equal(c.getChatReads('b')[0].peerId, 'a');
  assert.equal(c.markChatRead('b', 'a', 'other').success, false);
  assert.equal(c.markChatRead('a', 'b', 'new').success, false);
  assert.equal(c.markChatRead('b', 'wrong', 'new').success, false);
  assert.equal(c.markChatRead('b', 'a', 'missing').success, false);
});
test('mark-read API requires authentication and ignores a supplied user ID', () => {
  const { c } = server();
  c.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) };
  c.migrateJsonDatabase = () => {};
  c.validateSession = token => token === 'valid' ? { id: 'b' } : null;
  c.callWithLock = (_, action) => action();
  const request = token => c.doPost({ postData: { contents: JSON.stringify({ action: 'markChatRead', token, peerId: 'a', messageId: 'new', userId: 'c' }) } });
  assert.equal(request('').success, false);
  assert.equal(request('valid').success, true);
  assert.equal(c.getChatReads('b').length, 1);
  assert.equal(c.getChatReads('c').length, 0);
});
