import { writeFile, stat } from 'node:fs/promises';
const BB='31.325,117.835,32.070,118.900';
const EP='https://overpass-api.de/api/interpreter';
const Q={
  roads2008:`[out:json][timeout:600][date:"2008-06-01T00:00:00Z"];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](${BB});out geom;`,
  roads2013:`[out:json][timeout:600][date:"2013-06-01T00:00:00Z"];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](${BB});out geom;`,
  roads2018:`[out:json][timeout:600][date:"2018-06-01T00:00:00Z"];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](${BB});out geom;`,
};
async function get(body,tries=6){
  for(let i=0;i<tries;i++){
    try{
      const r=await fetch(EP,{method:'POST',headers:{'User-Agent':'city-metro-builder/1.0','Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(body)});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j=JSON.parse(await r.text()); if(!j.elements) throw new Error('no elements'); return j;
    }catch(e){ console.error('  retry',i+1,e.message); await new Promise(r=>setTimeout(r,8000*(i+1))); }
  }
  throw new Error('failed');
}
for(const [k,q] of Object.entries(Q)){
  const f=`C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/osm-cache/${k}.json`;
  try{ const s=await stat(f); if(s.size>1000){ console.log('skip',k,s.size); continue; } }catch{}
  const j=await get(q);
  await writeFile(f,JSON.stringify(j));
  console.log(k, j.elements.length);
}
