import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9700+Math.floor(Math.random()*90);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1400,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpw${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception||{}).description||r.exceptionDetails.text)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(5000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'probe2'})");
  for(let i=0;i<200;i++){ await sleep(400); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  console.log(JSON.stringify(await ev(`(function(){
    var D=CM.MAPS.ms.data, C=CM.game.city;
    var lms=D.landmarks.filter(function(l){return /凤林|当涂东|含山西/.test(l.name)}).map(function(l){return l.name+'@'+l.x.toFixed(1)+','+l.y.toFixed(1)+' y'+l.year});
    // 风景区覆盖：取寺庙位置与其北 5 格
    var rg=(x,y)=>{var r=C.regionAt(x,y);return r?r.id+'/'+r.name:'?'};
    var pts=[[142.6,118.9],[142.6,110],[142.6,125],[135,120],[165,120]];
    return {lms:lms, rgAtTemple:pts.map(function(p){return p.join(',')+' → '+rg(p[0],p[1])}),
      jlsD:p0(D.regions,'jls')};
    function p0(a,id){var r=a.filter(function(z){return z.id===id})[0];return r?r.poly.map(function(q){return q[0].toFixed(0)+','+q[1].toFixed(0)}).join(' | '):null;}
  })()`),null,1));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
