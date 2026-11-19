// 用高德 POI 检索核验和县地图上的地名/站点坐标，换算到 hx 格网（240×288，lon0=117.94, lat0=32.04665）
// 用法：AMAP_KEY=xxx node tools/amap-hx.mjs 历阳镇 乌江镇 ...
const KEY = process.env.AMAP_KEY;
const pr = { lon0: 117.94, lat0: 32.04664864864865, kx: 378.8, ky: 444 };
function gcj2wgs(lat, lon) {
  const pi = Math.PI, a = 6378245, ee = 0.006693421622965943;
  const tLat = (x, y) => { let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3; r += (20 * Math.sin(x * pi) + 40 * Math.sin(x / 3 * pi)) * 2 / 3; r += (160 * Math.sin(x / 12 * pi) + 320 * Math.sin(x * pi / 30)) * 2 / 3; return r; };
  const tLon = (x, y) => { let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x)); r += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3; r += (20 * Math.sin(x * pi) + 40 * Math.sin(x / 3 * pi)) * 2 / 3; r += (150 * Math.sin(x / 12 * pi) + 300 * Math.sin(x / 30 * pi)) * 2 / 3; return r; };
  let dLat = tLat(lat - 35, lon - 105), dLon = tLon(lat - 35, lon - 105);
  const rad = lat / 180 * pi; let m = Math.sin(rad); m = 1 - ee * m * m; const sq = Math.sqrt(m);
  dLat = (dLat * 180) / ((a * (1 - ee)) / (m * sq) * pi); dLon = (dLon * 180) / (a / sq * Math.cos(rad) * pi);
  return [lat * 2 - (lat + dLat), lon * 2 - (lon + dLon)];
}
const words = process.argv.slice(2);
const city = process.env.AMAP_CITY || '';
for (const w of words) {
  const u = 'https://restapi.amap.com/v3/place/text?keywords=' + encodeURIComponent(w) +
    (city ? '&city=' + encodeURIComponent(city) : '') + '&offset=8&page=1&key=' + KEY;
  let j;
  try { j = await (await fetch(u)).json(); } catch (e) { console.log('【' + w + '】请求失败', e.message); continue; }
  if (j.status !== '1') { console.log('【' + w + '】高德错误', j.info); continue; }
  const list = (j.pois || []).map(p => {
    if (!p.location) return null;
    const [lon, lat] = p.location.split(',').map(Number);
    const g = gcj2wgs(lat, lon);
    const x = (g[1] - pr.lon0) * pr.kx, y = (pr.lat0 - g[0]) * pr.ky;
    return { n: p.name, g: lat.toFixed(6) + ',' + lon.toFixed(6), x: +x.toFixed(1), y: +y.toFixed(1), t: (p.type || '').split(';').pop(), a: p.adname, inb: x >= 0 && x <= 240 && y >= 0 && y <= 288 };
  }).filter(Boolean);
  console.log('【' + w + '】' + (list.length ? '' : '（无结果）'));
  for (const p of list.slice(0, 6)) console.log('   ' + (p.inb ? '✓' : '✗') + ' ' + p.n + ' [' + p.a + '·' + p.t + '] ' + p.g + ' → (' + p.x + ',' + p.y + ')');
  await new Promise(r => setTimeout(r, 220));
}
