// 分区统计「精细度」：路网组数与总长、地名数、水体/绿地要素，用来找出各区域的数据密度差。
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1280,800',
  '--remote-debugging-port=9338', `--user-data-dir=${ROOT}/.chromeprof-detail`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
  return { value: r.result.value };
};

try {
  let t = null;
  for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch('http://127.0.0.1:9338/json')).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8199/index.html?v=detail1' });
  await sleep(4000);
  await ev('CM.newGame({ map: "ms", mode: "free" })');
  for (let i = 0; i < 180; i++) { await sleep(1000); const r = await ev('(function(){try{return CM.game && CM.game.city ? "y":"n"}catch(e){return "e"}})()'); if (r.value === 'y') break; }
  await sleep(2000);

  const out = await ev(`(function(){
    var C = CM.game.city, D = CM.MAP_LIST.filter(function(x){return x.id==="ms"})[0].data, W = C.W;
    var Z = [["含山县",20,145,95,300],["和县",145,235,30,275],["主城",235,320,130,215],["当涂",235,330,215,330],["博望",330,420,180,330]];
    var res = [];
    for (var zi = 0; zi < Z.length; zi++) {
      var nm = Z[zi][0], x0 = Z[zi][1], x1 = Z[zi][2], y0 = Z[zi][3], y1 = Z[zi][4];
      var km2 = (x1-x0)*(y1-y0)*0.0625;
      // 路网：按 bbox 中心归类
      var gs = 0, len = 0, byCls = {};
      for (var i = 0; i < C.roadGroups.length; i++) {
        var g = C.roadGroups[i], cx = (g.bbox[0]+g.bbox[2])/2, cy = (g.bbox[1]+g.bbox[3])/2;
        if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
        gs++; len += (g.len || 0);
        byCls[g.cls] = (byCls[g.cls] || 0) + 1;
      }
      // 地名
      var pl = 0, plT = {};
      for (var j = 0; j < D.places.length; j++) {
        var p = D.places[j];
        if (p[1] < x0 || p[1] > x1 || p[2] < y0 || p[2] > y1) continue;
        pl++; plT[p[3]] = (plT[p[3]] || 0) + 1;
      }
      // 人口/岗位总量（反映建成区规模）
      var pop = 0;
      for (var k = 0; k < C.N; k++) {
        var cx2 = k % W + 0.5, cy2 = ((k / W) | 0) + 0.5;
        if (cx2 < x0 || cx2 > x1 || cy2 < y0 || cy2 > y1) continue;
        pop += C.pop[k] + C.jobs[k];
      }
      res.push({ name: nm, km2: Math.round(km2), roads: gs, roadKm: +(len/1000).toFixed(1),
        roadsPer100: +(gs/km2*100).toFixed(1), roadKmPer100: +(len/1000/km2*100).toFixed(1),
        places: pl, placesPer100: +(pl/km2*100).toFixed(1), byType: plT, byCls: byCls, pop: Math.round(pop) });
    }
    var sample = C.roadGroups[0] ? Object.keys(C.roadGroups[0]) : [];
    return { res: res, roadGroups: C.roadGroups.length, places: D.places.length, gkeys: sample };
  })()`);
  if (out.error) throw new Error(out.error);
  const R = out.value.res;
  console.log('区域'.padEnd(8)+'面积km²'.padEnd(10)+'道路组'.padEnd(8)+'密度/百km²'.padEnd(12)+'地名'.padEnd(8)+'密度/百km²'.padEnd(12)+'人口');
  for (const r of R) console.log(r.name.padEnd(8)+String(r.km2).padEnd(10)+String(r.roads).padEnd(8)+String(r.roadsPer100).padEnd(12)+String(r.places).padEnd(8)+String(r.placesPer100).padEnd(12)+r.pop);
  console.log('--- 地名类型数（1=站 2=路/聚落 3=公交站 4=POI 5=地标 6=公共设施）');
  for (const r of R) console.log('  '+r.name.padEnd(8)+JSON.stringify(r.byType));
  console.log('--- 道路分级（2=支路 3=次干 4=主干）');
  for (const r of R) console.log('  '+r.name.padEnd(8)+JSON.stringify(r.byCls));
} catch (e) { console.error('FAIL', e.message); }
finally { try { child.kill(); } catch { } process.exit(0); }
