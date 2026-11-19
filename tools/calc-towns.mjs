// 每个乡镇：镇域内建成格的重心（用于镇名标注与商业区/景点定位）
import { readFile, writeFile } from 'node:fs/promises';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const BB={s:31.325,w:117.835,n:32.070,e:118.900};
const W=416,H=328,KX=W/(BB.e-BB.w),KY=H/(BB.n-BB.s);
const proj=(lat,lon)=>[(lon-BB.w)*KX,(BB.n-lat)*KY];
const key=p=>p.lat.toFixed(7)+','+p.lon.toFixed(7);
function stitch(ms){const segs=ms.filter(m=>m.geometry&&m.geometry.length>1).map(m=>m.geometry.slice());const rings=[];let pool=segs;
  while(pool.length){let cur=pool.shift(),g=0;
    while(g++<20000){if(key(cur[0])===key(cur[cur.length-1]))break;const t=key(cur[cur.length-1]);let f=-1,rev=false;
      for(let i=0;i<pool.length;i++){if(key(pool[i][0])===t){f=i;break;}if(key(pool[i][pool[i].length-1])===t){f=i;rev=true;break;}}
      if(f<0)break;const add=(rev?pool[f].slice().reverse():pool[f].slice());pool.splice(f,1);cur=cur.concat(add.slice(1));}
    if(cur.length>3&&key(cur[0])===key(cur[cur.length-1]))rings.push(cur);}
  return rings;}
const adm=JSON.parse(await readFile(ROOT+'/osm-cache/admin.json','utf8')).elements;
const E=JSON.parse(await readFile(ROOT+'/tools/lu-all.json','utf8'));
const bw=E.bw, GW=bw.x1-bw.x0;
const isBuilt=(i,j)=>{const v=String(E.lu.charCodeAt((j-bw.y0)*GW+(i-bw.x0))-65);return '12346'.includes(v);};

const towns={};
for(const e of adm){
  if(e.type!=='relation'||!e.tags||e.tags.admin_level!=='8') continue;
  const name=e.tags.name;
  if(!towns[name]) towns[name]={polys:[]};
  for(const r of stitch(e.members.filter(m=>m.type==='way'&&(m.role==='outer'||!m.role)))) towns[name].polys.push(r.map(p=>proj(p.lat,p.lon)).flat());
}
const inPoly=(x,y,ps)=>{let hit=false;for(const p of ps){const n=p.length/2;for(let i=0,j=n-1;i<n;j=i++){const xi=p[2*i],yi=p[2*i+1],xj=p[2*j],yj=p[2*j+1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}}return hit;};

const out=[];
for(const [name,o] of Object.entries(towns)){
  if(!o.polys.length) continue;
  let sx=0,sy=0,n=0; const cells=[];
  for(let j=bw.y0;j<bw.y1;j++)for(let i=bw.x0;i<bw.x1;i++){
    if(!isBuilt(i,j)) continue;
    if(!inPoly(i+0.5,j+0.5,o.polys)) continue;
    sx+=i+0.5; sy+=j+0.5; n++; cells.push([i,j]);
  }
  if(!n) continue;
  out.push({name, x:+(sx/n).toFixed(1), y:+(sy/n).toFixed(1), cells:n, km2:+(n*0.0625).toFixed(2)});
}
out.sort((a,b)=>b.cells-a.cells);
await writeFile(ROOT+'/tools/towns-ms.json', JSON.stringify(out,null,0));
console.log('有建成区的乡镇', out.length, '（总计', out.reduce((s,t)=>s+t.cells,0), '格）');
out.slice(0,20).forEach(t=>console.log('  ', t.name, t.x+','+t.y, t.km2+'km²'));
