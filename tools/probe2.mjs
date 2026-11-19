import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const child=spawn(CHROME,['--headless=new','--disable-gpu','--window-size=1200,800','--remote-debugging-port=9335','--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof4','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0; const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+r.exceptionDetails.text+' '+(r.exceptionDetails.exception&&r.exceptionDetails.exception.description)):r.result.value;};
try{
  let t=null; for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch('http://127.0.0.1:9335/json')).json();t=l.find(x=>x.type==='page');}catch{}}
  ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8123/index.html'});
  await sleep(6000);
  console.log(JSON.stringify(await ev(`(async function(){ await CM.loadGeo('ms');
    var G=CM.GEOS.ms, D=CM.MAPS.ms.data;
    var byLv={}; for (var i=0;i<G.admin.length;i++){var lv=G.admin[i][0]; byLv[lv]=(byLv[lv]||0)+1;}
    var streets={}; (D.regions||[]).forEach(function(r){ (r.streets||[]).forEach(function(s){streets[s]=r.id;}); });
    var districts={}; (D.regions||[]).forEach(function(r){ (r.district||[]).forEach(function(s){districts[s]=r.id;}); });
    var adminNames={lv8:[],lv67:[]}, hitS=0, hitD=0, miss=[];
    for (var i=0;i<G.admin.length;i++){ var r=G.admin[i], nm=G.names[r[1]];
      if(r[0]===8){ if(streets[nm]) hitS++; else miss.push('L8:'+nm); } else { if(districts[nm]) hitD++; else miss.push('L'+r[0]+':'+nm); } }
    var noRings=0; for (var i=0;i<G.admin.length;i++){ if(G.admin[i].length<3) noRings++; }
    return {byLv:byLv, hitStreets:hitS, hitDistricts:hitD, streetNames:Object.keys(streets).length, districtNames:Object.keys(districts).length, miss:miss.slice(0,12), noRings:noRings, adminRows:G.admin.length, regions:(D.regions||[]).length, def:D.defaultRegion&&D.defaultRegion.name};
  })()`),null,1));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
