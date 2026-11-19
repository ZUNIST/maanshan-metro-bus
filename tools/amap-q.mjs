// 查单个关键词的高德候选（仅保留地图范围内的点）
const KEY=process.env.AMAP_KEY;
const pr={lon0:117.835,lat0:32.07,kx:390.61,ky:440.27};
function gcj2wgs(lat,lon){const pi=Math.PI,a=6378245,ee=0.006693421622965943;
 const tLat=(x,y)=>{let r=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;r+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;r+=(160*Math.sin(x/12*pi)+320*Math.sin(x*pi/30))*2/3;return r;};
 const tLon=(x,y)=>{let r=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;r+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;r+=(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;return r;};
 let dLat=tLat(lat-35,lon-105), dLon=tLon(lat-35,lon-105);
 const rad=lat/180*pi; let m=Math.sin(rad); m=1-ee*m*m; const sq=Math.sqrt(m);
 dLat=(dLat*180)/((a*(1-ee))/(m*sq)*pi); dLon=(dLon*180)/(a/sq*Math.cos(rad)*pi);
 return [lat*2-(lat+dLat), lon*2-(lon+dLon)];}
const words=process.argv.slice(2);
for(const w of words){
  const u='https://restapi.amap.com/v3/place/text?keywords='+encodeURIComponent(w)+'&city=%E9%A9%AC%E9%9E%8D%E5%B1%B1&offset=10&page=1&key='+KEY;
  const j=await (await fetch(u)).json();
  const list=(j.pois||[]).map(p=>{
    if(!p.location) return null;
    const [lon,lat]=p.location.split(',').map(Number);
    const g=gcj2wgs(lat,lon); const x=(g[1]-pr.lon0)*pr.kx, y=(pr.lat0-g[0])*pr.ky;
    return {n:p.name, x:+x.toFixed(0), y:+y.toFixed(0), t:(p.type||'').split(';').pop(), a:p.adname};
  }).filter(Boolean).filter(p=>p.x>-20&&p.x<440&&p.y>-20&&p.y<350);
  console.log('【'+w+'】', list.length? list.slice(0,5).map(p=>p.n+'('+p.x+','+p.y+')'+p.t).join('  ') : '（范围内无结果）');
  await new Promise(r=>setTimeout(r,200));
}
