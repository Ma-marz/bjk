const STORAGE_KEY = 'bjkPortalData';
const CURRENT_USER_KEY = 'bjkCurrentUser';
const DEFAULT_WEEK = 23;

const appState = {
    users: [],
    messages: [],
    currentUser: null,
    currentView: 'prayers',
    weekNr: DEFAULT_WEEK,
    sessionToken: '',
    sentMessages: [],
    inboxMessages: [],
    leaderboard: []
};
// UI flags
appState.showSessionBadge = false;
appState.lastDbUpdate = null;

const GOOGLE_SHEET_ENDPOINT = window.BJK_GOOGLE_SHEET_ENDPOINT || '';

function hydrateStateFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : { users: [], messages: [] };
    } catch (error) {
        console.warn('Storage parsing failed:', error);
        return { users: [], messages: [] };
    }
}

function persistState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        users: appState.users,
        messages: appState.messages,
        currentUser: appState.currentUser ? {
            id: appState.currentUser.id,
            name: appState.currentUser.name,
            role: appState.currentUser.role,
            active: appState.currentUser.active,
            image: appState.currentUser.image,
            bestScore: Number(appState.currentUser.bestScore || 0)
        } : null
    }));
}

function readSessionState() {
    try {
        const raw = localStorage.getItem(CURRENT_USER_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.token) return null;
        return {
            token: parsed.token,
            user: parsed.user || null
        };
    } catch (error) {
        return null;
    }
}

function setSessionState(token, user = null) {
    const nextToken = token || '';
    const nextUser = user ? safeUser(user) : appState.currentUser ? safeUser(appState.currentUser) : null;

    appState.sessionToken = nextToken;
    appState.currentUser = nextUser;

    if (!nextToken) {
        localStorage.removeItem(CURRENT_USER_KEY);
        return;
    }

    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({
        token: nextToken,
        user: nextUser
    }));
}

function clearSession() {
    appState.sessionToken = '';
    appState.currentUser = null;
    scoreActivities.clear();
    activityResults.clear();
    renderDataActivity();
    appState.users = [];
    appState.sentMessages = [];
    appState.inboxMessages = [];
    appState.leaderboard = [];
    prayerRenderKey = '';
    prayerRenderVersion++;
    cancelPdfLoad?.();
    loadedPdfUrl = '';
    localStorage.removeItem(CURRENT_USER_KEY);
}

function safeUser(user) {
    if (!user) return null;
    return {
        id: user.id || '',
        name: user.name || '',
        active: user.active !== false,
        role: user.role || 'user',
        image: user.image || '',
        bestScore: Number(user.bestScore || 0)
    };
}

function showMessage(element, text, type = 'info') {
    const target = document.getElementById(element);
    if (!target) return;
    target.textContent = text;
    target.className = `message ${type}`;
    target.classList.remove('hidden');
}

function formatDateTime(isoString) {
    try {
        const d = new Date(isoString);
        return new Intl.DateTimeFormat('et-EE', {
            hour: '2-digit', minute: '2-digit'
        }).format(d);
    } catch (e) {
        return '';
    }
}

const dataActivities = new Map();
const activityResults = new Map();
const activityTimers = new Map();
const scoreActivities = new Map();

function currentActivityScope() {
    return appState.currentUser ? appState.currentView : 'account';
}
function renderDataActivity() {
    const el = document.getElementById('pageActivity');
    if (!el) return;
    const scope = currentActivityScope();
    const relevant = item => item.scope === scope || item.scope === 'account' || (scope === 'settings' && item.scope === 'members');
    const active = [...dataActivities.values()].filter(relevant);
    const scores = scope === 'games' ? [...scoreActivities.values()] : [];
    const saving = scores.some(item => item.state === 'saving');
    const pending = scores.find(item => item.state === 'pending');
    const result = activityResults.get(scope) || activityResults.get('account');
    const loading = active.length > 0 || saving;
    el.dataset.state = loading ? 'loading' : pending ? 'pending' : result?.failed ? 'error' : 'ready';
    const text = loading
        ? (active.length + Number(saving) > 1 ? 'Andmeid uuendatakse…' : saving ? 'Tulemust salvestatakse…' : active[0].label)
        : pending?.message || result?.text || '';
    document.getElementById('pageActivityText').textContent = text;
    const retryButton = document.getElementById('retryDataButton');
    const retry = pending ? () => processPendingScores() : result?.retry;
    retryButton.classList.toggle('hidden', loading || !retry);
    retryButton.disabled = loading;
    retryButton.onclick = async () => {
        if (retryButton.disabled) return;
        retryButton.disabled = true;
        try { await retry(); } catch (error) { console.warn('Data reload failed:', error); }
        finally { renderDataActivity(); }
    };
    el.classList.toggle('hidden', !text);
    el.setAttribute('aria-busy', String(loading));
}
function setActivityResult(scope, failed, text, retry) {
    clearTimeout(activityTimers.get(scope));
    const result = { failed, text, retry };
    activityResults.set(scope, result);
    if (!failed) activityTimers.set(scope, setTimeout(() => {
        if (activityResults.get(scope) === result) activityResults.delete(scope);
        renderDataActivity();
    }, 3500));
    renderDataActivity();
}
function beginDataActivity(scope, label, retry) {
    const id = Symbol();
    if (![...dataActivities.values()].some(item => item.scope === scope)) {
        activityResults.delete(scope);
        clearTimeout(activityTimers.get(scope));
    }
    dataActivities.set(id, { scope, label });
    renderDataActivity();
    return (failed = false) => {
        dataActivities.delete(id);
        if (failed || !activityResults.get(scope)?.failed) {
            setActivityResult(scope, failed, failed ? 'Andmete uuendamine ebaõnnestus. Proovi uuesti.' : 'Andmed uuendatud.', failed ? retry : undefined);
        }
        renderDataActivity();
    };
}
window.reportScoreStatus = (game, state, message) => {
    if (state === 'saved') {
        scoreActivities.delete(game);
        setActivityResult('games', false, message);
    } else {
        scoreActivities.set(game, { state, message });
        activityResults.delete('games');
    }
    renderDataActivity();
};
function updateDbTimestamp(isoString) {
    const el = document.getElementById('dbTimestamp');
    if (!el || !isoString) return;
    appState.lastDbUpdate = isoString;
    el.textContent = `Viimati uuendatud: ${formatDateTime(isoString)}`;
    el.classList.remove('hidden');
}

function hideMessage(element) {
    const target = document.getElementById(element);
    if (!target) return;
    target.classList.add('hidden');
    target.textContent = '';
}

function showLoading(element) {
    const target = document.getElementById(element);
    if (!target) return;
    target.closest('form')?.querySelectorAll('button[type=submit]').forEach(button => button.disabled = true);
}

function hideLoading(element) {
    const target = document.getElementById(element);
    if (!target) return;
    target.classList.add('hidden');
    target.closest('form')?.querySelectorAll('button[type=submit]').forEach(button => button.disabled = false);
}

function showView(viewName) {
    appState.currentView = viewName;
    renderDataActivity();
    document.querySelectorAll('.nav-button').forEach((button) => {
        button.classList.toggle('active', button.dataset.view === viewName);
        if (button.dataset.view === viewName) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });

    document.querySelectorAll('.view-panel').forEach((panel) => {
        const shouldShow = panel.id === `view-${viewName}`;
        panel.classList.toggle('hidden', !shouldShow);
        panel.classList.toggle('active', shouldShow);
    });
}

function buildPrayerUrl(userName, weekNumber) {
    const safeName = encodeURIComponent(String(userName || '').trim());
    const safeFileName = encodeURIComponent(`Nädal ${weekNumber}.pdf`);
    return `prayer/${safeName}/${safeFileName}`;
}

let pdfRendererPromise = null;
function getPdfRenderer() {
    if (!pdfRendererPromise) {
        pdfRendererPromise = import('./vendor/pdfjs/pdf.min.mjs').then(pdfjs => {
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', document.baseURI).href;
            return pdfjs;
        }).catch(error => { pdfRendererPromise = null; throw error; });
    }
    return pdfRendererPromise;
}
let cancelPdfLoad = null;
let loadedPdfUrl = '';
let prayerImageUrl = '';
async function loadPDF(fileURL) {
    if (loadedPdfUrl === fileURL) { updateOpenPdfButton(fileURL); return; }
    cancelPdfLoad?.();
    const image = document.getElementById('prayerImage');
    if (!image) return;
    const localFrame = document.getElementById('localPdfFrame');
    if (localFrame) {
        localFrame.onload = null;
        localFrame.onerror = null;
        localFrame.classList.add('hidden');
        localFrame.removeAttribute('src');
    }
    const finish = beginDataActivity('prayers', 'Sedelit laaditakse…', () => loadPDF(fileURL));
    const controller = new AbortController();
    let loadingTask;
    let renderTask;
    let cancelled = false;
    let completed = false;
    let nextImageUrl = '';
    let timer;
    const complete = failed => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        image.setAttribute('aria-busy', 'false');
        if (localFrame) { localFrame.onload = null; localFrame.onerror = null; }
        cancelPdfLoad = null;
        finish(failed);
    };
    const cancel = (failed = false) => {
        cancelled = true;
        controller.abort();
        renderTask?.cancel();
        loadingTask?.destroy().catch(() => {});
        complete(failed);
    };
    cancelPdfLoad = cancel;
    timer = setTimeout(() => cancel(true), 30000);
    image.classList.add('hidden');
    image.removeAttribute('src');
    image.setAttribute('aria-busy', 'true');
    loadedPdfUrl = '';
    if (prayerImageUrl) URL.revokeObjectURL(prayerImageUrl);
    prayerImageUrl = '';
    // The original remains available even if image rendering fails.
    updateOpenPdfButton(fileURL);
    try {
        if (location.protocol === 'file:') {
            // Browsers prohibit fetching local PDFs and importing local modules.
            // Navigate the built-in PDF viewer to the original document instead.
            const frame = document.getElementById('localPdfFrame');
            frame.classList.remove('hidden');
            frame.onload = () => { if (!cancelled) complete(false); };
            frame.onerror = () => { if (!cancelled) complete(true); };
            frame.src = `${fileURL}#toolbar=0&navpanes=0&view=FitH`;
            return;
        }
        const [pdfjs, response] = await Promise.all([
            getPdfRenderer(), fetch(fileURL, { signal: controller.signal, cache: 'no-cache' })
        ]);
        if (cancelled) return;
        if (!response.ok) throw new Error(`PDF request failed: ${response.status}`);
        const data = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        loadingTask = pdfjs.getDocument({
            data, isEvalSupported: false,
            standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', document.baseURI).href,
            wasmUrl: new URL('./vendor/pdfjs/wasm/', document.baseURI).href
        });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const original = page.getViewport({ scale: 1 });
        // Render once at a readable resolution; CSS scales the whole page on phones.
        const viewport = page.getViewport({ scale: Math.min(1600 / original.width, 2200 / original.height) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        await renderTask.promise;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (cancelled) return;
        if (!blob) throw new Error('PDF image could not be created');
        nextImageUrl = URL.createObjectURL(blob);
        const preview = new Image();
        preview.src = nextImageUrl;
        await preview.decode();
        if (cancelled) return;
        image.src = nextImageUrl;
        image.width = canvas.width;
        image.height = canvas.height;
        image.classList.remove('hidden');
        prayerImageUrl = nextImageUrl;
        nextImageUrl = '';
        loadedPdfUrl = fileURL;
        complete(false);
    } catch (error) {
        if (!cancelled) { console.warn('Prayer preview failed:', error); complete(true); }
    } finally {
        if (nextImageUrl) URL.revokeObjectURL(nextImageUrl);
        await loadingTask?.destroy().catch(() => {});
    }
}
const prayerWeekCache = new Map();
async function getAvailablePrayerWeeks(userName) {
    const allWeeks = Array.from({ length: DEFAULT_WEEK }, (_, index) => index + 1);
    if (!/^https?:/.test(location.protocol)) return allWeeks.reverse();
    const cached = prayerWeekCache.get(userName);
    if (cached && cached.expires > Date.now()) return cached.promise;
    const promise = (async () => {
        const finish = beginDataActivity('prayers', 'Sedelite nimekirja laaditakse…', () => {
            prayerWeekCache.delete(userName);
            prayerRenderKey = '';
            return renderPrayers();
        });
        const available = [];
        let failed = false;
        let index = 0;
        await Promise.all(Array.from({ length: 6 }, async () => {
            while (index < allWeeks.length) {
                const week = allWeeks[index++];
                try {
                    const response = await fetch(buildPrayerUrl(userName, week), { method: 'HEAD', signal: AbortSignal.timeout(8000) });
                    if (response.ok) available.push(week);
                    else if (response.status !== 404) failed = true;
                } catch (error) { failed = true; }
            }
        }));
        finish(failed);
        if (failed) { prayerWeekCache.delete(userName); throw new Error('Prayer availability could not be loaded'); }
        return available.sort((a,b) => b-a);
    })();
    prayerWeekCache.set(userName, { promise, expires: Date.now() + 300000 });
    return promise;
}
let prayerRenderKey = '';
let prayerRenderVersion = 0;

async function renderPrayers() {
    const prayerSelect = document.getElementById('prayerSelect');
    const prayerEmptyState = document.getElementById('prayerEmptyState');
    const userName = appState.currentUser ? appState.currentUser.name : 'guest';

    if (!prayerSelect) return;
    const key = `${userName}:${appState.weekNr}`;
    if (prayerRenderKey === key) return;
    prayerRenderKey = key;
    const version = ++prayerRenderVersion;

    // Fast UI: populate dropdown immediately, then refine if possible.
    prayerSelect.innerHTML = '';
    for (let i = (appState.weekNr || DEFAULT_WEEK); i >= 1; i -= 1) {
        const option = document.createElement('option');
        option.value = String(i);
        option.textContent = `Sedel nr ${i}`;
        prayerSelect.appendChild(option);
    }
    prayerSelect.value = String(appState.weekNr || DEFAULT_WEEK);
    prayerSelect.disabled = false;
    if (prayerEmptyState) prayerEmptyState.classList.add('hidden');
    hideOpenPdfButton();

    prayerSelect.onchange = async () => {
        const chosenWeek = Number(prayerSelect.value);
        appState.weekNr = chosenWeek;
        prayerRenderKey = `${userName}:${chosenWeek}`;
        const prayerPath = buildPrayerUrl(userName, chosenWeek);
        await loadPDF(prayerPath).catch(() => {
            if (prayerEmptyState) prayerEmptyState.classList.remove('hidden');
        });
    };

    // If possible, refine with availability probe (only over http)
    try {
        const availableWeeks = await getAvailablePrayerWeeks(userName);
        if (version !== prayerRenderVersion || appState.currentUser?.name !== userName) return;
        if (!availableWeeks || !availableWeeks.length) {
            prayerSelect.innerHTML = '<option value="">Palvesedelid puuduvad</option>';
            prayerSelect.disabled = true;
            if (prayerEmptyState) prayerEmptyState.classList.remove('hidden');
            hideOpenPdfButton();
            return;
        }
        // filter existing options to available ones
        const options = Array.from(prayerSelect.options);
        options.forEach((opt) => {
            if (!availableWeeks.includes(Number(opt.value))) opt.remove();
        });
        const selected = availableWeeks.includes(Number(appState.weekNr)) ? Number(appState.weekNr) : availableWeeks[0];
        appState.weekNr = selected;
        prayerRenderKey = `${userName}:${selected}`;
        prayerSelect.value = String(selected);
        const prayerPath = buildPrayerUrl(userName, selected);
        await loadPDF(prayerPath).catch(() => {
            if (prayerEmptyState) prayerEmptyState.classList.remove('hidden');
        });
    } catch (err) {
        if (version !== prayerRenderVersion || appState.currentUser?.name !== userName) return;
        prayerRenderKey = '';
        // Allow direct access if availability checks failed.
        const prayerPath = buildPrayerUrl(userName, Number(prayerSelect.value));
        await loadPDF(prayerPath).catch(() => {
            if (prayerEmptyState) prayerEmptyState.classList.remove('hidden');
        });
    }
}

function getUserAvatar(user) {
    if (user && user.image) return user.image;
    const name = user && user.name ? user.name : 'User';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=128&color=fff`;
}

function renderMembers() {
    const membersGrid = document.getElementById('membersGrid');
    if (!membersGrid) return;

    membersGrid.innerHTML = '';
    appState.users.forEach((user) => {
        const card = document.createElement('article');
        card.className = 'member-card';
        const statusLabel = user.active ? 'aktiivne' : 'mitteaktiivne';
        const isAdmin = appState.currentUser && appState.currentUser.role === 'admin';

        card.innerHTML = `
            <div class="member-top">
                <img class="member-avatar" src="${getUserAvatar(user)}" alt="${user.name}" />
                <div class="member-meta">
                    <h3>${user.name}</h3>
                    <div class="member-role">${user.role || 'user'}</div>
                </div>
            </div>
            <div class="member-status ${user.active ? 'active' : 'inactive'}">${statusLabel}</div>
        `;

        if (isAdmin && user.id !== appState.currentUser.id) {
            const select = document.createElement('select');
            select.className = 'member-status-select';
            select.innerHTML = `
                <option value="true" ${user.active ? 'selected' : ''}>aktiivne</option>
                <option value="false" ${!user.active ? 'selected' : ''}>mitteaktiivne</option>
            `;
            select.addEventListener('change', async (event) => {
                select.disabled = true;
                const nextActive = event.target.value === 'true';
                try {
                    const result = await callAppsScript('updateUserStatus', { userId: user.id, active: nextActive });
                    if (result && result.success) {
                        const updated = result.data && result.data.user ? result.data.user : null;
                        if (updated) {
                            const target = appState.users.find((entry) => entry.id === updated.id);
                            if (target) Object.assign(target, { ...target, ...updated, active: updated.active !== false });
                        }
                        // update DB timestamp and refresh members
                        updateDbTimestamp(new Date().toISOString());
                        renderMembers();
                    } else {
                        select.disabled = false;
                        select.value = user.active ? 'true' : 'false';
                    }
                } catch (error) {
                    select.disabled = false;
                    select.value = user.active ? 'true' : 'false';
                }
            });
            card.appendChild(select);
        }

        membersGrid.appendChild(card);
    });
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('et-EE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function renderMessages() {
    const sentMessages = document.getElementById('sentMessages');
    const receivedMessages = document.getElementById('receivedMessages');
    const recipientSelect = document.getElementById('recipientSelect');

    if (!sentMessages || !receivedMessages || !recipientSelect) return;

    recipientSelect.innerHTML = `
        <option value="">Vali saaja</option>
        ${appState.users
            .filter((user) => user.id !== appState.currentUser.id)
            .map((user) => `<option value="${user.id}">${user.name}</option>`)
            .join('')}
    `;

    const sent = Array.isArray(appState.sentMessages) ? appState.sentMessages : [];
    const received = Array.isArray(appState.inboxMessages) ? appState.inboxMessages : [];

    // sort newest -> oldest by createdAt
    const sortByDateDesc = (arr) => (arr || []).slice().sort((a, b) => {
        const ta = a && a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b && b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
    });
    const sentSorted = sortByDateDesc(sent);
    const receivedSorted = sortByDateDesc(received);

    sentMessages.innerHTML = sentSorted.length
        ? sentSorted.map((message) => `
            <div class="message-item">
                <strong>${message.receiverName || 'Saaja'}</strong>
                <div>${message.message}</div>
                <small>${formatDate(message.createdAt)}</small>
            </div>
        `).join('')
        : '<div class="message-item">Sõnumeid pole.</div>';

    receivedMessages.innerHTML = receivedSorted.length
        ? receivedSorted.map((message) => `
            <div class="message-item">
                <strong>${message.senderName || 'Saatja'}</strong>
                <div>${message.message}</div>
                <small>${formatDate(message.createdAt)}</small>
            </div>
        `).join('')
        : '<div class="message-item">Sulle pole uusi sõnumeid.</div>';

    // Ensure mobile tabs are visible and default to received messages
    const tabs = document.getElementById('messageTabs');
    if (tabs) {
        tabs.classList.remove('hidden');
        // default to received open
        setMessageTab('received');
    }
}

function renderLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    if (!leaderboardList) return;

    const scores = Array.isArray(appState.leaderboard) && appState.leaderboard.length
        ? appState.leaderboard
        : [];

    if (!scores.length) {
        leaderboardList.innerHTML = '<li>Ühtegi tulemust pole veel salvestatud.</li>';
        return;
    }

    leaderboardList.innerHTML = scores
        .map((entry) => `<li>${entry.userName || 'Kasutaja'} — ${entry.bestScore || 0}</li>`)
        .join('');
}

function renderSettings() {
    const sessionBadge = document.getElementById('sessionBadge');
    if (sessionBadge && appState.currentUser) {
        sessionBadge.textContent = appState.currentUser.name;
        sessionBadge.classList.remove('hidden');
    }
}

function renderAuthenticatedState() {
    renderDataActivity();
    if (!appState.currentUser) {
        document.getElementById('loginScreen')?.classList.remove('hidden');
        document.getElementById('appScreen')?.classList.add('hidden');
        document.getElementById('logoutButton')?.classList.add('hidden');
        window.bjkCurrentUserName = '';
        return;
    }

    window.bjkCurrentUserName = appState.showSessionBadge ? appState.currentUser.name : '';
    document.getElementById('loginScreen')?.classList.add('hidden');
    document.getElementById('appScreen')?.classList.remove('hidden');
    document.getElementById('logoutButton')?.classList.remove('hidden');
    const sessionBadge = document.getElementById('sessionBadge');
    if (sessionBadge) {
        if (appState.showSessionBadge) {
            sessionBadge.textContent = appState.currentUser.name;
            sessionBadge.classList.remove('hidden');
        } else {
            sessionBadge.classList.add('hidden');
            sessionBadge.textContent = '';
        }
    }

    renderPrayers();
    renderMembers();
    renderMessages();
    renderLeaderboard();
    renderSettings();
    showView(appState.currentView);
    const scoreBoard = document.getElementById('bestScoreBoard');
    if (scoreBoard) {
        scoreBoard.textContent = Number(appState.currentUser.bestScore || 0);
    }
}

async function loadUserDependentData({ fromLogin = false } = {}) {
    if (!appState.currentUser || !appState.sessionToken) return;
    const token = appState.sessionToken;
    const jobs = [
        ['getSentMessages', {}, 'sentMessages', 'messages', renderMessages],
        ['getInbox', {}, 'inboxMessages', 'messages', renderMessages]
    ];
    if (!fromLogin) jobs.push(
        ['getUsers', {}, 'users', 'users', () => { renderMembers(); renderMessages(); }],
        ['getLeaderboard', { game: 'bjker-mario' }, 'leaderboard', 'leaderboard', renderLeaderboard]
    );
    await Promise.allSettled(jobs.map(async ([action, payload, field, resultKey, render]) => {
        const result = await callAppsScript(action, { ...payload, token });
        if (appState.sessionToken !== token) return;
        if (result?.success && Array.isArray(result.data?.[resultKey])) {
            appState[field] = result.data[resultKey];
            render();
        }
    }));
}

async function handleLogin(event) {
    event.preventDefault();
    const name = document.getElementById('name').value.trim();
    const password = document.getElementById('password').value;

    if (!name || !password) {
        showMessage('error', 'Sisesta nimi ja salasõna.', 'error');
        return;
    }

    showLoading('loginLoading');
    try {
        const result = await callAppsScript('login', { name, password });
        if (!result || !result.success) {
            showMessage('error', result && result.error ? result.error : 'Vale kasutajanimi või salasõna.', 'error');
            hideLoading('loginLoading');
            return;
        }

        const token = result.data && result.data.token ? result.data.token : '';
        if (!token) {
            showMessage('error', 'Sessiooni loomine ebaõnnestus.', 'error');
            hideLoading('loginLoading');
            return;
        }

        setSessionState(token, result.data.user);
        processPendingScores().catch(console.warn);
        appState.users = Array.isArray(result.data.users) ? result.data.users : [];
        appState.leaderboard = Array.isArray(result.data.leaderboard) ? result.data.leaderboard : [];

        appState.showSessionBadge = true;
        hideLoading('loginLoading');
        hideMessage('error');
        hideMessage('randomError');
        document.getElementById('loginForm').reset();
        renderAuthenticatedState();
        loadUserDependentData({ fromLogin: true }).catch(console.warn);
    } catch (error) {
        hideLoading('loginLoading');
        showMessage('error', 'Sisselogimine ebaõnnestus.', 'error');
    }
}

async function handleLogout() {
    // play a quick logout animation immediately for instant feedback
    const appScreenEl = document.getElementById('appScreen');
    if (appScreenEl) appScreenEl.classList.add('logout-anim');

    // call logout in background (don't block on network to keep UI instant)
    if (appState.sessionToken) {
        callAppsScript('logout', {}).catch(() => {});
    }

    // after a short animation delay, clear local session and render login
    setTimeout(() => {
        clearSession();
        appState.showSessionBadge = false;
        document.getElementById('loginForm')?.reset();
        hideMessage('error');
        hideMessage('randomError');
        appState.currentView = 'prayers';
        // remove animation class to allow future logins to animate normally
        if (appScreenEl) appScreenEl.classList.remove('logout-anim');
        renderAuthenticatedState();
    }, 320);
}

async function handleMessageSubmit(event) {
    event.preventDefault();
    if (!appState.currentUser) return;

    const recipientId = document.getElementById('recipientSelect').value;
    const text = document.getElementById('messageText').value.trim();

    if (!recipientId) {
        showMessage('messageFormError', 'Vali saaja enne sõnumi saatmist.', 'error');
        return;
    }

    if (!text) {
        showMessage('messageFormError', 'Sõnumi tekst ei tohi olla tühi.', 'error');
        return;
    }

    const sendingToken = appState.sessionToken;
    showLoading('messageFormLoading');

    // Preserve the draft until the server confirms delivery.
    const newMessage = {
        senderId: appState.currentUser.id,
        receiverId: recipientId,
        message: text,
        createdAt: new Date().toISOString(),
        senderName: appState.currentUser.name,
        receiverName: appState.users.find(user => user.id === recipientId)?.name || 'Unknown'
    };

    try {
        const result = await callAppsScript('sendMessage', {
            receiverId: recipientId,
            message: text, token: sendingToken
        });
        if (appState.sessionToken !== sendingToken) { hideLoading('messageFormLoading'); return; }

        if (!result || !result.success) {
            showMessage('messageFormError', result && result.error ? result.error : 'Sõnumi saatmine ebaõnnestus.', 'error');
            hideLoading('messageFormLoading');
            return;
        }

        hideMessage('messageFormError');
        appState.sentMessages = [...appState.sentMessages, newMessage];
        renderMessages();
        const draft = document.getElementById('messageText');
        if (draft.value.trim() === text) draft.value = '';
        // mark DB update time
        updateDbTimestamp(new Date().toISOString());
        hideLoading('messageFormLoading');
    } catch (error) {
        hideLoading('messageFormLoading');
        showMessage('messageFormError', 'Sõnumi saatmine ebaõnnestus.', 'error');
    }
}

async function handlePasswordChange(event) {
    event.preventDefault();
    if (!appState.currentUser) return;

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!currentPassword) {
        showMessage('passwordMessage', 'Praegune salasõna ei ühti.', 'error');
        return;
    }

    if (!newPassword || newPassword.length < 6) {
        showMessage('passwordMessage', 'Uus salasõna peab olema vähemalt 6 tähemärki.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showMessage('passwordMessage', 'Uued salasõnad ei kattu.', 'error');
        return;
    }

    showLoading('passwordFormLoading');

    try {
        const result = await callAppsScript('changePassword', {
            currentPassword,
            newPassword
        });

        if (!result || !result.success) {
            showMessage('passwordMessage', result && result.error ? result.error : 'Salasõna uuendamine ebaõnnestus.', 'error');
            hideLoading('passwordFormLoading');
            return;
        }

        document.getElementById('passwordForm').reset();
        hideLoading('passwordFormLoading');
        setActivityResult('settings', false, 'Salasõna edukalt uuendatud.');
    } catch (error) {
        hideLoading('passwordFormLoading');
        showMessage('passwordMessage', 'Salasõna uuendamine ebaõnnestus.', 'error');
    }
}

const requestLabels = {
    login: ['account', 'Sisse logitakse…'], logout: ['account', 'Välja logitakse…'],
    getUsers: ['members', 'Liikmeid laaditakse…'], updateUserStatus: ['members', 'Liikme olekut salvestatakse…'],
    getSentMessages: ['messages', 'Saadetud sõnumeid laaditakse…'], getInbox: ['messages', 'Saabunud sõnumeid laaditakse…'],
    sendMessage: ['messages', 'Sõnumit saadetakse…'], changePassword: ['settings', 'Salasõna uuendatakse…'],
    getLeaderboard: ['games', 'Edetabelit laaditakse…'], saveScore: ['games', 'Tulemust salvestatakse…']
};
const pendingReads = new Map();
function callAppsScript(action, payload = {}) {
    const key = JSON.stringify([appState.sessionToken, action, payload]);
    const isRead = action.startsWith('get');
    if (isRead && pendingReads.has(key)) return pendingReads.get(key);
    const request = (async () => {
        const [scope, label] = requestLabels[action] || ['account', 'Andmeid uuendatakse…'];
        const retry = isRead ? () => {
            if (action === 'getLeaderboard' && payload.game === 'bjk-memory') return window.BJKMemory?.refreshLeaderboard();
            return loadUserDependentData();
        } : undefined;
        const finish = action === 'saveScore' ? () => {} : beginDataActivity(scope, label, retry);
        try {
            const result = await performAppsScriptRequest(action, payload);
            finish(result?.success !== true);
            if (result?.success === true) updateDbTimestamp(new Date().toISOString());
            return result;
        } catch (error) { finish(true); throw error; }
    })();
    if (isRead) {
        pendingReads.set(key, request);
        request.finally(() => pendingReads.delete(key)).catch(() => {});
    }
    return request;
}
async function performAppsScriptRequest(action, payload = {}) {
    if (!GOOGLE_SHEET_ENDPOINT) {
        return { success: false, error: 'Google Sheets endpoint is not configured.' };
    }

    const storedSession = readSessionState();
    if (storedSession && storedSession.token) {
        appState.sessionToken = storedSession.token;
    }

    const body = {
        action,
        token: appState.sessionToken || storedSession?.token || '',
        ...payload
    };

    const response = await fetch(GOOGLE_SHEET_ENDPOINT, {
        signal: AbortSignal.timeout(20000),
        method: 'POST',
        redirect: 'follow',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`Google Sheets request failed: ${response.status}`);
    }

    const json = await response.json().catch(() => ({}));
    if (!json || json.success !== true) {
        return { success: false, error: json && json.error ? json.error : 'Request failed.' };
    }
    return json;
}

// Persist before sending so navigation and network failures cannot lose a result.
const PENDING_SCORES_KEY = 'bjkPendingScoresV2';
let scoreSyncPromise = null;
let volatileScores = [];
let scoreStorageUnavailable = false;

function readPendingScores() {
    if (scoreStorageUnavailable) return volatileScores;
    try {
        const list = JSON.parse(localStorage.getItem(PENDING_SCORES_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (e) { return volatileScores; }
}

function writePendingScores(list) {
    volatileScores = list;
    try {
        localStorage.setItem(PENDING_SCORES_KEY, JSON.stringify(list));
        scoreStorageUnavailable = false;
        return true;
    } catch (e) { scoreStorageUnavailable = true; return false; }
}

function setScoreStatus(game, state, message) {
    window.reportScoreStatus?.(game, state, message);
}

function applySavedScore(item, result) {
    if (String(appState.currentUser?.id) !== item.userId) return;
    if (item.game === 'bjker-mario') {
        appState.currentUser.bestScore = Math.max(Number(appState.currentUser.bestScore || 0), Number(result.data.bestScore));
        appState.leaderboard = result.data.leaderboard || appState.leaderboard;
        setSessionState(appState.sessionToken, appState.currentUser);
        renderLeaderboard();
        const el = document.getElementById('bestScoreBoard');
        if (el) el.textContent = appState.currentUser.bestScore;
    } else if (window.BJKMemory?.renderLeaderboard) {
        window.BJKMemory.renderLeaderboard(result.data.leaderboard);
    }
    updateDbTimestamp(new Date().toISOString());
}

function processPendingScores() {
    if (scoreSyncPromise) return scoreSyncPromise;
    scoreSyncPromise = (async () => {
        const attempted = new Set();
        while (appState.currentUser && appState.sessionToken) {
            const item = readPendingScores().find(item => item.userId === String(appState.currentUser.id) && !attempted.has(item.id));
            if (!item) break;
            attempted.add(item.id);
            const token = appState.sessionToken;
            setScoreStatus(item.game, 'saving', 'Tulemust salvestatakse…');
            let result;
            try {
                result = await callAppsScript('saveScore', { game: item.game, score: item.score, token });
            } catch (e) { result = null; }
            if (result?.success === true && Number.isFinite(Number(result.data?.bestScore))) {
                // Remove only the acknowledged entry, preserving scores queued during the request.
                writePendingScores(readPendingScores().filter(entry => entry.id !== item.id));
                applySavedScore(item, result);
                if (String(appState.currentUser?.id) === item.userId) {
                    setScoreStatus(item.game, 'saved', 'Tulemus salvestatud.');
                }
            } else if (String(appState.currentUser?.id) === item.userId) {
                setScoreStatus(item.game, 'pending', 'Salvestamine ootel. Proovime automaatselt uuesti.');
            }
        }
    })().finally(() => { scoreSyncPromise = null; });
    return scoreSyncPromise;
}

async function saveScoreWithFallback(game, score) {
    if (!appState.currentUser?.id || !Number.isFinite(Number(score))) return { success: false };
    const item = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId: String(appState.currentUser.id), game, score: Number(score)
    };
    const durable = writePendingScores([...readPendingScores(), item]);
    await processPendingScores();
    const queued = readPendingScores().some(entry => entry.id === item.id);
    if (queued && !durable) setScoreStatus(game, 'pending', 'Salvestamine ebaõnnestus. Hoia leht avatuna; proovime uuesti.');
    return { success: !queued, queued };
}

window.addEventListener('online', () => { processPendingScores().catch(console.warn); });
setInterval(() => { processPendingScores().catch(console.warn); }, 15000);
window.saveScoreWithFallback = saveScoreWithFallback;


function setUpEventBindings() {
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
    document.getElementById('messageForm')?.addEventListener('submit', handleMessageSubmit);
    document.getElementById('passwordForm')?.addEventListener('submit', handlePasswordChange);
    document.querySelectorAll('.nav-button').forEach((button) => {
        button.addEventListener('click', () => showView(button.dataset.view));
    });

    // mobile message tabs
    const tabReceived = document.getElementById('msgTabReceived');
    const tabSent = document.getElementById('msgTabSent');
    if (tabReceived && tabSent) {
        tabReceived.addEventListener('click', () => setMessageTab('received'));
        tabSent.addEventListener('click', () => setMessageTab('sent'));
    }
}

// Games UI helpers
function showGamesList() {
    document.querySelectorAll('.game-subview').forEach(el=>el.classList.add('hidden'));
    document.getElementById('gamesList')?.classList.remove('hidden');
}

function openGameSubView(gameId) {
    document.getElementById('gamesList')?.classList.add('hidden');
    document.querySelectorAll('.game-subview').forEach(el=>el.classList.add('hidden'));
    if (gameId==='bjker-mario') {
        document.getElementById('subview-bjker-mario')?.classList.remove('hidden');
        // ensure Mario UI is visible (existing game uses same ids)
    } else if (gameId==='bjk-memory') {
        document.getElementById('subview-bjk-memory')?.classList.remove('hidden');
        // init memory if available
        if (window.BJKMemory && typeof window.BJKMemory.init === 'function') {
            window.BJKMemory.init();
        }
    }
}

// wire play buttons and back buttons after DOM ready
window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.play-game-button').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
            const g = btn.dataset.game;
            openGameSubView(g);
        });
    });
    document.querySelectorAll('.back-to-games').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            showGamesList();
        });
    });
    // default: ensure games list visible when opening Games view
    // when nav shows games view, show list
    const gamesNav = document.querySelector('.nav-button[data-view="games"]');
    if (gamesNav) gamesNav.addEventListener('click', () => { showGamesList(); });
});

function setMessageTab(which) {
    const sentBox = document.getElementById('sentBox');
    const receivedBox = document.getElementById('receivedBox');
    const tabReceived = document.getElementById('msgTabReceived');
    const tabSent = document.getElementById('msgTabSent');
    if (!sentBox || !receivedBox) return;

    tabSent?.setAttribute('aria-selected', String(which === 'sent'));
    tabReceived?.setAttribute('aria-selected', String(which !== 'sent'));
    if (which === 'sent') {
        sentBox.classList.add('active');
        receivedBox.classList.remove('active');
        if (tabSent) tabSent.classList.add('active');
        if (tabReceived) tabReceived.classList.remove('active');
    } else {
        receivedBox.classList.add('active');
        sentBox.classList.remove('active');
        if (tabReceived) tabReceived.classList.add('active');
        if (tabSent) tabSent.classList.remove('active');
    }
}

async function initializeApp() {
    const storedSession = readSessionState();
    if (storedSession && storedSession.token) {
        appState.sessionToken = storedSession.token;
        appState.currentUser = storedSession.user ? safeUser(storedSession.user) : null;
        // don't show the persisted user name in the header until we confirm/load backend data
        appState.showSessionBadge = false;
    }

    // Render immediately using stored state so UI is responsive
    persistState();
    setUpEventBindings();
    renderAuthenticatedState();

    // Load backend-dependent data in background to avoid blocking UI
    if (appState.currentUser) {
        // indicate DB refresh in header while background load happens
        updateDbTimestamp(null);
        loadUserDependentData().then(() => {
            // show session name once backend data has been refreshed
            appState.showSessionBadge = true;
            persistState();
            renderAuthenticatedState();
                // attempt to flush any pending scores after we've loaded user data
                processPendingScores().catch(()=>{});
            }).catch(() => {
            // ignore background load errors
        });
    }
}

window.addEventListener('DOMContentLoaded', initializeApp);

window.addEventListener('bjk-best-score', (event) => {
    const score = Number(event.detail?.score);
    if (!appState.currentUser || event.detail?.user !== appState.currentUser.name || !Number.isFinite(score) || score <= 0) return;
    saveScoreWithFallback('bjker-mario', score).catch(console.warn);
});

window.addEventListener('bjk-store-current-user', () => {
    if (appState.currentUser) {
        window.bjkCurrentUserName = appState.currentUser.name;
    }
});

window.addEventListener('beforeunload', persistState);

function updateOpenPdfButton(fileURL) {
    const buttonDiv = document.getElementById('openPDFButtonDiv');
    const button = document.getElementById('openPDFButton');
    if (!buttonDiv || !button) return;

    button.onclick = () => {
        if (fileURL) {
            window.open(fileURL, '_blank', 'noopener,noreferrer');
        }
    };

    buttonDiv.classList.remove('hidden');
}

function hideOpenPdfButton() {
    const buttonDiv = document.getElementById('openPDFButtonDiv');
    if (buttonDiv) {
        buttonDiv.classList.add('hidden');
    }
}