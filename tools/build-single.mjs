// 把整个游戏打包成「一个 html 文件」：双击就能玩，不需要服务器、不需要 Python。
//
// 做法：
//   1. index.html 里所有 <script src="js/*.js"> 的内容内联进 <script>（保留顺序，加 data-src 方便调试）；
//   2. css/style.css 内联成 <style>，favicon 转成 data URI；
//   3. 地理数据（<script type="application/city-metro-geo">）不是可执行脚本，而是按需载入的数据源：
//      改成内嵌的 <script type="application/city-metro-geo" id="geo-inline-geo_ms">，由 js/maps.js 的
//      loadGeo 在进入地图时取文本执行——这样仍然保持「只载入当前城市」的懒加载，不会一开页面就吃满内存。
//
// 用法：node tools/build-single.mjs [输出路径]
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

// 源目录可用环境变量 CM_SRC 指定（v3.23：有轨电车独立版本从 city-and-metro-tram 打包）
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.env.CM_SRC || 'city-and-metro');
const out = process.argv[2] || path.resolve(root, '..', '马鞍山地图', '马鞍山地图-单文件版.html');

// 加载动画 / 关于页引用 img/logo-*.png：单文件版没有 img/ 目录，file:// 下 SVG <image> 取不到图，
// 加载 LOGO 会发白、掉色（文件夹版正常）。v3.30 起把两张 LOGO 一并转成 data URI 内联。
const logoUris = {};
for (const f of ['img/logo-navy.png', 'img/logo-white.png']) {
  logoUris[f] = 'data:image/png;base64,' + (await readFile(path.join(root, f))).toString('base64');
}
const inlineLogos = function (text) {
  for (const f in logoUris) {
    text = text.split("'" + f + "'").join("'" + logoUris[f] + "'");
    text = text.split('"' + f + '"').join('"' + logoUris[f] + '"');
  }
  return text;
};

// 内联脚本必须把 </script 转义，否则 HTML 解析器会在这里截断脚本
const esc = s => s.replace(/<\/script/gi, '<\\/script');
const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const html = inlineLogos(await readFile(path.join(root, 'index.html'), 'utf8'));
const geo = [];            // { key, file, text }
let inlineCount = 0;
let bytes = 0;

// ---- 1. 脚本 ----
const tags = [...html.matchAll(/[ \t]*<script([^>]*)\ssrc="([^"]+)"([^>]*)><\/script>\r?\n?/g)];
let result = '';
let last = 0;
for (const t of tags) {
  const [whole, pre, src, post] = t;
  const attrs = pre + post;
  const file = path.join(root, src);
  const text = inlineLogos(await readFile(file, 'utf8'));
  result += html.slice(last, t.index);
  last = t.index + whole.length;
  if (/application\/city-metro-geo/.test(attrs)) {
    const key = path.basename(src, '.js');          // geo_ms
    geo.push({ key, src, text });
    continue;                                        // 原标签去掉，稍后统一追加内嵌数据块
  }
  bytes += Buffer.byteLength(text);
  inlineCount++;
  result += '  <script data-src="' + escAttr(src) + '">\n' + esc(text) + '\n  </script>\n';
}
result += html.slice(last);

// ---- 2. 样式与图标 ----
const css = inlineLogos(await readFile(path.join(root, 'css/style.css'), 'utf8'));
result = result.replace(/[ \t]*<link rel="stylesheet" href="css\/style\.css">/,
  '  <style>\n' + esc(css.replace(/<\/style/gi, '<\\/style')) + '\n  </style>');

const icon = await readFile(path.join(root, 'img/favicon.png'));
result = result.replace(/[ \t]*<link rel="icon"[^>]*>/,
  '  <link rel="icon" href="data:image/png;base64,' + icon.toString('base64') + '">');

// ---- 3. 地理数据块 + 构建标记 ----
// 告诉引擎「我在单文件里」：render.js 据此跳过依赖 importScripts 的后台绘制线程
result = result.replace('<meta charset="utf-8">',
  '<meta charset="utf-8">\n  <script>window.CM = window.CM || {}; window.CM.SINGLE_FILE = true;</script>');
let geoBlock = '\n  <!-- 地理数据（按需载入）：js/maps.js 的 loadGeo 从这里取文本执行 -->\n';
for (const g of geo) {
  bytes += Buffer.byteLength(g.text);
  geoBlock += '  <script type="application/city-metro-geo" id="geo-inline-' + g.key + '">\n' + esc(g.text) + '\n  </script>\n';
}
const banner = '<!--\n  城市与地铁 · 马鞍山地图（社区改版）—— 单文件离线版\n' +
  '  由 tools/build-single.mjs 从 index.html 与 js/、css/ 内联生成，双击即可在浏览器里玩，不需要服务器。\n' +
  '  与文件夹版的区别：浏览器把 file:// 当作不透明来源，IndexedDB 不可用，存档会自动退回 localStorage\n' +
  '  （容量约 5 MB，仍支持导入/导出存档文件）；需要更大的存档空间时改用 启动游戏.bat 的文件夹版。\n' +
  '  本版本为社区修改版，非官方版本，严禁商用。地理数据 © OpenStreetMap 贡献者（ODbL）。\n-->\n';
// 数据块必须排在所有脚本**之前**：main.js 一执行就可能触发 loadGeo（菜单背景、缩略图），
// 这时如果数据块还在文档后面没被解析，getElementById 会拿到 null，退回加载不存在的 js/geo_*.js。
result = result.replace('<body>', '<body>\n' + geoBlock);
result = result.replace('<!doctype html>', '<!doctype html>\n' + banner);

await writeFile(out, result, 'utf8');

// ---- 4. 自检：按浏览器的规则重新切分脚本块并逐个编译 ----
const htmlOut = await readFile(out, 'utf8');
// LOGO 必须全部内联：单文件版没有 img/ 目录，残留相对路径会让加载动画掉色
if (/(?:'|")img\/logo-(?:navy|white)\.png(?:'|")/.test(htmlOut)) throw new Error('LOGO 图片未内联，单文件版加载动画会掉色');
const blocks = [];
const re = /<script([^>]*)>([\s\S]*?)<\/script/gi;   // 与浏览器一致：遇到第一个 </script 就结束
let m2;
while ((m2 = re.exec(htmlOut))) blocks.push({ attrs: m2[1], code: m2[2] });
let checked = 0;
for (const b of blocks) {
  if (/application\/city-metro-geo/.test(b.attrs)) continue;
  if (!b.code.trim()) continue;
  new vm.Script(b.code.replace(/^\n/, ''));          // 语法检查：截断/转义出错会在这里炸
  checked++;
}
// ---- 5. 冒烟：在 vm 里按浏览器的切块规则跑一遍，确认 loadGeo 能从内嵌块载入地图数据 ----
const geoText = {};
for (const b of blocks) { const id = /id="geo-inline-([^"]+)"/.exec(b.attrs); if (id) geoText[id[1]] = b.code; }
const ctx = {
  console: { log() {}, warn() {}, error() {} }, performance, atob, btoa, TextEncoder, TextDecoder,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 },
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { protocol: 'file:', hostname: '', href: '' },
};
ctx.window = ctx;
vm.createContext(ctx);
let ran = 0;
for (const b of blocks) {
  if (/application\/city-metro-geo/.test(b.attrs)) continue;
  const src = /data-src="([^"]+)"/.exec(b.attrs);
  if (!src) continue;                                   // 内联主题脚本要用 document，这里跳过
  vm.runInContext(b.code, ctx, { filename: src[1] });
  ran++;
  if (src[1] === 'js/save.js') break;
}
if (!ctx.CM || !ctx.CM.MAP_ORDER || ctx.CM.MAP_ORDER.length < 10) throw new Error('单文件版脚本执行失败');
ctx.document = {
  getElementById(id) { const k = String(id).replace('geo-inline-', ''); return geoText[k] ? { textContent: geoText[k] } : null; },
  createElement() { return { _t: '', set textContent(v) { this._t = v; }, get textContent() { return this._t; }, remove() {} }; },
  head: { appendChild(el) { if (el._t) vm.runInContext(el._t, ctx, { filename: 'inline-geo.js' }); } },
  addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], body: { appendChild() {} },
};
const g = await ctx.CM.loadGeo('ms');
if (!g || !g.geo || !g.geo.water || !g.geo.water.length) throw new Error('内嵌地理数据载入失败');
// 二次载入（v3.25 的 bug）：内嵌块是同步执行的，若 Promise 缓存里残留已落定的旧值，
// 下次进入同一张地图会直接拿到它、数据块不再执行，geo.water 为空 → 进游戏报「地图数据载入失败」。
// 地图列表的缩略图会先把数据载入一遍，所以「看过列表再点进去」最容易撞上。
ctx.CM.mapId = '';
for (const k of ['water', 'roads', 'streets', 'rail', 'parks', 'reserves', 'woods', 'admin']) delete g.geo[k];
const g2 = await ctx.CM.loadGeo('ms');
if (!g2 || !g2.geo || !g2.geo.water || !g2.geo.water.length) throw new Error('二次载入地图数据失败（Promise 缓存残留）');

const st = await stat(out);
console.log(JSON.stringify({
  out, MB: +(st.size / 1048576).toFixed(2),
  scriptsInlined: inlineCount, geoBlocks: geo.length, blocksCompiled: checked,
  sourceBytesMB: +(bytes / 1048576).toFixed(2),
  smoke: { scriptsRun: ran, maps: ctx.CM.MAP_ORDER.length, waterFeatures: g.geo.water.length, reloadWater: g2.geo.water.length },
}));
