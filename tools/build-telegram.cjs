/* Produces an upload directory containing only the game. No credentials required. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const config={BOT_USERNAME:source.match(/BOT_USERNAME: '([^']+)'/)[1],APP_SHORT_NAME:source.match(/APP_SHORT_NAME: '([^']*)'/)[1],STANDALONE:true,DEMO_OUTSIDE_TG:false,ADSGRAM_BLOCK_ID:'',ADSGRAM_DEBUG:false};
const script='<script>window.APP_CONFIG='+JSON.stringify(config).replace(/</g,'\\u003c')+';</script>\n';
const html=source.replace('<script src="https://telegram.org/js/telegram-web-app.js"></script>',script+'<script src="https://telegram.org/js/telegram-web-app.js"></script>');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=/.test(m[1]))new vm.Script(m[2]);
const out=path.join(root,'telegram');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'index.html'),html);
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const info={builtAt:new Date().toISOString(),sourceSha256:sha(source),htmlSha256:sha(html),output:'telegram/index.html',launchUrl:'https://t.me/'+config.BOT_USERNAME+(config.APP_SHORT_NAME?'/'+config.APP_SHORT_NAME:'?startapp'),config};
fs.writeFileSync(path.join(root,'verification/telegram-build.json'),JSON.stringify(info,null,2)+'\n');console.log(JSON.stringify(info,null,2));
