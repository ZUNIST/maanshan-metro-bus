// 用高德 Web 服务核实地标 / 设施 / 乡镇标注的坐标
// 用法：AMAP_KEY=xxx node amap-verify.mjs
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const KEY=process.env.AMAP_KEY;
if(!KEY){ console.error('缺少 AMAP_KEY'); process.exit(1); }

function gcj2wgs(lat,lon){const pi=Math.PI,a=6378245,ee=0.006693421622965943;
 const tLat=(x,y)=>{let r=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;r+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;r+=(160*Math.sin(x/12*pi)+320*Math.sin(x*pi/30))*2/3;return r;};
 const tLon=(x,y)=>{let r=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;r+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;r+=(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;return r;};
 let dLat=tLat(lat-35,lon-105), dLon=tLon(lat-35,lon-105);
 const rad=lat/180*pi; let m=Math.sin(rad); m=1-ee*m*m; const sq=Math.sqrt(m);
 dLat=(dLat*180)/((a*(1-ee))/(m*sq)*pi); dLon=(dLon*180)/(a/sq*Math.cos(rad)*pi);
 return [lat*2-(lat+dLat), lon*2-(lon+dLon)];}

const CM={GEOS:{},U:{gcj2wgs},DATA:{plans:{}},CFG:{growth:{},cost:{}}};
vm.runInNewContext(await readFile(ROOT+'/city-and-metro/js/geo_ms.js','utf8'),{window:{CM}});
vm.runInNewContext(await readFile(ROOT+'/city-and-metro/js/data_ms.js','utf8'),{window:{CM}});
const D=CM.MAP_LIST.find(x=>x.id==='ms').data;
const pr=CM.GEOS.ms.proj;
const toGrid=(lat,lon)=>[ (lon-pr.lon0)*pr.kx, (pr.lat0-lat)*pr.ky ];
const toLatLon=(x,y)=>[ pr.lat0 - y/pr.ky, pr.lon0 + x/pr.kx ];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function amap(keyword, city='马鞍山'){
  const u='https://restapi.amap.com/v3/place/text?keywords='+encodeURIComponent(keyword)+'&city='+encodeURIComponent(city)+'&offset=8&page=1&extensions=base&key='+KEY;
  for(let i=0;i<3;i++){
    try{
      const r=await fetch(u); const j=await r.json();
      if(j.status==='1') return j.pois||[];
      if(String(j.infocode)==='10001'){ await sleep(1500); continue; }
      return [];
    }catch(e){ await sleep(800); }
  }
  return [];
}

const targets=[];
for(const l of D.landmarks) targets.push({kind:'地标', name:l.name, x:l.x, y:l.y, q:l.name});
for(const f of D.facilities){
  if(!f.at) continue;
  targets.push({kind:'设施', name:f.n, x:f.at[0], y:f.at[1], q:f.n});
}
for(const dl of D.districtLabels){
  if(!Array.isArray(dl[1])||typeof dl[1][0]!=='number') continue;
  targets.push({kind:'乡镇', name:dl[0], x:dl[1][0], y:dl[1][1], q:dl[0]+'镇'});
}

const rows=[];
for(const t of targets){
  const qs=[t.q];
  if(t.kind==='乡镇' && !/镇$/.test(t.q)) qs.unshift(t.q);
  let pois=[];
  for(const q of qs){ pois=await amap(q); if(pois.length) break; await sleep(120); }
  await sleep(130);
  if(!pois.length){ rows.push({...t, hit:null, d:null}); continue; }
  // 选名称最接近、且距离最近的
  let best=null;
  for(const p of pois){
    if(!p.location) continue;
    const [lon,lat]=p.location.split(',').map(Number);
    const w=gcj2wgs(lat,lon);
    const g=toGrid(w[0],w[1]);
    if(g[0]<-20||g[0]>440||g[1]<-20||g[1]>350) continue;   // 只认地图范围内的点，避免同名异地
    const d=Math.hypot(g[0]-t.x, g[1]-t.y);
    const exact=p.name===t.q||p.name===t.name;
    const score=d - (exact?1.2:0);
    if(!best||score<best.score) best={score,d,p,g,name:p.name,addr:p.address,type:p.type};
  }
  if(!best){ rows.push({...t, hit:null, d:null}); continue; }
  rows.push({...t, hit:best.name, addr:best.addr||'', type:best.type||'', gx:+best.g[0].toFixed(1), gy:+best.g[1].toFixed(1), d:+best.d.toFixed(2)});
}
await writeFile(ROOT+'/tools/amap-report.json', JSON.stringify(rows,null,1));
{
  const md=['# 高德坐标核对报告','',
    '以高德 Web 服务 `place/text` 逐点查询（GCJ-02 → WGS-84 后比对），距离为格（1 格 = 250 m）。','',
    '| 类型 | 名称 | 数据坐标 | 高德坐标 | 偏差 | 高德返回的 POI | 判定 |','|---|---|---|---|---|---|---|'];
  for(const r of rows.slice().sort((a,b)=>(b.d==null?-1:b.d)-(a.d==null?-1:a.d))){
    const ok = r.d==null ? '未查到' : (r.d<=2?'一致':(r.d<=4?'可接受':'偏差大'));
    md.push('| '+[r.kind,r.name,'('+r.x.toFixed(0)+','+r.y.toFixed(0)+')',r.d==null?'—':'('+r.gx+','+r.gy+')',r.d==null?'—':(r.d.toFixed(1)+' 格 ≈ '+(r.d*0.25).toFixed(2)+' km'),r.hit||'—',ok].join(' | ')+' |');
  }
  await writeFile(ROOT+'/tools/verify-report.md', md.join('\n'));
}
const bad=rows.filter(r=>r.d!=null&&r.d>4).sort((a,b)=>b.d-a.d);
const miss=rows.filter(r=>r.d==null);
console.log('核对', rows.length, '个点；偏差 >1 km 的', bad.length, '个；没查到的', miss.length, '个');
console.log('--- 偏差 >1 km ---');
for(const r of bad) console.log([r.kind, r.name, '数据('+r.x.toFixed(0)+','+r.y.toFixed(0)+')', '高德('+r.gx+','+r.gy+')', r.d.toFixed(1)+'格≈'+(r.d*0.25).toFixed(2)+'km', '→', r.hit].join(' | '));
console.log('--- 没查到 ---');
console.log(miss.map(r=>r.kind+':'+r.name).join(', '));
