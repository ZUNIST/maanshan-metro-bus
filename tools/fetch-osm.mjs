// 拉取马鞍山全域 OSM 数据（分主题、可断点续传、多重试）
// 用法：node fetch-osm.mjs [主题名...]
import { writeFile, readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';

const CACHE = path.resolve(process.argv[2] === '--' ? process.argv[3] : 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/osm-cache');
const BB = '31.325,117.835,32.070,118.900';   // south,west,north,east
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const Q = {
  water: `[out:json][timeout:300];(
    way["natural"="water"](${BB});
    way["waterway"="riverbank"](${BB});
    way["landuse"="reservoir"](${BB});
    way["natural"="wetland"](${BB});
  );out geom;`,
  waterRel: `[out:json][timeout:300];(
    rel["natural"="water"]["type"="multipolygon"](${BB});
    rel["waterway"="riverbank"]["type"="multipolygon"](${BB});
  );out geom;`,
  waterway: `[out:json][timeout:300];way["waterway"~"^(river|canal|stream|drain)$"](${BB});out geom;`,
  roads: `[out:json][timeout:600];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${BB});out geom;`,
  rail: `[out:json][timeout:300];way["railway"~"^(rail|light_rail)$"](${BB});out geom;`,
  green: `[out:json][timeout:300];(
    way["leisure"~"^(park|nature_reserve|garden)$"](${BB});
    way["landuse"~"^(forest|meadow|grass)$"](${BB});
    way["natural"="wood"](${BB});
  );out geom;`,
  admin: `[out:json][timeout:600];rel["boundary"="administrative"]["admin_level"~"^(6|7|8)$"](${BB});out geom;`,
  // 地名：城市/区县/镇/村/自然村/片区/居民点全都要——游戏用最近的这些名字给车站命名，
  // 只取 city..neighbourhood 时乡镇以下的自然村全缺，设站时可选名字太少
  places: `[out:json][timeout:600];(
    node["place"~"^(city|town|suburb|village|hamlet|quarter|neighbourhood|locality|isolated_dwelling|city_district|borough)$"](${BB});
    node["railway"="station"](${BB});
    node["railway"="halt"](${BB});
    node["amenity"="bus_station"][name](${BB});
  );out;`,
};

async function fetchOne(url, body, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 900000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': 'city-metro-map-builder/1.0 (Maanshan fan map; contact: local)', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(body),
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      const json = JSON.parse(txt);
      if (!json.elements) throw new Error('no elements');
      return json;
    } catch (e) {
      const wait = 8000 * Math.pow(1.8, i);
      console.error(`  retry ${i + 1}/${tries} after ${Math.round(wait / 1000)}s: ${e.message}`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error('fetch failed: ' + url);
}

await mkdir(CACHE, { recursive: true });
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
for (const [key, q] of Object.entries(Q)) {
  if (only.length && !only.includes(key)) continue;
  const file = path.join(CACHE, key + '.json');
  try { const s = await stat(file); if (s.size > 1000) { console.log('skip', key, s.size); continue; } } catch {}
  let done = false;
  for (const ep of ENDPOINTS) {
    try {
      console.log('fetch', key, 'from', ep);
      const json = await fetchOne(ep, q);
      await writeFile(file, JSON.stringify(json));
      const s = await stat(file);
      console.log('  ok', key, json.elements.length, 'elements', (s.size / 1048576).toFixed(2), 'MB');
      done = true; break;
    } catch (e) { console.error('  endpoint failed:', ep, e.message); }
  }
  if (!done) throw new Error('all endpoints failed for ' + key);
}
console.log('done');
