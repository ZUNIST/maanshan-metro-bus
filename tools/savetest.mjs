import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9800+Math.floor(Math.random()*90);
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1400,900',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cps${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(5000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'存档测试'})");
  for(let i=0;i<80;i++){ await sleep(500); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const a=await ev("(function(){window.__g=CM.game;return {pop:CM.game.city.pop.reduce(function(x,y){return x+y},0)|0, name:CM.game.name}})()");
  const s=await ev("(async function(){var r=await CM.Save.save(CM.game,'manual',{});return JSON.stringify(r).slice(0,200)})()");
  const before=await ev("(function(){return {slots:(CM.Save.list&&1)||0}})()");
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(5000);
  const list=await ev("(async function(){await CM.Save.init();var l=await CM.Save.list('ms');return l.map(function(x){return x.slotId+':'+(x.meta&&x.meta.name)+':'+(x.meta&&x.meta.date)})})()");
  console.log('saved', a, s, 'list', JSON.stringify(list));
  const list2=await ev("(async function(){var l=await CM.Save.list('ms'); if(!l.length) return 'none'; var p=await CM.Save.load(l[0].slotId); if(p) CM.loadGame(p); return 'loading'})()");
  for(let i=0;i<80;i++){ await sleep(500); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const b=await ev("(function(){var g=CM.game;return g?{pop:g.city.pop.reduce(function(x,y){return x+y},0)|0, map:g.mapId, name:g.name, clock:g.clock.y+'-'+g.clock.m}:null})()");
  console.log('after load', JSON.stringify(b), list2);
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
