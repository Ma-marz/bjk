const SPREADSHEET_ID = '1j3LdQi-44YuYJhzPus7r7C52669Br7bpke4mzu7-XIg';
const SHEET_SCHEMAS = {
  Users: ['id', 'name', 'passwordHash', 'active', 'role', 'image', 'createdAt', 'updatedAt'],
  Messages: ['id', 'senderId', 'receiverId', 'message', 'createdAt'],
  Scores: ['id', 'userId', 'game', 'bestScore', 'updatedAt'],
  Sessions: ['token', 'userId', 'createdAt', 'expiresAt'],
  Settings: ['key', 'value']
};

const DEFAULT_USERS = [
  { name: 'Markus', password: 'linnu', role: 'admin', active: true },
  { name: 'Stefan', password: 'SeeOnParool', role: 'user', active: true },
  { name: 'Ott', password: 'Rm8:28', role: 'user', active: true },
  { name: 'Paul', password: 'jaaniuss99', role: 'user', active: true },
  { name: 'Leo', password: '07012023', role: 'user', active: true },
  { name: 'Linnea', password: '-Karukonnpart63', role: 'user', active: true },
  { name: 'Eliisabet', password: 'Elsu1234', role: 'user', active: true },
  { name: 'Katariina', password: 'ma<3suema', role: 'user', active: true },
  { name: 'Anett', password: 'ane', role: 'user', active: true },
  { name: 'Karolina', password: 'Kollaneauto', role: 'user', active: true }
];

function getSpreadsheet() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'PASTE_YOUR_SHEET_ID_HERE') {
    throw new Error('Spreadsheet ID is missing. Update SPREADSHEET_ID in google-sheet-backend.gs.');
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(sheetName, createIfMissing) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet && createIfMissing !== false) {
    sheet = ss.insertSheet(sheetName);
    const headers = SHEET_SCHEMAS[sheetName] || [];
    if (headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
  return sheet;
}

function ensureSchema(sheetName) {
  const sheet = getSheet(sheetName, true);
  const headers = SHEET_SCHEMAS[sheetName] || [];
  if (!headers.length) {
    return sheet;
  }
  const existing = sheet.getRange(1, 1, 1, Math.max(headers.length, 1)).getValues()[0];
  let needsUpdate = false;
  for (let i = 0; i < headers.length; i += 1) {
    if ((existing[i] || '').toString() !== headers[i]) {
      needsUpdate = true;
      break;
    }
  }
  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function getSheetRows(sheetName) {
  const sheet = ensureSchema(sheetName);
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    return [];
  }
  const headers = values[0].map(String);
  return values.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index];
    });
    return record;
  });
}

function toRowFromObject(sheetName, object) {
  const headers = SHEET_SCHEMAS[sheetName] || [];
  return headers.map((header) => {
    const value = object && Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
    if (typeof value === 'boolean') {
      return value ? true : false;
    }
    if (typeof value === 'undefined' || value === null) {
      return '';
    }
    return value;
  });
}

function appendRow(sheetName, object) {
  const sheet = ensureSchema(sheetName);
  const row = toRowFromObject(sheetName, object);
  sheet.appendRow(row);
  return row;
}

function updateRowById(sheetName, id, updates) {
  const rows = getSheetRows(sheetName);
  const rowIndex = rows.findIndex((row) => row.id === id);
  if (rowIndex === -1) {
    return false;
  }
  const sheet = ensureSchema(sheetName);
  const headers = SHEET_SCHEMAS[sheetName] || [];
  const targetRowNumber = rowIndex + 2;
  const object = rows[rowIndex];
  const merged = { ...object, ...updates };
  headers.forEach((header, columnIndex) => {
    const value = Object.prototype.hasOwnProperty.call(merged, header) ? merged[header] : '';
    sheet.getRange(targetRowNumber, columnIndex + 1).setValue(value === undefined || value === null ? '' : value);
  });
  return true;
}

function findRowByColumn(sheetName, columnName, value) {
  const rows = getSheetRows(sheetName);
  return rows.find((row) => String(row[columnName] || '') === String(value));
}

function findRowsByColumn(sheetName, columnName, value) {
  const rows = getSheetRows(sheetName);
  return rows.filter((row) => String(row[columnName] || '') === String(value));
}

function toSafeUser(user) {
  if (!user) return null;
  return {
    id: user.id || '',
    name: user.name || '',
    active: user.active !== false,
    role: user.role || 'user',
    image: user.image || '',
    createdAt: user.createdAt || '',
    updatedAt: user.updatedAt || ''
  };
}

function hashPassword(password) {
  if (!password) return '';
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function isValidPasswordHash(passwordHash) {
  return typeof passwordHash === 'string' && passwordHash.length > 0;
}

function getUserById(id) {
  if (!id) return null;
  return findRowByColumn('Users', 'id', id) || null;
}

function getUserByName(name) {
  if (!name) return null;
  const normalized = String(name).trim();
  return findRowByColumn('Users', 'name', normalized) || null;
}

function getSessionByToken(token) {
  if (!token) return null;
  const session = findRowByColumn('Sessions', 'token', token);
  if (!session) return null;
  const expiresAt = new Date(session.expiresAt || 0).getTime();
  // Validation is read-only: deleting rows here can race another request.
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }
  return session;
}

function deleteSessionByToken(token) {
  const rows = getSheetRows('Sessions');
  const sheet = ensureSchema('Sessions');
  const rowIndex = rows.findIndex((row) => row.token === token);
  if (rowIndex !== -1) {
    sheet.deleteRow(rowIndex + 2);
  }
}

function deleteSessionsForUser(userId, keepToken) {
  const sheet = ensureSchema('Sessions');
  const rows = getSheetRows('Sessions');
  const indexes = rows
    .map((row, index) => (row.userId === userId && row.token !== keepToken ? index + 2 : null))
    .filter((rowNumber) => rowNumber !== null)
    .reverse();
  indexes.forEach((rowNumber) => sheet.deleteRow(rowNumber));
}

function createSession(userId) {
  const token = Utilities.getUuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (1000 * 60 * 60 * 24 * 30)).toISOString();
  const record = {
    token,
    userId,
    createdAt: now.toISOString(),
    expiresAt
  };
  appendRow('Sessions', record);
  return token;
}

function validateSession(token) {
  const session = getSessionByToken(token);
  if (!session || !session.userId) {
    return null;
  }
  const user = getUserById(session.userId);
  return user || null;
}

function getUsersList() {
  return getSheetRows('Users').map((user) => toSafeUser(user));
}

function getUserByToken(token) {
  const current = validateSession(token);
  return current || null;
}

function createUserRecord(userData) {
  const now = new Date().toISOString();
  const record = {
    id: userData.id || Utilities.getUuid(),
    name: userData.name || '',
    passwordHash: userData.passwordHash || '',
    active: userData.active !== false,
    role: userData.role || 'user',
    image: userData.image || '',
    createdAt: userData.createdAt || now,
    updatedAt: userData.updatedAt || now
  };
  appendRow('Users', record);
  return record;
}

function updateUserRecord(userId, updates) {
  if (!userId) return null;
  const user = getUserById(userId);
  if (!user) return null;
  const merged = { ...user, ...updates, updatedAt: new Date().toISOString() };
  updateRowById('Users', userId, merged);
  return merged;
}

function createMessageRecord(senderId, receiverId, message) {
  const record = {
    id: Utilities.getUuid(),
    senderId,
    receiverId,
    message: String(message || '').trim(),
    createdAt: new Date().toISOString()
  };
  appendRow('Messages', record);
  return record;
}

function resolveUserName(userId) {
  const user = getUserById(userId);
  return user ? user.name : '';
}

function getInboxForUser(userId) {
  return findRowsByColumn('Messages', 'receiverId', userId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map((message) => ({
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      message: message.message,
      createdAt: message.createdAt,
      senderName: resolveUserName(message.senderId),
      receiverName: resolveUserName(message.receiverId)
    }));
}

function getSentMessagesForUser(userId) {
  return findRowsByColumn('Messages', 'senderId', userId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map((message) => ({
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      message: message.message,
      createdAt: message.createdAt,
      senderName: resolveUserName(message.senderId),
      receiverName: resolveUserName(message.receiverId)
    }));
}

function saveBestScore(userId, game, score) {
  const numericScore = Number(score || 0);
  if (!userId || !game || Number.isNaN(numericScore)) {
    return { success: false, error: 'Invalid score payload.' };
  }

  const rows = getSheetRows('Scores');
  const existing = rows.find((row) => row.userId === userId && row.game === game);

  if (existing) {
    const previous = Number(existing.bestScore || 0);
    if (numericScore <= previous) {
      return { success: true, data: { bestScore: previous, updated: false } };
    }
    updateRowById('Scores', existing.id, {
      userId,
      game,
      bestScore: numericScore,
      updatedAt: new Date().toISOString()
    });
    return { success: true, data: { bestScore: numericScore, updated: true } };
  }

  const record = {
    id: Utilities.getUuid(),
    userId,
    game,
    bestScore: numericScore,
    updatedAt: new Date().toISOString()
  };
  appendRow('Scores', record);
  return { success: true, data: { bestScore: numericScore, updated: true } };
}

function getLeaderboard(game) {
  const rows = getSheetRows('Scores')
    .filter((row) => row.game === game)
    .map((row) => ({
      userId: row.userId,
      userName: resolveUserName(row.userId),
      bestScore: Number(row.bestScore || 0)
    }))
    .filter((entry) => entry.userName)
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, 10);
  return rows;
}

function getSettingsValue(key) {
  const row = findRowByColumn('Settings', 'key', key);
  return row ? row.value : null;
}

function setSettingsValue(key, value) {
  const existing = findRowByColumn('Settings', 'key', key);
  if (existing) {
    updateRowById('Settings', existing.id || key, { key, value: String(value) });
  } else {
    appendRow('Settings', { key, value: String(value) });
  }
}

function parseLegacyDatabaseState(rawValue) {
  if (!rawValue) {
    return null;
  }
  const parsed = JSON.parse(String(rawValue));
  if (Array.isArray(parsed)) {
    return { users: parsed, messages: [], scores: [], settings: {} };
  }
  if (parsed && typeof parsed === 'object') {
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
      settings: parsed.settings || {}
    };
  }
  return null;
}

function migrateJsonDatabase() {
  const ss = getSpreadsheet();
  const legacySheet = ss.getSheetByName('Database');
  const existingUsers = getSheetRows('Users');
  if (existingUsers.length === 0 && !legacySheet) {
    ensureDefaultUsers();
    return { migrated: true, reason: 'Created default seed users because no legacy data existed.' };
  }

  if (!legacySheet) {
    return { migrated: false, reason: 'No legacy Database sheet found; default users were already seeded.' };
  }

  const raw = legacySheet.getRange('A1').getValue();
  if (!raw) {
    return { migrated: false, reason: 'Database!A1 is empty.' };
  }

  let state;
  try {
    state = parseLegacyDatabaseState(raw);
  } catch (error) {
    return { migrated: false, reason: 'Database!A1 is not valid JSON: ' + error.message };
  }

  if (!state) {
    return { migrated: false, reason: 'Legacy JSON parse produced no usable data.' };
  }

  if (!state.users && !state.messages && !state.settings) {
    return { migrated: false, reason: 'Legacy database payload did not contain any known object keys.' };
  }

  ensureSchema('Users');
  ensureSchema('Messages');
  ensureSchema('Scores');
  ensureSchema('Sessions');
  ensureSchema('Settings');

  if (existingUsers.length > 0) {
    return { migrated: false, reason: 'Users table already exists; legacy migration was already applied.' };
  }

  const nameMap = {};
  const users = Array.isArray(state.users) ? state.users : [];
  users.forEach((legacyUser) => {
    if (!legacyUser || !legacyUser.name) return;
    const id = legacyUser.id || Utilities.getUuid();
    const passwordHash = legacyUser.passwordHash || (legacyUser.password ? hashPassword(legacyUser.password) : '');
    const nextUser = {
      id,
      name: legacyUser.name,
      passwordHash,
      active: legacyUser.active !== false,
      role: legacyUser.role || (legacyUser.name === 'Markus' ? 'admin' : 'user'),
      image: legacyUser.photo || legacyUser.image || '',
      createdAt: legacyUser.createdAt || new Date().toISOString(),
      updatedAt: legacyUser.updatedAt || new Date().toISOString()
    };
    appendRow('Users', nextUser);
    nameMap[String(legacyUser.name).trim()] = id;
  });

  const messages = Array.isArray(state.messages) ? state.messages : [];
  messages.forEach((message) => {
    if (!message) return;
    const senderId = typeof message.senderId === 'string' && message.senderId ? message.senderId : (message.from ? (nameMap[String(message.from).trim()] || '') : '');
    const receiverId = typeof message.receiverId === 'string' && message.receiverId ? message.receiverId : (message.to ? (nameMap[String(message.to).trim()] || '') : '');
    if (!senderId || !receiverId || !message.text) return;
    appendRow('Messages', {
      id: message.id || Utilities.getUuid(),
      senderId,
      receiverId,
      message: message.text,
      createdAt: message.sentAt || new Date().toISOString()
    });
  });

  const scores = Array.isArray(state.scores) ? state.scores : [];
  scores.forEach((scoreEntry) => {
    if (!scoreEntry || !scoreEntry.userId || !scoreEntry.game) return;
    appendRow('Scores', {
      id: scoreEntry.id || Utilities.getUuid(),
      userId: scoreEntry.userId,
      game: scoreEntry.game,
      bestScore: Number(scoreEntry.bestScore || 0),
      updatedAt: scoreEntry.updatedAt || new Date().toISOString()
    });
  });

  const legacyUsers = Array.isArray(state.users) ? state.users : [];
  legacyUsers.forEach((legacyUser) => {
    if (!legacyUser || !legacyUser.name || !legacyUser.bestScore) return;
    const userId = nameMap[String(legacyUser.name).trim()];
    if (!userId) return;
    const rows = getSheetRows('Scores');
    const existing = rows.find((row) => row.userId === userId && row.game === 'bjker-mario');
    if (!existing) {
      appendRow('Scores', {
        id: Utilities.getUuid(),
        userId,
        game: 'bjker-mario',
        bestScore: Number(legacyUser.bestScore || 0),
        updatedAt: new Date().toISOString()
      });
    }
  });

  if (state.settings && typeof state.settings === 'object') {
    Object.keys(state.settings).forEach((key) => {
      const existing = findRowByColumn('Settings', 'key', key);
      if (!existing) {
        appendRow('Settings', { key, value: state.settings[key] });
      }
    });
  }

  return { migrated: true, users: users.length, messages: messages.length, scores: scores.length };
}

function callWithLock(actionName, callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return callback();
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
}

function getApiResponse(payload, success) {
  return {
    success,
    ...(payload || {})
  };
}

function doGet() {
  try {
    migrateJsonDatabase();
    const state = {
      users: getUsersList(),
      messages: getSheetRows('Messages'),
      scores: getSheetRows('Scores'),
      settings: getSheetRows('Settings')
    };
    return ContentService.createTextOutput(JSON.stringify(state)).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    migrateJsonDatabase();
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const request = JSON.parse(raw || '{}');
    const action = String(request.action || 'ping');
    const token = String(request.token || '');
    const body = request.payload || request;

    if (action === 'login') {
      const name = String(body.name || '').trim();
      const password = String(body.password || '');
      const user = getUserByName(name);
      if (!user || !isValidPasswordHash(user.passwordHash)) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Invalid username or password.' })).setMimeType(ContentService.MimeType.JSON);
      }
      const suppliedHash = hashPassword(password);
      if (user.passwordHash !== suppliedHash) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Invalid username or password.' })).setMimeType(ContentService.MimeType.JSON);
      }
      // Each browser/device has its own token; login must not revoke others.
      const nextToken = callWithLock('login', () => createSession(user.id));
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        data: {
          token: nextToken,
          user: toSafeUser(user),
          users: getUsersList(),
          leaderboard: getLeaderboard('bjker-mario')
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'logout') {
      const sessionUser = validateSession(token);
      if (!sessionUser) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Invalid session.' })).setMimeType(ContentService.MimeType.JSON);
      }
      callWithLock('logout', () => deleteSessionByToken(token));
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: { loggedOut: true } })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getCurrentUser') {
      const user = validateSession(token);
      if (!user) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Invalid session.' })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: { user: toSafeUser(user) } })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getUsers') {
      const sessionUser = validateSession(token);
      if (!sessionUser) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Authentication required.' })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: { users: getUsersList() } })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'changePassword') {
      const sessionUser = validateSession(token);
      if (!sessionUser) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Authentication required.' })).setMimeType(ContentService.MimeType.JSON);
      }
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (!currentPassword || !newPassword || newPassword.length < 6) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Password validation failed.' })).setMimeType(ContentService.MimeType.JSON);
      }
      if (sessionUser.passwordHash !== hashPassword(currentPassword)) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Current password is incorrect.' })).setMimeType(ContentService.MimeType.JSON);
      }
      const result = callWithLock('changePassword', () => {
        const user = getUserById(sessionUser.id);
        if (!user) return { success: false, error: 'User not found.' };
        const updated = updateUserRecord(user.id, { passwordHash: hashPassword(newPassword) });
        // A password change revokes other devices, but keeps this one usable.
        deleteSessionsForUser(user.id, token);
        return { success: true, data: { user: toSafeUser(updated), updated: true } };
      });
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'updateUserStatus') {
      const sessionUser = validateSession(token);
      if (!sessionUser) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Authentication required.' })).setMimeType(ContentService.MimeType.JSON);
      }
      if ((sessionUser.role || 'user') !== 'admin') {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Admin access required.' })).setMimeType(ContentService.MimeType.JSON);
      }
      const targetUserId = String(body.userId || '');
      const active = body.active === true || body.active === 'true';
      const result = callWithLock('updateUserStatus', () => {
        const targetUser = getUserById(targetUserId);
        if (!targetUser) return { success: false, error: 'Target user not found.' };
        const updated = updateUserRecord(targetUser.id, { active, updatedAt: new Date().toISOString() });
        return { success: true, data: { user: toSafeUser(updated) } };
      });
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'sendMessage') {
      const sessionUser = validateSession(token);
      if (!sessionUser) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Authentication required.' })).setMimeType(ContentService.MimeType.JSON);
      }
      const receiverId = String(body.receiverId || '');
      const messageText = String(body.message || '').trim();
      if (!receiverId || !messageText) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Receiver and message are required.' })).setMimeType(ContentService.MimeType.JSON);
      }
      if (receiverId === sessionUser.id) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'You cannot send a message to yourself.' })).setMimeType(ContentService.MimeType.JSON);
      }
      const result = callWithLock('sendMessage', () => {
        const receiver = getUserById(receiverId);
        if (!receiver) {
          return { success: false, error: 'Receiver not found.' };
        }
        const message = createMessageRecord(sessionUser.id, receiverId, messageText);
        return { success: true, data: { message: { ...message, senderName: sessionUser.name, receiverName: receiver.name } } };
      });
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getInbox') {
      const sessionUser = validateSession(token);
      if (!sessionUser) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Authentication required.' })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: { messages: getInboxForUser(sessionUser.id) } })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getSentMessages') {
      const sessionUser = validateSession(token);
      if (!sessionUser) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Authentication required.' })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: { messages: getSentMessagesForUser(sessionUser.id) } })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'saveScore') {
      const sessionUser = validateSession(token);
      if (!sessionUser) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Authentication required.' })).setMimeType(ContentService.MimeType.JSON);
      }
      const game = String(body.game || 'bjker-mario');
      const score = Number(body.score || 0);
      if (!game || Number.isNaN(score)) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Score is invalid.' })).setMimeType(ContentService.MimeType.JSON);
      }
      const result = callWithLock('saveScore', () => saveBestScore(sessionUser.id, game, score));
      const leaderboard = getLeaderboard(game);
      return ContentService.createTextOutput(JSON.stringify({ success: result.success, data: { ...result.data, leaderboard } })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getLeaderboard') {
      const sessionUser = validateSession(token);
      if (!sessionUser) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Authentication required.' })).setMimeType(ContentService.MimeType.JSON);
      }
      const game = String(body.game || 'bjker-mario');
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: { leaderboard: getLeaderboard(game) } })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unknown action.' })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Server error: ' + error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function ensureDefaultUsers() {
  const existingUsers = getSheetRows('Users');
  if (existingUsers.length > 0) return;

  DEFAULT_USERS.forEach((user) => {
    appendRow('Users', {
      id: Utilities.getUuid(),
      name: user.name,
      passwordHash: hashPassword(user.password),
      active: user.active !== false,
      role: user.role || 'user',
      image: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
}

function initDatabase() {
  ensureSchema('Users');
  ensureSchema('Messages');
  ensureSchema('Scores');
  ensureSchema('Sessions');
  ensureSchema('Settings');
  migrateJsonDatabase();
  ensureDefaultUsers();
}

function onOpen() {
  initDatabase();
}
