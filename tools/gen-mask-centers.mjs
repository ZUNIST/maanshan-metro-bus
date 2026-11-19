// 250 m 逐格城市掩膜：每个建成格一个中心（精度 = 一格）
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const BB={s:31.325,w:117.835,n:32.070,e:118.900};
const W=416,H=328,KX=W/(BB.e-BB.w),KY=H/(BB.n-BB.s);
const proj=(lat,lon)=>[(lon-BB.w)*KX,(BB.n-lat)*KY];
const key=p=>p.lat.toFixed(7)+','+p.lon.toFixed(7);
const load=async f=>JSON.parse(await readFile(ROOT+'/osm-cache/'+f+'.json','utf8')).elements;
function stitch(ms){const segs=ms.filter(m=>m.geometry&&m.geometry.length>1).map(m=>m.geometry.slice());const rings=[];let pool=segs;
  while(pool.length){let cur=pool.shift(),g=0;
    while(g++<20000){if(key(cur[0])===key(cur[cur.length-1]))break;const t=key(cur[cur.length-1]);let f=-1,rev=false;
      for(let i=0;i<pool.length;i++){if(key(pool[i][0])===t){f=i;break;}if(key(pool[i][pool[i].length-1])===t){f=i;rev=true;break;}}
      if(f<0)break;const add=(rev?pool[f].slice().reverse():pool[f].slice());pool.splice(f,1);cur=cur.concat(add.slice(1));}
    if(cur.length>3&&key(cur[0])===key(cur[cur.length-1]))rings.push(cur);}
  return rings;}
const adm=await load('admin');
const MA=['花山区','雨山区','博望区','当涂县','含山县','和县','沈巷镇'];   // 沈巷镇按和县的一部分处理
const MA2000=['解放路街道','湖东路街道','沙塘路街道','桃源路街道','金家庄街道','塘西街道','江东街道','慈湖街道','雨山街道','平湖街道','安民街道','采石街道','佳山乡','梅山街道','姑孰镇'];
const polysFor=names=>{const out=[];for(const e of adm){if(e.type!=='relation'||!e.tags||!names.includes(e.tags.name))continue;
  for(const r of stitch(e.members.filter(m=>m.type==='way'&&(m.role==='outer'||!m.role))))out.push(r.map(p=>proj(p.lat,p.lon)).flat());}return out;};
const MA_P=polysFor(MA), MA2000_P=polysFor(MA2000);
// 2000 年已有的镇区：距 OSM 乡镇/街道驻地 1.5 km 以内（当年这些镇区已经存在，只是规模比现在小）
const CMS={}; vm.runInNewContext(await readFile(ROOT+'/city-and-metro/js/geo_ms.js','utf8'),{window:{CM:CMS}});
const PLACES=(CMS.GEOS.ms.places||[]).filter(p=>p[3]===2);
const nearTown=(x,y)=>{for(const p of PLACES){const dx=p[1]-x,dy=p[2]-y;if(dx*dx+dy*dy<4.84)return true;}return false;};   // 2.2 km：镇区边缘也算 2000 年已有
const inPoly=(x,y,ps)=>{let hit=false;for(const p of ps){const n=p.length/2;for(let i=0,j=n-1;i<n;j=i++){const xi=p[2*i],yi=p[2*i+1],xj=p[2*j],yj=p[2*j+1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}}return hit;};

// 栅格化：每个建成格标记 res / ind / com
const cells=new Map();
const lu=await load('landuse');
let polys=0;
for(const e of lu){
  if(e.type!=='way'||!e.geometry||e.geometry.length<4)continue;
  const t=e.tags&&e.tags.landuse;
  const cls=t==='residential'?'res':t==='industrial'?'ind':(t==='commercial'||t==='retail')?'com':null;
  if(!cls)continue;
  const g=e.geometry; if(g[0].lat!==g[g.length-1].lat||g[0].lon!==g[g.length-1].lon)continue;
  const flat=[]; for(const q of g){const p=proj(q.lat,q.lon);flat.push(p[0],p[1]);}
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(let i=0;i<flat.length;i+=2){x0=Math.min(x0,flat[i]);x1=Math.max(x1,flat[i]);y0=Math.min(y0,flat[i+1]);y1=Math.max(y1,flat[i+1]);}
  if(x1<0||y1<0||x0>=W||y0>=H)continue;
  polys++;
  const i0=Math.max(0,Math.floor(x0)), i1=Math.min(W-1,Math.ceil(x1));
  const j0=Math.max(0,Math.floor(y0)), j1=Math.min(H-1,Math.ceil(y1));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    if(!inPoly(i+0.5,j+0.5,[flat]))continue;
    const k=j*W+i;
    let o=cells.get(k); if(!o)cells.set(k,o={res:0,ind:0,com:0});
    o[cls]=1;
  }
}
console.log('用地多边形', polys, '建成格（重叠去重后）', cells.size);

// 连通域过滤：农村宅基地是孤立的一两格，城镇是连片的一整块。只保留 4-邻域连通面积 >= MINC 格的块
const MINC = 3;
const seen = new Set(), keep = new Set();
const comps = [];
for (const k of cells.keys()) {
  if (seen.has(k)) continue;
  const stack = [k]; seen.add(k); const comp = [];
  while (stack.length) {
    const c = stack.pop(); comp.push(c);
    const ci = c % W;
    const nb = [ci > 0 ? c - 1 : -1, ci < W - 1 ? c + 1 : -1, c - W, c + W];
    for (const n of nb) if (n >= 0 && cells.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
  }
  comps.push(comp);
}
for (const comp of comps) if (comp.length >= MINC) for (const c of comp) keep.add(c);
const dropN = cells.size - keep.size;
for (const k of [...cells.keys()]) if (!keep.has(k)) cells.delete(k);
console.log('连通块', comps.length, '保留（≥'+MINC+' 格）', comps.filter(c=>c.length>=MINC).length,
  '剔除孤立格', dropN);

// 填补街区内部的空隙：只按地块中心栅格化时，小区内部道路、单位院落、未单独标注的地块会留下空格，
// 城区看起来像「麻点」。被 3 个以上建成格包围的空格按 0.55 的居住密度补上，城区因此连成片
let filled = 0;
for (let pass = 0; pass < 2; pass++) {
  const add = new Set();
  for (const k of cells.keys()) {
    const ci = k % W;
    const nb = [ci > 0 ? k - 1 : -1, ci < W - 1 ? k + 1 : -1, k - W, k + W];
    for (const n of nb) {
      if (n < 0 || cells.has(n) || add.has(n)) continue;
      const ni = n % W;
      const nn = [ni > 0 ? n - 1 : -1, ni < W - 1 ? n + 1 : -1, n - W, n + W].filter(function (z) { return z >= 0 && cells.has(z); });
      if (nn.length >= 3) add.add(n);
    }
  }
  for (const n of add) { cells.set(n, { res: 0.55, ind: 0, com: 0 }); filled++; }
  if (!add.size) break;
}
console.log('填补街区内部空隙', filled, '格，建成格', cells.size);

// 镇区外围补齐（v3.1）：只用 OSM 地块时，镇区在 2000 年显得过小——当年的自建房、单位院子、
// 未单独标注的宅基地都不在地块里。按 40 个乡镇驻地，把 700 m 内还没建成的格子按 0.45 的居住密度补上，
// 使每个镇区在开局就有镇子的体量（仍保留各镇相对大小的差别）
// 只补乡镇（不含市区的街道）：市区本身地块密集，再补一圈会把主城撑大
const TOWNS = JSON.parse(await readFile(ROOT + '/tools/towns-ms.json', 'utf8')).filter(function (t) { return /[镇乡]$/.test(t.name); });
let ring = 0;
for (const t of TOWNS) {
  const R = 3.7;   // 约 1 km：镇区在 2000 年再向外补一圈
  for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
    if (di * di + dj * dj > R * R) continue;
    const i = Math.round(t.x) + di, j = Math.round(t.y) + dj;
    if (i < 0 || j < 0 || i >= W || j >= H) continue;
    const k = j * W + i;
    if (cells.has(k)) continue;
    cells.set(k, { res: 0.55, ind: 0, com: 0 });
    ring++;
  }
}
console.log('镇区外围补齐', ring, '格，建成格', cells.size);

const OUT=[];
for(const [k,o] of cells){
  const i=k%W, j=(k/W)|0, x=i+0.5, y=j+0.5;
  if(!inPoly(x,y,MA_P))continue;                       // 只保留马鞍山境内
  const old=inPoly(x,y,MA2000_P)||nearTown(x,y);
  // 2000 年已开发的城区按全量，之后的开发区按 42%（2000 年尚未建设）
  const k2=old?1:0.08;   // 新区 2000 年尚未建设，密度压到阈值以下；此后靠年代增长逐步点亮
  const pop=Math.round((o.res?22000:0)+(o.com?4000:0)+(o.ind?800:0)||1800);
  const jobs=Math.round((o.ind?16000:0)+(o.com?11000:0)+(o.res?3000:0)||600);
  OUT.push({x,y,pop:Math.round(pop*k2),jobs:Math.round(jobs*k2),r:0.09,old});
}
OUT.sort((a,b)=>a.y-b.y||a.x-b.x);
await writeFile(ROOT+'/tools/centers-mask.json', JSON.stringify(OUT));
console.log('中心数', OUT.length, '其中 2000 年城区', OUT.filter(o=>o.old).length);
console.log('r=0.09，单格互不干扰；对应建成区', (OUT.length*0.0625).toFixed(1),'km²');
