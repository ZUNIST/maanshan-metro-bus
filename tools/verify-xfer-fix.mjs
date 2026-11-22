// v3.63 回归探针：在有轨/公交共站且线路拥挤时，车站详情不再抛 reading 'size'。
// 构造 tram + bus 两线共站，强制高峰满载，逐站渲染详情并断言无异常。
import { spawn } from 'node:child_process';
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT=9000+Math.floor(Math.random()*200);
const url=process.argv[2]||'http://127.0.0.1:8123/index.html';
const MAP=process.argv[3]||'hx27';
const child=spawn(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--window-size=1440,900',
 `--remote-debugging-port=${PORT}`,`--user-data-dir=C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.cvxf${PORT}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=0;const pending=new Map();
const send=(m,p)=>new Promise((res,rej)=>{const i=++id;pending.set(i,{res,rej});ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.exceptionDetails?('ERR '+((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text)):r.result.value;};
const click=async(x,y)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});};
try{
 let t=null;for(let i=0;i<60&&!t;i++){await sleep(400);try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json();t=l.find(x=>x.type==='page');}catch{}}
 ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);d.error?p.rej(new Error(JSON.stringify(d.error))):p.res(d.result);}};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.navigate',{url});await sleep(5000);
 await ev(`CM.newGame({map:'${MAP}',mode:'free',name:'p'})`);
 for(let i=0;i<160;i++){await sleep(400);if(await ev('!!(CM.game&&CM.game.city&&!CM.isLoading())'))break;}
 const r=await ev("(function(){var b=[].slice.call(document.querySelectorAll('button')).find(function(x){return /开始规划/.test(x.textContent)});if(!b)return null;var q=b.getBoundingClientRect();return [q.x+q.width/2,q.y+q.height/2]})()");
 if(r)await click(r[0],r[1]);await sleep(2500);
 const out=await ev(`(function(){
   var g=CM.game, M=CM.Metro, net=g.net, city=g.city;
   // 造两条轻轨线共站：tram 与 bus 都停在同一个 X
   var bx=120,by=160;
   var A=M.addStation(net,bx-10,by,{size:'S',type:'surface',sys:'tram'},city);
   var X=M.addStation(net,bx,by,{size:'S',type:'surface',sys:'tram'},city);
   var B=M.addStation(net,bx+10,by,{size:'S',type:'surface',sys:'tram'},city);
   var C=M.addStation(net,bx,by+10,{size:'S',type:'surface',sys:'bus'},city);
   var lt=M.newLine(net,'测试有轨','tram'), lb=M.newLine(net,'测试公交','bus');
   M.addSegment(net,lt,A,X,[[bx-5,by]],'surface');
   M.addSegment(net,lt,X,B,[[bx+5,by]],'surface');
   M.addSegment(net,lb,X,C,[[bx,by+5]],'surface');
   g.compiled=CM.RailConcessions.compile(net,g); g.model.setNetwork(g.compiled);
   // 强制高峰客流到极大，保证拥挤诊断的 trains 分支一定执行
   var m=g.model;
   ['peak','inn','out','xfer'].forEach(function(k){if(m.stDaily&&m.stDaily[k])for(var i=0;i<m.stDaily[k].length;i++)m.stDaily[k][i]=5e6;});
   if(m.stDailyWk)['peak','inn','out','xfer'].forEach(function(k){if(m.stDailyWk[k])for(var i=0;i<m.stDailyWk[k].length;i++)m.stDailyWk[k][i]=5e6;});
   m.dailyStale=false;
   // 让 rideEdge 负荷极大 -> dirFreq 满载：直接把每条交路每段的 load 拉满
   for(var dt of ['wd','we']) if(m.ctxs[dt]) for(var P of m.ctxs[dt].per){ if(P.load)for(var i=0;i<P.load.length;i++)P.load[i]=1e9; }
   var crashes=[],btns=[];
   for(var sid in net.stations){ try{CM.ui.page_station(sid); var p=CM.ui.rBody; (p.querySelectorAll('button')||[]).forEach(function(b){var t=b.textContent.trim();if(/加长编组|运力不足|加密班次|平行线路/.test(t))btns.push(t);});}catch(e){crashes.push({sid:sid,name:net.stations[sid].name,msg:e.message});} }
   // 单独渲染共站 X
   var xcrash=null; try{CM.ui.page_station(X);}catch(e){xcrash=e.message;}
   // 直接调 crowdBlock，把每座站的诊断块文本取出来
   var diags=[];
   for(var sid in net.stations){ var kk=g.compiled.sIndex.get(sid); if(kk==null)continue;
     try{ var el=CM.ui.crowdBlock(sid,kk); if(el){var txt=(el.textContent||'').replace(/\s+/g,' ').slice(-120); diags.push(txt);} }catch(e){diags.push('ERR '+e.message);} }
   return {stCount:Object.keys(net.stations).length,X:X,crashes:crashes,xcrash:xcrash,diags:diags.filter(function(t){return /测试有轨|测试公交|加密班次|辆/.test(t);}).slice(0,6)};
 })()`);
 console.log('VERIFY',JSON.stringify(out).slice(0,3000));
}catch(e){console.error('FAIL',e.message);}finally{child.kill();process.exit(0);}
