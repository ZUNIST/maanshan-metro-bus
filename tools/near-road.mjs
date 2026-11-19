import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const ROOT='C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24';
const CM={}; vm.runInNewContext(await readFile(ROOT+'/city-and-metro/js/geo_ms.js','utf8'),{window:{CM}});
const G=CM.GEOS.ms;
function dec(str){const o=[];let i=0,x=0,y=0;while(i<str.length){let r=0,sh=0,b;
  do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);x+=(r&1)?~(r>>1):(r>>1);
  r=0;sh=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);y+=(r&1)?~(r>>1):(r>>1);
  o.push(x/64,y/64);}return o;}
const P=process.argv.slice(2).map(Number);
for(let k=0;k<P.length;k+=2){
  const tx=P[k], ty=P[k+1], hits=[];
  for(const r of G.roads){ const p=dec(r[3]);
    for(let i=0;i<p.length;i+=2){ const d=Math.hypot(p[i]-tx,p[i+1]-ty); if(d<3) { hits.push([d, r[0]>=0?G.names[r[0]]:'(无名)', r[1]]); break; } }
  }
  hits.sort((a,b)=>a[0]-b[0]);
  console.log('点', tx+','+ty, '→', hits.slice(0,6).map(h=>h[1]+'/cls'+h[2]+'/'+h[0].toFixed(1)+'格').join('  '));
}
