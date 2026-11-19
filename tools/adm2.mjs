import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const src=await readFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/city-and-metro/js/geo_ms.js','utf8');
const CM={}; vm.runInNewContext(src,{window:{CM}});
const G=CM.GEOS.ms, names=G.names;
function dec(str,from=0){const out=[];let i=from,x=0,y=0;while(i<str.length){let r=0,sh=0,b;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);x+=(r&1)?~(r>>1):(r>>1);r=0;sh=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5;}while(b>=32);y+=(r&1)?~(r>>1):(r>>1);out.push(x/64,y/64);}return out;}
const want=['玄武区','花山区','雨山区','当涂县','霍里街道','解放路街道','和县','含山县'];
for(const r of G.admin){
  const nm=names[r[1]]; if(!want.includes(nm)&&r[0]!==8) continue;
  console.log('L'+r[0], nm, 'rings=', r.length-2, r.slice(2).map(s=>s[0]+':'+s.length).join(' '));
  if(want.includes(nm)) console.log('   first ring pts=', dec(r[2],1).length/2, JSON.stringify(dec(r[2],1).slice(0,8)));
}
console.log('total admin', G.admin.length);
