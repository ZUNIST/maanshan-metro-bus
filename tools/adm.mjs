import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const src = await readFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/city-and-metro/js/geo_ms.js','utf8');
const CM={}; vm.runInNewContext(src,{window:{CM}});
const G=CM.GEOS.ms, P=G.proj, names=G.names;
function dec(str, from=0){const out=[];let i=from,x=0,y=0;while(i<str.length){let r=0,sh=0,b;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);x+=(r&1)?~(r>>1):(r>>1);r=0;sh=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);y+=(r&1)?~(r>>1):(r>>1);out.push(x/64,y/64);}return out;}
for(const r of G.admin){ if(r[0]!==8) continue; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const s of r.slice(2)){const p=dec(s,1);for(let i=0;i<p.length;i+=2){x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);y0=Math.min(y0,p[i+1]);y1=Math.max(y1,p[i+1]);}}
  const cx=(x0+x1)/2, cy=(y0+y1)/2;
  console.log([names[r[1]], cx.toFixed(1), cy.toFixed(1), (P.lat0-cy/P.ky).toFixed(4), (P.lon0+cx/P.kx).toFixed(4)].join('\t'));
}
