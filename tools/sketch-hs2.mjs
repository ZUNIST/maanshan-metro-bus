import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const BB={s:31.325,w:117.835,n:32.070,e:118.900};
const W=416,H=328,KX=W/(BB.e-BB.w),KY=H/(BB.n-BB.s);
const proj=(lat,lon)=>[(lon-BB.w)*KX,(BB.n-lat)*KY];
const key=p=>p.lat.toFixed(7)+','+p.lon.toFixed(7);
const box={x0:44,x1:152,y0:100,y1:312};
const S=5, M=30, LEGW=330;
const pw=(box.x1-box.x0)*S, ph=(box.y1-box.y0)*S;
const X=x=>((x-box.x0)*S+M).toFixed(1), Y=y=>((y-box.y0)*S+M+34).toFixed(1);

// 水面
const src=await readFile(ROOT+'/city-and-metro/js/geo_ms.js','utf8');
const CM={}; vm.runInNewContext(src,{window:{CM}});
const G=CM.GEOS.ms;
function dec(str,from=0){const o=[];let i=from,x=0,y=0;while(i<str.length){let r=0,sh=0,b;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);x+=(r&1)?~(r>>1):(r>>1);r=0;sh=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);y+=(r&1)?~(r>>1):(r>>1);o.push(x/64,y/64);}return o;}
const bbOk=p=>p.some((v,i)=>i%2===0?(v>box.x0-2&&v<box.x1+2):(v>box.y0-2&&v<box.y1+2));
const pathOf=p=>{let d='M'+X(p[0])+' '+Y(p[1]);for(let i=2;i<p.length;i+=2)d+='L'+X(p[i])+' '+Y(p[i+1]);return d+'Z';};
let waterSvg='';
for(const r of G.water){
  if(typeof r[1]==='number'){const p=dec(r[2]);if(!bbOk(p))continue;
    let d='M'+X(p[0])+' '+Y(p[1]);for(let i=2;i<p.length;i+=2)d+='L'+X(p[i])+' '+Y(p[i+1]);
    waterSvg+=`<path d="${d}" fill="none" stroke="#cfe3f1" stroke-width="${Math.max(1.5,r[1]*S)}" stroke-linecap="round"/>`;continue;}
  for(let k=1;k<r.length;k++){const p=dec(r[k],1);if(!bbOk(p))continue;waterSvg+=`<path d="${pathOf(p)}" fill="#d6e8f4" fill-rule="evenodd"/>`;}
}

// 镇界与镇域
const adm=JSON.parse(await readFile(ROOT+'/osm-cache/admin.json','utf8')).elements;
function stitch(ms){const segs=ms.filter(m=>m.geometry&&m.geometry.length>1).map(m=>m.geometry.slice());const rings=[];let pool=segs;
  while(pool.length){let cur=pool.shift(),g=0;
    while(g++<20000){if(key(cur[0])===key(cur[cur.length-1]))break;const t=key(cur[cur.length-1]);let f=-1,rev=false;
      for(let i=0;i<pool.length;i++){if(key(pool[i][0])===t){f=i;break;}if(key(pool[i][pool[i].length-1])===t){f=i;rev=true;break;}}
      if(f<0)break;const add=(rev?pool[f].slice().reverse():pool[f].slice());pool.splice(f,1);cur=cur.concat(add.slice(1));}
    if(cur.length>3&&key(cur[0])===key(cur[cur.length-1]))rings.push(cur);}
  return rings;}
const TOWNS=['环峰镇','昭关镇','仙踪镇','清溪镇','陶厂镇','林头镇','铜闸镇','运漕镇'];
const townRings={};
for(const t of TOWNS){
  const rs=[];
  for(const e of adm){if(e.type!=='relation'||!e.tags||e.tags.name!==t)continue;
    for(const r of stitch(e.members.filter(m=>m.type==='way'&&(m.role==='outer'||!m.role))))rs.push(r.map(p=>proj(p.lat,p.lon)).flat());}
  townRings[t]=rs;
}
const inPoly=(x,y,polys)=>{let hit=false;for(const p of polys){const n=p.length/2;for(let i=0,j=n-1;i<n;j=i++){const xi=p[2*i],yi=p[2*i+1],xj=p[2*j],yj=p[2*j+1];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}}return hit;};
const townOf=(x,y)=>{for(const t of TOWNS)if(inPoly(x,y,townRings[t]))return t;return '（县外）';};

// 逐格用地
const EXP=JSON.parse(await readFile(ROOT+'/tools/lu-all.json','utf8'));
const bw=EXP.bw, GW=bw.x1-bw.x0, ABS=true;
const CELL_COL={'1':'#e07b39','2':'#c0392b','3':'#8e5bb5','4':'#e0b040','6':'#3aa3a3'};
const cellStat={};   // town -> cells
let cellSvg='';
for(let j=bw.y0;j<bw.y1;j++)for(let i=bw.x0;i<bw.x1;i++){
  const ch=String(EXP.lu.charCodeAt((j-bw.y0)*GW+(i-bw.x0))-65);
  const col=CELL_COL[ch]; if(!col) continue;
  cellSvg+=`<rect x="${X(i)}" y="${Y(j)}" width="${S}" height="${S}" fill="${col}" opacity="0.66"/>`;
  const t=townOf(i+0.5,j+0.5);
  cellStat[t]=(cellStat[t]||0)+1;
}

// 真实成片用地（只保留 >= 8000 m² 的地块，剔除农村宅基地）
const lu=JSON.parse(await readFile(ROOT+'/osm-cache/landuse.json','utf8')).elements;
const STY={residential:'#b5651d',industrial:'#6b3fa0',commercial:'#a93226',retail:'#a93226'};
let realSvg='', dropped=0;
const realStat={};
for(const e of lu){
  if(e.type!=='way'||!e.geometry||e.geometry.length<4)continue;
  const t=e.tags&&e.tags.landuse; const col=STY[t]; if(!col)continue;
  const g=e.geometry; if(g[0].lat!==g[g.length-1].lat||g[0].lon!==g[g.length-1].lon)continue;
  const flat=[]; for(const q of g){const p=proj(q.lat,q.lon);flat.push(p[0],p[1]);}
  if(!bbOk(flat))continue;
  let a=0;const n=flat.length/2;for(let i=0;i<n;i++){const j=(i+1)%n;a+=flat[2*i]*flat[2*j+1]-flat[2*j]*flat[2*i+1];}
  a=Math.abs(a)/2*0.0625*1e6;                    // m²
  if(a<8000){dropped++;continue;}
  realSvg+=`<path d="${pathOf(flat)}" fill="${col}" fill-opacity="0.16" stroke="${col}" stroke-width="1.2" opacity="0.9"/>`;
  let cx=0,cy=0;for(let i=0;i<flat.length;i+=2){cx+=flat[i];cy+=flat[i+1];}
  if(t!=='residential') continue;               // 只统计居住地块：工业厂区面积大、口径不可比
  const tt=townOf(cx/(flat.length/2),cy/(flat.length/2));
  realStat[tt]=(realStat[tt]||0)+a;
}

// 人口中心
let cenSvg='';
for(const [x,y,pop,jobs,r] of EXP.centers){
  if(x<box.x0||x>box.x1||y<box.y0||y>box.y1)continue;
  cenSvg+=`<circle cx="${X(x)}" cy="${Y(y)}" r="${(r*S).toFixed(1)}" fill="none" stroke="#111" stroke-width="1.3" stroke-dasharray="3 3" opacity="0.75"/><circle cx="${X(x)}" cy="${Y(y)}" r="2.4" fill="#111"/>`;
}

// 镇名 + 统计
let labelSvg='';
for(const t of TOWNS){
  const rs=townRings[t]; if(!rs.length)continue;
  let x=0,y=0,n=0;for(const p of rs)for(let i=0;i<p.length;i+=2){x+=p[i];y+=p[i+1];n++;}
  const cx=x/n, cy=y/n;
  labelSvg+=`<text x="${X(cx)}" y="${Y(cy)}" font-size="13" font-weight="700" fill="#25455f" text-anchor="middle" stroke="#fbfaf6" stroke-width="3" paint-order="stroke">${t}</text>`;
}
// 右侧表格
const rows=TOWNS.map(t=>({t,cells:cellStat[t]||0,km2:((cellStat[t]||0)*0.0625).toFixed(1),osm:((realStat[t]||0)/1e6).toFixed(1)}))
  .filter(r=>r.cells||+r.osm>0).sort((a,b)=>b.cells-a.cells);
const totalCells=rows.reduce((s,r)=>s+r.cells,0), totalKm2=(totalCells*0.0625).toFixed(1);
const totalOsm=(Object.values(realStat).reduce((a,b)=>a+b,0)/1e6).toFixed(1);
const tx=M+pw+22, ty=M+34;
let tableSvg=`<text x="${tx}" y="${ty-6}" font-size="13" font-weight="700" fill="#1d1d1d">各镇建成区面积对比</text>`;
tableSvg+=`<text x="${tx}" y="${ty+12}" font-size="11" fill="#666">游戏（2000 年）/ OSM 居住地块（2026 年，含村庄）</text>`;
rows.forEach((r,i)=>{
  const y=ty+36+i*21;
  tableSvg+=`<rect x="${tx}" y="${y-13}" width="${LEGW-40}" height="19" fill="${i%2?'#f2efe8':'#fbfaf6'}"/>`;
  tableSvg+=`<text x="${tx+4}" y="${y}" font-size="12" fill="#2b2b2b">${r.t}</text>`;
  tableSvg+=`<text x="${tx+112}" y="${y}" font-size="12" font-weight="600" fill="#c0392b" text-anchor="end">${r.km2}</text>`;
  tableSvg+=`<text x="${tx+190}" y="${y}" font-size="12" fill="#2b6b3a" text-anchor="end">${r.osm}</text>`;
  tableSvg+=`<text x="${tx+206}" y="${y}" font-size="11" fill="#888">km²</text>`;
});
const ty2=ty+36+rows.length*21+16;
tableSvg+=`<line x1="${tx}" y1="${ty2-14}" x2="${tx+LEGW-50}" y2="${ty2-14}" stroke="#ccc"/>`;
tableSvg+=`<text x="${tx+4}" y="${ty2}" font-size="12" font-weight="700" fill="#1d1d1d">合计</text>`;
tableSvg+=`<text x="${tx+112}" y="${ty2}" font-size="12" font-weight="700" fill="#c0392b" text-anchor="end">${totalKm2}</text>`;
tableSvg+=`<text x="${tx+190}" y="${ty2}" font-size="12" font-weight="700" fill="#2b6b3a" text-anchor="end">${totalOsm}</text>`;
tableSvg+=`<text x="${tx+206}" y="${ty2}" font-size="11" fill="#888">km²</text>`;
tableSvg+=`<text x="${tx}" y="${ty2+22}" font-size="10.5" fill="#666">OSM 列为居住类地块面积合计，包含大量村庄宅基地，</text>`;
tableSvg+=`<text x="${tx}" y="${ty2+38}" font-size="10.5" fill="#666">而游戏的城区已剔除孤立宅基地，两者不宜直接相减。</text>`;

// 图例（表格下方）
const legend=[['#e07b39','游戏判定：住宅','fill'],['#c0392b','游戏判定：商业办公','fill'],['#8e5bb5','游戏判定：工业仓储','fill'],['#e0b040','游戏判定：混合功能','fill'],['#3aa3a3','游戏判定：学校机构','fill'],['#b5651d','OSM 成片居住地块','line'],['#6b3fa0','OSM 成片工业地块','line'],['#111','人口中心与影响半径','circle'],['#5b7fa6','镇界','dash']];
const ly=ty2+66;
let legendSvg=`<text x="${tx}" y="${ly-10}" font-size="13" font-weight="700" fill="#1d1d1d">图例</text>`;
legend.forEach(([c,label,kind],i)=>{
  const y=ly+10+i*20;
  const mark=kind==='fill'?`<rect x="${tx}" y="${y-9}" width="14" height="12" fill="${c}" opacity="0.7"/>`
    :kind==='line'?`<rect x="${tx}" y="${y-4}" width="16" height="2.6" fill="${c}"/>`
    :kind==='circle'?`<circle cx="${tx+8}" cy="${y-3}" r="6" fill="none" stroke="${c}" stroke-width="1.3" stroke-dasharray="3 3"/>`
    :`<rect x="${tx}" y="${y-4}" width="16" height="2.6" fill="none" stroke="#5b7fa6" stroke-dasharray="5 4"/>`;
  legendSvg+=mark+`<text x="${tx+26}" y="${y}" font-size="11.5" fill="#2b2b2b">${label}</text>`;
});
const scaleKm=2, scalePx=scaleKm/0.25*S;

const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${pw+M*2+LEGW}" height="${ph+M*2+70}" viewBox="0 0 ${pw+M*2+LEGW} ${ph+M*2+70}" font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif">
<rect width="100%" height="100%" fill="#fbfaf6"/>
<text x="${M}" y="26" font-size="17" font-weight="700" fill="#1d1d1d">含山县 · 建成区对照（游戏 2000 年局面 vs OSM 真实用地）</text>
<g>${waterSvg}${realSvg}${cellSvg}${cenSvg}</g>
<g>${[...new Set(TOWNS)].map(t=>townRings[t].map(p=>`<path d="${pathOf(p)}" fill="none" stroke="#5b7fa6" stroke-width="1.1" stroke-dasharray="5 4" opacity="0.8"/>`).join('')).join('')}</g>
${labelSvg}
<g transform="translate(${M},${M+ph+44})">
  <rect x="0" y="0" width="${scalePx}" height="6" fill="#1d1d1d"/>
  <text x="0" y="22" font-size="12" fill="#555">${scaleKm} km（${scaleKm/0.25} 格）</text>
</g>
${tableSvg}
${legendSvg}
</svg>`;
await writeFile(ROOT+'/tools/sketch-hs2.svg', svg);
console.log('SVG', (svg.length/1024).toFixed(0),'KB','剔除小地块',dropped,'合计游戏',totalKm2,'OSM',totalOsm);
console.log(rows.map(r=>`${r.t}: 游戏 ${r.km2} / OSM ${r.osm}`).join('\n'));
