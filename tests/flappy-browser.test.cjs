const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({hasTouch:true});
  const page=await context.newPage();const errors=[],calls=[];
  page.on('pageerror',e=>errors.push(e.message));
  let image='11.png';
  await page.route('https://script.google.com/**',async route=>{
   const body=route.request().postDataJSON();calls.push(body);
   const data=body.action==='getCurrentUser'?{user:{id:'flappy-test',name:'Test',image}}:
    body.action==='saveScore'?{bestScore:body.score,leaderboard:[{userId:'flappy-test',userName:'Test',bestScore:body.score}]}:{leaderboard:[]};
   await route.fulfill({json:{success:true,data}});
  });
  await page.goto('http://localhost:8000');
  await page.evaluate(()=>{
   setSessionState('flappy-token',{id:'flappy-test',name:'Test',image:'11.png'});
   document.getElementById('loginScreen').classList.add('hidden');
   document.getElementById('appScreen').classList.remove('hidden');
   showView('games');openGameSubView('bjk-flappy');
  });
  await page.waitForFunction(()=>appState.currentUser.image==='11.png');
  assert.equal(await page.evaluate(()=>scrollY),0);
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>showGamesList());
   await page.locator('.play-game-button[data-game="bjk-flappy"]').click();
   assert.equal(await page.evaluate(()=>scrollY),0, 'Opening from the games list starts at the top');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:`/tmp/bjk-flappy-${width}.png`,fullPage:true});
  }
  await page.locator('#flappyAction').scrollIntoViewIfNeeded();
  const initialScroll = await page.evaluate(()=>scrollY);
  await page.locator('#flappyAction').click();
  assert.equal(await page.evaluate(()=>scrollY),initialScroll);
  assert.equal(await page.locator('#flappyStage').getAttribute('data-state'),'playing');
  await page.evaluate(()=>window.scrollTo(0, 150));
  assert.equal(await page.locator('#flappyStage').getAttribute('data-state'),'playing', 'Manual scrolling does not pause');
  await page.evaluate(()=>showView('messages'));
  assert.equal(await page.locator('#flappyStage').getAttribute('data-state'),'paused');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#flappyStage').getAttribute('data-state'),'paused');
  await page.evaluate(()=>{showView('games');openGameSubView('bjk-flappy');});
  await page.locator('#flappyCanvas').focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('#flappyStage').getAttribute('data-state'),'playing');
  assert.equal(await page.locator('#flappyPause').count(),0);
  await page.evaluate(()=>{showView('messages');showView('games');openGameSubView('bjk-flappy');});
  await page.locator('#flappyCanvas').tap({position:{x:70,y:100}});
  assert.equal(await page.locator('#flappyStage').getAttribute('data-state'),'playing');
  // Let the actual physics finish the run. Forging a physics method is now
  // covered by the security suite and must never be used as a score fixture.
  await page.waitForFunction(()=>document.getElementById('flappyStage').dataset.state==='over');
  assert.equal(await page.evaluate(()=>BJKGameSecurity.blocked),false);
  assert.equal(calls.filter(c=>c.action==='saveScore').length,0);
  assert.equal(await page.locator('#leaderboard-bjk-memory').textContent(),'');
  assert.equal(await page.locator('#bestScoreBoard').textContent(),'0');
  image='missing-file.png';
  await page.evaluate(()=>{clearSession();setSessionState('next-token',{id:'flappy-test',name:'Test',image:'missing-file.png'});openGameSubView('bjk-flappy');});
  await page.waitForFunction(()=>appState.currentUser.image==='missing-file.png');
  await page.locator('#flappyAction').click();
  await page.waitForFunction(()=>document.getElementById('flappyStage').dataset.state==='over');
  assert.deepEqual(errors,[]);
  console.log('PASS: responsive Flappy UI, per-user image, missing-image fallback, touch/Space, pause and isolated score saving');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
