// 下载高德卫星瓦片并对每个 250 m 游戏格做建成区识别（亮度/绿度/纹理），
// 输出栅格 JSON 与「自动识别 vs 现有建成格」对照图。
// 用法：node tools/sat-scan.mjs <preset>
// preset: wujiang | zpg | edz | hexian
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const CACHE = ROOT + '/tools/_sat';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PR = { lon0: 117.835, lat0: 32.07, kx: 390.61, ky: 440.27 };
const g2ll = (gx, gy) => [PR.lon0 + gx / PR.kx, PR.lat0 - gy / PR.ky];
const worldPx = (lon, lat, z) => {
  const n = 256 * Math.pow(2, z);
  return [(lon + 180) / 360 * n, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n];
};
const g2px = (gx, gy, z) => worldPx(...g2ll(gx, gy), z);

const PRESETS = {
  wujiang: { box: [230, 256, 80, 128], z: 15 },
  zpg: { box: [174, 210, 180, 216], z: 15 },
  edz: { box: [192, 220, 128, 168], z: 15 },
  laoqiao: { box: [178, 198, 196, 214], z: 15 },
  hexian: { box: [150, 262, 60, 245], z: 13 },
};

const preset = process.argv[2] || 'hexian';
const P = PRESETS[preset];
if (!P) { console.error('未知 preset'); process.exit(1); }
const [bx0, bx1, by0, by1] = P.box;
const z = P.z;

// 视口：以 box 中心为中心
const ccx = (bx0 + bx1) / 2, ccy = (by0 + by1) / 2;
const [wcx, wcy] = g2px(ccx, ccy, z);
const cw = g2px(ccx + 1, ccy, z)[0] - wcx;   // 每格横向像素
const ch = g2px(ccx, ccy + 1, z)[1] - wcy;   // 每格纵向像素
const W = Math.ceil((bx1 - bx0) * cw) + 8;
const H = Math.ceil((by1 - by0) * ch) + 8;
const left = wcx - (ccx - bx0) * cw - 4;
const top = wcy - (ccy - by0) * ch - 4;

const tx0 = Math.floor(left / 256), tx1 = Math.floor((left + W) / 256);
const ty0 = Math.floor(top / 256), ty1 = Math.floor((top + H) / 256);
const tiles = [];
for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tiles.push({ tx, ty });

if (!existsSync(CACHE)) await mkdir(CACHE, { recursive: true });
console.log('tiles:', tiles.length, 'viewport', W, 'x', H, 'cellPx', cw.toFixed(1), ch.toFixed(1));

// 下载（并发 3，已存在则跳过；限流时指数退避）
let done = 0, failed = 0;
async function dl(t) {
  const f = `${CACHE}/${z}_${t.tx}_${t.ty}.jpg`;
  if (existsSync(f)) { done++; return; }
  const url = `https://webst0${1 + ((t.tx + t.ty) % 4)}.is.autonavi.com/appmaptile?style=6&x=${t.tx}&y=${t.ty}&z=${z}`;
  for (let k = 0; k < 6; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.amap.com/' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length < 800) throw new Error('too small');
      await writeFile(f, b); done++; return;
    } catch (e) {
      if (k === 5) { failed++; console.error('fail', t.tx, t.ty, e.message); return; }
      await new Promise(r => setTimeout(r, 700 * Math.pow(2, k)));
    }
  }
}
const queue = tiles.slice();
await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) { await dl(queue.shift()); } }));
console.log('downloaded:', done, '/', tiles.length, 'failed:', failed);

// 读 center 数据，供对照
const { readFile } = await import('node:fs/promises');
const vm = await import('node:vm');
const CM = { GEOS: {}, U: { gcj2wgs: (a, b) => [a, b] }, DATA: { plans: {} }, CFG: { growth: {}, cost: {} }, MAP_LIST: [] };
const ctx = { window: { CM }, CM };
vm.runInNewContext(await readFile(ROOT + '/city-and-metro/js/geo_ms.js', 'utf8'), ctx);
vm.runInNewContext(await readFile(ROOT + '/city-and-metro/js/data_ms.js', 'utf8'), ctx);
const D = CM.MAP_LIST.find(x => x.id === 'ms').data;
const centers = D.centers;

const tileList = tiles.map(t => ({ u: `${z}_${t.tx}_${t.ty}.jpg`, l: t.tx * 256 - left, t: t.ty * 256 - top }));
const cellInfo = { bx0, by0, cw, ch, W, H };

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#0b1117}</style></head>
<body><canvas id="cv" width="${W}" height="${H}"></canvas><div id="st">working</div>
<script>
const TILES = ${JSON.stringify(tileList)};
const CI = ${JSON.stringify(cellInfo)};
const CUR = ${JSON.stringify(centers.filter(c => c.x >= bx0 - 1 && c.x <= bx1 + 1 && c.y >= by0 - 1 && c.y <= by1 + 1))};
const CV = document.getElementById('cv'), CTX = CV.getContext('2d', { willReadFrequently: true });
function load(u){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src='tools/_sat/'+u;});}
(async()=>{
  let n=0;
  for(const t of TILES){ try{ const im=await load(t.u); CTX.drawImage(im,t.l,t.t); n++; }catch(e){} }
  document.getElementById('st').textContent='loaded '+n;
  window.__tiles=n;
  window.__scan = function(){
    const img = CTX.getImageData(0,0,CI.W,CI.H).data;
    const out=[];
    for(let gy=${by0}; gy<${by1}; gy++){
      for(let gx=${bx0}; gx<${bx1}; gx++){
        const x0 = Math.round((gx-CI.bx0)*CI.cw)+2, y0=Math.round((gy-CI.by0)*CI.ch)+2;
        const x1 = x0 + Math.max(3,Math.round(CI.cw)-4), y1 = y0 + Math.max(3,Math.round(CI.ch)-4);
        let sr=0,sg=0,sb=0,cnt=0, lum2=0, s2=0, gcnt=0, bcnt=0;
        const lums=[];
        for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){
          const i=(y*CI.W+x)*4; const r=img[i],g=img[i+1],b=img[i+2];
          sr+=r; sg+=g; sb+=b; cnt++;
          const l=0.299*r+0.587*g+0.114*b; lums.push(l); lum2+=l;
          if (g > r+10 && g > b+10) gcnt++;          // 植被像素
          if (l > 105) bcnt++;                        // 高亮像素（屋顶/硬化面）
        }
        if(!cnt){out.push([gx,gy,0,0,0,0,0,0]);continue;}
        const mr=sr/cnt, mg=sg/cnt, mb=sb/cnt, ml=lum2/cnt;
        if (ml < 15) { out.push([gx,gy, 0,0,0,-1,0,0]); continue; }   // 瓦片缺失
        for(const l of lums) s2+=(l-ml)*(l-ml);
        const sd=Math.sqrt(s2/cnt);
        const green = mg-(mr+mb)/2;
        const gp = gcnt/cnt, lp = bcnt/cnt;           // 绿像素占比、亮像素占比
        // 建成区判据：高亮硬化面占比高、同时植被覆盖明显低于农田
        const built = (lp > 0.30 && gp < 0.88) ? 1 : 0;
        out.push([gx,gy, +ml.toFixed(0), +green.toFixed(0), +sd.toFixed(0), built, +gp.toFixed(2), +lp.toFixed(2)]);
      }
    }
    window.__result = out;
    return out;
  };
  window.__render = function(){
    const out = window.__result || window.__scan();
    const map = {}; for(const c of out) map[c[0]+','+c[1]] = c;
    CTX.save();
    // 自动识别：绿色填充
    for(const c of out){ if(c[5]!==1) continue;
      const X=(c[0]-CI.bx0)*CI.cw, Y=(c[1]-CI.by0)*CI.ch;
      CTX.fillStyle='rgba(0,255,120,0.30)'; CTX.fillRect(X,Y,CI.cw,CI.ch);
    }
    // 现有 centers：红色描边
    CTX.strokeStyle='rgba(255,45,60,0.95)'; CTX.lineWidth=2.4;
    for(const c of CUR){
      const X=(c.x-0.5-CI.bx0)*CI.cw, Y=(c.y-0.5-CI.by0)*CI.ch;
      CTX.strokeRect(X+0.6,Y+0.6,CI.cw-1.2,CI.ch-1.2);
    }
    // 坐标刻度
    CTX.font='bold 15px sans-serif'; CTX.lineWidth=3; CTX.strokeStyle='#000'; CTX.fillStyle='#fff';
    for(let gx=Math.ceil(CI.bx0/10)*10; gx<CI.bx0+(CI.W/CI.cw); gx+=10){
      const X=(gx-CI.bx0)*CI.cw;
      CTX.beginPath(); CTX.moveTo(X,0); CTX.lineTo(X,CI.H); CTX.lineWidth=1.2; CTX.strokeStyle='rgba(255,255,255,.35)'; CTX.stroke();
      CTX.lineWidth=3; CTX.strokeStyle='#000'; CTX.fillStyle='#ffe66d';
      CTX.strokeText('x'+gx, X+3, 22); CTX.fillText('x'+gx, X+3, 22);
      CTX.strokeStyle='rgba(255,45,60,0.95)'; CTX.lineWidth=2.4;
    }
    for(let gy=Math.ceil(CI.by0/10)*10; gy<CI.by0+(CI.H/CI.ch); gy+=10){
      const Y=(gy-CI.by0)*CI.ch;
      CTX.beginPath(); CTX.moveTo(0,Y); CTX.lineTo(CI.W,Y); CTX.lineWidth=1.2; CTX.strokeStyle='rgba(255,255,255,.35)'; CTX.stroke();
      CTX.lineWidth=3; CTX.strokeStyle='#000'; CTX.fillStyle='#ffe66d';
      CTX.strokeText('y'+gy, 4, Y-4); CTX.fillText('y'+gy, 4, Y-4);
      CTX.strokeStyle='rgba(255,45,60,0.95)'; CTX.lineWidth=2.4;
    }
    CTX.restore();
    return 'ok';
  };
})();
</script></body></html>`;

const htmlPath = ROOT + `/scan-${preset}.html`;
await writeFile(htmlPath, html, 'utf8');

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  `--window-size=${Math.min(W, 1600)},${Math.min(H, 1000)}`, '--remote-debugging-port=9335',
  `--user-data-dir=${ROOT}/.chromeprof-scan`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '') };
  return { value: r.result.value };
};
let scan = null;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) { await sleep(400); try { const l = await (await fetch('http://127.0.0.1:9335/json')).json(); target = l.find(t => t.type === 'page'); } catch { } }
  if (!target) throw new Error('CDP 未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + htmlPath.replace(/\\/g, '/') });
  await sleep(1500);
  for (let i = 0; i < 90; i++) { await sleep(600); const r = await evaluate('(function(){var s=document.getElementById("st");return s?s.textContent:""})()'); if (/loaded/.test(r.value || '')) break; }
  const r = await evaluate('JSON.stringify(window.__scan ? window.__scan() : null)');
  if (r.value) scan = JSON.parse(r.value);
  await evaluate('window.__render && window.__render()');
  const du = await evaluate('document.getElementById("cv").toDataURL("image/jpeg",0.8)');
  if (du.value && du.value.startsWith('data:')) {
    await writeFile(ROOT + `/扫描-${preset}.jpg`, Buffer.from(du.value.split(',')[1], 'base64'));
    console.log('预览图已保存: 扫描-' + preset + '.jpg');
  } else console.error('导出失败:', du.error || (du.value || '').slice(0, 80));
} catch (e) { console.error('FAIL', e.message); }
finally { try { child.kill(); } catch { } }

if (scan) {
  // 连通域过滤：剔除孤立的单格/双格误判，只保留 >=3 格的连片建成区
  const key = c => c[0] + ',' + c[1];
  const set = new Set(scan.filter(c => c[5] === 1).map(key));
  const seen = new Set(); const comps = [];
  for (const k of set) {
    if (seen.has(k)) continue;
    const stack = [k], comp = [];
    seen.add(k);
    while (stack.length) {
      const cur = stack.pop(); comp.push(cur);
      const [x, y] = cur.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = (x + dx) + ',' + (y + dy);
        if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    comps.push(comp);
  }
  const keep = new Set();
  for (const c of comps) if (c.length >= 3) for (const k of c) keep.add(k);
  const filtered = scan.map(c => (c[5] === 1 && !keep.has(key(c))) ? [c[0], c[1], c[2], c[3], c[4], 0, c[6], c[7]] : c);
  await writeFile(`${ROOT}/tools/sat-scan-${preset}.json`, JSON.stringify({ preset, box: [bx0, bx1, by0, by1], z, cells: filtered }), 'utf8');
  const built = filtered.filter(c => c[5] === 1);
  console.log(`识别 ${scan.filter(c => c[5] === 1).length} 格，连通域过滤后 ${built.length} 格（${comps.filter(c => c.length >= 3).length} 个连片）`);
  const grid = {};
  for (const c of built) { const k = Math.floor((c[0] - bx0) / 10) + ',' + Math.floor((c[1] - by0) / 10); grid[k] = (grid[k] || 0) + 1; }
  console.log('建成格密度（10x10 分块计数）:');
  const keys = Object.keys(grid).sort((a, b) => { const [ax, ay] = a.split(',').map(Number), [bx2, by2] = b.split(',').map(Number); return ay - by2 || ax - bx2; });
  for (const k of keys) {
    const [ax, ay] = k.split(',').map(Number);
    console.log(`  x${bx0 + ax * 10}-${bx0 + ax * 10 + 9} y${by0 + ay * 10}-${by0 + ay * 10 + 9}: ${grid[k]}`);
  }
}
process.exit(0);
