'use strict';
// 马鞍山 · 2030 剧本（三市域线开局）。派生自 data_ms2027.js，沿用同一份地理、建成区与地名库，
// 再把和县 2027 剧本中已核过的宁和线、马郑线站序/折点/点位换算到马鞍山全域图（ms 格网）。
// 坐标换算：ms → hx 为 ax(x)=x*SX+TX, ay(y)=y*SY+TY，其中 SX=PH.kx/PM.kx, SY=PH.ky/PM.ky,
// TX=(PM.lon0-PH.lon0)*PH.kx, TY=(PH.lat0-PM.lat0)*PH.ky；这里用逆变换把 hx2027 的站点搬回 ms。
// 真实性：宁马线为史实；宁和线与马郑线沿用 hx2027 的规划口径（本剧本按 2026 年底建成、2030 年运营中）。
(function (CM) {
  if (!CM.MAP_LIST) return;
  let base = null;
  for (const m of CM.MAP_LIST) if (m.id === 'ms27') base = m;
  if (!base) return;

  const cp = function (v) {
    if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) a[i] = cp(v[i]); return a; }
    if (v && typeof v === 'object') { const o = {}; for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = cp(v[k]); return o; }
    return v;
  };
  const d = cp(base.data);
  d.city = '马鞍山'; d.saveName = '马鞍山';
  // 2027 剧本的「线网规划修编」判定年份（2030/2028）早于本剧本开局，挪到 2035 年修编、2033 年前通车。
  for (const t of d.traits) if (t.use === 'foresight' && t.id === 'ms27-net') {
    t.ym = [2035, 12]; t.before = 2033;
    t.title = '轨道交通三期修编';
    t.hit = '三期修编之前就通到{st}站的线路，更容易成为骨干，沿线开发提前启动。';
    t.miss = '三期修编完成，{st}一带仍没有地铁，新的建设重点落在别处。';
  }

  const Y0 = 2030;
  const OPEN = 2026.9;   // 宁和线、马郑线的设定通车时点（与 hx2027 一致）
  const NJM = 2026.3;    // 宁马线（史实）通车时点

  // hx2027 的站点经仿射逆变换回到 ms 格网（生成时已逐点核对：马鞍山经开区落在 267.25,194.27，
  // 与 ms2027 按高德 POI 标定的 267.98,194.27 仅差 0.7 格；郑蒲港、马鞍山南同样重合）。
  const NH = [{"n":"高家冲","x":266.84,"y":70.77,"size":"L","bends":[],"type":null,"span":null},{"n":"浦和产业园","x":241.89,"y":104.88,"size":"M","bends":[[259.62,77.71],[253.44,82.67],[247.25,88.62],[247.87,98.14]],"type":null,"span":null},{"n":"宋桥","x":230.75,"y":118.37,"size":"S","bends":[[236.94,111.42]],"type":null,"span":null},{"n":"和县经开区","x":208.06,"y":136.21,"size":"M","bends":[[220.44,125.31],[213.22,130.26]],"type":null,"span":null},{"n":"海峰路","x":206.62,"y":145.24,"size":"M","bends":[[207.24,140.18]],"type":null,"span":null},{"n":"历阳","x":205.49,"y":152.48,"size":"L","bends":[[205.9,149.1]],"type":null,"span":null},{"n":"龙潭路","x":202.91,"y":159.81,"size":"M","bends":[[204.66,155.45]],"type":null,"span":null},{"n":"太阳河","x":202.91,"y":170.92,"size":"S","bends":[[202.6,163.98]],"type":null,"span":null},{"n":"综合保税区","x":199.92,"y":180.94,"size":"M","bends":[[201.47,176.87]],"type":null,"span":null},{"n":"郑蒲港","x":194.66,"y":207.91,"size":"L","bends":[[201.77,180.94],[200.85,185.79],[200.54,193.83],[199.09,197.1],[198.27,199.08],[196.62,205.23],[195.48,208.2]],"type":null,"span":null}];
  const MZ = [{"n":"马鞍山经开区","x":267.25,"y":194.27,"size":"M","bends":[],"type":null,"span":null},{"n":"马鞍山南","x":259.21,"y":209.39,"size":"M","bends":[[266.69,195.71],[266.89,199.18],[266.22,202.25],[265.4,205.03],[264.47,206.92],[263.23,207.91],[261.89,208.5],[260.65,209]],"type":"underground","span":null},{"n":"江心洲","x":235.91,"y":208.6,"size":"M","bends":[[257.56,209.39],[247.66,209.59]],"type":null,"span":"underground"},{"n":"郑蒲港","x":194.66,"y":207.91,"size":"S","bends":[[222.5,209.2],[208.06,208.9],[197.75,208.2]],"type":null,"span":null}];
  // [站名, x, y, 规模, 开通年, 车站敷设方式, 折点, 上一区间敷设方式]
  const st = function (s) { return [s.n, s.x, s.y, s.size, OPEN, s.type, s.bends, s.span]; };

  // ---------- 一、开局线网：宁马线 + 宁和线 + 马郑线 ----------
  const lines = cp(base.data.initialNetwork.lines);
  lines.push({ name: '宁和线', color: '#a86ab5', type: 'elevated', year: OPEN, stations: NH.map(st) });
  lines.push({ name: '马郑线', color: '#0f7fbf', type: 'elevated', year: OPEN, stations: MZ.map(st) });
  d.initialNetwork = {
    year: Y0,
    note: '宁马线（2026 年 4 月通车）、宁和线与马郑线（设定 2026 年底建成）均已运营，2030 年初交你经营',
    lines: lines,
  };

  // ---------- 二、宁和线北端接驳口（南京 S3 高家冲） ----------
  // hx2027 的 hx_njlink 换算到本图；ms2027 已有宁马线的西善桥接驳口，两者分工不同，不能合并。
  d.facilities.push({
    id: 'ms30_gaojiachong', n: '南京（高家冲接驳）', t: 'rail', ext: ['NE', 14], gate: true, to: '南京',
    at: [266.84, 70.77], y0: [2017, 12],
    pax: [[2018, 0.1], [2022, 0.25], [2026, 0.5], [2027, 1.4], [2030, 2.2], [2035, 3.2], [2045, 4.0], [2060, 4.6]],
    note: '宁和线北端在高家冲接南京地铁 S3 线（浦口方向）。此处代表经宁和线进出的跨省客流；'
      + '本图另设西善桥接驳口，承担宁马线（南京 S2 线，江宁方向）的客流，两者互不重叠。',
  });

  // ---------- 三之一、绰庙 / 螺百 / 五显 三处小集镇的建成区（v3.53） ----------
  // 这三处在 ms2027 的 centers 里都只有零散低权重中心（绰庙 3 个 55 人、五显 1 个），或者虽落在
  // OSM 掩膜格里但就业比过高（螺百 5 格只亮 1 个点），开局在图上基本看不到街区。
  // 按和县剧本里同类小集镇的口径（腰埠约 10 格、0.6 km²）补一小片连片街区：从镇中心做确定性
  // 广度生长（同一 seed 每次生成结果一致），每格 3400 人 + 1800 岗 —— 噪声最不利 0.7/0.65 时
  // 仍有 3400×0.7 + 1800×0.65 = 3550 > city.js 的 2600 建成阈值，不会出现「补了却不亮」。
  {
    const W = base.cfg.W, H = base.cfg.H;
    const MINI = [['绰庙', 201.5, 27.9, 9], ['螺百', 143.9, 257.0, 11], ['五显', 158.7, 249.2, 8]];
    const h2 = function (x, y, s) { const t = Math.sin(x * 12.9898 + y * 78.233 + s * 37.719) * 43758.5453; return t - Math.floor(t); };
    const at = new Map();
    for (const c of d.centers) at.set(Math.floor(c.x) + ',' + Math.floor(c.y), c);
    MINI.forEach(function (t, ti) {
      const q = [[Math.floor(t[1]) + 0.5, Math.floor(t[2]) + 0.5]], seen = new Set(), got = [];
      let guard = 0;
      while (q.length && got.length < t[3] && guard++ < 400) {
        const p = q.splice(Math.floor(h2(q[0][0], q[0][1], ti) * q.length), 1)[0];
        const key = Math.floor(p[0]) + ',' + Math.floor(p[1]);
        if (seen.has(key)) continue;
        seen.add(key);
        if (p[0] < 1 || p[1] < 1 || p[0] > W - 1 || p[1] > H - 1) continue;
        got.push(p);
        q.push([p[0] + 1, p[1]], [p[0] - 1, p[1]], [p[0], p[1] + 1], [p[0], p[1] - 1]);
      }
      for (const p of got) {
        const key = Math.floor(p[0]) + ',' + Math.floor(p[1]);
        const c = at.get(key);
        if (c) { c.pop = 3400; c.jobs = 1800; }
        else { const n = { x: p[0], y: p[1], r: 0.09, pop: 3400, jobs: 1800 }; d.centers.push(n); at.set(key, n); }
      }
    });
  }

  // ---------- 三之二、缩小时仍显示的小地名 ----------
  // 普通 place 节点只在 z>=13 显示；写进 districtLabels（直接给格坐标）后在 z<16 的缩略视野也会渲染。
  // v3.53：补绰庙、五显、腰埠三处（小镇在缩略视野里没有 station 也没有 place 标签，整片看上去是空白）；
  // 「郑蒲港」从港区/站前的 (196,206) 挪到中飞大道（194.1,194.6 ~ 197.0,184.9）一带——新城核心在那里，
  // 缩略视野下名字贴在港区反而指错地方。
  const extraLabels = [
    ['濮集', [212.74, 122.5]], ['南义', [141.58, 193.85]], ['祁门', [132.32, 135.71]],
    ['戚镇', [184.44, 171.35]], ['洞阳', [300.25, 218.57]], ['西梁山', [191.26, 247.57]],
    ['绰庙', [201.5, 25.3]], ['五显', [158.7, 246.7]], ['腰埠', [153.3, 144.2]],
    ['郑蒲港', [195.6, 190.3]],
  ];
  d.districtLabels = (d.districtLabels || [])
    .filter(function (l) { return l[0] !== '郑蒲港'; })
    .concat(extraLabels);

  // ---------- 四、年代参数（2030 年价格） ----------
  d.stages = [[2035, '一江两岸通勤'], [2045, '多线成网'], [2050, '存量更新']];
  d.stageLast = '存量更新时期';
  d.events.push({ y: 2030, m: 1, tag: '设定', title: '三线并网',
    desc: '宁马线、宁和线与马郑线都已投入运营：南京 S2 走廊沿江东主城与当涂南北纵贯，宁和线穿和县县城到郑蒲港，马郑线从马鞍山经开区过江，在郑蒲港与宁和线、巢马高铁换乘。' });

  const bc = base.cfg;
  const cfg = Object.assign({}, bc, {
    START: { y: Y0, m: 1, d: 1, minute: 360 },
    growth: Object.assign({}, bc.growth, {
      popCurve: [[2030, 1.55e6], [2035, 1.57e6], [2040, 1.58e6], [2050, 1.58e6], [2300, 1.60e6]],
      histEnd: Y0,
      jobsRatio: [[2030, 0.59], [2040, 0.60]],
    }),
    econBase: Y0,
    economy: Object.assign({}, bc.economy, {
      startFunds: 700000, debtLimit: -400000, rewardScale: 0.9,
      grantBase: [[2030, 300000], [2035, 360000], [2040, 400000], [2050, 520000]],
    }),
    macro: Object.assign({}, bc.macro, {
      gdp0: 36000000, revRatio: [[2030, 0.16], [2040, 0.15]],
      prod: [[2030, 0.04], [2035, 0.035], [2050, 0.02], [2080, 0.012]],
      histEnd: Y0,
    }),
  });

  // ---------- 五、登记地图 ----------
  (CM.MAP_LIST = CM.MAP_LIST || []).push(Object.assign({}, base, {
    id: 'ms30',
    name: '马鞍山',
    title: '马鞍山 · 2030',
    sub: '真实地理 · 2030 年起 · 人民币 · 宁马/宁和/马郑三线开局',
    desc: '2030 年的马鞍山已经进入一江两岸通勤时代：宁马线纵贯江东，宁和线穿和县到郑蒲港，马郑线从马鞍山经开区过江。三条线交给你经营，怎么把它们接进主城、接住跨省客流，是这一局的核心。',
    facts: [['范围', '104 km × 82 km'], ['起始', '2030 年'], ['城镇人口', '约 155 万'], ['货币', '人民币（元）'], ['既有线路', '宁马 9 站 / 宁和 10 站 / 马郑 4 站'], ['模式', '经营挑战 / 自由建造']],
    scenario: 'ms-2030',
    tagline: '三线并网，一江两岸',
    difficulty: 4,
    tags: ['已有地铁', '跨省通勤', '一江两岸', '接管运营'],
    intro: '到 2030 年，宁马线已经通车四年，宁和线与马郑线也把江北和县、郑蒲港与江东主城连了起来。'
      + '你接手的是一张已经成形的三线骨架：跨省客流在增长，江南江北的换乘需求刚开始，城市还有大片地方没有轨道。',
    features: [
      ['train', '三条市域线在手', '宁马线 9 站（西善桥接驳口—太白）、宁和线 10 站（高家冲—郑蒲港）、马郑线 4 站（马鞍山经开区—马鞍山南—江心洲—郑蒲港）'],
      ['globe', '两个南京接驳口', '西善桥走 S2 线（江宁方向），高家冲走 S3 线（浦口方向），客流分别计算'],
      ['rail', '高铁已通车', '巢马、宁安高铁均已运营，可在「铁路经营权」分别签约接管'],
      ['map', '2030 年的城市', '建成区按 OSM 城镇用地掩膜布置，濮集、南义、祁门、戚镇、洞阳、西梁山在缩小时也标出'],
    ],
    highlights: [[2026, '宁马线与巢马高铁通车'], [2027, '宁和线与马郑线建成（设定）'], [2030, '接管三线'], [2035, '一江两岸通勤成型']],
    geo: Object.assign({}, base.geo),
    econ: { devOffset: -14, money: 1.32 },
    data: d,
    cfg: cfg,
    cam: { cx: 228, cy: 152, zoom: 18 },
  }));
})(window.CM);
