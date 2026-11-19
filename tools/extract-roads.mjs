// 试验：从高德卫星瓦片提取道路中心线（当涂县城 2×2 km 试片）
// 思路：道路在影像上是「高亮度 + 低饱和 + 细长连续」的带状特征。
// 二值化 -> 去小块 -> 线状连通域筛选 -> 骨架化 -> 输出去向统计与叠加图。
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

const cx = 259, cy = 232, z = 16;          // 当涂县城核心，z16 ≈ 每格 0.5 m/px 级别
const halfG = 4;                            // ±4 格 = 约 2×2 km
const [wcx, wcy] = g2px(cx, cy, z);
const cw = g2px(cx + 1, cy, z)[0] - wcx;
const W = Math.round(cw * halfG * 2), H = W;
const left = wcx - W / 2, top = wcy - H / 2;
const tx0 = Math.floor(left / 256), tx1 = Math.floor((left + W) / 256);
const ty0 = Math.floor(top / 256), ty1 = Math.floor((top + H) / 256);
const tiles = [];
for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tiles.push({ tx, ty });

if (!existsSync(CACHE)) await mkdir(CACHE, { recursive: true });
console.log(`试片 ${W}×${H}px, z${z}, 瓦片 ${tiles.length} 张`);
for (const t of tiles) {
  const f = `${CACHE}/${z}_${t.tx}_${t.ty}.jpg`;
  if (existsSync(f)) continue;
  const url = `https://webst0${1 + ((t.tx + t.ty) % 4)}.is.autonavi.com/appmaptile?style=6&x=${t.tx}&y=${t.ty}&z=${z}`;
  for (let k = 0; k < 5; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.amap.com/' } });
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > 800) { await writeFile(f, b); break; }
    } catch { await new Promise(r => setTimeout(r, 600 * (k + 1))); }
  }
}

const tileList = tiles.map(t => ({ u: `${z}_${t.tx}_${t.ty}.jpg`, l: t.tx * 256 - left, t: t.ty * 256 - top }));
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#111}</style></head><body>
<canvas id="src" width="${W}" height="${H}"></canvas><canvas id="out" width="${W}" height="${H}"></canvas><div id="st">working</div>
<script>
const T=${JSON.stringify(tileList)};
const W=${W},H=${H};
const S=document.getElementById('src'),SC=S.getContext('2d',{willReadFrequently:true});
const O=document.getElementById('out'),OC=O.getContext('2d');
const load=u=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src='tools/_sat/'+u;});
(async()=>{
  for(const t of T){ try{ const im=await load(t.u); SC.drawImage(im,t.l,t.t); }catch(e){} }
  const img=SC.getImageData(0,0,W,H), d=img.data;
  // 1) 道路候选：高亮度 + 低饱和（灰白），且不是纯白屋顶（>235）
  const bin=new Uint8Array(W*H);
  for(let i=0,p=0;i<d.length;i+=4,p++){
    const r=d[i],g=d[i+1],b=d[i+2];
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    const lum=0.299*r+0.587*g+0.114*b;
    const sat=mx-mn;
    bin[p]=(lum>92 && lum<232 && sat<26)?1:0;
  }
  // 2) 形态学：腐蚀 1 次去孤立点，再膨胀补洞
  const er=new Uint8Array(W*H), di=new Uint8Array(W*H);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const p=y*W+x;
    if(!bin[p]) continue;
    let n=0; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) n+=bin[p+dy*W+dx];
    if(n>=6) er[p]=1;
  }
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const p=y*W+x; if(!er[p]) continue;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) di[p+dy*W+dx]=1;
  }
  // 3) 连通域：按「面积/周长²」判断线状，保留细长的
  const lab=new Int32Array(W*H).fill(-1); let comps=0; const info=[];
  const stack=[];
  for(let p=0;p<W*H;p++){
    if(!di[p]||lab[p]>=0) continue;
    const id=comps++; let area=0,minx=1e9,maxx=-1,miny=1e9,maxy=-1;
    stack.length=0; stack.push(p); lab[p]=id;
    while(stack.length){
      const q=stack.pop(); const x=q%W,y=(q/W)|0;
      area++; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue;
        const nq=ny*W+nx; if(di[nq]&&lab[nq]<0){ lab[nq]=id; stack.push(nq); }
      }
    }
    const w=maxx-minx+1,h=maxy-miny+1;
    info.push({id,area,w,h,elong:Math.max(w,h)/Math.max(1,Math.min(w,h))});
  }
  // 保留：足够长 + 细长比高（道路）
  const keep=new Uint8Array(comps);
  let kept=0;
  for(const c of info){ if(c.area>=140 && c.elong>=2.6 && Math.max(c.w,c.h)>=34){ keep[c.id]=1; kept++; } }
  // 4) 输出：原图淡化 + 提取结果高亮
  OC.globalAlpha=0.35; OC.drawImage(S,0,0); OC.globalAlpha=1;
  const ov=OC.getImageData(0,0,W,H), od=ov.data;
  for(let p=0;p<W*H;p++){
    if(keep[lab[p]]){
      const i=p*4; od[i]=255; od[i+1]=60; od[i+2]=40; od[i+3]=255;
    }
  }
  OC.putImageData(ov,0,0);
  document.getElementById('st').textContent='comps '+comps+' kept '+kept;
  window.__stat={comps,kept};
})();
</script></body></html>`;

const htmlPath = ROOT + '/extract-test.html';
await writeFile(htmlPath, html, 'utf8');

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  `--window-size=${Math.min(W, 1400)},${Math.min(H, 1000)}`, '--remote-debugging-port=9339',
  `--user-data-dir=${ROOT}/.chromeprof-extract`, 'about:blank'], { stdio: 'ignore' });
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
  for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch('http://127.0.0.1:9339/json')).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + htmlPath.replace(/\\/g, '/') });
  await sleep(1500);
  for (let i = 0; i < 60; i++) { await sleep(600); const r = await ev('document.getElementById("st").textContent'); if (/kept/.test(r.value || '')) break; }
  console.log('统计:', JSON.stringify((await ev('window.__stat')).value));
  const du = await ev('document.getElementById("out").toDataURL("image/jpeg",0.85)');
  if (du.value && du.value.startsWith('data:')) { await writeFile(ROOT + '/试验-道路提取.jpg', Buffer.from(du.value.split(',')[1], 'base64')); console.log('输出 试验-道路提取.jpg'); }
  else console.log('导出失败', du.error);
} catch (e) { console.error('FAIL', e.message); }
finally { try { child.kill(); } catch { } process.exit(0); }
