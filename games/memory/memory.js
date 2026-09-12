(function(){
// Memory game module
const GAME_ID = 'bjk-memory';
let boardEl, timeEl, attemptsEl, restartBtn, leaderboardEl;
let timerInterval = null;
let startTime = 0;
let elapsed = 0;
let attempts = 0;
let firstCard = null;
let lock = false;
let matches = 0;
let totalPairs = 0;
let cards = [];

function fmtSeconds(ms) {
  return (ms/1000).toFixed(2);
}

// Existing scores are negative integer milliseconds. For new scores, use the
// interval (-milliseconds, -milliseconds + 1) to store attempts as well.
// Larger remains better on the existing backend: time first, then attempts.
// Legacy integer scores have unknown attempts and lose an otherwise exact tie.
const MEMORY_ATTEMPT_SCALE = 1000000;
function encodeMemoryScore(milliseconds, attemptCount) {
  if (!Number.isInteger(milliseconds) || milliseconds < 1 ||
      !Number.isInteger(attemptCount) || attemptCount < 1 || attemptCount >= MEMORY_ATTEMPT_SCALE) {
    throw new Error('Invalid memory result');
  }
  const score = -(milliseconds - 1 + attemptCount / MEMORY_ATTEMPT_SCALE);
  const decoded = decodeMemoryScore(score);
  if (decoded.milliseconds !== milliseconds || decoded.attempts !== attemptCount) {
    throw new Error('Memory result exceeds score precision');
  }
  return score;
}
function decodeMemoryScore(score) {
  const value = Math.abs(Number(score));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (Number.isInteger(value)) return { milliseconds: value, attempts: null };
  return {
    milliseconds: Math.ceil(value),
    attempts: Math.round((value - Math.floor(value)) * MEMORY_ATTEMPT_SCALE)
  };
}

function listImages() {
  return Array.from({ length: 11 }, (_, index) => `game/img/${index + 1}.png`);
}
let imageCache = null;
let boardVersion = 0;
let initialized = false;
let boardOwner = null;

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

async function preloadImages(paths, timeout = 2500) {
  const loaders = paths.map(p => new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const timer = setTimeout(()=>{
      if (done) return; done = true; resolve({ ok:false, path: p });
    }, timeout);
    img.onload = () => { if (done) return; done = true; clearTimeout(timer); resolve({ ok:true, path: p }); };
    img.onerror = () => { if (done) return; done = true; clearTimeout(timer); resolve({ ok:false, path: p }); };
    img.src = p;
  }));
  const results = await Promise.all(loaders);
  return results.filter(r=>r.ok).map(r=>r.path);
}

async function buildBoard() {
  const version = ++boardVersion;
  resetState();
  const finish = beginDataActivity('games', 'Mängu pilte laaditakse…', () => buildBoard());
  restartBtn.disabled = true;
  lock = true;
  cards = [];
  totalPairs = 0;
  boardEl.innerHTML = '';
  if (!imageCache) imageCache = preloadImages(listImages());
  let imgs = [...new Set((await imageCache).filter(Boolean))];
  if (version !== boardVersion) { finish(); return; }
  // Retry once automatically; never start a shortened, easier round.
  if (imgs.length < 8) {
    imageCache = preloadImages(listImages());
    imgs = [...new Set((await imageCache).filter(Boolean))];
    if (version !== boardVersion) { finish(); return; }
  }
  if (imgs.length < listImages().length) imageCache = null;
  restartBtn.disabled = false;
  if (imgs.length < 8) {
    boardEl.innerHTML = '<div class="message error">Kõiki 16 kaarti ei saanud laadida. Proovi uuesti.</div>';
    finish(true);
    return;
  }
  const chosen = shuffle(imgs).slice(0, 8);
  totalPairs = 8;
  const pairList = shuffle([...chosen, ...chosen]);
  cards = pairList.map((src, idx) => ({ id: idx, src, matched:false }));

  renderBoard();
  lock = false;
  finish();
}

function renderBoard(){
  boardEl.innerHTML = '';
  // determine grid columns based on pairs
  const cols = totalPairs<=6?4:4;
  boardEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0,1fr))`;

  cards.forEach((card)=>{
    const el = document.createElement('button');
    el.type = 'button';
    el.setAttribute('aria-label', `Kaart ${card.id + 1}`);
    el.className = 'memory-card';
    el.dataset.id = card.id;
    el.innerHTML = `
      <div class="inner">
        <div class="face back"></div>
        <div class="face front"><img src="${card.src}" alt="card"></div>
      </div>
    `;
    el.addEventListener('click',()=>onCardClick(card, el));
    boardEl.appendChild(el);
  });
}

function onCardClick(card, el){
  if (lock) return;
  if (cards.length !== 16 || totalPairs !== 8 || boardEl.querySelectorAll('.memory-card').length !== 16) {
    imageCache = null;
    buildBoard();
    return;
  }
  if (card.matched || matches === totalPairs) return;
  const inner = el.querySelector('.inner');
  if (!inner) return;
  // prevent clicking same card twice
  if (firstCard && firstCard.el===el) return;

  // start timer on first interaction
  if (!timerInterval) startTimer();

  el.classList.add('flipped');

  if (!firstCard) {
    firstCard = { card, el };
    return;
  }

  attempts++;
  attemptsEl.textContent = attempts;
  lock = true;
  const second = { card, el };
  const version = boardVersion;

  if (firstCard.card.src === second.card.src) {
    // match
    firstCard.card.matched = true;
    second.card.matched = true;
    matches++;
    if (matches === totalPairs) {
      // Stop on the final pair, excluding the match animation delay. Match the
      // stored precision to the hundredths of a second displayed to players.
      elapsed = Math.max(10, Math.round((Date.now() - startTime) / 10) * 10);
      stopTimer();
      timeEl.textContent = fmtSeconds(elapsed);
      finishGame();
    }
    setTimeout(()=>{
      if (version !== boardVersion) return;
      firstCard.el.classList.add('matched');
      second.el.classList.add('matched');
      firstCard = null;
      lock = false;
    }, 350);
  } else {
    // not match
    setTimeout(()=>{
      if (version !== boardVersion) return;
      firstCard.el.classList.remove('flipped');
      second.el.classList.remove('flipped');
      firstCard = null;
      lock = false;
    }, 750);
  }
}

function startTimer(){
  startTime = Date.now();
  timerInterval = setInterval(()=>{
    elapsed = Date.now()-startTime;
    timeEl.textContent = fmtSeconds(elapsed);
  }, 100);
}

function stopTimer(){
  if (timerInterval) { clearInterval(timerInterval); timerInterval=null; }
}

async function finishGame(){
  stopTimer();
  const ms = Math.max(1, Math.round(elapsed));
  // Store time and attempts together in the existing numeric score field.
  try {
    const sendVal = encodeMemoryScore(ms, attempts);
    const saver = (window && window.saveScoreWithFallback) ? window.saveScoreWithFallback : async (g,s)=> await callAppsScript('saveScore', { game: g, score: s });
    const res = await saver(GAME_ID, sendVal);
    if (res && res.success && res.data) {
      if (res.data.leaderboard && Array.isArray(res.data.leaderboard)) {
        renderLeaderboardList(res.data.leaderboard, leaderboardEl);
        return;
      }
    } else if (res && res.queued) {
      return;
    }
  } catch (e) {
    console.warn('score save failed', e);
  }
  // fallback: fetch leaderboard
  // The shared saver updates the leaderboard after acknowledgement.
}

async function refreshLeaderboard(){
  const token = appState.sessionToken;
  try {
    const res = await callAppsScript('getLeaderboard', { game: GAME_ID });
    if (token === appState.sessionToken && res && res.success && res.data && Array.isArray(res.data.leaderboard)) {
      renderLeaderboardList(res.data.leaderboard, leaderboardEl);
    }
  } catch(e){ console.warn('leaderboard fetch failed', e); }
}

function renderLeaderboardList(list, el){
  if (!el) return;
  if (!list || !list.length) { el.innerHTML = '<li>Ühtegi tulemust pole.</li>'; return; }
  const items = list.filter(entry => decodeMemoryScore(entry.bestScore));
  // The same numeric ordering is used when saving personal bests on the server.
  items.sort((a, b) => Number(b.bestScore) - Number(a.bestScore));
  el.replaceChildren();
  items.forEach(entry => {
    const result = decodeMemoryScore(entry.bestScore);
    const row = document.createElement('li');
    const attemptText = result.attempts === null ? 'katsete arv teadmata' : `${result.attempts} katset`;
    row.textContent = `${entry.userName || 'Kasutaja'} — ${fmtSeconds(result.milliseconds)} s · ${attemptText}`;
    if (appState.currentUser?.id === entry.userId) row.classList.add('current-user-score');
    // The enclosing <ol> supplies the rank number, just as in Mario.
    el.appendChild(row);
  });
}

function resetState(){
  stopTimer();
  elapsed = 0; attempts = 0; matches = 0; firstCard=null; lock=false; timerInterval=null;
  timeEl.textContent = '0.00'; attemptsEl.textContent = '0';
}

function setup(container){
  boardEl = document.getElementById('memoryBoard');
  timeEl = document.getElementById('memoryTime');
  attemptsEl = document.getElementById('memoryAttempts');
  restartBtn = document.getElementById('memoryRestart');
  leaderboardEl = document.getElementById('leaderboard-bjk-memory');
  if (!initialized) {
    restartBtn.addEventListener('click',()=>{ resetState(); buildBoard(); });
    initialized = true;
  }
  if (boardOwner !== appState.currentUser?.id || (!lock && boardEl.querySelectorAll('.memory-card').length !== 16)) {
    boardOwner = appState.currentUser?.id;
    resetState();
    buildBoard();
  }
  refreshLeaderboard();
}

// expose init
window.BJKMemory = { init: setup, refreshLeaderboard, renderLeaderboard: list => {
  if (Array.isArray(list)) renderLeaderboardList(list, leaderboardEl);
} };
})();
