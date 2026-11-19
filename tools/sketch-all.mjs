// 马鞍山全市 8 个城镇组团的建成区对照总图
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const BB={s:31.325,w:117.835,n:32.070,e:118.900};
const W=416,H=328,KX=W/(BB.e-BB.w),KY=H/(BB.n-BB.s);
const proj=(lat,lon)=>[(lon-BB.w)*KX,(BB.n-lat)*KY];

// 水面
const src=await readFile(ROOT+'/city-and-metro/js/geo_ms.js','utf8');
const CM={}; vm.runInNewContext(src,{window:{CM}});
const G=CM.GEOS.ms;
function dec(str,from=0){const o=[];let i=from,x=0,y=0;while(i<str.length){let r=0,sh=0,b;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);x+=(r&1)?~(r>>1):(r>>1);r=0;sh=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);y+=(r&1)?~(r>>1):(r>>1);o.push(x/64,y/64);}return o;}
const waterPolys=[], waterLines=[];
for(const r of G.water){
  if(typeof r[1]==='number'){ waterLines.push({p:dec(r[2]),w:r[1]}); continue; }
  for(let k=1;k<r.length;k++) waterPolys.push(dec(r[k],1));
}
// 真实用地（>=8000 m²）
const lu=JSON.parse(await readFile(ROOT+'/osm-cache/landuse.json','utf8')).elements;
const REAL=[];
for(const e of lu){
  if(e.type!=='way'||!e.geometry||e.geometry.length<4)continue;
  const t=e.tags&&e.tags.landuse; if(!['residential','industrial','commercial'].includes(t))continue;
  const g=e.geometry; if(g[0].lat!==g[g.length-1].lat||g[0].lon!==g[g.length-1].lon)continue;
  const flat=[]; for(const q of g){const p=proj(q.lat,q.lon);flat.push(p[0],p[1]);}
  let a=0;const n=flat.length/2;for(let i=0;i<n;i++){const j=(i+1)%n;a+=flat[2*i]*flat[2*j+1]-flat[2*j]*flat[2*i+1];}
  a=Math.abs(a)/2*0.0625;                     // km²
  if(a<0.004)continue;                         // 4000 m²
  let cx=0,cy=0;for(let i=0;i<flat.length;i+=2){cx+=flat[i];cy+=flat[i+1];}
  REAL.push({p:flat,a,t,cx:cx/(flat.length/2),cy:cy/(flat.length/2),bb:[Math.min(...flat.filter((_,i)=>i%2===0)),Math.min(...flat.filter((_,i)=>i%2===1)),Math.max(...flat.filter((_,i)=>i%2===0)),Math.max(...flat.filter((_,i)=>i%2===1))]});
}
// 游戏用地
const EXP=JSON.parse(await readFile(ROOT+'/tools/lu-all.json','utf8'));
const bw=EXP.bw, GW=bw.x1-bw.x0;
const CELL_COL={'1':'#e07b39','2':'#c0392b','3':'#8e5bb5','4':'#e0b040','6':'#3aa3a3'};

const PANELS=[
  {name:'主城 · 花山/雨山/慈湖',cx:262,cy:172},
  {name:'和县县城 · 历阳',cx:204,cy:153},
  {name:'含山县城 · 环峰',cx:103,cy:158},
  {name:'郑蒲港 · 姥桥/白桥',cx:184,cy:216},
  {name:'当涂县城 · 姑孰',cx:259,cy:224},
  {name:'当涂南部 · 护河/石桥',cx:295,cy:247},
  {name:'博望 · 博望/丹阳',cx:388,cy:222},
  {name:'和县东北 · 乌江',cx:241,cy:95},
];
const HALF=18, S=8, PW=HALF*2*S;
const COLS=4, GAP=14, M=26;
const rowsN=Math.ceil(PANELS.length/COLS);
const totalW=M*2+COLS*(PW+GAP)-GAP;
const totalH=52+rowsN*(PW+64)+62;
let body='';
const stats=[];
PANELS.forEach((pn,idx)=>{
  const ci=idx%COLS, ri=(idx/COLS)|0;
  const ox=M+ci*(PW+GAP), oy=52+ri*(PW+64);
  const bx0=pn.cx-HALF, by0=pn.cy-HALF, bx1=pn.cx+HALF, by1=pn.cy+HALF;
  const X=x=>((x-bx0)*S).toFixed(1), Y=y=>((y-by0)*S).toFixed(1);
  const inBox=(p)=>p.some((v,i)=>i%2===0?(v>=bx0-1&&v<=bx1+1):(v>=by0-1&&v<=by1+1));
  const pathOf=(p)=>{let d='M'+X(p[0])+' '+Y(p[1]);for(let i=2;i<p.length;i+=2)d+='L'+X(p[i])+' '+Y(p[i+1]);return d+'Z';};

  let s=`<g transform="translate(${ox},${oy})"><rect width="${PW}" height="${PW}" fill="#f7f5ee" stroke="#d8d2c4"/>
<clipPath id="c${idx}"><rect width="${PW}" height="${PW}"/></clipPath><g clip-path="url(#c${idx})">`;
  for(const p of waterPolys) if(inBox(p)) s+=`<path d="${pathOf(p)}" fill="#d6e8f4" fill-rule="evenodd"/>`;
  for(const l of waterLines) if(inBox(l.p)){
    let d='M'+X(l.p[0])+' '+Y(l.p[1]); for(let i=2;i<l.p.length;i+=2) d+='L'+X(l.p[i])+' '+Y(l.p[i+1]);
    s+=`<path d="${d}" fill="none" stroke="#d6e8f4" stroke-width="${Math.max(1.2,l.w*S)}" stroke-linecap="round"/>`;
  }
  let realKm=0, cellN=0;
  for(const r of REAL){
    if(r.cx<bx0-1||r.cx>bx1+1||r.cy<by0-1||r.cy>by1+1) continue;
    const col=r.t==='residential'?'#b5651d':r.t==='industrial'?'#6b3fa0':'#a93226';
    s+=`<path d="${pathOf(r.p)}" fill="${col}" fill-opacity="0.14" stroke="${col}" stroke-width="0.9"/>`;
    if(r.t==='residential' && r.cx>=bx0&&r.cx<bx1&&r.cy>=by0&&r.cy<by1) realKm+=r.a;
  }
  for(let j=by0;j<by1;j++)for(let i=bx0;i<bx1;i++){
    if(i<bw.x0||i>=bw.x1||j<bw.y0||j>=bw.y1) continue;
    const ch=String(EXP.lu.charCodeAt((j-bw.y0)*GW+(i-bw.x0))-65);
    const col=CELL_COL[ch]; if(!col) continue;
    s+=`<rect x="${X(i)}" y="${Y(j)}" width="${S}" height="${S}" fill="${col}" opacity="0.68"/>`;
    cellN++;
  }
  for(const [x,y,pop,jobs,r] of EXP.centers){
    if(x<bx0||x>bx1||y<by0||y>by1) continue;
    s+=`<circle cx="${X(x)}" cy="${Y(y)}" r="${(r*S).toFixed(1)}" fill="none" stroke="#111" stroke-width="1.1" stroke-dasharray="2.5 2.5" opacity="0.72"/><circle cx="${X(x)}" cy="${Y(y)}" r="2" fill="#111"/>`;
  }
  s+='</g>';
  // 比例尺 1km
  s+=`<rect x="6" y="${PW-12}" width="${S*4}" height="3.4" fill="#111"/><text x="${S*4+10}" y="${PW-8}" font-size="9" fill="#333">1 km</text>`;
  // 标题与数据
  const gameKm=(cellN*0.0625).toFixed(1);
  const ratio=realKm>0.2?(cellN*0.0625/realKm):null;
  stats.push({name:pn.name,game:gameKm,real:realKm.toFixed(1),ratio});
  const bad=ratio==null?'无法比较':(ratio>1.6?'偏高 '+ratio.toFixed(1)+'×':ratio<0.55?'偏低 '+ratio.toFixed(1)+'×':'接近');
  const badCol=ratio==null?'#999':(ratio>1.6?'#c0392b':ratio<0.55?'#1f6f4a':'#555');
  s+=`<text x="0" y="${PW+20}" font-size="12.5" font-weight="700" fill="#1d1d1d">${pn.name}</text>`;
  s+=`<text x="0" y="${PW+36}" font-size="11" fill="#c0392b">游戏 ${gameKm}</text>`;
  s+=`<text x="${PW*0.42}" y="${PW+36}" font-size="11" fill="#2b6b3a">OSM ${realKm.toFixed(1)}</text>`;
  s+=`<text x="${PW-2}" y="${PW+36}" font-size="11" font-weight="700" fill="${badCol}" text-anchor="end">${bad}</text>`;
  s+='</g>';
  body+=s;
});
const legend=[['#e07b39','游戏判定：住宅'],['#c0392b','游戏判定：商业办公'],['#8e5bb5','游戏判定：工业仓储'],['#e0b040','游戏判定：混合功能'],['#3aa3a3','游戏判定：学校机构'],['#b5651d','OSM 成片居住地块'],['#6b3fa0','OSM 成片工业地块'],['#111','人口中心与影响半径']];
let lg=`<g transform="translate(${M},${totalH-40})">`;
legend.forEach(([c,t],i)=>{ const col=i%4, row=(i/4)|0; const x=col*300, y=row*20;
  lg+=`<rect x="${x}" y="${y-9}" width="13" height="11" fill="${c}" opacity="0.75"/><text x="${x+19}" y="${y}" font-size="11.5" fill="#2b2b2b">${t}</text>`; });
lg+='</g>';

const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" font-family="Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif">
<rect width="100%" height="100%" fill="#fbfaf6"/>
<text x="${M}" y="26" font-size="17" font-weight="700" fill="#1d1d1d">马鞍山全市 · 八个城镇组团建成区对照（游戏 2000 年局面 vs OSM 真实用地）</text>
<text x="${M}" y="43" font-size="11.5" fill="#666">每格 250 m，窗口约 9 km × 9 km；彩色方块 = 游戏判定为建成区的格子，棕色/紫色轮廓 = OSM 真实地块（≥4000 m²，含村庄）；比值仅供参考</text>
${body}${lg}
</svg>`;
await writeFile(ROOT+'/tools/sketch-all.svg', svg);
console.log('SVG', (svg.length/1024).toFixed(0)+'KB', 'size', totalW+'x'+totalH);
console.log(stats.map(s=>`${s.name}: 游戏 ${s.game} / OSM ${s.real} = ${s.ratio? s.ratio.toFixed(2):'-'}`).join('\n'));
