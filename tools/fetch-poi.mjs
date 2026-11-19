import { writeFile } from 'node:fs/promises';
const BB='31.325,117.835,32.070,118.900';
const EP='https://overpass-api.de/api/interpreter';
const Q=`[out:json][timeout:600];(
  node["tourism"][name](${BB});
  way["tourism"~"^(attraction|museum|hotel|zoo|theme_park)$"][name](${BB});
  node["historic"][name](${BB});
  way["historic"~"^(memorial|archaeological_site|monument|castle)$"][name](${BB});
  node["amenity"~"^(university|college|hospital|stadium|theatre|place_of_worship|marketplace)$"][name](${BB});
  way["amenity"~"^(university|college|hospital|stadium|marketplace)$"][name](${BB});
  way["leisure"~"^(park|garden|nature_reserve)$"][name](${BB});
  node["leisure"~"^(park|garden)$"][name](${BB});
  node["shop"="mall"][name](${BB});
  way["shop"="mall"][name](${BB});
  node["office"][name](${BB});
  way["office"][name](${BB});
  node["landuse"="industrial"][name](${BB});
  way["landuse"="industrial"][name](${BB});
  node["amenity"="bus_station"][name](${BB});
);out center tags;`;
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
await writeFile('C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/osm-cache/poi.json', JSON.stringify(j));
console.log('poi', j.elements.length);
