/* Extracts facts from the actual HTML. Does not change the game. Node built-ins only. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const file = path.resolve(process.argv[2] || path.join(root, 'index.html'));
const html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m => !/\bsrc=/.test(m[1]));
for (const [i, m] of scripts.entries()) new vm.Script(m[2], { filename: `inline-${i + 1}.js` });
const scope = {};
vm.runInNewContext(html.split('// ECONOMY-START')[1].split('// ECONOMY-END')[0], scope);
const E = scope.ECON;
const contentScope = {};
const contentSource = html.match(/var CONTENT_VERSION[\s\S]*?(?=function zoneStory)/);
if (contentSource) vm.runInNewContext(contentSource[0], contentScope);
const functions = [...html.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => ({name:m[1],line:html.slice(0,m.index).split('\n').length}));
const report = {
  source: path.relative(root, file), sha256:crypto.createHash('sha256').update(html).digest('hex'),
  bytes:Buffer.byteLength(html), lines:html.split('\n').length - (html.endsWith('\n') ? 1 : 0), inlineScripts:scripts.length,
  functions,
  content:contentSource ? {version:contentScope.CONTENT_VERSION,zones:contentScope.ZONE_STORIES,coinLore:contentScope.COIN_LORE,hatSets:contentScope.HAT_SETS,journey:contentScope.JOURNEY} : null,
  tiers:Array.from({length:E.MAX_TIER+1},(_,t)=>({tier:t,name:E.tierName(t),denomination:E.denom(t)})),
  zones:Array.from({length:35},(_,i)=>{const z=i+1;return {zone:z,name:E.zoneName(z),multiplier:E.zoneMult(z),nextZonePrice:E.zoneCost(z),baseCapacity:E.capBase(z),declaredMaxCapacity:E.capMax(z),capacityUpgradeMax:E.upgMax({id:'cap'},z),minionMax:E.minionCap(z),pressMax:E.pressCap(z)};}),
  upgrades:E.UPGRADES.map(u=>({id:u.id,name:u.name,base:u.base,growth:u.grow,declaredMax:u.max,actualMaxZone1:E.upgMax(u,1),actualMaxZone15:E.upgMax(u,15)})),
  perks:E.PERKS.map(p=>({id:p.id,name:p.name,base:p.base,growth:p.grow,max:p.max})),
  constants:{BAR_BONUS:E.BAR_BONUS,HAT_BONUS:E.HAT_BONUS,BARS_MIN:E.BARS_MIN,PRESTIGE_ZONE:E.PRESTIGE_ZONE,BASE_CYCLE:E.BASE_CYCLE,AIR_TIME:E.AIR_TIME,EDGE_MULT:E.EDGE_MULT},
  samples:{coinPrices:Array.from({length:12},(_,n)=>E.coinPrice(n,0)),minionPrices:Array.from({length:12},(_,n)=>E.minionPrice(n)),xp:Array.from({length:10},(_,i)=>({level:i+1,need:E.xpNeed(i+1),gems:E.levelGems(i+1)})),capsules:Array.from({length:12},(_,n)=>E.capsulePrice(n))},
  syntax:'pass'
};
fs.writeFileSync(path.join(root,'verification/source-facts.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({syntax:report.syntax,sha256:report.sha256,functions:functions.length,tiers:report.tiers.length,upgrades:report.upgrades.length,perks:report.perks.length},null,2));
