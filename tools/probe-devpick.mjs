import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9760+Math.floor(Math.random()*20);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1600,1000','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port='+PORT,'--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-r'+PORT,'about:blank'],{stdio:'ignore'});
let ws,id=0;const pending=new Map();const logs=[];
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}))});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)return{error:(r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text};return{value:r.result.value}};
try{
 let t=null;for(let i=0;i<80&&!t;i++){await sleep(500);try{const l=await(await fetch('http://127.0.0.1:'+PORT+'/json')).json();t=l.find(x=>x.type==='page')}catch{}}
 ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(JSON.stringify(m.error))):p.res(m.result)}if(m.method==='Runtime.exceptionThrown')logs.push('EXC '+((m.params.exceptionDetails.exception&&m.params.exceptionDetails.exception.description)||m.params.exceptionDetails.text))};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url:process.env.CM_URL});
 for(let i=0;i<160;i++){await sleep(500);if((await ev('!!(window.CM&&CM.newGame)')).value)break}
 await ev("CM.newGame({map:'ms30',mode:'free'})");
 for(let i=0;i<120;i++){await sleep(500);if((await ev('!!(window.CM&&CM.game&&CM.game.city&&CM.game.city.N)')).value)break}
 await sleep(2000);
 await ev("CM.ui.openPage('development','project',{root:true})"); await sleep(1200);
 const b=(await ev("(function(){var x=[...document.querySelectorAll('button')].find(e=>/选视野中心/.test(e.textContent));if(x){x.click();return 'clicked'}return 'nobtn'})()")).value;
 console.log('BTN:',b); await sleep(1200);
 console.log('DRAFT:',JSON.stringify((await ev("(function(){var d=CM.ui.developmentDraft;return d?{bounds:d.bounds}:null})()")).value));
 console.log('PANEL:',String((await ev("(function(){var r=document.querySelector('.rbody')||document.querySelector('#rightPanel');return r?r.textContent.replace(/\\s+/g,' ').slice(0,150):'none'})()")).value));
 console.log('LOGS:',JSON.stringify(logs.slice(-3)));
}catch(e){console.log('FAIL',e.message)}finally{try{child.kill()}catch{}}
