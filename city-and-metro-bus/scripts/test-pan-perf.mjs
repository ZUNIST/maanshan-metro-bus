// 平移性能回归测试：拖动地图时不得再做逐事件的 O(n) 几何拾取（会遍历全部站点与折线）。
// 用户反馈「移动地图卡」——根因是 pointermove 频率高于帧率，而每次事件都调 updateHover，
// 其中 pickStation/pickSegment 遍历全部站点/折线；拖动时相机在动、屏幕坐标本就错位，拾取无意义。
// 本测试用 mock 的 Renderer/UI 统计拾取调用次数，验证「拖动跳过、悬停保留、结束恢复」。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = {
  console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
context.window = context;
vm.createContext(context);
const root = new URL('../', import.meta.url);
// 只需 util/config + tools.js；tools.js 依赖 CM.Accessibility / CM.U / CM.CFG / CM.Metro
for (const src of ['js/util.js', 'js/config.js', 'js/tools.js']) {
  vm.runInContext(await readFile(new URL(src, root), 'utf8'), context, { filename: src });
}
const CM = context.CM;
CM.Settings = { get: () => null };   // Tools 构造时读取 curveMode 等偏好
// Tools 构造会调 bind()：给事件源补上空监听
context.addEventListener = () => {};
context.document = { addEventListener: () => {}, hidden: false };

// ---- mock Renderer / UI ----
let pickCalls = 0, panCalls = 0, hoverCalls = 0, tooltipCalls = 0;
const cv = { style: { cursor: '' }, addEventListener: () => {}, setPointerCapture: () => {} };
const R = {
  cv,
  unproject: (sx, sy) => ({ x: sx, y: sy }),
  trackH: () => 0,
  panBy: () => { panCalls++; },
  pickStation: () => { pickCalls++; return null; },
  pickSegment: () => { pickCalls++; return null; },
  portalPick: () => null,
  pickExtend: () => null,
  pickHandle: () => null,
  pickLink: () => null,
  pickTaskPin: () => null,
  tEase: 1,
  zoomAt: () => {},
};
const ui = {
  blocking: () => false,
  setTooltip: () => { tooltipCalls++; },
  startDraw: () => {},
};
const tools = new CM.Tools(R, ui);
tools.game = () => ({ jumping: false, draft: false, clock: { minute: 480 }, model: {}, net: { stations: {}, lines: {} }, city: {} });
// 直接 mock updateHover 只计数：onMove 一旦调用它，就会走进源码里的
// pickStation / pickSegment（遍历全部站点与折线）。测试只需验证「onMove 是否调用它」，
// 不必真的执行其依赖大量 CM 子模块的拾取逻辑。
tools.updateHover = function () { hoverCalls++; };

const ev = (over) => Object.assign({ clientX: 100, clientY: 100, pointerId: 1, pointerType: 'mouse', button: 0, shiftKey: false, altKey: false, target: cv }, over);

// ---- 1. 悬停（无 ptr）：仍必须拾取，功能不回退 ----
hoverCalls = 0;
tools.onMove(ev({}));
assert.equal(hoverCalls, 1, '悬停时调用 updateHover → 走进站点/线段拾取（高亮、提示照常）');

// ---- 2. 拖动地图（ptr.pan）：不得拾取 ----
hoverCalls = 0; panCalls = 0;
tools.ptr = { id: 1, x: 100, y: 100, sx: 100, sy: 100, button: 0, moved: false, pan: true, t: performance.now() };
tools.onMove(ev({ clientX: 140, clientY: 120 }));
assert.equal(panCalls, 1, '拖动时执行 panBy');
assert.equal(hoverCalls, 0, '拖动地图时不调用 updateHover（关键修复：省掉每次事件遍历全部站点/折线）');
assert.equal(cv.style.cursor, 'grabbing', '拖动时显示抓取光标');
assert.equal(tools.hover, null, '拖动时清空悬停高亮');

// ---- 3. 延长手柄拖动：仍需悬停反馈，不被 pan 短路误伤 ----
// 短路条件显式排除了 this.ptr.extend；此处即使 pan 标志为真也不应跳过 updateHover。
hoverCalls = 0;
tools.ptr = { id: 1, x: 100, y: 100, sx: 100, sy: 100, button: 0, moved: true, pan: true,
  extend: { station: 1, line: 2 }, extending: true, t: performance.now() };
tools.onMove(ev({ clientX: 140, clientY: 120 }));
assert.equal(hoverCalls, 1, '拖延长手柄时仍调用 updateHover（未被 pan 短路误伤）');

// ---- 4. 拖动结束后悬停恢复 ----
tools.ptr = null; hoverCalls = 0;
tools.onMove(ev({ clientX: 200, clientY: 200 }));
assert.equal(hoverCalls, 1, '松手后悬停拾取恢复正常');

console.log('PASS 平移性能：拖动时零几何拾取（panBy 保留）/ 悬停照常拾取 / 特殊拖动不误伤 / 松手恢复');
