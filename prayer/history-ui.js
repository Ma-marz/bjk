// Prayer weeks use a consistent Monday–Sunday calendar in Europe/Tallinn.
const PRAYER_DAY_MS = 86400000;
let prayerHistoryPromise;
let prayerHistoryViewVersion = 0;

function prayerCalendarDay(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tallinn', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = type => parts.find(item => item.type === type).value;
    return Date.UTC(Number(part('year')), Number(part('month')) - 1, Number(part('day')));
}

function prayerHistoryRows(history, userName, now = new Date()) {
    const weeks = Object.values(history?.weeks || {}).filter(record => Number.isInteger(record.week) && record.week > 0 && /^\d{4}-\d{2}-\d{2}$/.test(record.date || '') && Number.isFinite(Date.parse(record.date)))
        .sort((a, b) => a.week - b.week);
    if (!weeks.length) return [];
    const first = weeks[0];
    const firstDate = Date.parse(first.date + 'T00:00:00Z');
    const weekday = new Date(firstDate).getUTCDay();
    // Weekend generation prepares the coming week; weekdays belong to that week.
    const firstMonday = firstDate + (weekday === 6 ? 2 : weekday === 0 ? 1 : 1 - weekday) * PRAYER_DAY_MS;
    const today = prayerCalendarDay(now);
    const normalize = name => String(name || '').normalize('NFKC').trim().toLocaleLowerCase('et');
    const name = normalize(userName);
    return weeks.flatMap(record => {
        const start = firstMonday + (record.week - first.week) * 7 * PRAYER_DAY_MS;
        if (start > today) return [];
        const assignments = record.assignments || {};
        const names = Object.keys(assignments);
        const exact = names.find(candidate => normalize(candidate) === name);
        const candidates = names.filter(candidate => normalize(candidate).split(/\s+/)[0] === name);
        const owner = exact || (candidates.length === 1 ? candidates[0] : null);
        if (!owner) return [];
        const end = start + 6 * PRAYER_DAY_MS;
        const current = today <= end;
        const row = { week: record.week, start, end, current, prayingFor: assignments[owner] };
        // Never include the incoming assignment in the current week's view model.
        if (!current) row.prayedForBy = names.find(candidate => assignments[candidate] === owner) || '';
        return [row];
    }).reverse();
}

async function getPrayerHistory() {
    if (!prayerHistoryPromise) {
        prayerHistoryPromise = (async () => {
            if (location.protocol === 'file:') {
                if (!window.BJK_PRAYER_HISTORY) throw new Error('Prayer history index is missing.');
                return window.BJK_PRAYER_HISTORY;
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch('tools/prayer-generator/history.json', { cache: 'no-store', signal: controller.signal });
                if (!response.ok) throw new Error('Prayer history could not be loaded.');
                const data = await response.json();
                if (!data?.weeks || typeof data.weeks !== 'object') throw new Error('Invalid prayer history.');
                return data;
            } finally { clearTimeout(timeout); }
        })().catch(error => { prayerHistoryPromise = undefined; throw error; });
    }
    return prayerHistoryPromise;
}

function prayerWeekRange(row) {
    const date = value => new Intl.DateTimeFormat('et-EE', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(value);
    return `${date(row.start)} – ${date(row.end)}`;
}

async function renderPrayerHistory() {
    const button = document.getElementById('currentPrayer');
    const list = document.getElementById('prayerHistoryList');
    if (!button || !list || !appState.currentUser) return;
    const version = ++prayerHistoryViewVersion;
    const name = appState.currentUser.name;
    const token = appState.sessionToken;
    try {
        const history = await getPrayerHistory();
        if (version !== prayerHistoryViewVersion || appState.currentUser?.name !== name || appState.sessionToken !== token) return;
        const rows = prayerHistoryRows(history, name);
        const current = rows.find(row => row.current);
        document.getElementById('currentPrayerName').textContent = current?.prayingFor || 'Selle nädala määrang puudub';
        document.getElementById('prayerHistoryError').classList.add('hidden');
        list.replaceChildren();
        if (!rows.length) list.append(chatText('p', 'prayer-history-empty', 'Sinu palveajalugu on veel tühi.'));
        rows.forEach(row => {
            const card = chatText('article', 'prayer-history-week', '');
            card.classList.toggle('current', row.current);
            card.append(chatText('h3', '', `Nädal ${row.week}${row.current ? ' · hetkel palves' : ''}`), chatText('p', 'prayer-week-dates', prayerWeekRange(row)));
            const outgoing = chatText('p', '', '');
            outgoing.append(chatText('span', 'prayer-history-label', row.current ? 'Palvetad tema eest' : 'Palvetasid tema eest'), chatText('strong', '', row.prayingFor || '—'));
            card.append(outgoing);
            if (!row.current) {
                const incoming = chatText('p', '', '');
                incoming.append(chatText('span', 'prayer-history-label', 'Sinu eest palvetas'), chatText('strong', '', row.prayedForBy || '—'));
                card.append(incoming);
            }
            list.append(card);
        });
    } catch (_) {
        if (version !== prayerHistoryViewVersion || appState.sessionToken !== token) return;
        document.getElementById('currentPrayerName').textContent = 'Ava palveajalugu';
        document.getElementById('prayerHistoryError').classList.remove('hidden');
    }
}

function clearPrayerHistoryView() {
    prayerHistoryViewVersion++;
    document.getElementById('prayerHistoryList')?.replaceChildren();
    const name = document.getElementById('currentPrayerName');
    if (name) name.textContent = 'Laadin…';
}

function setUpPrayerHistory() {
    document.getElementById('currentPrayer')?.addEventListener('click', () => showView('prayer-history'));
    document.getElementById('prayerHistoryBack')?.addEventListener('click', () => showView('prayers'));
    document.getElementById('prayerHistoryRetry')?.addEventListener('click', () => { prayerHistoryPromise = undefined; renderPrayerHistory(); });
    setInterval(() => { if (appState.currentUser && !document.hidden) renderPrayerHistory(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (appState.currentUser && !document.hidden) renderPrayerHistory(); });
}
