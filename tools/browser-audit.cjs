/* Characterization tests of the supplied game, including known defects.
 * Runs only in a temporary isolated browser context. All external requests are blocked.
 * npm install --no-save playwright; npx playwright install chromium
 * BROWSER_CHANNEL=chrome node tools/browser-audit.cjs (alternative: installed Chrome).
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const results=[];
let browser;
async function pageFor({live=false,viewport={width:390,height:844}}={}) {
  const context=await browser.newContext({viewport,deviceScaleFactor:1,locale:'ru-RU',timezoneId:'Asia/Nicosia'});
  await context.route('**/*',route=>route.request().url()==='http://mint-dvor.test/'
    ? route.fulfill({status:200,contentType:'text/html',body:html})
    : route.fulfill({status:200,contentType:'text/plain',body:''}));
  const page=await context.newPage();
  page.auditErrors=[];
  page.on('pageerror',e=>page.auditErrors.push(e.message));
  await page.addInitScript(({live})=>{
    if(!live) window.requestAnimationFrame=()=>0;
    // Seed only randomness, never user storage. No Telegram session or real purchases.
    let seed=431; Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  },{live});
  await page.goto('http://mint-dvor.test/');
  await page.waitForFunction(()=>document.querySelector('#splash').classList.contains('off'),null,{polling:50});
  await page.evaluate(()=>{S.settings.sound=false;S.settings.haptic=false;});
  if(live) await page.waitForFunction(()=>getComputedStyle(document.querySelector('#splash')).opacity==='0',null,{polling:50});
  return page;
}
async function check(id,kind,fn) {
  const p=await pageFor();
  try {const evidence=await fn(p);results.push({id,kind,result:'pass',evidence});}
  catch(e){results.push({id,kind,result:'fail',error:e.stack});}
  finally {await p.context().close();}
}
async function ev(p,fn){return p.evaluate(fn);}
async function main(){
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 await check('boot','behavior',async p=>{const r=await ev(p,()=>({money:S.money,gems:S.gems,lvl:S.lvl,tiers:world.coins.map(c=>c.tier),capacity:capacity(),price:coinPrice(),baseMult:baseMult()}));assert.deepEqual(r,{money:0,gems:10,lvl:1,tiers:[0,0],capacity:6,price:3,baseMult:1.02});assert.deepEqual(p.auditErrors,[]);return r;});
 await check('heads-tails-edge','behavior',async p=>{const r=await ev(p,()=>{const c=world.coins[0];c.u1=c.u;c.v1=c.v;c.byTap=true;c.res2='heads';landCoin(c);const a=[S.money,S.tokens,S.xp];c.res2='tails';landCoin(c);const b=[S.money,S.tokens,S.xp];c.res2='edge';landCoin(c);return {a,b,c:[S.money,S.tokens,S.xp],flips:S.stats.flips};});assert.deepEqual(r,{a:[1,0,1],b:[1,1,2],c:[11,1,8],flips:3});return r;});
 await check('real-pointer-tap','behavior',async p=>{const point=await ev(p,()=>toScreen(world.coins[0].u,world.coins[0].v));await p.mouse.click(point.x,point.y);const r=await ev(p,()=>{update(1.2);return {taps:S.stats.taps,flips:S.stats.flips,xp:S.xp};});assert.equal(r.taps,1);assert.equal(r.flips,1);assert.equal(r.xp,1);return r;});
 await check('level-unlocks','behavior',async p=>{const r=await ev(p,()=>{addXP(20);const a={lvl:S.lvl,gems:S.gems,merge:unlocked('merge'),minions:unlocked('minions')};addXP(ECON.xpNeed(2));return {a,b:{lvl:S.lvl,gems:S.gems,minions:unlocked('minions')}};});assert.deepEqual(r,{a:{lvl:2,gems:13,merge:true,minions:false},b:{lvl:3,gems:16,minions:true}});return r;});
 await check('buy-capacity','behavior',async p=>{const r=await ev(p,()=>{S.money=1000;while(buyCoin(true)){}return {count:world.coins.length,bought:R().bought,money:S.money};});assert.deepEqual(r,{count:6,bought:4,money:986});return r;});
 await check('merge-normal','behavior',async p=>{const r=await ev(p,()=>{mergeCoins(world.coins[0],world.coins[1]);return {tiers:world.coins.map(c=>c.tier),merges:S.stats.merges,xp:S.xp,discovered:discCount()};});assert.deepEqual(r,{tiers:[1],merges:1,xp:1,discovered:2});return r;});
 await check('merge-button','behavior',async p=>{const r=await ev(p,()=>{S.lvl=2;mergeAllPairs();update(.23);return {tiers:world.coins.map(c=>c.tier),flyers:flyers.length};});assert.deepEqual(r,{tiers:[1],flyers:0});return r;});
 await check('minion-income','behavior',async p=>{const r=await ev(p,()=>{S.lvl=3;S.money=100;buyMinion();for(let i=0;i<1200;i++)update(.05);return {minions:R().minions,flips:S.stats.flips,earned:R().earned,xp:S.xp,idle:idleIncome()};});assert.equal(r.minions,1);assert.ok(r.flips>10);assert.ok(r.earned>0);return r;});
 await check('auto-needs-full-and-money','behavior',async p=>{const r=await ev(p,()=>{S.lvl=4;R().upg.auto=1;S.money=1000;while(world.coins.length<capacity())buyCoin(true);const before=world.coins.length;S.money=0;update(1.3);const noMoney=world.coins.length;S.money=1000;update(1.3);return {before,noMoney,withMoney:world.coins.length};});assert.deepEqual(r,{before:6,noMoney:6,withMoney:5});return r;});
 await check('zone-keeps-run','behavior',async p=>{const r=await ev(p,()=>{S.money=2000;R().upg.cap=2;R().bought=7;zoneUp();return {money:S.money,zone:R().zone,cap:capacity(),bought:R().bought,coins:world.coins.length,mult:ECON.zoneMult(R().zone)};});assert.deepEqual(r,{money:500,zone:2,cap:9,bought:7,coins:2,mult:5});return r;});
 await check('prestige-threshold-and-retention','behavior',async p=>{const r=await ev(p,()=>{S.lvl=7;R().zone=3;R().earned=5e7;S.tokens=123;S.gems=77;S.perks.p_start=2;S.perks.p_press=2;S.purchases.x2forever=1;S.boostUntil=now()+999999;const pending=pendingBars();doPrestige();return {pending,bars:S.bars,total:S.barsTotal,money:S.money,zone:R().zone,minions:R().minions,press:L('press'),lvl:S.lvl,gems:S.gems,tokens:S.tokens,x2:S.purchases.x2forever,boost:S.boostUntil>now()};});assert.deepEqual(r,{pending:3,bars:3,total:3,money:0,zone:1,minions:2,press:1,lvl:7,gems:77,tokens:123,x2:1,boost:true});return r;});
 await check('perk-spend-retains-total','behavior',async p=>{const r=await ev(p,()=>{S.bars=S.barsTotal=10;buyPerk('p_mint');return {bars:S.bars,total:S.barsTotal,level:P('p_mint'),mult:baseMult()};});assert.equal(r.bars,7);assert.equal(r.total,10);assert.equal(r.level,1);return r;});
 await check('save-load-roundtrip','behavior',async p=>{await ev(p,()=>{S.money=1234;S.gems=88;S.lvl=7;R().upg.press=2;world.coins[0].tier=5;discover(5);S.gems=88;saveAll(true);});await p.reload();await p.waitForFunction(()=>document.querySelector('#splash').classList.contains('off'),null,{polling:50});const r=await ev(p,()=>({money:S.money,gems:S.gems,lvl:S.lvl,press:L('press'),tiers:world.coins.map(c=>c.tier)}));assert.equal(r.money,1234);assert.equal(r.gems,88);assert.equal(r.lvl,7);assert.equal(r.press,2);assert.deepEqual(r.tiers,[5,0]);return r;});
 await check('capsule-and-duplicate','behavior',async p=>{const r=await ev(p,()=>{S.lvl=7;S.tokens=100;Math.random=()=>0;openCapsule();const a={tokens:S.tokens,capsules:S.capsules,gems:S.gems,hats:Object.keys(S.hats).length};openCapsule();return {a,b:{tokens:S.tokens,capsules:S.capsules,gems:S.gems,hats:Object.keys(S.hats).length}};});assert.deepEqual(r,{a:{tokens:80,capsules:1,gems:10,hats:2},b:{tokens:56,capsules:2,gems:13,hats:2}});return r;});
 await check('daily-once','behavior',async p=>{const r=await ev(p,()=>{S.lvl=5;showDaily();$('dOk').click();showDaily();return {gems:S.gems,tokens:S.tokens,streak:S.daily.streak,canClaim:!!$('dOk')};});assert.deepEqual(r,{gems:15,tokens:10,streak:1,canClaim:false});return r;});
 await check('quest-once','behavior',async p=>{const r=await ev(p,()=>{S.lvl=5;ensureQuests();const q=S.quests.list[0];quest(q.id,q.goal);showQuests();document.querySelector('#mBox [data-q="0"]').click();return {claimed:q.c,gems:S.gems,reward:q.g};});assert.equal(r.claimed,1);assert.equal(r.gems,10+r.reward);return r;});
 await check('lucky-reward-branches','behavior',async p=>{const r=await ev(p,()=>{const data=[];for(const n of [.1,.6,.95]){Math.random=()=>n;spawnLucky();catchLucky();data.push({gems:S.gems,money:S.money,frenzy:frenzyUntil>now()});}return data;});assert.equal(r[0].frenzy,true);assert.equal(r[1].money,50);assert.equal(r[2].gems,13);return r;});
 await check('gem-shop','behavior',async p=>{const r=await ev(p,()=>{S.gems=200;GEM_SHOP.forEach(gemBuy);return {gems:S.gems,tokens:S.tokens,money:S.money,boost:S.boostUntil>now(),lucky:!!world.lucky};});assert.deepEqual(r,{gems:105,tokens:50,money:100,boost:true,lucky:true});return r;});
 await check('offline-cap','behavior',async p=>{const r=await ev(p,()=>{R().minions=1;rebuildWorld();const rate=idleIncome();showOffline(36000);$('oTake').click();return {rate,earned:R().earned,expected:rate*7200};});assert.ok(Math.abs(r.earned-r.expected)<1e-8);return r;});
 await check('offline-club-cap','behavior',async p=>{const r=await ev(p,()=>{R().minions=1;R().upg.safe=1;S.clubUntil=now()+864e5;rebuildWorld();const rate=idleIncome();showOffline(36000);$('oTake').click();return {earned:R().earned,expected:rate*7*3600*1.5};});assert.equal(r.earned,r.expected);return r;});
 await check('B01-vip-unlimited-gems','known-defect',async p=>{const r=await ev(p,()=>{S.purchases.vip=1;S.ads={day:today(),n:20};for(let i=0;i<100;i++)Ads.show(()=>S.gems+=5);return {gems:S.gems,ads:S.ads.n};});assert.deepEqual(r,{gems:510,ads:20});return r;});
 await check('B02-offline-ad-limit-loses-reward','known-defect',async p=>{const r=await ev(p,()=>{R().minions=1;rebuildWorld();S.ads={day:today(),n:20};showOffline(3600);const offered=$('mBox').textContent;$('oX2').click();saveAll();return {offered,money:S.money,modal:$('modal').classList.contains('open'),savedMoney:JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY)).money};});assert.equal(r.money,0);assert.equal(r.savedMoney,0);assert.equal(r.modal,false);return r;});
 await check('B03-max-tier-overflow','known-defect',async p=>{const r=await ev(p,()=>{S.lvl=7;R().coins=[59,59];rebuildWorld();const pairsBefore=pairs();mergeAllPairs();update(.23);return {pairsBefore,tiers:world.coins.map(c=>c.tier),max:ECON.MAX_TIER};});assert.deepEqual(r,{pairsBefore:0,tiers:[60],max:59});return r;});
 await check('B04-overlapping-merge-jobs','known-defect',async p=>{const r=await ev(p,()=>{S.lvl=7;R().coins=[0,0,0,0];rebuildWorld();mergeAllPairs();mergeAllPairs();const jobs=flyers.length;update(.23);return {jobs,tiers:world.coins.map(c=>c.tier),states:world.coins.map(c=>c.state),merges:S.stats.merges};});assert.equal(r.jobs,3);assert.ok(r.states.includes('fly'));return r;});
 await check('B05-null-save-crashes','known-defect',async p=>{const r=await ev(p,()=>{try{mergeLoaded({stats:null});return 'accepted';}catch(e){return e.name+': '+e.message;}});assert.match(r,/TypeError/);return r;});
 await check('B06-negative-values-accepted','known-defect',async p=>{const r=await ev(p,()=>{const d=defaultState();d.money=-500;d.gems=-7;d.run.coins=[99];const o=mergeLoaded(d);return {money:o.money,gems:o.gems,tiers:o.run.coins};});assert.deepEqual(r,{money:-500,gems:-7,tiers:[99]});return r;});
 await check('B07-grant-replay','known-defect',async p=>{const r=await ev(p,()=>{Pay.grant({sku:'gems_s',id:'same'});Pay.grant({sku:'gems_s',id:'same'});return {gems:S.gems};});assert.equal(r.gems,250);return r;});
 await check('B08-claim-not-durable','known-defect',async p=>{const r=await ev(p,async()=>{saveAll();TGB.inTG=true;TGB.call=async()=>({purchases:['vip'],refGems:30});await Pay.claim();return {live:{gems:S.gems,vip:!!S.purchases.vip},saved:JSON.parse(localStorage.getItem(CONFIG.SAVE_KEY))};});assert.equal(r.live.gems,40);assert.equal(r.live.vip,true);assert.equal(r.saved.gems,10);assert.equal(!!r.saved.purchases.vip,false);return {live:r.live,saved:{gems:r.saved.gems,vip:!!r.saved.purchases.vip}};});
 await check('B09-demo-ad-inside-telegram','known-defect',async p=>{const r=await ev(p,()=>{TGB.inTG=true;Ads.ctrl=null;Ads.show(()=>{});return {demo:CONFIG.DEMO_OUTSIDE_TG,busy:Ads.busy,overlay:$('adov').classList.contains('open')};});assert.deepEqual(r,{demo:true,busy:true,overlay:true});return r;});
 await check('B10-capacity-over-declared-limit','known-defect',async p=>{const r=await ev(p,()=>{R().zone=11;R().upg.cap=16;const before=capacity();R().zone=12;return {before,after:capacity(),declared:ECON.capMax(12),upgradeLimit:ECON.upgMax({id:'cap'},12)};});assert.deepEqual(r,{before:32,after:33,declared:32,upgradeLimit:15});return r;});
 await check('B11-reset-keeps-transient-state','known-defect',async p=>{const r=await ev(p,()=>{S.qtyMax=qtyMax=true;frenzyUntil=now()+20000;showSettings();$('sReset').click();$('rOk').click();return {savedQty:S.qtyMax,liveQty:qtyMax,frenzy:frenzyUntil>now()};});assert.deepEqual(r,{savedQty:false,liveQty:true,frenzy:true});return r;});
 await check('B12-deferred-refresh-fixed','regression',async p=>{const r=await ev(p,()=>{S.lvl=4;openTab('upgrades');refreshUI(true);S.money=12;refreshUI();tabRenderedAt=now()-1000;refreshUI();return {money:S.money,buttonDisabled:$('shBody').querySelector('button').disabled,signatureCurrent:lastSig===tabSig(curTab)};});assert.deepEqual(r,{money:12,buttonDisabled:false,signatureCurrent:true});return r;});
 await check('B13-landscape-floor-fixed','regression',async p=>{await p.setViewportSize({width:844,height:390});const r=await ev(p,()=>{resize();return {top:F.top,bottom:F.bottom,vMax:F.vMax,diameter:coinPx()*2,minV:-F.vMax+world.coinR*1.4,maxV:F.vMax-world.coinR*1.1};});assert.ok(r.minV<r.maxV);return r;});
 await check('B14-name-html-injection','known-defect',async p=>{const r=await ev(p,()=>{TGB.user={first_name:'<b id="injected-marker">markup</b>'};showSettings();return {injected:!!$('injected-marker')};});assert.equal(r.injected,true);return r;});
 await check('B15-reset-removes-starter-hat','known-defect',async p=>{const r=await ev(p,()=>{Pay.grant({sku:'starter'});showSettings();$('sReset').click();$('rOk').click();return {ownedStarter:!!S.purchases.starter,hat:!!S.hats[24],gems:S.gems};});assert.deepEqual(r,{ownedStarter:true,hat:false,gems:10});return r;});
 await check('B16-ad-failure-offline','known-defect',async p=>{const r=await ev(p,async()=>{R().minions=1;rebuildWorld();Ads.ctrl={show:()=>Promise.reject(new Error('test skip'))};showOffline(3600);$('oX2').click();await new Promise(r=>setTimeout(r,10));return {money:S.money,modal:$('modal').classList.contains('open'),busy:Ads.busy};});assert.deepEqual(r,{money:0,modal:false,busy:false});return r;});
 await check('content-old-save-migration','content',async p=>{
   const old=await ev(p,()=>{S.money=1234;S.lvl=7;S.stats.taps=40;R().minions=2;R().coins=[0,0];const d=JSON.parse(serialize());delete d.content;return d;});
   await p.addInitScript(old=>localStorage.setItem('mintcoin_save_v1',JSON.stringify(old)),old);
   await p.reload();await p.waitForFunction(()=>$('splash').classList.contains('off'),null,{polling:50});
   const r=await ev(p,()=>({money:S.money,taps:S.stats.taps,minions:R().minions,content:S.content,ready:journeyValue(currentJourney())>=currentJourney().goal}));
   assert.equal(r.money,1234);assert.equal(r.taps,40);assert.equal(r.minions,2);assert.equal(r.content.peakMinions,2);assert.deepEqual(r.content.journey,{});assert.equal(r.ready,true);return r;
 });
 await check('journey-eligibility-once-durable','content',async p=>{
   const first=await ev(p,()=>{const early=claimJourney('first_ring');S.stats.taps=10;const later=claimJourney('small_change'),ok=claimJourney('first_ring'),repeat=claimJourney('first_ring');return {early,later,ok,repeat,gems:S.gems,tokens:S.tokens,next:currentJourney().id};});
   assert.deepEqual(first,{early:false,later:false,ok:true,repeat:false,gems:12,tokens:10,next:'small_change'});
   await p.reload();await p.waitForFunction(()=>$('splash').classList.contains('off'),null,{polling:50});
   const loaded=await ev(p,()=>({gems:S.gems,tokens:S.tokens,repeat:claimJourney('first_ring'),next:currentJourney().id}));
   assert.deepEqual(loaded,{gems:12,tokens:10,repeat:false,next:'small_change'});return {first,loaded};
 });
 await check('journey-complete-and-prestige','content',async p=>{
   const r=await ev(p,()=>{S.stats.taps=100;S.stats.bought=100;S.stats.merges=100;S.stats.heads=100;S.stats.lucky=10;S.stats.total=1e9;S.stats.prestiges=1;S.capsules=1;R().minions=1;S.disc[14]=1;S.maxZoneEver=10;
     let n=0;while(currentJourney()&&n<20){if(!claimJourney(currentJourney().id))break;n++;}
     const total={gems:S.gems,tokens:S.tokens};R().zone=3;R().earned=5e7;S.lvl=7;doPrestige();return {n,total,after:{gems:S.gems,tokens:S.tokens},next:currentJourney(),claimed:Object.keys(S.content.journey).length,peak:S.content.peakMinions};});
   assert.equal(r.n,15);assert.equal(r.claimed,15);assert.equal(r.next,null);assert.deepEqual(r.after,r.total);assert.equal(r.peak,1);return r;
 });
 await check('hat-set-once-durable','content',async p=>{
   const before=await ev(p,()=>{const missing=claimHatSet('shift'),unknown=claimHatSet('missing');S.hats[1]=S.hats[2]=1;const ok=claimHatSet('shift'),repeat=claimHatSet('shift');return {missing,unknown,ok,repeat,gems:S.gems,tokens:S.tokens};});
   assert.deepEqual(before,{missing:false,unknown:false,ok:true,repeat:false,gems:25,tokens:30});
   await p.reload();await p.waitForFunction(()=>$('splash').classList.contains('off'),null,{polling:50});
   const after=await ev(p,()=>({repeat:claimHatSet('shift'),gems:S.gems,tokens:S.tokens,claimed:S.content.sets.shift}));assert.deepEqual(after,{repeat:false,gems:25,tokens:30,claimed:1});return {before,after};
 });
 await check('journey-ui-and-daily-access','content',async p=>{
   await p.locator('#btnQuests').click();assert.equal(await p.locator('#shTitle').innerText(),'Путь мастера');
   assert.equal(await p.locator('.daily-link').isDisabled(),true);
   await ev(p,()=>{S.stats.taps=10;tabRenderedAt=now()-1000;refreshUI();});
   await p.locator('.story-card.current button').click();
   assert.equal(await ev(p,()=>currentJourney().id),'small_change');
   await ev(p,()=>{S.lvl=5;refreshUI(true);});await p.locator('.daily-link').click();assert.equal(await p.locator('#modal').evaluate(e=>e.classList.contains('open')),true);return {journeyEntry:true,claimButton:true,dailyGate:true};
 });
 await check('coin-lore-and-hat-set-ui','content',async p=>{
   await ev(p,()=>{S.lvl=7;S.disc[24]=1;openTab('collection');});
   assert.equal(await p.locator('.coin-entry').count(),2);
   await p.locator('.coin-entry').last().press('Enter');
   assert.match(await p.locator('#mBox').innerText(),/2-го круга/);
   await ev(p,()=>{closeModal();S.hats[1]=S.hats[2]=1;refreshUI(true);});
   const buttons=p.getByRole('button',{name:'Забрать 15 💎 + 30 жетонов',exact:true});assert.equal(await buttons.count(),1);await buttons.click();
   assert.equal(await ev(p,()=>S.content.sets.shift),1);return {albumKeyboard:true,secondLap:true,setClaim:true};
 });
 await check('double-radius-all-zones','content',async p=>{
   const r=await ev(p,()=>{const ratios=[];for(let z=1;z<=30;z++){R().zone=z;const old=clamp(.1*Math.sqrt(12/ECON.capMax(z)),.058,.085);ratios.push(zoneCoinR()/old);}return ratios;});assert.ok(r.every(n=>n===2));return {zones:r.length,ratio:2};
 });
 await check('large-coins-mobile-placement','content',async p=>{
   const sizes=[];for(const viewport of [{width:390,height:844},{width:320,height:568}]){
     await p.setViewportSize(viewport);const r=await ev(p,()=>{resize();refreshUI(true);fitCoinsToFloor();const initial=world.coins.map(c=>floorOK(c.u,c.v,world.coinR));S.money=1000;while(buyCoin(true)){}refreshUI(true);fitCoinsToFloor();const b=$('actions').getBoundingClientRect();return {width:innerWidth,initial,count:world.coins.length,valid:world.coins.map(c=>floorOK(c.u,c.v,world.coinR)),left:b.left,right:b.right,diameter:coinPx()*2};});
     assert.ok(r.initial.every(Boolean));assert.ok(r.valid.every(Boolean));assert.equal(r.count,6);assert.ok(r.left>=0&&r.right<=viewport.width);sizes.push(r);
   }return sizes;
 });
 await check('large-coins-pointer-drag-merge','content',async p=>{
   const pts=await ev(p,()=>{S.lvl=2;S.stats.taps=10;refreshUI(true);fitCoinsToFloor();return world.coins.map(c=>toScreen(c.u,c.v));});
   await p.mouse.move(pts[0].x,pts[0].y);await p.mouse.down();await p.mouse.move(pts[1].x,pts[1].y,{steps:8});await p.mouse.up();
   const r=await ev(p,()=>({tiers:world.coins.map(c=>c.tier),merges:S.stats.merges}));assert.deepEqual(r,{tiers:[1],merges:1});return r;
 });

 // Live rendering screenshots use unmodified timing; seeded advanced state is clearly labelled.
 for(const [name,viewport] of [['initial-mobile',{width:390,height:844}],['initial-small',{width:320,height:568}],['initial-desktop',{width:1280,height:800}]]){
   const p=await pageFor({live:true,viewport});
   await p.screenshot({path:path.join(root,`verification/${name}.png`)});
   results.push({id:name,kind:'visual-smoke',result:p.auditErrors.length?'fail':'pass',errors:p.auditErrors});
   await p.context().close();
 }
 const p=await pageFor({live:true});
 await ev(p,()=>{S.lvl=12;S.stats.taps=20;S.stats.bought=10;S.stats.merges=5;S.money=1e8;S.tokens=300;S.bars=20;S.barsTotal=30;S.maxZoneEver=3;S.maxZoneThisRun=3;R().zone=3;R().earned=1e8;R().minions=4;R().coins=[0,0,1,1,2,2,3,4];R().upg={speed:3,heads:2,press:2};S.hats={0:1,1:1,5:1,14:1};rebuildWorld();applyTheme();refreshUI(true);});
 await p.waitForTimeout(2800);
 for(const tab of ['table','journey','upgrades','collection','prestige','shop']){
   await p.evaluate(tab=>{closeModal();openTab(tab);},tab);
   await p.waitForTimeout(500);
   await p.screenshot({path:path.join(root,`verification/fixture-${tab}.png`)});
 }
 results.push({id:'advanced-screens',kind:'visual-smoke',result:p.auditErrors.length?'fail':'pass',errors:p.auditErrors});
 const defaultSave=await ev(p,()=>{const s=defaultState();s.lastSeen=0;s.run.started=0;return s;});
 fs.writeFileSync(path.join(root,'docs/save-default.json'),JSON.stringify(defaultSave,null,2)+'\n');
 await p.context().close();
 const zonePage=await pageFor({live:true});
 const zoneEvidence=[];
 for(let z=1;z<=10;z++){
   const data=await zonePage.evaluate(z=>{S.lvl=7;S.stats.taps=20;S.stats.bought=10;S.stats.merges=3;R().zone=z;R().coins=[0,1,2,5,7,14];R().upg={speed:1};rebuildWorld();applyTheme();refreshUI(true);$('toasts').replaceChildren();render(.016);return {zone:z,chapter:zoneStory(z).chapter,colors:floorColors()};},z);
   await zonePage.screenshot({path:path.join(root,`verification/zone-${z}.png`)});zoneEvidence.push(data);
 }
 results.push({id:'all-zone-art',kind:'visual-smoke',result:zonePage.auditErrors.length?'fail':'pass',errors:zonePage.auditErrors,evidence:zoneEvidence});
 await zonePage.context().close();
 const contentPage=await pageFor({live:true,viewport:{width:320,height:568}});
 await ev(contentPage,()=>{S.lvl=7;S.stats.taps=20;S.hats[1]=S.hats[2]=1;S.disc[14]=1;openTab('collection');refreshUI(true);});
 await contentPage.getByRole('button',{name:'Наборы',exact:true}).click();
 await contentPage.screenshot({path:path.join(root,'verification/sets-small.png')});
 const setGeometry=await ev(contentPage,()=>{const c=$('collectionSets').getBoundingClientRect(),b=$('shBody').getBoundingClientRect();return {heading:c.top,body:b.top};});
 if(Math.abs(setGeometry.heading-setGeometry.body)>2)contentPage.auditErrors.push('Collection set shortcut did not scroll to heading');
 await ev(contentPage,()=>showCoinStory(14));
 await contentPage.waitForFunction(()=>getComputedStyle($('mBox')).opacity==='1');
 await contentPage.screenshot({path:path.join(root,'verification/coin-story-small.png')});
 await ev(contentPage,()=>{closeModal();showJourney();});
 await contentPage.waitForTimeout(300);
 await contentPage.screenshot({path:path.join(root,'verification/journey-small.png')});
 results.push({id:'content-small-screens',kind:'visual-smoke',result:contentPage.auditErrors.length?'fail':'pass',errors:contentPage.auditErrors,evidence:setGeometry});
 await contentPage.context().close();

 const summary={executedAt:new Date().toISOString(),browser:await browser.version(),isolation:'Fresh contexts; local HTML route; external SDKs and API blocked; no real Telegram account',tests:results.length,passed:results.filter(r=>r.result==='pass').length,failed:results.filter(r=>r.result==='fail').length,results};
 fs.writeFileSync(path.join(root,'verification/browser-results.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify({...summary,results:results.filter(r=>r.result==='fail')},null,2));
 await browser.close();
 if(summary.failed)process.exitCode=1;
}
main().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
