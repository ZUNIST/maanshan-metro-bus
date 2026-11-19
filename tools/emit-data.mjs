// 输出可直接嵌入 data_ms.js 的 centers 与 roadYears 片段
import { readFile, writeFile } from 'node:fs/promises';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const centersRaw=JSON.parse(await readFile(ROOT+'/tools/centers-ms.json','utf8'));
// 块面积 4 km²（8×8 格）；建成区面积超出块面积时按比例归一
// centers-ms.json 里的 pop/jobs 是「块内总人口」，city.js 里按人/km² 密度使用，除以块面积 4 km²
const centers=centersRaw.map(c=>{
  const pop=Math.max(1500,Math.round((c.pop/4)/500)*500);
  const jobs=Math.max(1200,Math.round((c.jobs/4)/500)*500);
  return {x:c.x,y:c.y,pop,jobs,r:c.r};
}).sort((a,b)=>a.y-b.y||a.x-b.x);
const centerLines=centers.map(c=>`      { x: ${c.x}, y: ${c.y}, pop: ${c.pop}, jobs: ${c.jobs}, r: ${c.r} },`).join('\n');
await writeFile(ROOT+'/tools/out-centers.txt', centerLines);

// 道路年代：只给主干道以上（motorway/trunk/primary）且有名字的
const roads=JSON.parse(await readFile(ROOT+'/osm-cache/roads.json','utf8')).elements;
const n13=new Set(), n18=new Set();
for(const e of JSON.parse(await readFile(ROOT+'/osm-cache/roads2013.json','utf8')).elements) if(e.tags&&e.tags.name) n13.add(e.tags.name);
for(const e of JSON.parse(await readFile(ROOT+'/osm-cache/roads2018.json','utf8')).elements) if(e.tags&&e.tags.name) n18.add(e.tags.name);
const hand={ '马鞍山长江公路大桥':2013,'马鞍山长江大桥':2013,'马和汽渡':2000,'马和轮渡':2000,'宁马高速':1996,'宁芜高速':1996,'芜马高速':2005,'合马高速':2013,'滁马高速':2015,'溧马高速':2013,'205国道':2000,'宁芜路':2000,'湖东路':2000,'解放路':2000,'湖南路':2000,'雨山路':2000,'江东大道':2004,'太白大道':2010,'采石河路':2008,'慈湖河路':2006,'旅游大道':2009,'霍里山大道':2011,'城际快速通道':2016,'郑蒲港疏港公路':2014,'巢马高速':2019 };
const auto={};
for(const e of roads){
  const t=e.tags||{}; const hw=t.highway||'';
  if(!/^(motorway|trunk|primary)$/.test(hw)) continue;
  const n=t.name; if(!n||hand[n]!=null) continue;
  if(n13.has(n)) auto[n]=2009; else if(n18.has(n)) auto[n]=2015; else auto[n]=2021;
}
const merged=Object.assign({},auto,hand);   // 手写优先
const keys=Object.keys(merged).sort((a,b)=>merged[a]-merged[b]);
const ryLines=keys.map(k=>`      '${k}': ${merged[k]},`).join('\n');
await writeFile(ROOT+'/tools/out-roadyears.txt', ryLines);
console.log('centers', centers.length, 'roadYears', keys.length, '（自动', Object.keys(auto).length, '手写', Object.keys(hand).length, '）');
console.log('样例 center', JSON.stringify(centers[0]));
console.log('2009/2015/2021:', [2009,2015,2021].map(y=>Object.values(merged).filter(v=>v===y).length).join('/'));
