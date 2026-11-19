import { writeFile } from 'node:fs/promises';
const BB='31.325,117.835,32.070,118.900';
const EP='https://overpass-api.de/api/interpreter';
const Q=`[out:json][timeout:600];(
  node["highway"="bus_stop"][name](${BB});
  node["public_transport"="platform"][name](${BB});
  node["amenity"="bus_station"][name](${BB});
);out;`;
async function get(body,tries=6){
  for(let i=0;i<tries;i++){
    try{
      const r=await fetch(EP,{method:'POST',headers:{'User-Agent':'city-metro-builder/1.0','Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(body)});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j=JSON.parse(await r.text()); if(!j.elements) throw new Error('no elements'); return j;
    }catch(e){ console.error('retry',i+1,e.message); await new Promise(r=>setTimeout(r,8000*(i+1))); }
  }
  throw new Error('failed');
}
const j=await get(Q);
await writeFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/osm-cache/busstop.json', JSON.stringify(j));
const pts=j.elements.filter(e=>e.tags&&e.tags.name);
console.log('bus/stop', j.elements.length, 'named', pts.length, pts.slice(0,6).map(e=>e.tags.name).join(','));
