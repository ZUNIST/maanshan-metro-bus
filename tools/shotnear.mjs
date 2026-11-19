import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9700+Math.floor(Math.random()*80);
const CX=Number(process.argv[2]||103), CY=Number(process.argv[3]||158), OUT=process.argv[4];
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1400,860',`--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cpn${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const t of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent',{type:t,x,y,button:'left',clickCount:1});};
const shot=async(f)=>{const r=await send('Page.captureScreenshot',{format:'jpeg',quality:76}); await writeFile(f,Buffer.from(r.data,'base64'));};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'}); await sleep(5000);
  await ev("CM.newGame({map:'ms',mode:'free',name:'near'})");
  for(let i=0;i<200;i++){ await sleep(400); if(await ev("!!(CM.game&&CM.game.city&&!CM.isLoading())")) break; }
  const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
  if(r) await click(r[0],r[1]);
  await sleep(2500);
  // 直接把镜头移到目标点（游戏内相机对象）
  const Z=Number(process.argv[5]||19);
  const ok=await ev(`(function(){try{
    var c=CM.R.cam; c.cx=${CX}; c.cy=${CY}; c.zoom=c.tz=${Z}; c.view=1; c.t=1; c.anchor=null; c.fly=null;
    return 'ok z='+c.zoom;
  }catch(e){return 'err:'+e.message}})()`);
  await sleep(2500);
  const ZZ=[12,8,5];
  for(let k=0;k<ZZ.length;k++){
    await ev(`(function(){var c=CM.R.cam;c.cx=${CX};c.cy=${CY};c.zoom=c.tz=${ZZ[k]};c.t=1;return c.zoom})()`);
    await sleep(2200);
    await shot(OUT.replace('.png','-z'+ZZ[k]+'.png'));
  }
  console.log('camera', ok);
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
