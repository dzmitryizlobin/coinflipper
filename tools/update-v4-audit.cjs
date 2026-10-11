/* Regression coverage for the v4 import, using only isolated synthetic saves. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'telegram/index.html'),'utf8');
const results=[];let browser;
async function page(cloud){
 const c=await browser.newContext({viewport:{width:390,height:844}});
 await c.route('**/*',r=>r.fulfill({contentType:r.request().url()==='https://mint.test/'?'text/html':'text/plain',body:r.request().url()==='https://mint.test/'?html:''}));
 const p=await c.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')p.errors.push(m.text());});
 await p.addInitScript(cloud=>{
  window.requestAnimationFrame=()=>0;
  let seed=43;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  if(!cloud)return;
  window.__keys=[];window.__store={sn:'1',s0:JSON.stringify(cloud)};
  const w={initData:'synthetic-only',initDataUnsafe:{user:{id:77,first_name:'Тест'}},isVersionAtLeast:()=>true,expand:()=>{},ready:()=>{},setHeaderColor:()=>{},setBackgroundColor:()=>{},onEvent:()=>{},CloudStorage:{getItem:(k,cb)=>{__keys.push(k);cb(null,__store[k]);},getItems:(ks,cb)=>{__keys.push(...ks);cb(null,Object.fromEntries(ks.map(k=>[k,__store[k]])));},setItem:(k,v,cb)=>{__keys.push(k);__store[k]=v;if(cb)cb(null,true);}}};window.Telegram={WebApp:w};
 },cloud||null);
 await p.goto('https://mint.test/');await p.waitForFunction(()=>$('splash').classList.contains('off'),null,{polling:30});
 await p.evaluate(()=>{S.settings.sound=S.settings.haptic=false;});return p;
}
async function reload(p){await p.reload();await p.waitForFunction(()=>$('splash').classList.contains('off'),null,{polling:30});}
async function test(name,fn,cloud){const p=await page(cloud);try{const evidence=await fn(p);assert.deepEqual(p.errors,[]);results.push({name,result:'pass',evidence});}catch(e){results.push({name,result:'fail',error:e.stack,errors:p.errors});}finally{await p.context().close();}}
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 await test('legacy-save-and-quest-migration',async p=>{
  const fixture=await p.evaluate(()=>{const d=defaultState();d.money=123456;d.gems=89;d.tokens=43;d.bars=12;d.barsTotal=25;d.lvl=12;d.run.zone=4;d.run.minions=12;d.run.coins=[2,3,4];d.disc={0:1,2:1,3:1,4:1};d.run.upg={speed:5,press:2};d.maxZoneEver=4;d.hats[2]=1;d.content.journey.first_ring=1;d.content.sets.shift=1;d.quests={day:'2026-1-1',list:[{id:'flip',t:'Переверни 150 монет',goal:150,p:77,g:6,c:0},{id:'heads',t:'Выбей 80 орлов',goal:80,p:80,g:9,c:0},{id:'buy',t:'Купи 15 монет',goal:15,p:15,g:5,c:1}]};delete d.hires;return d;});
  await p.addInitScript(d=>{if(!sessionStorage.getItem('v4-fixture')){localStorage.setItem('mintcoin_save_v1',JSON.stringify(d));sessionStorage.setItem('v4-fixture','1');}},fixture);
  await reload(p);
  const a=await p.evaluate(()=>({key:CONFIG.SAVE_KEY,money:S.money,gems:S.gems,tokens:S.tokens,bars:S.bars,total:S.barsTotal,minions:R().minions,tiers:world.coins.map(c=>c.tier),speed:L('speed'),content:S.content,quests:S.quests}));
  assert.equal(a.key,'mintcoin_save_v1');assert.equal(a.money,123456);assert.equal(a.gems,89);assert.equal(a.tokens,43);assert.equal(a.bars,12);assert.equal(a.total,25);assert.equal(a.minions,12);assert.deepEqual(a.tiers,[2,3,4]);assert.equal(a.speed,5);assert.equal(a.content.journey.first_ring,1);assert.equal(a.content.sets.shift,1);assert.equal(a.quests.v,2);assert.equal(a.quests.list.length,3);assert.equal(a.quests.list[0].p,77);assert.equal(a.quests.list[1].amt,9);
  await p.evaluate(()=>claimQuest(1));await reload(p);assert.equal(await p.evaluate(()=>S.gems),98);assert.equal(await p.evaluate(()=>S.quests.done),2);return {balancesAndUnlocksPreserved:true,aboveNewCapWorkersRetained:true,partialAndCompletedQuestsMigrated:true};
 });
 await test('quest-rewards-durable-before-animation',async p=>{
  const outcomes=[];
  for(const kind of ['gems','tokens','cash','boost']){
   const r=await p.evaluate(kind=>{closeModal();S.lvl=7;const before={gems:S.gems,tokens:S.tokens,money:S.money,boost:S.boostUntil};S.quests.list[0]={id:'tap',t:'Тест',goal:1,p:1,rw:kind,amt:kind==='cash'?120:5};claimQuest(0);claimQuest(0);const saved=JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY));return {before,gems:S.gems,tokens:S.tokens,money:S.money,boost:S.boostUntil,saved:{gems:saved.gems,tokens:saved.tokens,money:saved.money,boost:saved.boostUntil},done:S.quests.done};},kind);
   assert.deepEqual(r.saved,{gems:r.gems,tokens:r.tokens,money:r.money,boost:r.boost});if(kind==='gems')assert.equal(r.gems-r.before.gems,5);if(kind==='tokens')assert.equal(r.tokens-r.before.tokens,5);if(kind==='cash')assert.equal(r.money-r.before.money,20);if(kind==='boost')assert.ok(r.boost>Date.now()+299000);
   await reload(p);assert.equal(await p.evaluate(()=>S.quests.done),r.done);outcomes.push(kind);
  }return outcomes;
 });
 await test('daily-and-level-rewards-survive-close',async p=>{
  await p.evaluate(()=>{S.lvl=5;showDaily();$('dOk').click();});await reload(p);assert.deepEqual(await p.evaluate(()=>({g:S.gems,t:S.tokens,day:S.daily.last===today()})),{g:15,t:10,day:true});
  const expected=await p.evaluate(()=>{closeModal();const before=S.gems;addXP(ECON.xpNeed(S.lvl));closeModal();return before+ECON.levelGems(6);});await reload(p);assert.equal(await p.evaluate(()=>S.gems),expected);return {daily:true,levelDismissed:true};
 });
 await test('quest-skip-cooldown-and-unlocks',async p=>{
  const r=await p.evaluate(()=>{S.lvl=1;S.quests={v:2,list:[],done:0};ensureQuests();const initial=S.quests.list.map(q=>q.id);S.lvl=7;showQuests();$('qSkip').click();const first=JSON.stringify(S.quests);$('qSkip').onclick();return {initial,blocked:JSON.stringify(S.quests)===first,list:S.quests.list.length,wait:S.quests.skipAt-now()};});assert.ok(r.initial.every(id=>['tap','heads','buy','flip','earn'].includes(id)));assert.ok(r.blocked);assert.equal(r.list,3);assert.ok(r.wait>599000);return r;
 });
 await test('temporary-workers-limit-persistence-expiry',async p=>{
  const r=await p.evaluate(()=>{S.lvl=7;S.gems=200;R().minions=3;S.purchases.starter=1;rebuildWorld();const item=GEM_SHOP.find(i=>i.id==='hire');for(let i=0;i<4;i++)gemBuy(item);rehat();return {gems:S.gems,hires:S.hires.length,workers:world.minions.length,goldHat:world.minions.find(m=>m.kind==='gold').hat};});assert.deepEqual(r,{gems:110,hires:3,workers:7,goldHat:24});await reload(p);assert.equal(await p.evaluate(()=>world.minions.length),7);
  const end=await p.evaluate(()=>{const limit=Math.max(...S.hires)+1;now=()=>limit;const hire=world.minions.find(m=>m.kind==='hire'),coin=world.coins[0];hire.target=coin;coin.res=hire;syncExtras();return {workers:world.minions.length,hires:S.hires.length,released:coin.res===null};});assert.deepEqual(end,{workers:4,hires:0,released:true});return {before:r,after:end};
 });
 await test('temporary-workers-offline-expiry',async p=>{
  const r=await p.evaluate(()=>{const time=2000000000000;now=()=>time;R().minions=1;R().coins=[0,0];rebuildWorld();return {value:offlineValue(3600,[time-1800000,time+60000]),full:offlineValue(7200,[])};});assert.ok(Math.abs(r.value-1147.5)<1e-8);assert.ok(Math.abs(r.full-459)<1e-8);return r;
 });
 await test('merge-locks-max-tier-and-reload',async p=>{
  const r=await p.evaluate(()=>{S.lvl=7;R().coins=[0,0,0,0,59,59];rebuildWorld();mergeAllPairs();mergeAllPairs();const jobs=merging.length;const target=merging[0].into;flipCoin(target,1,1,true);const locked=target.state==='ground';saveAll(true);update(.9);return {jobs,locked,tiers:world.coins.map(c=>c.tier),merges:S.stats.merges};});assert.equal(r.jobs,2);assert.ok(r.locked);assert.deepEqual(r.tiers,[1,1,59,59]);assert.equal(r.merges,2);
  await reload(p);assert.deepEqual(await p.evaluate(()=>world.coins.map(c=>c.tier)),[1,1,59,59]);await p.evaluate(()=>mergeAllPairs());await reload(p);assert.deepEqual(await p.evaluate(()=>world.coins.map(c=>c.tier)),[1,1,59,59]);const rebuilt=await p.evaluate(()=>{mergeAllPairs();rebuildWorld();update(1);return {jobs:merging.length,coins:world.coins.length,merges:S.stats.merges};});assert.deepEqual(rebuilt,{jobs:0,coins:4,merges:2});return {completed:r,rebuild:rebuilt};
 });
 await test('standalone-worker-dialog-and-new-art',async p=>{
  const r=await p.evaluate(()=>{S.lvl=7;R().minions=ECON.minionCap(1);rebuildWorld();showMinionCap();const ad=!!$('hAd'),gem=!!$('hGem');closeModal();return {ad,gem,floors:FLOOR_STYLES.length,props:ZONE_PROPS.length,previews:Array.from({length:10},(_,i)=>floorPreview(i+1).length),money:fmtMoney(12345),coin:fmtCoin(5)};});assert.equal(r.ad,false);assert.equal(r.gem,true);assert.equal(r.floors,10);assert.equal(r.props,10);assert.ok(r.previews.every(n=>n>2000));assert.equal(r.money,'$123');assert.equal(r.coin,'5¢');return r;
 });
 const cloud={v:1,money:43210,gems:77,tokens:91,bars:4,barsTotal:6,lvl:7,xp:3,run:{zone:2,bought:4,minions:2,upg:{speed:2},coins:[0,1],earned:9876,started:Date.now()},savedAt:Date.now(),lastSeen:Date.now()};
 await test('legacy-telegram-cloud-namespace',async p=>{
  assert.equal(await p.evaluate(()=>S.money),43210);assert.equal(await p.evaluate(()=>S.gems),77);await p.evaluate(()=>saveAll(true));const r=await p.evaluate(()=>({keys:__keys,saved:JSON.parse(Array.from({length:+__store.sn},(_,i)=>__store['s'+i]).join('')).money}));assert.ok(r.keys.includes('sn')&&r.keys.includes('s0'));assert.ok(r.keys.every(k=>/^s(n|\d+)$/.test(k)));assert.equal(r.saved,43210);return r;
 },cloud);
 const out={executedAt:new Date().toISOString(),tests:results.length,passed:results.filter(r=>r.result==='pass').length,failed:results.filter(r=>r.result==='fail').length,results};fs.writeFileSync(path.join(root,'verification/update-v4-results.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));await browser.close();if(out.failed)process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
