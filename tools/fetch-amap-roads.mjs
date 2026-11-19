// 从高德 style=8 路网瓦片提取道路中心线（试验/生产两用）
// - 瓦片是透明底 + 浅灰道路线 + 深色文字，按 alpha 与亮度即可分割
// - Zhang-Suen 骨架化 -> 端点/分叉点间的折线追踪 -> Douglas-Peucker 简化
// 用法：node tools/fetch-amap-roads.mjs <preset>
// preset: test（当涂县城 3×3 瓦片） | dutu | bowang | hexian
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const ROOT = 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const CACHE = ROOT + '/tools/_roadtile';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PR = { lon0: 117.835, lat0: 32.07, kx: 390.61, ky: 440.27 };
const g2ll = (gx, gy) => [PR.lon0 + gx / PR.kx, PR.lat0 - gy / PR.ky];
const worldPx = (lon, lat, z) => {
  const n = 256 * Math.pow(2, z);
  return [(lon + 180) / 360 * n, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n];
};
const g2px = (gx, gy, z) => worldPx(...g2ll(gx, gy), z);
const px2g = (px, py, z) => {
  const n = 256 * Math.pow(2, z);
  const lon = px / n * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * py / n))) * 180 / Math.PI;
  return [(lon - PR.lon0) * PR.kx, (PR.lat0 - lat) * PR.ky];
};

const PRESETS = {
  test: { box: [254, 264, 227, 237], z: 15 },     // 当涂县城 10×10 格
  dutu: { box: [236, 330, 214, 300], z: 14 },     // 当涂县大部份
  bowang: { box: [330, 410, 180, 300], z: 14 },   // 博望区
  hexian: { box: [145, 235, 30, 275], z: 14 },    // 和县（含沈巷），含山不取（OSM 已很密）
};
const preset = process.argv[2] || 'test';
const P = PRESETS[preset];
if (!P) { console.error('未知 preset'); process.exit(1); }
const [bx0, bx1, by0, by1] = P.box, z = P.z;

const [p0x, p0y] = g2px(bx0, by0, z), [p1x, p1y] = g2px(bx1, by1, z);
const left = p0x, top = p0y, W = Math.round(p1x - p0x), H = Math.round(p1y - p0y);
const tx0 = Math.floor(left / 256), tx1 = Math.floor((left + W) / 256);
const ty0 = Math.floor(top / 256), ty1 = Math.floor((top + H) / 256);
const tiles = [];
for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) tiles.push({ tx, ty });
console.log(`区域 ${bx0}-${bx1} × ${by0}-${by1} 格，z${z}，画布 ${W}×${H}px，瓦片 ${tiles.length} 张`);

if (!existsSync(CACHE)) await mkdir(CACHE, { recursive: true });
let dl = 0, fail = 0;
async function get(t) {
  const f = `${CACHE}/8_${z}_${t.tx}_${t.ty}.png`;
  if (existsSync(f)) return;
  const url = `https://webst0${1 + ((t.tx + t.ty) % 4)}.is.autonavi.com/appmaptile?style=8&x=${t.tx}&y=${t.ty}&z=${z}`;
  for (let k = 0; k < 5; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.amap.com/' } });
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length < 600) throw new Error('small');
      await writeFile(f, b); dl++; return;
    } catch (e) { if (k === 4) { fail++; console.error('fail', t.tx, t.ty); } await new Promise(r => setTimeout(r, 500 * (k + 1))); }
  }
}
const queue = tiles.slice();
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) await get(queue.shift()); }));
console.log(`下载完成 ${dl} 张，失败 ${fail}`);

const tileList = tiles.map(t => ({ u: `8_${z}_${t.tx}_${t.ty}.png`, l: t.tx * 256 - left, t: t.ty * 256 - top }));

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head>
<body><canvas id="src" width="${W}" height="${H}"></canvas><canvas id="out" width="${W}" height="${H}"></canvas><div id="st">working</div>
<script>
const T=${JSON.stringify(tileList)}, W=${W}, H=${H};
const S=document.getElementById('src'),SC=S.getContext('2d',{willReadFrequently:true});
const O=document.getElementById('out'),OC=O.getContext('2d');
const load=u=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src='tools/_roadtile/'+u;});
function zhangSuen(bin,w,h){
  const img=new Uint8Array(bin), del=[];
  let changed=true, guard=0;
  const P=(x,y)=>img[y*w+x];
  while(changed&&guard++<60){
    changed=false;
    for(let step=0;step<2;step++){
      del.length=0;
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        if(!P(x,y))continue;
        const p2=P(x,y-1),p3=P(x+1,y-1),p4=P(x+1,y),p5=P(x+1,y+1),p6=P(x,y+1),p7=P(x-1,y+1),p8=P(x-1,y),p9=P(x-1,y-1);
        const B=p2+p3+p4+p5+p6+p7+p8+p9;
        if(B<2||B>6)continue;
        const seq=[p2,p3,p4,p5,p6,p7,p8,p9,p2];
        let A=0; for(let i=0;i<8;i++) if(seq[i]===0&&seq[i+1]===1)A++;
        if(A!==1)continue;
        if(step===0){ if(p2*p4*p6!==0)continue; if(p4*p6*p8!==0)continue; }
        else { if(p2*p4*p8!==0)continue; if(p2*p6*p8!==0)continue; }
        del.push(y*w+x);
      }
      for(const q of del){ img[q]=0; changed=true; }
    }
  }
  return img;
}
(async()=>{
  for(const t of T){ try{ const im=await load(t.u); SC.drawImage(im,t.l,t.t); }catch(e){} }
  const img=SC.getImageData(0,0,W,H), d=img.data;
  // 道路掩膜：有内容(alpha>40) 且 亮度在浅灰区间（排除深色文字/彩色图标）
  const bin=new Uint8Array(W*H);
  for(let i=0,p=0;i<d.length;i+=4,p++){
    const a=d[i+3]; if(a<40) continue;                      // 透明背景
    const r=d[i],g=d[i+1],b=d[i+2];
    const lum=0.299*r+0.587*g+0.114*b;
    if(lum<186) continue;                                    // 地名文字是浅灰(#aaa 左右)，比道路线暗一档
    if(r>190 && g<90 && b<90) continue;                      // 纯红 = POI 图标
    if(b>170 && r<130 && g<160) continue;                    // 纯蓝 = POI 图标
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    const gray = (mx-mn)<34 && lum>190 && lum<254;           // 次干道 / 支路：浅灰
    const warm = r>195 && b<205 && r>b+18 && g>110;          // 主干道 / 快速路：黄、橙
    if(gray||warm) bin[p]=1;
  }
  // 连通域过滤：路名文字、POI 图标都是小块（每个字几十像素），路网是几万像素的大连通域。
  // 先按面积剔掉小块，再做膨胀，否则文字会被膨胀粘到路网上。
  {
    const lab=new Int32Array(W*H).fill(-1);
    const st=[];
    for(let p0=0;p0<W*H;p0++){
      if(!bin[p0]||lab[p0]>=0) continue;
      const id=p0; let area=0;
      st.length=0; st.push(p0); lab[p0]=id;
      while(st.length){
        const q=st.pop(); const x=q%W,y=(q/W)|0; area++;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;
          const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue;
          const nq=ny*W+nx; if(bin[nq]&&lab[nq]<0){lab[nq]=id;st.push(nq);}
        }
      }
      if(area<320){ for(let q=0;q<W*H;q++) if(lab[q]===id) bin[q]=0; }
    }
  }
  // 膨胀一次，补上抗锯齿造成的细线缺口（骨架化后仍是一条线）
  {
    const tmp=new Uint8Array(W*H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const p=y*W+x; if(!bin[p])continue;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue;
        tmp[ny*W+nx]=1;
      }
    }
    bin.set(tmp);
  }
  const sk=zhangSuen(bin,W,H);
  // 端点/分叉点
  const isNode=new Uint8Array(W*H);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const p=y*W+x; if(!sk[p])continue;
    let n=0; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; if(sk[p+dy*W+dx])n++; }
    if(n!==2) isNode[p]=1;
  }
  // 追踪折线
  const segs=[]; const used=new Uint8Array(W*H);
  const nbrs=(x,y)=>{ const r=[]; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H)continue; const q=ny*W+nx; if(sk[q])r.push([nx,ny,q]); } return r; };
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const p=y*W+x; if(!sk[p]||!isNode[p])continue;
    for(const [nx,ny,nq] of nbrs(x,y)){
      if(used[nq])continue;
      const path=[[x,y]]; let cx=nx,cy=ny,cq=nq; used[nq]=1;
      while(true){
        path.push([cx,cy]);
        if(isNode[cq])break;
        const ns=nbrs(cx,cy).filter(([,,q])=>!used[q]&&q!==cq);
        if(ns.length!==1)break;
        const [ax,ay,aq]=ns[0]; used[aq]=1; cx=ax;cy=ay;cq=aq;
      }
      if(path.length>=4) segs.push(path);
    }
  }
  // Douglas-Peucker
  const dp=(pts,eps)=>{
    if(pts.length<3) return pts;
    const [x1,y1]=pts[0],[x2,y2]=pts[pts.length-1];
    let mi=0,md=0;
    const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1;
    for(let i=1;i<pts.length-1;i++){
      const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+x2*y1-y2*x1)/L;
      if(d>md){md=d;mi=i;}
    }
    if(md<=eps) return [pts[0],pts[pts.length-1]];
    return dp(pts.slice(0,mi+1),eps).slice(0,-1).concat(dp(pts.slice(mi),eps));
  };
  const out=[];
  for(const seg of segs){
    // 按实际折线长度筛选：路名文字被骨架化成十几到几十像素的轮廓环，
    // 只保留 70px 以上（z15 下约 340 m）的线段，得到的正好是骨架路网
    let L=0;
    for(let i=1;i<seg.length;i++) L+=Math.hypot(seg[i][0]-seg[i-1][0], seg[i][1]-seg[i-1][1]);
    if(L < 16) continue;
    // 路名文字被骨架化成闭合或近乎闭合的小环，道路段则是开放的
    const gap=Math.hypot(seg[0][0]-seg[seg.length-1][0], seg[0][1]-seg[seg.length-1][1]);
    if(gap < 4.5 && L < 130) continue;
    const simp=dp(seg,1.6);
    out.push(simp.map(([x,y])=>[x,y]));
  }
  // 画结果
  OC.fillStyle='#fff'; OC.fillRect(0,0,W,H);
  OC.globalAlpha=0.25; OC.drawImage(S,0,0); OC.globalAlpha=1;
  OC.strokeStyle='#e01b1b'; OC.lineWidth=1.4;
  for(const s of out){ OC.beginPath(); OC.moveTo(s[0][0],s[0][1]); for(let i=1;i<s.length;i++)OC.lineTo(s[i][0],s[i][1]); OC.stroke(); }
  document.getElementById('st').textContent='segs '+out.length;
  window.__segs=out; window.__stat={mask:bin.reduce((a,b)=>a+b,0),skel:sk.reduce((a,b)=>a+b,0),segs:out.length};
})();
</script></body></html>`;

const htmlPath = ROOT + '/_roadtest.html';
await writeFile(htmlPath, html, 'utf8');

const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  `--window-size=${Math.min(W, 1500)},${Math.min(H, 1000)}`, '--remote-debugging-port=9341',
  `--user-data-dir=${ROOT}/.chromeprof-roadtile`, 'about:blank'], { stdio: 'ignore' });
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
  for (let i = 0; i < 60 && !t; i++) { await sleep(400); try { const l = await (await fetch('http://127.0.0.1:9341/json')).json(); t = l.find(x => x.type === 'page'); } catch { } }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + htmlPath.replace(/\\/g, '/') });
  await sleep(1200);
  for (let i = 0; i < 120; i++) { await sleep(800); const r = await ev('document.getElementById("st").textContent'); if (/segs/.test(r.value || '')) break; }
  const stat = await ev('window.__stat');
  console.log('统计:', JSON.stringify(stat.value));
  const data = await ev('JSON.stringify(window.__segs)');
  if (data.value) {
    const segs = JSON.parse(data.value);
    // 像素 -> 游戏格
    const gj = segs.map(s => s.map(([x, y]) => px2g(left + x, top + y, z).map(v => +v.toFixed(2))));
    await writeFile(`${ROOT}/tools/amap-roads-${preset}.json`, JSON.stringify({ preset, box: P.box, z, left, top, segs: gj }), 'utf8');
    console.log('折线:', gj.length, ' 已写入 tools/amap-roads-' + preset + '.json');
  }
  const du = await ev('document.getElementById("out").toDataURL("image/jpeg",0.85)');
  if (du.value && du.value.startsWith('data:')) { await writeFile(`${ROOT}/试验-高德路网-${preset}.jpg`, Buffer.from(du.value.split(',')[1], 'base64')); console.log('图已保存'); }
} catch (e) { console.error('FAIL', e.message); }
finally { try { child.kill(); } catch { } process.exit(0); }
