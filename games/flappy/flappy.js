(function () {
  'use strict';
  const GAME = 'bjk-flappy';
  const security = window.BJKGameSecurity;
  const guard = security.register(GAME);
  const { Flight, WIDTH: W, HEIGHT: H, FLOOR, X, RADIUS: R } = window.BJKFlappyEngine;
  let canvas, ctx, stage, overlay, action, scoreEl, bestEl;
  let flight = new Flight(), state = 'ready', opened = false, initialized = false;
  let frame = 0, lastTime = 0, accumulator = 0, clock = 0;
  let owner = '', token = '', best = 0, avatar = null, avatarVersion = 0, avatarFile = '';
  let avatarLoading = false, avatarTimer = 0;
  let roundImage = null, scoreSubmitted = false, lastDisplayedScore = -1;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const byId = id => document.getElementById(id);
  function visible() {
    return opened && !document.hidden && appState.currentView === 'games' &&
      !byId('subview-bjk-flappy').classList.contains('hidden') &&
      String(appState.currentUser?.id || '') === owner && appState.sessionToken === token;
  }
  function setState(next) {
    state = next; stage.dataset.state = state;
    overlay.classList.toggle('hidden', state === 'playing');
    const labels = {
      ready: ['Taevas ootab', '', 'Alusta lendu'],
      paused: ['Võta hetk', 'Sinu lend ootab. Jätka siis, kui oled valmis.', 'Jätka lendu'],
      over: ['Veel üks lend?', `Läbitud väravaid: ${flight.score}`, 'Proovi uuesti']
    };
    if (labels[state]) {
      byId('flappyTitle').textContent = labels[state][0];
      byId('flappyDescription').textContent = labels[state][1];
      action.textContent = labels[state][2];
    }
  }
  function schedule() { if (!frame && visible()) frame = requestAnimationFrame(guard.wrap(animate)); }
  function pause() {
    if (state === 'playing') setState('paused');
    cancelAnimationFrame(frame); frame = 0; lastTime = 0; accumulator = 0;
    if (ctx) draw();
  }
  function close() { opened = false; pause(); }
  function input() {
    if (!visible() || avatarLoading) return;
    const starting = state !== 'playing';
    if (state === 'over' || state === 'ready') {
      flight = new Flight(); scoreSubmitted = false; lastDisplayedScore = -1;
      roundImage = avatar; setState('playing');
    } else if (state === 'paused') setState('playing');
    flight.flap();
    if (starting) {
      lastTime = 0; accumulator = 0;
    }
    canvas.focus({ preventScroll: true }); schedule();
  }
  function finish() {
    setState('over'); best = Math.max(best, flight.score); bestEl.textContent = best;
    byId('flappyAnnouncement').textContent = `Lend lõppes. ${flight.score} väravat.`;
    if (!scoreSubmitted && flight.score > 0 && visible()) {
      scoreSubmitted = true;
      // The shared queue persists the result immediately and retries offline saves.
      guard.submit(flight.score).catch(console.warn);
    }
  }
  function animate(now) {
    frame = 0;
    if (!visible()) { pause(); return; }
    const delta = lastTime ? Math.min((now - lastTime) / 1000, .05) : 0;
    lastTime = now; clock += delta;
    if (state === 'playing') {
      accumulator += delta;
      while (accumulator >= 1 / 120 && flight.alive) {
        flight.step(1 / 120); accumulator -= 1 / 120;
      }
      if (!flight.alive) finish();
    }
    if (lastDisplayedScore !== flight.score) {
      scoreEl.textContent = flight.score; lastDisplayedScore = flight.score;
    }
    draw();
    if (state === 'playing' || (state === 'ready' && !reduceMotion.matches)) schedule();
  }
  function line(points, color, width = 1) {
    ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function cloud(x, y, scale) {
    ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
    ctx.fillStyle = '#fff8e7'; ctx.beginPath();
    ctx.ellipse(0,0,45,12,0,0,Math.PI*2); ctx.ellipse(-15,-9,18,15,0,0,Math.PI*2);
    ctx.ellipse(12,-12,23,19,0,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  function gate(g) {
    const top = g.center - g.gap/2, bottom = g.center + g.gap/2;
    for (const [y,h,capY] of [[0,top,top-19],[bottom,FLOOR-bottom,bottom]]) {
      const shade = ctx.createLinearGradient(g.x,0,g.x+g.width,0);
      shade.addColorStop(0,'#8e9770'); shade.addColorStop(.18,'#bdc39a'); shade.addColorStop(1,'#7c8663');
      ctx.fillStyle = shade; ctx.fillRect(g.x,y,g.width,h);
      ctx.strokeStyle = '#66704e'; ctx.lineWidth = 2; ctx.strokeRect(g.x,y,g.width,h);
      ctx.fillStyle = '#d1c49d'; ctx.fillRect(g.x-5,capY,g.width+10,19); ctx.strokeRect(g.x-5,capY,g.width+10,19);
      ctx.globalAlpha = .25;
      for (let row = y+35; row < y+h-20; row+=36) {
        line([[g.x+2,row],[g.x+g.width-2,row]],'#485139');
        line([[g.x+g.width/2,row],[g.x+g.width/2,row+16]],'#485139');
      }
      ctx.globalAlpha = 1;
    }
  }
  function bird() {
    const y = state === 'ready' ? 260 + (reduceMotion.matches ? 0 : Math.sin(clock*2.7)*7) : flight.y;
    const angle = state === 'playing' ? Math.max(-.45, Math.min(1.0, flight.velocity/600)) : -.12;
    ctx.save(); ctx.translate(X,y); ctx.rotate(angle);
    // Small wings and a brass frame keep photographs readable as game characters.
    ctx.fillStyle = '#ad8050'; ctx.strokeStyle = '#735337'; ctx.lineWidth = 2;
    const wing = reduceMotion.matches ? 0 : Math.sin(clock*23)*5;
    ctx.beginPath(); ctx.moveTo(17,-2); ctx.lineTo(27,3); ctx.lineTo(17,7); ctx.fill();
    const picture = state === 'ready' ? avatar : roundImage;
    ctx.save(); ctx.beginPath(); ctx.arc(0,0,R+2,0,Math.PI*2); ctx.clip();
    ctx.fillStyle = '#f8edcf'; ctx.fillRect(-22,-22,44,44);
    if (picture) {
      const size = Math.min(picture.naturalWidth,picture.naturalHeight);
      ctx.drawImage(picture,(picture.naturalWidth-size)/2,(picture.naturalHeight-size)/2,size,size,-R-2,-R-2,(R+2)*2,(R+2)*2);
    } else {
      ctx.fillStyle = '#b88348'; ctx.beginPath(); ctx.ellipse(-1,3,16,12,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#4d392a'; ctx.beginPath(); ctx.arc(8,-3,2.4,0,Math.PI*2); ctx.fill();
      line([[-12,3],[-5,9],[1,3]],'#f8edcf',2);
    }
    ctx.restore(); ctx.strokeStyle = '#735337'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0,0,R+2,0,Math.PI*2); ctx.stroke();
    // Paint the wing last, outside the portrait clip, so the image cannot cover it.
    ctx.fillStyle = '#ad8050';
    ctx.beginPath(); ctx.ellipse(-20,3,13,6,-.5+wing*.04,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function draw() {
    if (!ctx) return;
    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    const sky = ctx.createLinearGradient(0,0,0,FLOOR);
    sky.addColorStop(0,'#cad9c3'); sky.addColorStop(1,'#f3e7c5');
    ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#f8e4a3'; ctx.beginPath(); ctx.arc(335,96,34,0,Math.PI*2); ctx.fill();
    const travel = flight.distance;
    for (let i=0;i<4;i++) cloud(((i*157+75-travel*.17)%650+650)%650-95,85+i%3*65,.65+i*.08);
    for (let layer=0;layer<2;layer++) {
      ctx.fillStyle = layer ? '#a7b391' : '#bac5a5'; ctx.beginPath(); ctx.moveTo(0,FLOOR);
      for(let x=-10;x<=W+10;x+=10) ctx.lineTo(x,420+layer*65+Math.sin((x+travel*(.12+layer*.1))/92)*24+Math.cos(x/47)*8);
      ctx.lineTo(W,FLOOR); ctx.closePath(); ctx.fill();
    }
    for (const g of flight.pipes) gate(g);
    bird();
    ctx.fillStyle = '#d6c296'; ctx.fillRect(0,FLOOR,W,H-FLOOR);
    ctx.fillStyle = '#7e8b60'; ctx.fillRect(0,FLOOR,W,7);
    for(let x=-(travel%28);x<W;x+=28) line([[x,FLOOR+25],[x+9,FLOOR+19]],'#b2996e',2);
    ctx.strokeStyle='#ffffff20'; ctx.lineWidth=1;
    for(let y=12;y<H;y+=24) line([[0,y],[W,y]],'#ffffff12');
    // Keep the score legible above the scenery and moving gates.
    ctx.save();
    ctx.font = 'bold 64px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#65472f';
    ctx.lineWidth = 5;
    ctx.fillStyle = '#fff4d8';
    ctx.strokeText(String(flight.score), W / 2, 92);
    ctx.fillText(String(flight.score), W / 2, 92);
    ctx.restore();
  }
  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W*ratio); canvas.height = Math.round(H*ratio); draw();
  }
  function loadAvatar(file) {
    file = typeof file === 'string' ? file.trim() : '';
    if (file === avatarFile) return;
    avatarFile = file; avatar = null; const version = ++avatarVersion;
    clearTimeout(avatarTimer); avatarLoading = false; action.disabled = false;
    if (!/^[a-zA-Z0-9_-]+\.png$/i.test(file)) { draw(); return; }
    avatarLoading = true; action.disabled = true;
    const image = new Image();
    const finish = guard.wrap(loaded => {
      if (version !== avatarVersion) return;
      clearTimeout(avatarTimer); image.onload = null; image.onerror = null;
      avatar = loaded ? image : null; avatarLoading = false; action.disabled = false;
      draw();
    });
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    avatarTimer = setTimeout(() => finish(false), 3000);
    image.src = `game/img/${encodeURIComponent(file)}`;
  }

  function renderLeaderboard(list) {
    if (!initialized || !Array.isArray(list)) return;
    const el = byId('leaderboard-bjk-flappy'); el.replaceChildren();
    const entries = list.filter(row => Number.isFinite(Number(row.bestScore)) && Number(row.bestScore)>=0)
      .slice().sort((a,b)=>Number(b.bestScore)-Number(a.bestScore));
    if (!entries.length) { const li=document.createElement('li'); li.textContent='Esimene lend ootab sind.'; el.appendChild(li); }
    for (const row of entries) {
      const li=document.createElement('li'); li.textContent=`${row.userName || 'Lendaja'} — ${Math.floor(Number(row.bestScore))} väravat`;
      if (String(row.userId)===owner) { li.classList.add('current-user-score'); best=Math.max(best,Number(row.bestScore)); }
      el.appendChild(li);
    }
    bestEl.textContent=best;
  }
  async function refreshLeaderboard() {
    const currentToken=appState.sessionToken;
    try {
      const result=await callAppsScript('getLeaderboard',{game:GAME,token:currentToken});
      if(security.check() && currentToken===token && currentToken===appState.sessionToken && result?.success) guard.run(() => renderLeaderboard(result.data?.leaderboard));
    } catch(error) { console.warn('Flappy leaderboard unavailable:',error); }
  }
  function bind() {
    canvas=byId('flappyCanvas'); ctx=canvas.getContext('2d'); stage=byId('flappyStage');
    overlay=byId('flappyOverlay'); action=byId('flappyAction'); scoreEl=byId('flappyScore'); bestEl=byId('flappyBest');
    canvas.addEventListener('pointerdown', guard.wrap(event => { if(event.isPrimary && event.button===0) input(); }));
    action.addEventListener('click', guard.wrap(input));
    document.addEventListener('keydown',guard.wrap(event=>{
      if(!visible() || event.code!=='Space' || event.target.closest('input,textarea,select,button,[contenteditable="true"]')) return;
      event.preventDefault(); if(!event.repeat) input();
    }));
    document.addEventListener('visibilitychange',guard.wrap(()=>{if(document.hidden) pause();}));
    window.addEventListener('blur',guard.wrap(pause));
    window.addEventListener('resize',guard.wrap(resize));
    initialized=true; resize();
    [stage, scoreEl].forEach(node => guard.watch(node));
  }
  function init() {
    if(!initialized) bind();
    const nextOwner=String(appState.currentUser?.id || '');
    if(owner!==nextOwner || token!==appState.sessionToken) {
      close(); owner=nextOwner; token=appState.sessionToken; best=0; avatar=null; avatarFile=''; avatarVersion++; clearTimeout(avatarTimer); avatarLoading=false; action.disabled=false;
      flight=new Flight(); roundImage=null; lastDisplayedScore=-1; scoreSubmitted=false;
      scoreEl.textContent='0'; bestEl.textContent='0'; setState('ready');
      byId('leaderboard-bjk-flappy').replaceChildren();
    }
    opened=true; loadAvatar(appState.currentUser?.image); resize(); schedule();
    refreshLeaderboard();
    const requestToken=token;
    callAppsScript('getCurrentUser',{token:requestToken}).then(guard.wrap(result=>{
      if(requestToken!==token || requestToken!==appState.sessionToken || !result?.success) return;
      appState.currentUser.image=result.data?.user?.image || '';
      setSessionState(requestToken,appState.currentUser);
      loadAvatar(appState.currentUser.image);
    })).catch(error=>console.warn('Flappy character unavailable:',error));
  }
  guard.monitor(() => flight.random);
  [animate, finish, input].forEach((fn, i) => guard.monitor(() => [animate, finish, input][i]));
  guard.monitor(() => JSON.stringify([flight, state, opened, frame, lastTime, accumulator,
    owner, token, best, scoreSubmitted, lastDisplayedScore]));
  guard.onBlock(() => { cancelAnimationFrame(frame); clearTimeout(avatarTimer); opened = false; state = 'blocked'; });
  security.publish('BJKFlappy', { init: guard.wrap(init), close: guard.wrap(close),
    refreshLeaderboard: guard.wrap(refreshLeaderboard), renderLeaderboard: guard.wrap(renderLeaderboard) });
})();
