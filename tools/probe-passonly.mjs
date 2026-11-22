// 检查各剧本的「境外」片区：线路可以穿过（geometry.locked 为空），但不能设站（checkSite 拒绝），
// 且剧本自带的站仍然存在。用法：node tools/probe-passonly.mjs [url]
import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9000+Math.floor(Math.random()*200);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1400,860',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpp${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
const probe = map => ev(`(function(){
  const g=CM.game, city=g.city, R=city.regions;
  const po=[]; R.forEach(function(r,i){ if(r.passOnly) po.push({i:i,id:r.id,name:r.name}); });
  const out={map:'${map}',passOnly:po.map(function(p){return p.id;}),stations:Object.keys(g.net.stations).length,details:[]};
  for (const p of po) {
    let cell=-1;
    for (let c=0;c<city.N;c++) if (city.region[c]===p.i && city.landFrac[c]>=0.5 && !city.waterDistAt(c%city.W+0.5, ((c/city.W)|0)+0.5)>=0) { cell=c; break; }
    if (cell<0) { out.details.push({id:p.id,cell:null}); continue; }
    const x=cell%city.W+0.5, y=((cell/city.W)|0)+0.5;
    const geo=CM.Metro.geomFromControl([[Math.max(0.5,x-3),y],[x,y],[Math.min(CM.CFG.W-0.5,x+3),Math.min(CM.CFG.H-0.5,y+2)]],'underground',city);
    const site=CM.Metro.checkSite(city,x,y,'underground');
    out.details.push({id:p.id,x:+x.toFixed(1),y:+y.toFixed(1),locked:(geo.locked||[]).map(function(l){return l.name;}),siteOk:site.ok,msg:site.msg||'',
      lockText:city.regionLockText(p.i)});
  }
  return out;})()`);
try{
 let t=null;for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
 ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:process.argv[2]||'http://127.0.0.1:8123/index.html'});
 await sleep(4500);
 for (const map of ['ms','ms27','ms30','hx','hx27']) {
   await ev(`CM.newGame({map:'${map}',mode:'free',name:'p'})`);
   for(let i=0;i<120;i++){await sleep(400);if(await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())'))break;}
   const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
   if(r)await click(r[0],r[1]);
   await sleep(1200);
   console.log(JSON.stringify(await probe(map)));
 }
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
