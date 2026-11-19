// 用 OSM landuse 多边形聚合出真实建成区，生成 centers 数组片段
import { readFile, writeFile } from 'node:fs/promises';
const BBOX={s:31.325,w:117.835,n:32.070,e:118.900};
const W=416,H=328,KX=W/(BBOX.e-BBOX.w),KY=H/(BBOX.n-BBOX.s);
const proj=(lat,lon)=>[(lon-BBOX.w)*KX,(BBOX.n-lat)*KY];
const BLK=8;                       // 2 km 聚合块
const BW=Math.ceil(W/BLK), BH=Math.ceil(H/BLK);

const raw=JSON.parse(await readFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/osm-cache/landuse.json','utf8')).elements;
// 用格坐标计算多边形面积（格²，1 格 = 0.0625 km²）
function area(ring){ let a=0; const n=ring.length/2; for(let i=0;i<n;i++){ const j=(i+1)%n; a+=ring[2*i]*ring[2*j+1]-ring[2*j]*ring[2*i+1]; } return Math.abs(a)/2; }
const acc=new Map();   // key -> {res,ind,com,ret,con}
const put=(k,cls,v)=>{ let o=acc.get(k); if(!o) acc.set(k,o={res:0,ind:0,com:0,ret:0,con:0,pop:0,jobs:0}); o[cls]+=v; };
let used=0, skipped=0;
for(const e of raw){
  if(e.type!=='way'||!e.geometry||e.geometry.length<4) { skipped++; continue; }
  const g=e.geometry; if(g[0].lat!==g[g.length-1].lat||g[0].lon!==g[g.length-1].lon){ skipped++; continue; }
  const flat=new Float64Array(g.length*2);
  for(let i=0;i<g.length;i++){ const p=proj(g[i].lat,g[i].lon); flat[2*i]=p[0]; flat[2*i+1]=p[1]; }
  const a=area(flat); if(!(a>0)) { skipped++; continue; }
  const lu=e.tags.landuse;
  const cls = lu==='residential'?'res': lu==='industrial'?'ind': (lu==='commercial'||lu==='retail')?'com': 'con';
  // 质心
  let cx=0,cy=0; for(let i=0;i<flat.length;i+=2){ cx+=flat[i]; cy+=flat[i+1]; } cx/=flat.length/2; cy/=flat.length/2;
  if(cx<0||cy<0||cx>=W||cy>=H) continue;
  const bi=Math.min(BW-1,Math.max(0,Math.floor(cx/BLK))), bj=Math.min(BH-1,Math.max(0,Math.floor(cy/BLK)));
  put(bj*BW+bi, cls, a);
  used++;
}
const rows=[];
for(const [k,o] of acc){
  const km2=(o.res+o.ind+o.com)*0.0625;
  if(km2<0.5) continue;                       // 2 km 块内建成区不足 0.5 km² 的不设中心
  const bi=k%BW, bj=(k/BW)|0;
  const x=+(bi*BLK+BLK/2).toFixed(1), y=+(bj*BLK+BLK/2).toFixed(1);
  rows.push({x,y,km2:+km2.toFixed(2),res:+(o.res*0.0625).toFixed(2),ind:+(o.ind*0.0625).toFixed(2),com:+(o.com*0.0625).toFixed(2)});
}
rows.sort((a,b)=>b.km2-a.km2);
console.log('landuse 要素', raw.length, '使用', used, '跳过', skipped, '块数', acc.size, '合格中心', rows.length);
console.log('建成区总面积 km²', rows.reduce((s,r)=>s+r.km2,0).toFixed(1));
console.log('前 12 :', rows.slice(0,12).map(r=>`(${r.x},${r.y}) ${r.km2}km²`).join('  '));
await writeFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/tools/centers-ms.json', JSON.stringify(rows));
