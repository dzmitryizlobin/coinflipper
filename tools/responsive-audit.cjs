/* Layout checks in isolated browser contexts, including a simulated Telegram host.
 * External services and user storage are never used. BROWSER_CHANNEL=chrome is supported.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const cases=[['narrow',280,600],['small-short',320,480],['very-short',320,400],['small',320,568],['mobile',390,844],['large-phone',430,932],['mid',540,720],['landscape-small',568,320],['landscape',844,390],['tablet',768,1024],['desktop',1280,800],['desktop-large',1920,1080],['telegram',390,844,{height:844,safe:{top:24,bottom:34,left:0,right:0},content:{top:32,bottom:0,left:0,right:0}}],['telegram-compact',390,844,{height:550,safe:{top:0,bottom:20,left:0,right:0},content:{top:0,bottom:0,left:0,right:0}}],['telegram-landscape',844,390,{height:390,safe:{top:0,bottom:21,left:44,right:44},content:{top:24,bottom:0,left:0,right:0}}]];
const results=[];let browser;
(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 for(const [name,width,height,tg] of cases){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,locale:'ru-RU'});
  await context.route('**/*',r=>r.fulfill({status:200,contentType:r.request().url()==='http://mint-dvor.test/'?'text/html':'text/plain',body:r.request().url()==='http://mint-dvor.test/'?html:''}));
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(tg=>{if(!tg)return;window.__tgEvents={};window.__tgCalls=[];const log=n=>()=>window.__tgCalls.push(n);window.Telegram={WebApp:{initData:'test-only',initDataUnsafe:{user:{id:1,first_name:'Тест'}},viewportStableHeight:tg.height,viewportHeight:tg.height,safeAreaInset:tg.safe,contentSafeAreaInset:tg.content,isVersionAtLeast:()=>true,ready:log('ready'),expand:log('expand'),disableVerticalSwipes:log('disableVerticalSwipes'),setHeaderColor:()=>{},setBackgroundColor:()=>{},setBottomBarColor:()=>{},onEvent:(n,fn)=>window.__tgEvents[n]=fn,BackButton:{onClick:fn=>window.__tgEvents.back=fn,show:()=>{},hide:()=>{}},SettingsButton:{onClick:fn=>window.__tgEvents.settings=fn,show:log('settings')}}};},tg||null);
  try{
   await p.goto('http://mint-dvor.test/');await p.waitForFunction(()=>$('splash').classList.contains('off')&&getComputedStyle($('splash')).opacity==='0');
   await p.evaluate(()=>{S.settings.sound=S.settings.haptic=false;});
   const measure=()=>{
    const app=$('app'),a=app.getBoundingClientRect(),css=getComputedStyle(app),buy=$('buy').getBoundingClientRect(),qty=$('qty').getBoundingClientRect();
    const controls=['btnSettings','qty','btnMerge','btnMinion','zonepill','nav'].map(id=>{const b=$(id).getBoundingClientRect();return {id,left:b.left,top:b.top,right:b.right,bottom:b.bottom};});
    return {layout:app.dataset.layout,app:{left:a.left,right:a.right,top:a.top,bottom:a.bottom},safe:{left:parseFloat(css.paddingLeft),right:parseFloat(css.paddingRight),top:parseFloat(css.paddingTop),bottom:parseFloat(css.paddingBottom)},controls,gap:Math.max(qty.top-buy.bottom,qty.left-buy.right),qtyClickable:[...$('qty').children].every(b=>{const q=b.getBoundingClientRect();return document.elementFromPoint(q.x+q.width/2,q.y+q.height/2)===b;}),floor:{top:F.top,bottom:F.bottom,minV:-F.vMax+world.coinR*1.4,maxV:F.vMax-world.coinR*1.1},valid:world.coins.every(c=>floorOK(c.u,c.v,world.coinR)),errors:[],scrollX:document.documentElement.scrollWidth-innerWidth};
   };
   const r=await p.evaluate(measure);
   assert.ok(r.gap>=9,`quantity gap ${r.gap}`);assert.ok(r.qtyClickable,'quantity hit targets');assert.ok(r.floor.minV<r.floor.maxV,'no playfield');assert.ok(r.valid,'initial coin outside playfield');assert.equal(r.scrollX,0);assert.equal(await p.locator('#sheet').isVisible(),false);
   for(const c of r.controls){assert.ok(c.left>=r.app.left+r.safe.left-1&&c.right<=r.app.right-r.safe.right+1,`${c.id} outside horizontal safe area`);assert.ok(c.top>=r.app.top+r.safe.top-1&&c.bottom<=r.app.bottom-r.safe.bottom+1,`${c.id} outside vertical safe area`);}
   await p.locator('#qty [data-q="max"]').click();assert.equal(await p.evaluate(()=>qtyMax),true);await p.locator('#qty [data-q="1"]').click();
   await p.locator('#btnSettings').click();await p.waitForFunction(()=>getComputedStyle($('mBox')).opacity==='1');assert.equal(await p.locator('#sSnd').count(),1);await p.evaluate(()=>closeModal());
   if(['small','mobile','landscape','desktop','telegram','telegram-landscape'].includes(name))await p.screenshot({path:path.join(root,`verification/responsive-${name}.png`)});
   await p.evaluate(()=>{S.lvl=12;S.stats.taps=20;S.stats.bought=10;S.stats.merges=5;S.money=1e8;S.maxZoneEver=R().zone=3;R().coins=[0,1,2,3,4,5];rebuildWorld();refreshUI(true);resize();$('toasts').replaceChildren();});
   const advanced=await p.evaluate(measure);assert.ok(advanced.valid,'advanced coin outside playfield');
   for(const tab of ['upgrades','collection','journey','shop']){
    await p.evaluate(t=>openTab(t),tab);await p.waitForFunction(()=>getComputedStyle($('sheet')).transform==='matrix(1, 0, 0, 1, 0, 0)');
    const overflow=await p.evaluate(()=>{const b=$('shBody'),box=$('sheet').getBoundingClientRect(),app=$('app').getBoundingClientRect();return {x:b.scrollWidth-b.clientWidth,top:box.top,bottom:box.bottom,appBottom:app.bottom};});assert.ok(overflow.x<=1,`${tab} horizontal overflow ${overflow.x}`);assert.ok(overflow.bottom<=overflow.appBottom+1&&overflow.top>=-1,JSON.stringify(overflow));
   }
   await p.evaluate(()=>closeAll());
   if(tg){assert.ok(await p.evaluate(()=>__tgCalls.includes('ready')&&__tgCalls.includes('expand')&&__tgCalls.includes('settings')));await p.evaluate(()=>__tgEvents.settings());assert.equal(await p.locator('#sSnd').count(),1);await p.evaluate(()=>__tgEvents.back());assert.equal(await p.locator('#modal').evaluate(e=>e.classList.contains('open')),false);}
   if(name==='telegram'){await p.evaluate(()=>{Telegram.WebApp.viewportStableHeight=600;__tgEvents.viewportChanged({isStateStable:true});});await p.waitForFunction(()=>Math.round($('app').getBoundingClientRect().height)===600);await p.evaluate(()=>{Telegram.WebApp.safeAreaInset={top:0,bottom:0,left:0,right:0};Telegram.WebApp.contentSafeAreaInset={top:12,bottom:0,left:0,right:0};__tgEvents.safeAreaChanged();__tgEvents.contentSafeAreaChanged();});await p.waitForFunction(()=>getComputedStyle($('app')).paddingTop==='12px');await p.setViewportSize({width:844,height:390});await p.waitForFunction(()=>$('app').dataset.layout==='wide');const rotated=await p.evaluate(measure);assert.ok(rotated.valid);assert.ok(rotated.qtyClickable);r.viewportAndSafeAreaChanges=true;}
   assert.deepEqual(errors,[]);results.push({name,result:'pass',evidence:r});
  }catch(e){results.push({name,result:'fail',error:String(e),pageErrors:errors});await p.screenshot({path:path.join(root,`verification/responsive-${name}-failure.png`)});}
  await context.close();
 }
 const out={executedAt:new Date().toISOString(),browser:await browser.version(),tests:results.length,passed:results.filter(r=>r.result==='pass').length,failed:results.filter(r=>r.result==='fail').length,results};fs.writeFileSync(path.join(root,'verification/responsive-results.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,results:results.filter(r=>r.result==='fail')},null,2));await browser.close();if(out.failed)process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});
