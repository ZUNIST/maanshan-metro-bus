// 自动站名审计：在代表性坐标（含偏远乡村路沿线）调用 suggestName，检查是否取到邻市/商业/编号名
// 用法: node tools/name-audit.mjs <url>
import { spawn } from 'node:child_process';
const URL_ = process.argv[2] || 'http://127.0.0.1:8199/index.html?v=3';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9343;
const PROFILE = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/.chromeprof-nameaudit';
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1400,900',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async e => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
  return r.result.value;
};

const PROBE = `(function(){
  var C=CM.game.city, M=CM.Metro, D=CM.DATA;
  var pts=[
    ['主城·解放路',262,162],['主城·雨山湖',258,166],['主城·安工大',263,169],['主城·东站',274,165],
    ['主城·秀山',280,175],['主城·采石矶',243,186],['主城·向山',298,177],['主城·濮塘',318,158],
    ['和县·历阳',204,153],['和县·乌江',241,95],['和县·香泉',189,88],['和县·西埠',176,131],
    ['和县·石杨',174,56],['和县·善厚',125,85],['和县·姥桥',183,204],['和县·郑蒲港',196,206],
    ['沈巷',153,266],['含山·环峰',103,159],['含山·昭关',88,130],['含山·铜闸',93,255],
    ['含山·清溪',63,183],['含山·华阳洞',109,126],['含山·凌家滩',80,264],
    ['当涂·姑孰',259,222],['当涂·东站',268,223],['当涂·护河',294,246],['当涂·年陡',243,280],
    ['当涂·太白',248,244],['博望·丹阳',343,195],['博望·镇区',382,216],['博望·南',388,230],
    ['偏远·含山北',120,200],['偏远·和县北',220,60],['偏远·当涂东',300,250],['偏远·博望南',350,260],
    ['偏远·江南',170,230],['偏远·含山西',60,220],['偏远·和县中',200,120]
  ];
  var out=[];
  for(var i=0;i<pts.length;i++){
    var p=pts[i], net={stations:{},segments:{},lines:{},nextId:1};
    var nm=''; try{ nm=M.suggestName(net,p[1],p[2],C); }catch(e){ nm='ERR '+e.message; }
    out.push({at:p[0],x:p[1],y:p[2],name:nm});
  }
  // 沿一条偏远乡村路连续设站，检查是否退化为编号名或邻市名
  var line=[], net2={stations:{},segments:{},lines:{},nextId:1};
  for(var k=0;k<10;k++){
    var x=115+k*4, y=205+k*1.5, nm2=M.suggestName(net2,x,y,C);
    net2.stations['s'+k]={id:'s'+k,name:nm2,x:x,y:y};
    line.push(nm2);
  }
  var bad=/南京|江宁|芜湖|巢湖|雨花台|镜湖|高淳|溧水|浦口|鼓楼|建邺|栖霞|六合|江苏省|建材|五金|市场|卖场|专卖|网吧|手机|轮胎|超市|酒店|宾馆|饭店|公司|委会|人民政府|服务中心|[0-9]+站$/;
  return { places:D.places.length, samples:out, ruralLine:line,
    badCount:out.filter(function(o){return bad.test(o.name);}).length,
    badLine:line.filter(function(n){return bad.test(n);}).length };
})()`;

try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); target = list.find(t => t.type === 'page'); } catch {}
  }
  if (!target) throw new Error('CDP 未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  const logs = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('console: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || '').slice(0, 200));
  });
  await send('Page.navigate', { url: URL_ });
  await sleep(3500);
  await ev("CM.newGame({map:'ms',mode:'free',name:'nameaudit'})");
  let ready = false;
  for (let i = 0; i < 90; i++) { await sleep(1000); const ok = await ev("!!(CM.game&&CM.game.city&&CM.game.city.pop&&!CM.isLoading())"); if (ok === true) { ready = true; break; } }
  if (!ready) throw new Error('建城未完成');
  const r = await ev(PROBE);
  console.log('places:', r.places, ' badCount:', r.badCount, ' badLine:', r.badLine);
  console.log('--- 代表点站名 ---');
  for (const s of r.samples) console.log('  ' + s.at.padEnd(14) + ' (' + s.x + ',' + s.y + ') -> ' + s.name);
  console.log('--- 偏远乡村路连续设站 ---');
  console.log('  ' + r.ruralLine.join(' | '));
  console.log('logs:', JSON.stringify(logs));
} catch (e) { console.error('FAIL', e.message); }
finally { try { ws && ws.close(); } catch {} child.kill(); }
