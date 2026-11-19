// 生成含山县建成区对照示意图（SVG）
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const BBOX={s:31.325,w:117.835,n:32.070,e:118.900};
const W=416,H=328,KX=W/(BBOX.e-BBOX.w),KY=H/(BBOX.n-BBOX.s);
const proj=(lat,lon)=>[(lon-BBOX.w)*KX,(BBOX.n-lat)*KY];
const key=p=>p.lat.toFixed(7)+','+p.lon.toFixed(7);
const box={x0:44,x1:151,y0:105,y1:230};
const S=7, M=28, LEG=250;
const pw=(box.x1-box.x0)*S, ph=(box.y1-box.y0)*S;
const X=x=>((x-box.x0)*S+M).toFixed(1), Y=y=>((y-box.y0)*S+M).toFixed(1);

// geo_ms.js：解码水面
const src=await readFile(ROOT+'/city-and-metro/js/geo_ms.js','utf8');
const CM={}; vm.runInNewContext(src,{window:{CM}});
const G=CM.GEOS.ms, names=G.names;
function dec(str,from=0){const out=[];let i=from,x=0,y=0;while(i<str.length){let r=0,sh=0,b;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);x+=(r&1)?~(r>>1):(r>>1);r=0;sh=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);y+=(r&1)?~(r>>1):(r>>1);out.push(x/64,y/64);}return out;}
const bbOk=(p)=>p.some((v,i)=>i%2===0? (v>box.x0-2&&v<box.x1+2):(v>box.y0-2&&v<box.y1+2));
const pathOf=(p)=>{let d='M'+X(p[0])+' '+Y(p[1]);for(let i=2;i<p.length;i+=2)d+='L'+X(p[i])+' '+Y(p[i+1]);return d+'Z';};
let waterSvg='';
for(const r of G.water){
  if(typeof r[1]==='number') continue;
  for(let k=1;k<r.length;k++){ const p=dec(r[k],1); if(!bbOk(p)) continue; waterSvg+=`<path d="${pathOf(p)}" fill="#cfe3f1" fill-rule="evenodd"/>`; }
}
for(const r of G.water){
  if(typeof r[1]!=='number') continue;
  const p=dec(r[2]); if(!bbOk(p)) continue;
  let d='M'+X(p[0])+' '+Y(p[1]); for(let i=2;i<p.length;i+=2) d+='L'+X(p[i])+' '+Y(p[i+1]);
  waterSvg+=`<path d="${d}" fill="none" stroke="#cfe3f1" stroke-width="${Math.max(1.5,r[1]*S)}" stroke-linecap="round"/>`;
}

// 行政界线（含山县与所属镇）
const adm=JSON.parse(await readFile(ROOT+'/osm-cache/admin.json','utf8')).elements;
function stitch(members){const segs=members.filter(m=>m.geometry&&m.geometry.length>1).map(m=>m.geometry.slice());const rings=[];let pool=segs;
  while(pool.length){let cur=pool.shift(),g=0;
    while(g++<20000){ if(key(cur[0])===key(cur[cur.length-1]))break; const t=key(cur[cur.length-1]);let f=-1,rev=false;
      for(let i=0;i<pool.length;i++){if(key(pool[i][0])===t){f=i;break;}if(key(pool[i][pool[i].length-1])===t){f=i;rev=true;break;}}
      if(f<0)break; const add=(rev?pool[f].slice().reverse():pool[f].slice()); pool.splice(f,1); cur=cur.concat(add.slice(1));}
    if(cur.length>3&&key(cur[0])===key(cur[cur.length-1])) rings.push(cur);}
  return rings;}
const ringsFor=(name)=>{const out=[];for(const e of adm){if(e.type!=='relation'||!e.tags||e.tags.name!==name)continue;
  for(const r of stitch(e.members.filter(m=>m.type==='way'&&(m.role==='outer'||!m.role)))) out.push(r.map(p=>proj(p.lat,p.lon)).flat());}return out;};
const HS_TOWNS=['环峰镇','昭关镇','仙踪镇','清溪镇','陶厂镇','林头镇','铜闸镇','运漕镇'];
let admSvg='', labelSvg='';
for(const t of HS_TOWNS){
  const rs=ringsFor(t);
  if(!rs.length){console.log('缺多边形',t);continue;}
  rs.forEach(p=>admSvg+=`<path d="${pathOf(p)}" fill="none" stroke="#5b7fa6" stroke-width="1.1" stroke-dasharray="5 4" opacity="0.75"/>`);
  let x=0,y=0,n=0; for(const p of rs) for(let i=0;i<p.length;i+=2){x+=p[i];y+=p[i+1];n++;}
  labelSvg+=`<text x="${X(x/n)}" y="${Y(y/n)}" font-size="13" font-weight="600" fill="#3d5a75" text-anchor="middle" opacity="0.9">${t}</text>`;
}

// OSM 真实用地轮廓
const lu=JSON.parse(await readFile(ROOT+'/osm-cache/landuse.json','utf8')).elements;
const LU_STYLE={residential:'#d2691e',industrial:'#7d4fa8',commercial:'#c0392b',retail:'#c0392b',construction:'#8a8a8a'};
let realSvg='';
for(const e of lu){
  if(e.type!=='way'||!e.geometry||e.geometry.length<4) continue;
  const t=e.tags&&e.tags.landuse; const col=LU_STYLE[t]; if(!col) continue;
  const g=e.geometry; if(g[0].lat!==g[g.length-1].lat||g[0].lon!==g[g.length-1].lon) continue;
  const flat=[]; for(const q of g){const p=proj(q.lat,q.lon); flat.push(p[0],p[1]);}
  if(!bbOk(flat)) continue;
  realSvg+=`<path d="${pathOf(flat)}" fill="none" stroke="${col}" stroke-width="1.3" opacity="0.85"/>`;
}

// 游戏的逐格用地
const EXP=JSON.parse(await readFile(ROOT+'/tools/lu-hs.json','utf8'));
const bw=EXP.bw, GW=bw.x1-bw.x0;
const CELL_COL={'1':'#e07b39','2':'#c0392b','3':'#8e5bb5','4':'#e0b040','6':'#3aa3a3'};
let cellSvg='';
for(let j=bw.y0;j<bw.y1;j++)for(let i=bw.x0;i<bw.x1;i++){
  const ch=EXP.lu[(j-bw.y0)*GW+(i-bw.x0)];
  const col=CELL_COL[ch]; if(!col) continue;
  cellSvg+=`<rect x="${X(i)}" y="${Y(j)}" width="${S}" height="${S}" fill="${col}" opacity="0.62"/>`;
}
// 人口中心
let cenSvg='';
for(const [x,y,pop,jobs,r] of EXP.centers){
  if(x<box.x0||x>box.x1||y<box.y0||y>box.y1) continue;
  cenSvg+=`<circle cx="${X(x)}" cy="${Y(y)}" r="${(r*S).toFixed(1)}" fill="none" stroke="#1d1d1d" stroke-width="1.4" stroke-dasharray="3 3" opacity="0.8"/>`;
  cenSvg+=`<circle cx="${X(x)}" cy="${Y(y)}" r="2.2" fill="#1d1d1d"/>`;
}

// 图例
const legend=[
  ['#e07b39','游戏判定：住宅','fill'],['#c0392b','游戏判定：商业办公','fill'],['#8e5bb5','游戏判定：工业仓储','fill'],
  ['#e0b040','游戏判定：混合功能','fill'],['#3aa3a3','游戏判定：学校机构','fill'],
  ['#d2691e','OSM 真实居住地块（轮廓）','line'],['#7d4fa8','OSM 真实工业地块（轮廓）','line'],
  ['#1d1d1d','人口中心及其影响半径','circle'],['#5b7fa6','镇界','dash'],
];
const legendSvg=legend.map(([c,label,kind],i)=>{
  const y=110+i*24;
  const mark = kind==='fill'?`<rect x="16" y="${y-9}" width="14" height="12" fill="${c}" opacity="0.62"/>`
    : kind==='line'?`<rect x="16" y="${y-4}" width="14" height="2.4" fill="${c}"/>`
    : kind==='circle'?`<circle cx="23" cy="${y-3}" r="6" fill="none" stroke="${c}" stroke-width="1.4" stroke-dasharray="3 3"/>`
    : `<rect x="16" y="${y-4}" width="14" height="2.4" fill="none" stroke="${c}" stroke-dasharray="5 4"/>`;
  return mark+`<text x="36" y="${y}" font-size="12" fill="#2b2b2b">${label}</text>`;
}).join('');

const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${pw+M*2+LEG}" height="${ph+M*2+80}" viewBox="0 0 ${pw+M*2+LEG} ${ph+M*2+80}" font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif">
<rect width="100%" height="100%" fill="#fbfaf6"/>
<text x="${M}" y="20" font-size="16" font-weight="700" fill="#1d1d1d">含山县 · 建成区对照（游戏 2000 年局面 vs OSM 真实用地）</text>
<g>${waterSvg}${cellSvg}${realSvg}${admSvg}${cenSvg}${labelSvg}</g>
${legendSvg}
<g transform="translate(16,${110+legend.length*24+16})">
  <rect x="0" y="0" width="${pw*0.35}" height="6" fill="#1d1d1d"/>
  <text x="0" y="22" font-size="12" fill="#555">${(pw*0.35/S*0.25).toFixed(1)} km</text>
</g>
</svg>`;
await writeFile(ROOT+'/tools/sketch-hs.svg', svg);
console.log('SVG', (svg.length/1024).toFixed(0), 'KB', 'pw', pw, 'ph', ph);
