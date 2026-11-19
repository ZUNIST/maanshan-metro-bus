'use strict';
// 国铁通勤线路运营权（移植自 Starry 社区版 rail-concessions.js，v1.3.1）。
//
// 思路：国铁不作为玩家可建线路，而是在「编译线网」时临时叠加一条虚拟线路（overlay）——
// 固定站点、固定线形、不进草案、不占用玩家车队，用「每方向每小时 N 班」的固定班次参与客流分配。
// 签约前：客流计入 external（外部竞争），票款从玩家收入中扣除，车站免运营费；
// 签约后：客流计入 owned，票款归玩家，按合同付首付 + 月费（+ 可选票款分成）。
//
// 马鞍山 2027 剧本有两条运营权线路：
//   1) 巢马高铁马鞍山段（西缘合肥接驳口—含山—郑蒲港—马鞍山南—马鞍山东），西端接驳口在地图西缘、对接合肥方向长途；
//   2) 宁安城际马鞍山段（马鞍山东—当涂东），北端南京南接驳口、南端芜湖接驳口对接两个方向的长途。
// 仅把市内车站纳入运营权；长途由 data_ms2027.js 里的地图外枢纽设施（facility）单独产生进城接驳需求，
// 两条通道互不重叠：设施负责「到站后进城」，运营权负责「沿线各站之间的通勤」。
// 合同状态存 g.railConcession = { chaoma: {local, express}, ningan: {...} }；
// 兼容旧存档的 {local, express} 扁平格式（视为巢马线合同）。
(function (CM) {
  const R = CM.RailConcessions = {};

  // 站点坐标与地图上已有的铁路车站（landmark / facility）完全一致，虚拟车站直接落在既有高铁站上：
  //   含山站 = ms_hsnew ll(31.657097,118.071108)  —— 注意不是商合杭的含山西站 ms_hsx！
  //   郑蒲港站 = ms_zpgst ll(31.596004,118.338677)
  //   马鞍山南站 = ms_south ll(31.592302,118.503862)
  //   马鞍山东站 = ms_east llW(31.6946,118.5361)（宁安高铁，两条线的换乘点）
  //   当涂东站 = ms_dteast llW(31.5635,118.5212)
  // 西端首站「合肥·西缘接驳」[0.5,167.86] 在已画高铁通道（商合杭/合福共用段）离开地图西缘处，
  // 合肥方向客流从这里进入线网，对应 data_ms2027.js 的 ms_hflink 地图外枢纽（与宁马线西善桥同构）。
  // 线路自西向东：西缘接驳口沿已画商合杭通道东南行到巢马接轨点，再沿巢马正线经含山—郑蒲港—马鞍山南，
  // 最后经联络线（马鞍山南站东端引出、沿宁安城际西侧北行引入）到马鞍山东。
  // 每个站的第 5 项是「本站到下一站之间沿已画铁路的折点」（游戏格），使虚拟运营线贴合地图上的铁路几何，
  // 而不是站点间直线穿越。折点取自 geo_ms.js 的解码折线与 rail-extra.json 的联络线。
  // [站名, x, y, 开通年, 到下一站的折点[]]；巢马 2026 年底全线通车，开局即全部可用。
  const chaoma = {
    id: 'chaoma', seg: 0, name: '巢马城际（马鞍山段）', from: 2027, color: '#8a6d3b',
    start: 2, max: 6, fee: 48, entry: 1200, speed: 160, share: 0,
    stations: [
      // 西缘接驳→含山：沿已画商合杭/合福通道东南行到巢马接轨点（[31.4,194.4]），再转入巢马正线经含山。
      // 西延段折点取自 geo_ms.js 合杭高速线解码折线（抽稀最大偏差 0.37 格）；接轨点之后为巢马正线折点。
      ['合肥·西缘接驳', 0.5, 167.86, 2027,
        [[11.2, 172.59], [19.34, 179.42], [26.36, 186.63], [31.44, 194.39],
         [32.59, 196.38], [34.42, 199.55], [35.28, 200.98], [45.25, 210.28], [48.98, 209.12],
         [55.38, 202.98], [60.75, 197.75], [67.80, 190.91], [75.36, 185.12], [83.39, 182.20], [88.58, 181.36]]],
      // 含山→郑蒲港：从含山向东南，经和县北部丘陵
      ['含山', 90.05, 180.99, 2027, [[100, 179.95], [120, 183.27], [144, 192.06], [168, 203.72], [192, 207.08]]],
      // 郑蒲港→马鞍山南：沿江东行，经郑蒲港过江通道
      ['郑蒲港', 194.64, 207.87, 2027, [[208, 208.86], [224, 210.64], [240, 209.33], [248, 209.27]]],
      // 马鞍山南→马鞍山东：约 12 km 联络线。按环评（2020 年报批稿）走线：
      // 自马鞍山南站东端引出，在宁安城际铁路西侧北行，跨常合高速后继续沿宁安西侧北行，跨湖南东路后引入马鞍山东站。
      // 折点取宁安正线西侧约 1 格（250 m）平行推算（中段间距 0.98–1.43 格），与已画联络线（rail-extra.json，已同步更新）一致。
      ['马鞍山南', 259.24, 209.44, 2027,
        [[261.8, 209.3], [264.0, 207.6], [265.4, 204.5], [265.7, 200.5], [266.5, 196.3], [268.7, 190.8],
         [270.3, 186.0], [271.4, 182.3], [272.3, 178.8], [273.3, 174.0], [273.5, 170.5], [273.7, 167.6]]],
      ['马鞍山东', 273.86, 165.28, 2027, []],
    ],
  };

  // 宁安城际马鞍山段（2015 年 12 月通车，时速 250 km）：北端落在南京南站本体
  // [374.5,44.1] = llW(31.9683,118.7965)，OSM 宁安客专线在图内的北端终点，对应 ms_njnlink 接驳口；
  // 市内两站马鞍山东、当涂东落在已有 landmark 上；南端「芜湖·宁安接驳」[214.08,327.38] 是
  // 宁安客专线离开地图南缘的位置（往芜湖站/弋江方向），对应 ms_whlink 接驳口。
  // 折点取自 geo_ms.js 宁安客专线解码折线（Douglas–Peucker 0.5–0.6 格抽稀，最大偏差约 0.5 格 = 125 m）。
  const ningan = {
    id: 'ningan', seg: 100, name: '宁安城际（马鞍山段）', from: 2015, month: 12, color: '#41638c',
    start: 2, max: 6, fee: 24, entry: 600, speed: 250, share: 0,
    stations: [
      // 南京南→马鞍山东：向北经江宁铜井—江宁街道出图北缘（南京江宁方向），再折回东北进南京南站。
      // 折点都在地图内的已画宁安铁路上。
      ['南京南·宁安接驳', 374.5, 44.1, 2015,
        [[367.03, 47.22], [361.3, 51.09], [353.2, 59.09], [328.61, 78.58], [312.94, 92.64], [302.16, 98.58],
         [291.36, 113.2], [280.14, 123.23], [271.7, 137.67], [270.16, 142.31], [269.98, 150.08], [273.02, 157.83]]],
      // 马鞍山东→当涂东：沿宁安正线向南，经银塘镇东侧
      ['马鞍山东', 273.86, 165.28, 2015,
        [[274.53, 173.48], [272.22, 184.44], [267.52, 196.91], [266.58, 201.53]]],
      // 当涂东→芜湖：出当涂县城东侧后沿江西南行，经年陡镇—芜湖东，在图南缘离开地图（芜湖方向）
      ['当涂东', 268.05, 223.0, 2015,
        [[267.67, 231.92], [264.41, 239.13], [257.47, 246.78], [251.56, 255.95], [229.95, 277.36], [225.11, 283.61],
         [211.67, 311.3], [211.73, 312.45], [214.86, 315.7], [215.84, 318.36], [215.92, 322.92]]],
      ['芜湖·宁安接驳', 214.08, 327.38, 2015, []],
    ],
  };

  // ---------- 和县 2027 剧本（hx27）的两条运营权线路 ----------
  // 坐标全部是 hx 格网（232×288）的换算值：ms 坐标经仿射换算而来，与底图上已画的铁路几何重合。
  // 站点落在地标上：郑蒲港站 hx_zpgst、马鞍山南站 hx_south、马鞍山东站 hx_east、当涂东站 hx_dteast。
  // 含山站在含山县（本图境外、人口 0），只作折点，不设站（见下）。
  // 折点取自 geo_hx.js 的「巢马高速线」「宁安客专线」「马鞍山南联络线」解码折线（抽稀后最大偏差约 0.5 格）。
  //
  // 巢马城际在本图内从图西缘的高铁通道进入（对应 data_hx2027.js 的 hx_hflink 合肥接驳口），
  // 经含山、郑蒲港、马鞍山南，再以约 12 km 联络线到马鞍山东。本图裁掉了马鞍山东以东的部分，
  // 所以这条线的东端就停在马鞍山东，与宁安城际换乘。
  const chaomaHx = {
    id: 'chaoma-hx', seg: 200, name: '巢马城际（和县段）', from: 2027, color: '#8a6d3b',
    start: 2, max: 6, fee: 36, entry: 900, speed: 160, share: 0,
    stations: [
      // 合肥·西缘接驳 → 含山：折点是「本站到下一站」的走向（见 R.overlay 的 prevBends）
      ['合肥·西缘接驳', 0.5, 200.0, 2027,
        [[1.38, 200.84], [3.09, 201.55], [5.52, 201.55], [7.73, 200.53], [27.55, 180.59], [30.8, 177.92],
         [33.31, 176.34], [37.52, 174.39], [41.09, 173.38]]],
      // 含山站：巢马高铁新建站，位于含山县城西南。坐标取站房地标 hx_hsnew（47.6, 172.2）——
      // 地标由 WGS-84 经纬度换算，与 OSM 底图同源；高德 POI 是 GCJ-02，整体偏东北约 1.3 格，不能直接用。
      // v3.34 起含山县与和县一同开放建设，含山站恢复为可乘降车站。
      ['含山', 47.6, 172.2, 2027,
        [[54.11, 171.3], [59.47, 171.13], [63.95, 171.56], [76.09, 173.7], [80.97, 175.58],
         [126.92, 195.83], [130.11, 196.81], [133.5, 197.47], [145.78, 198.44]]],
      // 郑蒲港站：宁和市域线的终点在它北侧约 1.2 km；郑蒲港→马鞍山南经长江公铁大桥过江（线位在 y≈202 处）
      ['郑蒲港', 149.0, 199.3, 2027,   // 站房地标 hx_zpgst（149.0, 199.3）；高德 POI 是 GCJ-02，偏东北 1.3 格
        [[158.95, 199.94], [179.86, 202.22], [182.7, 202.11], [192.09, 200.73]]],
      // 马鞍山南站 → 马鞍山东站：约 12 km 联络线，在宁安城际西侧北行（折点取已画联络线，偏差 ≤ 0.3 格）
      ['马鞍山南', 211.6, 200.8, 2027,
        [[213.56, 200.66], [216.25, 198.98], [217.61, 195.86], [217.89, 191.83], [218.67, 187.59],
         [220.81, 182.05], [224.3, 169.94], [225.27, 165.11]]],
      ['马鞍山东', 225.8, 156.3, 2027, []],
    ],
  };

  // 宁安城际（2015 年 12 月通车，时速 250 km）在本图内只有马鞍山东—当涂东两站；
  // 北端接南京南（图东北缘 232,113.8 处出图，对应 hx_njnlink），南端往芜湖（图南缘 172.5,288，对应 hx_whlink）。
  // 折点同样取自 geo_hx.js 的「宁安客专线」解码折线（最大偏差 0.27 格）。
  const ninganHx = {
    id: 'ningan-hx', seg: 300, name: '宁安城际（和县段）', from: 2015, month: 12, color: '#41638c',
    start: 2, max: 6, fee: 20, entry: 500, speed: 250, share: 0,
    stations: [
      ['南京南·宁安接驳', 231.5, 114.0, 2015,
        [[227.0, 122.91], [223.7, 128.45], [222.95, 130.2], [222.2, 133.16], [221.75, 137.3],
         [222.03, 141.0], [222.75, 143.56], [224.95, 148.8], [225.63, 152.19]]],
      ['马鞍山东', 225.8, 156.3, 2015,
        [[226.52, 160.75], [226.38, 164.95], [223.98, 176.44], [219.64, 188.2], [218.73, 192.88],
         [218.81, 197.75], [220.13, 206.23]]],
      ['当涂东', 220.2, 214.5, 2015,
        [[220.39, 218.94], [219.78, 223.52], [218.63, 227.11], [217.2, 229.89], [215.5, 232.28],
         [209.89, 238.5], [204.17, 247.73], [180.97, 271.92], [178.52, 275.63], [173.58, 286.05]]],
      ['芜湖·宁安接驳', 172.5, 287.5, 2015, []],
    ],
  };
  const HX27_LINES = [chaomaHx, ninganHx];

  // 线路定义按 mapId 取：ms27（马鞍山全域）与 hx27（和县）各两条。
  // seg 是虚拟线路的号段偏移（900000 + seg），四条线互不冲突。
  const MS27_LINES = [chaoma, ningan];
  const LINES_BY_MAP = { ms27: MS27_LINES, hx27: HX27_LINES };
  R.definitions = g => LINES_BY_MAP[g.mapId] || [];
  R.definition = g => R.definitions(g)[0] || null;   // 兼容旧调用（第一条=巢马）
  // 阶段变更年份（站点按 from 过滤 + 年份进入编译缓存 key）。各线开局即全线可用，无后续阶段。
  R.phaseDates = { chaoma: [], ningan: [], 'chaoma-hx': [], 'ningan-hx': [] };

  R.available = (g, d) => g.clock.y > d.from || (g.clock.y === d.from && g.clock.m >= (d.month || 1));
  // 某条线的合同状态；兼容旧存档的 {local, express} 扁平格式（视为巢马）
  R.lineState = (g, d) => {
    const s = g.railConcession;
    if (!s) return undefined;
    if (s[d.id]) return s[d.id];
    if (s.local != null && d.id === 'chaoma') return s;   // 旧格式
    return undefined;
  };
  R.terms = (g, d, state) => {
    const local = state?.local ?? d.start;
    const express = state?.express ?? 1;
    const scale = CM.Metro.costIndex(g.clock.y);
    return { local, express, entry: d.entry * scale, monthly: d.fee * scale * (local + express) };
  };

  // 在玩家线网上叠加虚拟国铁线路。返回一份浅拷贝的 net（不改原对象），交给 M.compile。
  // 巢马线用 l900000/s900000+i，宁安线用 l900100/s900100+i，互不冲突。
  R.overlay = (net, g, state = g.railConcession) => {
    const defs = R.definitions(g).filter(d => R.available(g, d));
    if (!defs.length) return net;
    const n = { ...net, stations: { ...net.stations }, segments: { ...net.segments }, lines: { ...net.lines } };
    for (const d of defs) {
      const base = 900000 + (d.seg || 0);
      const { local, express } = R.terms(g, d, R.lineState(g, d));
      const line = {
        id: 'l' + base, name: d.name, color: d.color, speed: d.speed, rail: d.id,
        railOwned: !!R.lineState(g, d), rootSet: true, railFreq: local, railShare: d.share || 0,
      };
      n.lines[line.id] = line;
      const stops = []; let prevBends = [];
      for (const [i, [name, x, y, from, bends]] of d.stations.entries()) {
        if (from && g.clock.y < from) continue;
        if (g.city.cellAt(x, y) < 0) continue;
        const id = 's' + (base + i);
        n.stations[id] = { id, name, x, y, type: 'surface', size: 'L', rail: d.id, inherited: true };
        const prev = stops.at(-1);
        if (prev) {
          const sid = 'g' + (base + i);
          // 折点是上一站定义里的「到下一站折点」，让区间沿已画铁路走向而不是直线
          n.segments[sid] = { id: sid, a: prev, b: id, line: line.id, pts: prevBends.slice(), type: 'surface', inherited: true };
        }
        stops.push(id);
        prevBends = bends || [];
      }
      line.root = stops[0];
      if (express && stops.length > 2) line.svcs = [{ id: 'rail-express', name: '直达', skip: stops.slice(1, -1), railFreq: express }];
    }
    return n;
  };

  R.compile = (net, g, state = g.railConcession) => CM.Metro.compile(R.overlay(net, g, state), g.city);

  // 签约 / 调班次时应付金额（首付或差额，按当月剩余天数折算）。
  R.due = (g, d, plan) => {
    const q = R.terms(g, d, plan), first = !R.lineState(g, d);
    const days = CM.U.daysInMonth(g.clock.y, g.clock.m);
    const remaining = (days - g.clock.d + 1) / days;
    const current = first ? 0 : R.terms(g, d, R.lineState(g, d)).monthly;
    return (first ? q.entry : 0) + Math.max(0, q.monthly - current) * remaining;
  };

  // 签约 / 调整某条线的班次。成功返回 null，失败返回错误文案（与社区版一致）。
  R.change = (g, local, express, lineId) => {
    const d = R.definitions(g).find(x => x.id === lineId) || R.definition(g);
    if (!d || !R.available(g, d) || g.pending || g.jumping || g.draft?.liveSnap) return '当前不能调整铁路合同';
    if (!Number.isInteger(local) || !Number.isInteger(express) || local < 1 || express < 0 || local + express > d.max) return '班次超出合同允许范围';
    const first = !R.lineState(g, d), due = R.due(g, d, { local, express });
    if (!g.econ.canAffordBuild(due)) return '可用资金不足';
    g.econ.spend('pppOut', due);
    // 升级为按线存储；若原来是旧扁平格式，先迁移为 {chaoma: ...}
    const st = (g.railConcession && (g.railConcession.local != null && !g.railConcession.chaoma && !g.railConcession.ningan))
      ? { chaoma: g.railConcession } : (g.railConcession || {});
    st[d.id] = { local, express };
    g.railConcession = st;
    g.logEvent({ tag: '运营', title: (first ? '签约接管：' : '调整铁路班次：') + d.name,
      desc: '每方向每小时站站停 ' + local + ' 班' + (express ? '，直达 ' + express + ' 班' : '') + '。' });
    g.refreshOperations();
    return null;
  };

  // 每月扣各线月费。
  R.monthly = g => {
    for (const d of R.definitions(g)) {
      const st = R.lineState(g, d);
      if (st) g.econ.spend('pppOut', R.terms(g, d, st).monthly);
    }
  };
})(window.CM);
