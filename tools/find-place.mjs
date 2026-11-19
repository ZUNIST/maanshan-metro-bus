// 按名称查 geo_hx 的 place 点：node tools/find-place.mjs 乌江 香泉 ...
import fs from 'node:fs';
import vm from 'node:vm';
const CM = { GEOS: {} };
vm.runInNewContext(fs.readFileSync('city-and-metro-bus/js/geo_hx.js', 'utf8'), { CM, console, window: { CM } });
const G = CM.GEOS.hx;
const kws = process.argv.slice(2);
const KIND = { 0: '?', 1: '村/镇', 2: '?', 3: '?' };
for (const kw of kws) {
  const hit = [];
  for (const p of G.places) {
    const nm = G.names[p[0]] !== undefined ? G.names[p[0]] : p[0];
    if (String(nm).indexOf(kw) >= 0) hit.push([nm, p[1], p[2], p[3]]);
  }
  console.log('##', kw, hit.length);
  for (const h of hit.slice(0, 12)) console.log('   ', h[0], h[1], h[2], 'kind', h[3]);
}
