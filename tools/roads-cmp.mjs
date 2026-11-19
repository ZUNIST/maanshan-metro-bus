import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const CM={}; vm.runInNewContext(await readFile(ROOT+'/city-and-metro/js/geo_ms.js','utf8'),{window:{CM}});
const G=CM.GEOS.ms;
function dec(str){const o=[];let i=0,x=0,y=0;while(i<str.length){let r=0,sh=0,b;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);x+=(r&1)?~(r>>1):(r>>1);r=0;sh=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);y+=(r&1)?~(r>>1):(r>>1);o.push(x/64,y/64);}return o;}
const CX=262.2, CY=162.3, HALF=10.5, S=1280/(HALF*2);
const X=x=>((x-(CX-HALF))*S).toFixed(1), Y=y=>((y-(CY-HALF))*S).toFixed(1);
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1280"><rect width="1280" height="1280" fill="#f6f4ee"/>`;
// 水面
for(const r of G.water){
  if(typeof r[1]==='number') continue;
  for(let k=1;k<r.length;k++){ const p=dec(String(r[k]).slice(1)); let d='M'+X(p[0])+' '+Y(p[1]); for(let i=2;i<p.length;i+=2) d+='L'+X(p[i])+' '+Y(p[i+1]); svg+=`<path d="${d}Z" fill="#cfe0ef"/>`; }
}
const COL={2:'#b9b2a4',3:'#8d8577',4:'#5c5346'};
const WID={2:1.6,3:3.2,4:5.6};
for(const cls of [2,3,4]){
  let d='';
  for(const r of G.roads){ if(r[1]!==cls) continue; const p=dec(r[3]); if(!p.length) continue;
    let inb=false;
    for(let i=0;i<p.length;i+=2){ if(p[i]>CX-HALF-2&&p[i]<CX+HALF+2&&p[i+1]>CY-HALF-2&&p[i+1]<CY+HALF+2){inb=true;break;} }
    if(!inb) continue;
    d+='M'+X(p[0])+' '+Y(p[1]);
    for(let i=2;i<p.length;i+=2) d+='L'+X(p[i])+' '+Y(p[i+1]);
  }
  svg+=`<path d="${d}" fill="none" stroke="${COL[cls]}" stroke-width="${WID[cls]}" stroke-linecap="round"/>`;
}
svg+='</svg>';
await writeFile(ROOT+'/tools/roads-cmp.svg', svg);
console.log('ok', (svg.length/1024).toFixed(0)+'KB');
