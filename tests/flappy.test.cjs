const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Flight,touchesRect,X,FLOOR}=require('../games/flappy/engine.js');
const fs=require('node:fs'), vm=require('node:vm');

test('flap lifts the player and collisions end the run',()=>{
 const f=new Flight(()=>.5); f.flap(); f.step(1/120); assert.ok(f.y<260);
 f.y=FLOOR-1; f.velocity=0; f.step(1/120); assert.equal(f.alive,false);
 const score=f.score; f.flap(); f.step(1); assert.equal(f.score,score);
 assert.equal(touchesRect(10,10,5,14,0,20,30),true);
 assert.equal(touchesRect(10,10,5,16,0,20,30),false);
});
test('a gate is scored once and the clear gap does not collide',()=>{
 const f=new Flight(()=>.5); f.pipes=[{x:X-85,width:64,center:260,gap:190,scored:false}];
 f.y=260; f.step(1/120); assert.equal(f.score,1); assert.equal(f.alive,true);
 f.step(1/120); assert.equal(f.score,1);
 f.pipes=[{x:X-10,width:64,center:400,gap:160,scored:false}]; f.y=120;f.step(1/120);
 assert.equal(f.alive,false);
});
test('endless spawning stays bounded and every gate has room to pass',()=>{
 const f=new Flight(()=>.5);
 for(let i=0;i<120*240;i++) {
  f.y=270; f.velocity=-1050/120; f.step(1/120);
  assert.equal(f.alive,true); assert.ok(f.pipes.length<=4);
  assert.ok(f.pipes.every(g=>g.gap>=144 && g.center-g.gap/2>0 && g.center+g.gap/2<FLOOR));
 }
 assert.ok(f.score>100);
});
test('Flappy uses the existing user image field without a schema change',()=>{
 const source=fs.readFileSync('google-sheet-backend.gs','utf8');
 const c=vm.createContext({});vm.runInContext(source,c);
 const fields=vm.runInContext('SHEET_SCHEMAS.Users',c);
 assert.deepEqual(Array.from(fields),['id','name','passwordHash','active','role','image','createdAt','updatedAt']);
 assert.equal(c.toSafeUser({id:'a',image:'11.png'}).image,'11.png');
 assert.equal(c.toSafeUser({id:'b'}).image,'');
});
