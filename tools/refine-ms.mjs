// 由真实用地重算聚落中心；由 2013/2018 历史快照给道路分年代档
import { readFile, writeFile } from 'node:fs/promises';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const BBOX={s:31.325,w:117.835,n:32.070,e:118.900};
const W=416,H=328,KX=W/(BBOX.e-BBOX.w),KY=H/(BBOX.n-BBOX.s);
const proj=(lat,lon)=>[(lon-BBOX.w)*KX,(BBOX.n-lat)*KY];
const key=p=>p.lat.toFixed(7)+','+p.lon.toFixed(7);
const load=async f=>JSON.parse(await readFile(ROOT+'/osm-cache/'+f+'.json','utf8')).elements;

// ---- 关系多边形缝合 ----
function stitch(members){
  const segs=members.filter(m=>m.geometry&&m.geometry.length>1).map(m=>m.geometry.slice());
  const rings=[]; let pool=segs;
  while(pool.length){
    let cur=pool.shift(), guard=0;
    while(guard++<20000){
      if(key(cur[0])===key(cur[cur.length-1])) break;
      const tail=key(cur[cur.length-1]); let found=-1,rev=false;
      for(let i=0;i<pool.length;i++){ if(key(pool[i][0])===tail){found=i;break;} if(key(pool[i][pool[i].length-1])===tail){found=i;rev=true;break;} }
      if(found<0) break;
      const add=(rev?pool[found].slice().reverse():pool[found].slice()); pool.splice(found,1);
      cur=cur.concat(add.slice(1));
    }
    if(cur.length>3&&key(cur[0])===key(cur[cur.length-1])) rings.push(cur);
  }
  return rings;
}
const ringsOf=row=>row.slice(2).map(s=>s);   // geo 行（admin 已编码），这里改用原始 osm

// ---- 马鞍山区县与 2000 年已开发街道的多边形 ----
const adminRaw=await load('admin');
const MA_COUNTY=['花山区','雨山区','博望区','当涂县','含山县','和县'];
const MA_CITY2000=['解放路街道','湖东路街道','沙塘路街道','桃源路街道','金家庄街道','塘西街道','江东街道','慈湖街道','雨山街道','平湖街道','安民街道','采石街道','佳山乡','梅山街道','姑孰镇'];
function polysFor(names){
  const out=[];
  for(const e of adminRaw){
    if(e.type!=='relation'||!e.tags||!names.includes(e.tags.name)) continue;
    for(const r of stitch(e.members.filter(m=>m.type==='way'&&(m.role==='outer'||!m.role)))) out.push(r.map(p=>proj(p.lat,p.lon)).flat());
  }
  return out;
}
const MA=polysFor(MA_COUNTY), MA2000=polysFor(MA_CITY2000);
const inPoly=(x,y,polys)=>{
  let hit=false;
  for(const p of polys){
    const n=p.length/2;
    for(let i=0,j=n-1;i<n;j=i++){
      const xi=p[2*i],yi=p[2*i+1],xj=p[2*j],yj=p[2*j+1];
      if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) hit=!hit;
    }
  }
  return hit;
};
console.log('区县多边形', MA.length, '2000 年已开发街道多边形', MA2000.length);

// ---- 建成区聚合 ----
const lu=await load('landuse');
const area=ring=>{let a=0;const n=ring.length/2;for(let i=0;i<n;i++){const j=(i+1)%n;a+=ring[2*i]*ring[2*j+1]-ring[2*j]*ring[2*i+1];}return Math.abs(a)/2;};
const BLK=8, BW=Math.ceil(W/BLK), BH=Math.ceil(H/BLK);
const acc=new Map();
for(const e of lu){
  if(e.type!=='way'||!e.geometry||e.geometry.length<4) continue;
  const g=e.geometry; if(g[0].lat!==g[g.length-1].lat||g[0].lon!==g[g.length-1].lon) continue;
  const flat=new Float64Array(g.length*2);
  for(let i=0;i<g.length;i++){const p=proj(g[i].lat,g[i].lon);flat[2*i]=p[0];flat[2*i+1]=p[1];}
  const a=area(flat); if(!(a>0)) continue;
  const t=e.tags.landuse;
  const cls=t==='residential'?'res':t==='industrial'?'ind':(t==='commercial'||t==='retail')?'com':'con';
  let cx=0,cy=0; for(let i=0;i<flat.length;i+=2){cx+=flat[i];cy+=flat[i+1];}
  cx/=flat.length/2; cy/=flat.length/2;
  if(cx<0||cy<0||cx>=W||cy>=H) continue;
  const bi=Math.min(BW-1,Math.max(0,Math.floor(cx/BLK))), bj=Math.min(BH-1,Math.max(0,Math.floor(cy/BLK)));
  const k=bj*BW+bi;
  let o=acc.get(k); if(!o) acc.set(k,o={res:0,ind:0,com:0});
  o[cls]+=a*0.0625;
}
const cands=[];
for(const [k,o] of acc){
  const bi=k%BW, bj=(k/BW)|0;
  const x=bi*BLK+BLK/2, y=bj*BLK+BLK/2;
  if(!inPoly(x,y,MA)) continue;                  // 只保留马鞍山境内
  const km2=o.res+o.ind+o.com;
  if(km2<0.8) continue;
  const old=inPoly(x,y,MA2000);                  // 是否属于 2000 年已经开发的城区
  cands.push({x,y,km2,res:o.res,ind:o.ind,com:o.com,old});
}
cands.sort((a,b)=>b.km2-a.km2);
const keep=cands.slice(0,110);
const centers=keep.map(c=>{
  const k=c.old?1:0.5, kj=c.old?1:0.6;   // 新区保留乡镇级密度，靠年代增长补齐
  const pop=Math.round((c.res*36000+c.com*14000)*k/100)*100;
  const jobs=Math.round((c.ind*26000+c.com*30000+c.res*3500)*kj/100)*100;
  const r=+(0.75+Math.sqrt(c.km2)*0.4).toFixed(2);
  return {x:+c.x.toFixed(1),y:+c.y.toFixed(1),pop,jobs,r,old:c.old,km2:+c.km2.toFixed(2)};
});
console.log('合格块', cands.length, '保留', centers.length, '其中 2000 年城区', centers.filter(c=>c.old).length);
console.log('保留建成区 km²', keep.reduce((s,c)=>s+c.km2,0).toFixed(1));

// ---- 道路年代分档 ----
const r13=await load('roads2013'), r18=await load('roads2018');
const names13=new Set(), names18=new Set();
for(const e of r13) if(e.tags&&e.tags.name) names13.add(e.tags.name);
for(const e of r18) if(e.tags&&e.tags.name) names18.add(e.tags.name);
const cur=await load('roads');
const curNames=new Set();
for(const e of cur) if(e.tags&&e.tags.name) curNames.add(e.tags.name);
let a=0,b=0,c2=0;
const years={};
for(const n of curNames){
  if(names13.has(n)||names18.has(n)) { years[n]=2010; a++; }   // 2018 年前已有，按 2010 前后出现
  else if(names13.has(n)) { years[n]=2010; a++; }
  else { years[n]=2022; c2++; }
}
// 2013 与 2018 同时存在的，进一步细分：两者都有 -> 2009；仅 2018 有 -> 2016
for(const n of curNames){
  if(names13.has(n)&&names18.has(n)) years[n]=2009;
  else if(!names13.has(n)&&names18.has(n)) years[n]=2016;
}
console.log('有名称道路', curNames.size, '2013 已有', names13.size, '2018 已有', names18.size);
console.log('分档: 2009 年前', Object.values(years).filter(v=>v===2009).length, '/ 2016', Object.values(years).filter(v=>v===2016).length, '/ 2022', Object.values(years).filter(v=>v===2022).length);

await writeFile(ROOT+'/tools/centers-ms.json', JSON.stringify(centers,null,0));
await writeFile(ROOT+'/tools/roadyears-ms.json', JSON.stringify(years,null,0));
console.log('OK');
