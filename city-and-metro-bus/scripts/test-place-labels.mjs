// 村镇地名标签层测试（v3.18）：放大时 geo 地名库（OSM place）应出现在地图标签里，
// 缩小时不显示；当涂县、市区的村名/镇名可被看到。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
function canvas() {
  const cv = { width: 900, height: 700 };
  const ctx = new Proxy({
    canvas: cv,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
    drawImage: () => {},
    measureText: s => ({ width: String(s).length * 8 }),
  }, { get: (o, k) => k in o ? o[k] : () => {} });
  cv.getContext = () => ctx;
  return cv;
}
const context = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout, navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
context.window = context;
vm.createContext(context);
const root = new URL('../', import.meta.url);
for (const [, src] of (await readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)) {
  vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
  if (src === 'js/save.js') break;
}
vm.runInContext(await readFile(new URL('js/settings.js', root), 'utf8'), context, { filename: 'js/settings.js' });
vm.runInContext(await readFile(new URL('js/render.js', root), 'utf8'), context, { filename: 'js/render.js' });
vm.runInContext(await readFile(new URL('js/sites.js', root), 'utf8'), context, { filename: 'js/sites.js' });
vm.runInContext(await readFile(new URL('js/scenery.js', root), 'utf8'), context, { filename: 'js/scenery.js' });
context.document = { createElement: name => { assert.equal(name, 'canvas'); return canvas(); } };

const C = context.CM;
C.UI = function () {};
C.useMap('ms');
const g = C.Game.create({ mode: 'free', seed: 20270101 });
assert.ok(C.Geo.ready, 'Geo ready');
// v3.20.1 清洗掉 864 条永远当不了站名的条目（超长机关名、院校内部单位），地名库 7678 → 6814
assert.ok(C.Geo.places.length > 6500, 'places loaded: ' + C.Geo.places.length);

const R = new C.Renderer(canvas());
R.game = g; R.w = 900; R.h = 700;
R.resize = () => {}; R.updateCamera = () => R.computeTransform(); R.syncFacModels = () => {};
R.markDirty = () => {}; R.rasterLevel = () => 0; R.prefetch = () => {}; R.agentsOn = false;
for (const name of Object.getOwnPropertyNames(C.Renderer.prototype)) if (name.startsWith('draw')) R[name] = () => {};
R.drawLabels = C.Renderer.prototype.drawLabels;   // 标签排版要真跑（其余 draw* 已 stub）

// 记录 labelSprite 收到的所有文本
const texts = [];
const origSprite = C.Renderer.prototype.labelSprite;
R.labelSprite = function (t, f, c) { texts.push(String(t)); return origSprite.call(this, t, f, c); };

const run = (zoom, cx, cy) => {
  texts.length = 0;
  R.cam.cx = cx; R.cam.cy = cy; R.cam.zoom = R.cam.tz = zoom;
  R.computeTransform();
  R.render(1 / 60, null);   // 先跑一帧让 view / stPx 等状态就绪（drawLabels 已 stub 的部分会重设回真函数）
  // 直接排版（绕过 drawLabels 的 110ms 移动节流，避免测试时序不稳定）
  R.layoutLabels({}, 'test-sig', 'cam' + zoom + ':' + cx + ':' + cy + ':' + Math.random(), performance.now(), true);
  return texts.slice();
};

// 1. 缩小视图（z=10）：无村名标签
const small = run(10, 261.6, 168.8);
assert.ok(!small.some(t => /村$|镇$/.test(t) && !/站/.test(t)), 'z=10: no village labels');
console.log('z=10 labels:', small.length);

// 2. 市区放大（z=20，市中心）：应有村名/社区/镇名标签
const urban = run(20, 261.6, 168.8);
const urbanVill = urban.filter(t => /村|镇|社区|小区/.test(t));
assert.ok(urbanVill.length >= 3, 'z=20 city center: village labels visible (' + urbanVill.length + ')');
console.log('z=20 市区村名样例:', urbanVill.slice(0, 10).join(' / '));

// 3. 当涂东部放大（大公圩一带 [322,262]）：此前 0 个地标，现在应有镇村名
const east = run(20, 322, 262);
const eastVill = east.filter(t => /村|镇|社区|小区|圩/.test(t));
assert.ok(eastVill.length >= 3, 'z=20 当涂东部: village labels visible (' + eastVill.length + ')');
console.log('z=20 当涂东部村名样例:', eastVill.slice(0, 10).join(' / '));
assert.ok(east.some(t => t.includes('石桥镇') || t.includes('石桥')), '石桥镇 label visible');

// 4. 当涂县城（[259,222]）：住宅小区名可见
const dt = run(22, 259, 222);
console.log('z=22 当涂县城样例:', dt.filter(t => /小区|社区|村/.test(t)).slice(0, 8).join(' / '));

// 5. 中间档（z=14）：level 1 城镇名（如"慈湖""采石"）可见，村名不出现
const mid = run(14, 246.9, 181.9);
assert.ok(!mid.some(t => /村$/.test(t)), 'z=14: no level-2 village names');
console.log('z=14 采石附近:', mid.slice(0, 8).join(' / '));

console.log('PASS place labels: village/town names render at high zoom across urban, rural and county areas');
