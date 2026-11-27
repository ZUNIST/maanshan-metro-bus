// 采集文件里的街巷图层（service / track / path / footway / living_street / pedestrian）
// 用法：node tools/fetch-minor.mjs <缓存目录>
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE = process.argv[2] || 'C:/Users/zuni/WorkBuddy/2026-11-15-15-18-24/osm-cache';
const BB = '31.325,117.835,32.070,118.900';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const Q = `[out:json][timeout:600];way["highway"~"^(service|track|path|footway|living_street|pedestrian)$"](${BB});out geom;`;

for (const ep of ENDPOINTS) {
  for (let i = 0; i < 4; i++) {
    try {
      console.log('fetch minor from', ep);
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'User-Agent': 'city-metro-map-builder/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(Q),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json.elements) throw new Error('no elements');
      await writeFile(path.join(CACHE, 'minor.json'), JSON.stringify(json));
      console.log('  ok minor', json.elements.length, 'elements');
      process.exit(0);
    } catch (e) {
      console.error('  retry', i + 1, e.message);
      await new Promise(r => setTimeout(r, 6000 * (i + 1)));
    }
  }
}
throw new Error('all endpoints failed for minor');
