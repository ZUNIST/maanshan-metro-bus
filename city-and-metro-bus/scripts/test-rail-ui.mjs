// UI 面板验证：铁路经营权 tab 能构建且不抛错（用最小 DOM mock）
import fs from 'node:fs/promises'; import vm from 'node:vm';
const root = new URL('../', import.meta.url), mem = new Map();
function mkEl(tag) {
  return { tagName: (tag || 'div').toUpperCase(), children: [], className: '', style: { setProperty() {} }, _text: '',
    appendChild(c) { this.children.push(c); return c; }, append(...cs) { cs.forEach(c => this.children.push(c)); },
    addEventListener() {}, setAttribute(k, v) { this[k] = v; }, querySelector() { return null; },
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html || ''; }, set innerHTML(v) { this._html = String(v); },
    classList: { add() {}, remove() {}, toggle() {} }, scrollTop: 0, valueAsNumber: 2, value: '2' };
}
const c = { console, performance, atob, btoa, TextEncoder, TextDecoder, setTimeout, clearTimeout,
  setInterval: () => 0, navigator: { hardwareConcurrency: 4, deviceMemory: 4 }, matchMedia: () => ({ matches: false }),
  MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
  NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
  document: { createElement: mkEl, createDocumentFragment: () => mkEl('frag'), body: mkEl('body'), querySelector: () => null, getElementById: () => null,
    createTreeWalker: () => ({ nextNode: () => null }),
    createTextNode: t => ({ nodeType: 3, textContent: String(t), _text: String(t), children: [] }),
    documentElement: { ...mkEl('html'), lang: 'zh-CN', dataset: {} }, title: '城市与地铁', addEventListener() {} },
  localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) } };
c.window = c; vm.createContext(c);
const load = async f => vm.runInContext(await fs.readFile(new URL(f, root), 'utf8'), c, { filename: f });
const scripts = [...(await fs.readFile(new URL('index.html', root), 'utf8')).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
for (const f of scripts) { await load(f); if (f === 'js/save.js') break; }
const C = c.CM;
C.UI = function () {};   // pages.js 等挂载 UI.prototype，需先有构造器
for (const f of ['settings', 'icons', 'pages', 'corp', 'fleet', 'opsapp', 'render', 'sites', 'scenery']) await load('js/' + f + '.js');

let fail = 0; const ok = (v, m) => { console.log((v ? 'PASS ' : 'FAIL ') + m); if (!v) fail++; };
C.useMap('ms27');
const g = C.Game.create({ mode: 'free', seed: 1 });
const ui = new C.UI();
ui.g = () => g; ui.rBody = mkEl('div'); ui.stack = [{ kind: 'tasks', id: 'rail' }];
ui.renderPage = () => {}; ui.rerenderPage = () => {}; ui.toast = () => {}; ui.flyTo = () => {};
ui.pageTabs = (tabs) => mkEl('div'); ui.markUnsaved = () => {};
ui.callout = (...a) => mkEl('div');
let page;
try { page = ui.page_tasks('rail'); ok(true, 'page_tasks("rail") builds without throwing'); }
catch (e) { ok(false, 'page_tasks("rail") throws: ' + e.message + '\n' + e.stack); process.exit(1); }
// 递归收集文本
const texts = []; const walk = el => { if (!el) return; if (el._text) texts.push(el._text); (el.children || []).forEach(walk); };
walk(page && page.el);
const all = texts.join(' ');
ok(all.includes('巢马城际') && all.includes('宁安城际'), 'panel renders both rail concession blocks (巢马 + 宁安)');
ok(all.includes('南京南') && all.includes('芜湖'), 'ningan panel mentions both outer portals');
console.log('  collected text sample:', all.slice(0, 160));
console.log('  total text length:', all.length);
console.log(fail ? ('\nFAILED ' + fail) : '\nALL GREEN'); process.exit(fail ? 1 : 0);
