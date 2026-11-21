// 目录版（网页部署）构建：首屏 85 个 <script> 合并成一个包，并以 gzip 传输、在浏览器端解压。
//
// 为什么这么做（实测数据）：
//   1) 托管是 HTTP/1.1，不做 gzip。87 个脚本要分十几轮往返，9.4 MB 要 11 s 才进选图页；
//      合并成 1 个请求后仍有 7.9 s —— 说明瓶颈是带宽，不是请求数。
//   2) 试过 terser 压缩：体积 6.87 → 5.14 MB，但 ms30 开局从 4.6 s 掉到 20 s（V8 优化退化），放弃。
//   3) 现在：构建时生成 app.bundle.js.gz（约 1.5 MB），页面用 DecompressionStream 本地解压后执行，
//      传输量只有原来的 1/4；不支持 DecompressionStream 的浏览器自动回退到未压缩的 .js。
//
// 地理数据（type="application/city-metro-geo"）与语言包（city-metro-lazy）保持原标签不动：
// 它们本来就不执行，运行时按需注入，不进首屏。
import { cp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const SRC = process.argv[2] || 'merge-2.9.5';
const OUT = process.argv[3] || '公网部署-目录版';
const COPY = ['index.html', 'css', 'js', 'img', 'licenses', 'game-manifest.json'];

const root = path.resolve(SRC), dest = path.resolve(OUT);
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
for (const item of COPY) {
  await cp(path.join(root, item), path.join(dest, item), { recursive: true });
}

const html = await readFile(path.join(dest, 'index.html'), 'utf8');

// 逐个收集脚本标签：src、属性、在原文件中的起止位置
const re = /<script src="([^"]+)"([^>]*)><\/script>/g;
const tags = [];
let m;
while ((m = re.exec(html))) {
  tags.push({ src: m[1], attrs: m[2] || '', start: m.index, end: m.index + m[0].length });
}
// 会执行的＝没有 type 属性的普通脚本；带 type 的（地理数据、按需语言包）保持原位，交给运行时注入
const exec = tags.filter(t => !/type=/.test(t.attrs));
const lazy = tags.filter(t => /type=/.test(t.attrs));

const parts = [];
let bytes = 0;
for (const t of exec) {
  const code = await readFile(path.join(dest, t.src), 'utf8');
  bytes += Buffer.byteLength(code);
  // 每段前补分号与换行：上一段以 IIFE 收尾时，下一段开头的 ( 不会被当成调用
  parts.push('\n/* ==== ' + t.src + ' ==== */\n' + code.replace(/^\uFEFF/, '') + '\n;\n');
}
const header = '/* 首屏合并包（tools/build-webdir.mjs 生成）：' + exec.length + ' 个脚本按 index.html 原顺序拼接。\n' +
  ' * 改动源码后必须重新构建，不要手改本文件。 */\n';
const bundle = (header + parts.join('')).replace(/<\/script>/gi, '<\\/script>');
await writeFile(path.join(dest, 'js/app.bundle.js'), bundle);
const gz = gzipSync(Buffer.from(bundle, 'utf8'), { level: 9 });
await writeFile(path.join(dest, 'js/app.bundle.js.gz'), gz);

// 页面里的 bundle 标签换成引导脚本：先取 .gz 本地解压执行，失败或不支持时回退到 .js
const boot = `  <script>
  /* 首屏合并包的加载器（tools/build-webdir.mjs 生成）：先取 gzip 版在本地解压，约省 3/4 流量；
     不支持 DecompressionStream 或取不到时，回退到未压缩的 js/app.bundle.js。 */
  (function () {
    var run = function (text) {
      var el = document.createElement('script');
      if (text == null) el.src = 'js/app.bundle.js'; else el.textContent = text;
      document.head.appendChild(el);
    };
    if (!window.fetch || !('DecompressionStream' in window)) { run(null); return; }
    fetch('js/app.bundle.js.gz').then(function (r) {
      if (!r.ok) throw new Error('gz');
      return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
    }).then(run).catch(function () { run(null); });
  })();
  </script>`;

// 用引导脚本替换第一个执行脚本，其余执行脚本的标签删掉；带 type 的按需标签原样保留
const first = exec[0];
let out = html.slice(0, first.start) + boot;
let cursor = first.end;
for (const t of tags) {
  if (t.start <= first.start) continue;
  out += html.slice(cursor, t.start);
  if (lazy.includes(t)) out += html.slice(t.start, t.end);
  cursor = t.end;
}
out += html.slice(cursor);
await writeFile(path.join(dest, 'index.html'), out);

// 地理数据也各生成一份 .gz：maps.js 在网页版优先取 gz，本地解压后执行（地形数据 gzip 后约为 1/3）
let geoSaved = 0, geoRaw = 0;
for (const t of lazy) {
  if (!/\.js$/.test(t.src)) continue;
  const buf = await readFile(path.join(dest, t.src));
  const packed = gzipSync(buf, { level: 6 });   // level 6：与 9 相差不到 2%，快很多
  await writeFile(path.join(dest, t.src + '.gz'), packed);
  geoSaved += packed.length; geoRaw += buf.length;
}
console.log('地理/语言资源 ' + lazy.length + ' 个：' + (geoRaw / 1048576).toFixed(1) + ' MB → gzip ' + (geoSaved / 1048576).toFixed(1) + ' MB');
const lazyBytes = (await Promise.all(lazy.map(async t => (await stat(path.join(dest, t.src))).size))).reduce((a, b) => a + b, 0);
console.log('首屏脚本 ' + exec.length + ' 个 → js/app.bundle.js（' + (bytes / 1048576).toFixed(2) + ' MB）');
console.log('gzip 版 js/app.bundle.js.gz（' + (gz.length / 1048576).toFixed(2) + ' MB，浏览器端解压）');
console.log('按需资源保留 ' + lazy.length + ' 个（' + (lazyBytes / 1048576).toFixed(1) + ' MB，用到时才取）');
console.log('输出目录：' + dest);
