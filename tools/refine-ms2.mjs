// 1 km 网格精细版：建成区中心（精度 4 倍）+ 面积标定
import { readFile, writeFile } from 'node:fs/promises';
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
const MA=['花山区','雨山区','博望区','当涂县','含山县','和县'];
const MA2000=['解放路街道','湖东路街道','沙塘路街道','桃源路街道','金家庄街道','塘西街道','江东街道','慈湖街道','雨山街道','平湖街道','安民街道','采石街道','佳山乡','梅山街道','姑孰镇'];
const polysFor=names=>{const out=[];for(const e of adm){if(e.type!=='relation'||!e.tags||!names.includes(e.tags.name))continue;
  for(const r of stitch(e.members.filter(m=>m.type==='way'&&(m.role==='outer'||!m.role))))out.push(r.map(p=>proj(p.lat,p.lon)).flat());}return out;};
const MA_P=polysFor(MA), MA2000_P=polysFor(MA2000);
const inPoly=(x,y,ps)=>{let hit=false;for(const p of ps){const n=p.length/2;for(let i=0,j=n-1;i<n;j=i++){const xi=p[2*i],yi=p[2*i+1],xj=p[2*j],yj=p[2*j+1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}}return hit;};

const lu=await load('landuse');
const areaOf=r=>{let a=0;const n=r.length/2;for(let i=0;i<n;i++){const j=(i+1)%n;a+=r[2*i]*r[2*j+1]-r[2*j]*r[2*i+1];}return Math.abs(a)/2;};
const BLK=4;                                  // 1 km
const BW=Math.ceil(W/BLK), BH=Math.ceil(H/BLK);
const acc=new Map();
for(const e of lu){
  if(e.type!=='way'||!e.geometry||e.geometry.length<4)continue;
  const g=e.geometry; if(g[0].lat!==g[g.length-1].lat||g[0].lon!==g[g.length-1].lon)continue;
  const flat=new Float64Array(g.length*2);
  for(let i=0;i<g.length;i++){const p=proj(g[i].lat,g[i].lon);flat[2*i]=p[0];flat[2*i+1]=p[1];}
  const a=areaOf(flat); if(!(a>0))continue;
  const t=e.tags.landuse;
  const cls=t==='residential'?'res':t==='industrial'?'ind':(t==='commercial'||t==='retail')?'com':null;
  if(!cls)continue;
  let cx=0,cy=0;for(let i=0;i<flat.length;i+=2){cx+=flat[i];cy+=flat[i+1];}
  cx/=flat.length/2; cy/=flat.length/2;
  if(cx<0||cy<0||cx>=W||cy>=H)continue;
  const bi=Math.min(BW-1,Math.max(0,Math.floor(cx/BLK))), bj=Math.min(BH-1,Math.max(0,Math.floor(cy/BLK)));
  const k=bj*BW+bi;
  let o=acc.get(k); if(!o)acc.set(k,o={res:0,ind:0,com:0});
  o[cls]+=a*0.0625;                            // km²
}
const cands=[];
for(const [k,o] of acc){
  const bi=k%BW, bj=(k/BW)|0;
  const x=bi*BLK+BLK/2, y=bj*BLK+BLK/2;
  if(!inPoly(x,y,MA_P))continue;
  const tot=o.res+o.ind+o.com;
  if(tot<0.05)continue;                        // 块内建成区 ≥ 0.05 km²
  cands.push({x,y,res:o.res,ind:o.ind,com:o.com,tot,old:inPoly(x,y,MA2000_P)});
}
// 块面积 1 km²：密度 = 该块人口 / 1
const OUT=[];
for(const c of cands){
  const k=c.old?1:0.55, kj=c.old?1:0.65;
  // 密度按块内建成区面积饱和增长：小块也有基础密度（不至于被阈值吃掉），大块封顶（避免叠加后糊成一片）
  const F=1.0;
  const pop=Math.round(Math.min(9000,1500+c.tot*9000)*k*F);
  const jobs=Math.round(Math.min(8000,1200+c.tot*8000)*kj*F);
  const r=+(0.44+Math.sqrt(Math.min(1,c.tot))*0.14).toFixed(2);   // 相邻 1 km 块的密度场刚好接上，不散成点阵
  OUT.push({x:+c.x.toFixed(1),y:+c.y.toFixed(1),pop,jobs,r,old:c.old,tot:+c.tot.toFixed(2)});
}
OUT.sort((a,b)=>a.y-b.y||a.x-b.x);
await writeFile(ROOT+'/tools/centers-v2.json', JSON.stringify(OUT));
console.log('1km 块合格', cands.length, '其中 2000 年城区', cands.filter(c=>c.old).length,
  '建成区合计 km²', cands.reduce((s,c)=>s+c.tot,0).toFixed(1));
console.log('r 范围', Math.min(...OUT.map(o=>o.r)), Math.max(...OUT.map(o=>o.r)));
console.log('样例', JSON.stringify(OUT.slice(0,3)));
