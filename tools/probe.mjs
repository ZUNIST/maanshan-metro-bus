import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1200,800','--remote-debugging-port=9334','--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof3','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+r.exceptionDetails.text):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch('http://127.0.0.1:9334/json')).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/preview.html?map=ms'});
  await sleep(9000);
  console.log(JSON.stringify(await ev(`(function(){
    var m=CM.MAPS.ms;
    return {file:m.geo.file, hasWater:!!(m.geo.water&&m.geo.water.length), geosHasWater:!!(CM.GEOS.ms&&CM.GEOS.ms.water&&CM.GEOS.ms.water.length),
      mapId:CM.mapId, sameObj: CM.GEO===m.geo, geoReady: CM.geoReady('ms'),
      scripts: [].map.call(document.querySelectorAll('script[src*="geo_ms"]'),function(s){return s.src+':'+s.type}),
      roads: (CM.Geo&&CM.Geo.roads)?CM.Geo.roads.length:null, admin: (CM.Geo&&CM.Geo.admin)?CM.Geo.admin.length:null,
      streets: (CM.Geo&&CM.Geo.streets)?CM.Geo.streets.length:null};
  })()`),null,1));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
