// 更新公告回归测试（v3.47）：网页版的公告必须是本分支（ZUNIST/maanshan-metro-bus）自己的版本记录，
// 而不是上游 2.x 的公告；已读判断也要跟着公告最新版本走。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const ctx = { console };
ctx.window = ctx;
ctx.CM = {};   // news.js 只往 window.CM 上挂数据
vm.createContext(ctx);
vm.runInContext(await readFile(new URL('js/news.js', root), 'utf8'), ctx, { filename: 'news.js' });
const NEWS = ctx.CM.NEWS;
const APP_CFG = await readFile(new URL('js/config.js', root), 'utf8');
const CFG_APP_VER = (function () {
  const m = /APP_VERSION:\s*'([^']+)'/.exec(APP_CFG);
  return m ? m[1] : NEWS[0].v;
})();
let pass = 0;
const ok = (m) => { console.log('  ok  ' + m); pass++; };

assert.ok(Array.isArray(NEWS) && NEWS.length >= 8, '公告应有 8 条以上（本分支各版本）');
ok('公告条数 ' + NEWS.length);

// 版本号必须是 3.x，不能回退到上游 2.x
for (const n of NEWS) assert.ok(/^3\.\d+$/.test(n.v), '版本号必须是 3.x，实际 ' + n.v);
assert.equal(NEWS[0].v, CFG_APP_VER, '最新一条应与 APP_VERSION 一致');
ok('全部为 3.x，最新一条 V' + NEWS[0].v);

// 从新到旧严格递减
const num = (v) => { const [a, b] = v.split('.').map(Number); return a * 100 + b; };
for (let i = 1; i < NEWS.length; i++) {
  assert.ok(num(NEWS[i - 1].v) > num(NEWS[i].v), '版本顺序必须从新到旧：' + NEWS[i - 1].v + ' → ' + NEWS[i].v);
}
ok('版本从新到旧严格递减');

// 每条都要有标题、日期与至少 2 条说明
for (const n of NEWS) {
  assert.ok(n.title && n.title.length >= 2, n.v + ' 缺标题');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(n.date), n.v + ' 日期格式');
  assert.ok(Array.isArray(n.items) && n.items.length >= 2, n.v + ' 至少 2 条说明');
}
ok('每条都有标题 / 日期 / 至少 2 条说明');

// 不能残留上游公告的关键词
const text = JSON.stringify(NEWS);
for (const banned of ['深圳', '深港', '伦敦与城市特色', '北京与更顺手的规划', '青湾教程']) {
  assert.ok(text.indexOf(banned) < 0, '不应残留上游公告：' + banned);
}
ok('没有残留上游 2.x 公告内容');

// 已读判断跟随公告版本，而不是 CFG.GAME_VERSION（否则红点永远消不掉）
const screens = await readFile(new URL('js/screens.js', root), 'utf8');
assert.ok(/const newsVersion = function/.test(screens), 'screens.js 应有 newsVersion（2.9.5 起的命名）');
assert.ok(/newsVersion\(\)/.test(screens) && /NEWS\?\.\[0\]\?\.v/.test(screens), '已读判断应比较公告最新版本');
assert.ok(!/newsVer\(CFG\.GAME_VERSION\)/.test(screens), '不应再拿 GAME_VERSION 比较公告');
ok('已读判断跟随公告最新版本（红点可正常消除）');

console.log('\nPASS ' + pass + ' 项：公告为本分支 3.x 的版本记录（最新一条与 APP_VERSION 一致），顺序、内容与已读判断均正确。');
