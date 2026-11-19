import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
function gcj2wgs(lat,lon){const pi=Math.PI,a=6378245,ee=0.006693421622965943;
 const tLat=(x,y)=>{let r=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;r+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;r+=(160*Math.sin(x/12*pi)+320*Math.sin(x*pi/30))*2/3;return r;};
 const tLon=(x,y)=>{let r=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;r+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;r+=(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;return r;};
 let dLat=tLat(lat-35,lon-105), dLon=tLon(lat-35,lon-105);
 const rad=lat/180*pi; let magic=Math.sin(rad); magic=1-ee*magic*magic; const sq=Math.sqrt(magic);
 dLat=(dLat*180)/((a*(1-ee))/(magic*sq)*pi); dLon=(dLon*180)/(a/sq*Math.cos(rad)*pi);
 return [lat*2-(lat+dLat), lon*2-(lon+dLon)];}
const CM={GEOS:{},U:{gcj2wgs},DATA:{plans:{}},CFG:{growth:{},cost:{}}};
vm.runInNewContext(await readFile(ROOT+'/city-and-metro/js/geo_ms.js','utf8'),{window:{CM}});
vm.runInNewContext(await readFile(ROOT+'/city-and-metro/js/data_ms.js','utf8'),{window:{CM}});
const D=CM.MAP_LIST.find(x=>x.id==='ms').data;
const pr=CM.GEOS.ms.proj;
const poi=JSON.parse(await readFile(ROOT+'/osm-cache/poi.json','utf8')).elements;
const list=[];
for(const e of poi){const t=e.tags||{};if(!t.name)continue;const la=e.lat!=null?e.lat:(e.center&&e.center.lat), lo=e.lon!=null?e.lon:(e.center&&e.center.lon);if(la==null)continue;
 list.push({n:t.name,x:(lo-pr.lon0)*pr.kx,y:(pr.lat0-la)*pr.ky,k:(t.tourism||t.historic||t.amenity||t.leisure||t.landuse||'')});}
const near=(name,x,y)=>{const h=list.filter(o=>o.n===name||o.n.includes(name));h.forEach(o=>o.d=Math.hypot(o.x-x,o.y-y));h.sort((a,b)=>a.d-b.d);return h.slice(0,2);};
console.log('=== 地标（当前坐标 | 最近的同名 POI | 距离） ===');
for(const l of D.landmarks){const h=near(l.name,l.x,l.y);const d=h.length?h[0].d:null;
 console.log([l.name.padEnd(12), l.x.toFixed(0)+','+l.y.toFixed(0), d==null?'无匹配':d.toFixed(1)+'格', h.map(o=>o.n+'@'+o.x.toFixed(0)+','+o.y.toFixed(0)+' '+o.k).join(' ; ')].join(' | '));}
console.log('=== 设施 ===');
for(const f of D.facilities){const nm=f.n.replace(/（.*）/,'');const h=near(nm,f.at?f.at[0]:null,f.at?f.at[1]:null);
 console.log([f.id.padEnd(14), nm.padEnd(14), f.at?f.at.join(','):'lm:'+(f.lm||''), h.map(o=>o.n+'@'+o.x.toFixed(0)+','+o.y.toFixed(0)).join(' ; ')].join(' | '));}
