# 交接文档（给下一个 AI 会话）

> 更新时间：2026-11-20 09:40。本文是**会话级交接**：讲清当前做到哪一步、还剩什么、有哪些踩过的坑。
> 项目的技术细节沉淀在同目录 `交接文档.md`（长期维护），两份配合着读。
>
> **v3.40 已完成**：公交恢复成纯虚拟线路——不再被「景区/历史城区/受保护建筑只能走地下」拦住（含画线预览与建站选址），
> 车站处转向上限按制式取值（公交 120°，地铁仍 60°），也不计景区/古建保护费。代码已同步到
> `https://github.com/ZUNIST/maanshan-metro-bus` 并出包。

---

## 一、项目与当前状态

- **项目**：《城市地铁》马鞍山地图网页游戏（纯前端，无构建依赖，Node 只用于脚本）。
- **工作根目录**：`C:\Users\zuni\WorkBuddy\2026-11-15-15-18-24\`
- **主工程**：`city-and-metro-bus/`（公交独立版，游戏本体在此）。
- **当前版本**：**v3.40.0**，改动已全部落盘，状态如下：

| 检查项 | 状态 |
|---|---|
| `verify-game.mjs`（source） | ✅ 16 图 / 112 文件一致（manifest 已 `--write`） |
| `SIM_STAMP` | **已变**（改了 `config.js` / `metro.js`）→ **旧存档需开新档** |
| 回归测试 | ✅ test-bus / test-bus-crossing / test-station-tiers / netlayout / station-names / save-storage / map-migrations 全绿；**新增 test-bus-virtual（16 项）** |
| 交付目录 `马鞍山地图-公交版-v3.40-公交虚拟/` | ✅ 源码 277 项 md5 与主工程零差异、dist 已重建同步 |
| 单文件版 | ✅ 已重打包（31.65 MB，smoke 16 图通过） |
| **v3.40 的 zip** | ✅ 已打包（282 文件 / 52.46 MB） |
| `交接文档.md` | ✅ 版本沿革加 v3.40 行 |
| GitHub | ✅ `ZUNIST/maanshan-metro-bus`（源码 + Release 可玩包） |
| 历史包 | v3.36 – v3.39 的 zip 都在根目录 |

启动方式：`启动游戏.bat`（pythonw 起 `serve.py`，端口 8123~8130 自动挑一个），或 `python serve.py`。
截图/探针时注意：`serve.py` 要带 `--root "city-and-metro-bus"`（需目录内有 `index.html`），否则退 1 且 45 s 无心跳自退；
更省事的是在 `city-and-metro-bus/` 里 `python -m http.server 8123 --bind 127.0.0.1`。
诊断工具：`node tools/diag-hx-areas.mjs hx|hx27` —— 输出指定地点的 pop>60 / street=1 / 最大连片 / 最近锚点 / 周边设施。

## 二、最近两轮做了什么

**v3.39（平面交叉与站台档位，本轮四项）**
1. **公交平面交叉豁免**：`metro.js` 收集 `surf` 时排除公交段（`M.isBus(draft.lines[s.line])`）。公交×公交、
   公交×电车、公交×地铁地面段全部放行；**电车×电车、电车×地铁仍然拦**（有钢轨，必须立体交叉）。
2. **公交新增 L 档「BRT 站台」**：`stationCap.L = 3000`（广州中山大道/成都二环 BRT 高峰 2500–4000 人/h）、
   `accessM.L = 600`（普通站 200–300）、`sizeName = { L: 'BRT 站台' }`、`carsBySize.L = 1`。
3. **有轨电车新增 L 档「大型站」**：`stationCap.L = 6000`、`carsBySize.L = 4`（可停 4 节）。
4. **BRT 线路降价**：B3 `track` 2200 → **1600** 万元/km（现实专用道 1500–3000，原值偏上限）。
   `M.sizeText(L, size)` 新增：按制式取规模名，UI 与 evaluate 日志统一使用（否则会拼成「BRT 站台车站」）。

**v3.38（建成区与景区）**
1. **五处建成区缺失**（和县经开区、郑蒲港新城商业、综保区、祁门、腰埠）：根因是都不在 `TOWNS` 表，
   离最近锚点 12~33 格、超出 6.5 格补格上限。补锚点后 hx 图 20/16/6/4/5 格，hx27 图 20/20/18/6/7 格。
2. **小集镇改连片生长**：补格从「按环布点」改为**镇中心广度生长**（确定性 hash 取队列元素 + 四邻入队）；
   `GROW_MAX = 8`，want ≤ 8 的小集镇完全靠生长、不按掩膜点亮（江北掩膜在这些村只有三四个散点，会成麻点）。
   实测祁门 4/4、腰埠 5/5、综保区 6/6、经开区 20/20 全连片。水/山/公园由 `city.js:100` 跳过，不会在水里长街区。
3. **褒禅山华阳洞做成景区**：新增 `hx_baochans`（`t:'scenic'`）。**注意**：地标 `hx_baochansi` 已由
   `ms_baochansi` 换算而来，**不要再手写同名 landmark**（本轮一度写重复，图上出现两个同名标签，已删除）。

**v3.37（同名车站标名去重，三项）**
1. **枢纽设施优先**：`drawMapLabel` 改为返回「是否真的标出」，`layoutLabels` 收集 `hubShown`；车站与已标出的铁路枢纽同名同点
   （去「站」后相同、相距 <4 格）时站名让位——马鞍山南只显示「◆ 马鞍山南站」。与既有「接驳口车站让位」同一思路。
2. **站名优先于普通地标**：站名循环记录 `labeledSt`，普通地标循环里同名同点的让位——当涂东站是纯 landmark（无 facility 背书），
   最终只显示「当涂东」。
3. **地名库同步去重**：`CM.Geo.places`（v3.18 地名标签层）里有 OSM 车站节点「马鞍山南」「当涂东」（level 1），
   现在跳过已被站名/设施覆盖的点，不再叠第三个标签。
   只认「去『站』后完全相同」，慈湖高新区 / 马鞍山经开区 / 含山南站不受影响。

**v3.35（按 2024 批复规划图重画和县线网）**
1. 马郑线江北端从「镇淮路」改到**郑蒲港站**（`149.0, 199.3`），与宁和线同名合并为换乘站；过江折点取底图「巢马高速线」实测线位（y≈200.5）。顺带修了一个真 bug：v3.34 把过江段末尾折点写进了「马鞍山南→江心洲」那一段，列车冲过站再折回，画面成一个闭合大环。
2. 商合杭高铁（底图 `合杭高速线`）进图，设站设施（`hx_hsx`），只画线+接驳需求，**不进 `rail-concessions.js` 运营权**。
3. 浦和产业园、含山站点位重标——根因：高德 POI 是 GCJ-02，转 WGS-84 后本图仍**偏东 1~2.5 格**，v3.32 那批点全按高德填的。镇点/轨道站点一律改用与底图同源的 OSM。
4. 香泉/石杨/乌江镇点校正，新增戚镇、濮集、南义、化工园四片 `TOWNS`。补格口径 bug 修掉：点亮格权重同为 9000 时 Voronoi 把远处农居点算进最近镇桶，「还差几格」算成负数、一个环都不补；现在 near 半径按目标人口折算，2027 剧本先把基剧本 centers 并入再叠掩膜。
5. 郑蒲港综保区从受保护建筑（landmark `kind:'factory'`）改成 `ind` 产业园区设施（通勤点）；`facility.js` TYPES 新增 `ind`。
6. `render.js` 铁路分高铁/普速两档线宽并加 `railHsrCase` 描边（原「白芯浅边」在浅色地面近乎隐形，用户以为马郑线不存在）。

**v3.36（铁路断口、含山南站正名、走线校顺，本轮四条）**
1. **铁路隧道段不再跳过**：`render.js` 原先 `if (r.flags & 2) continue` 把隧道整段丢掉 → 铜闸以西商合杭（太湖山隧道）与吴山附近淮南线各断一截。现在隧道画 `railTunnel` 虚线，线是连着的。
2. **含山西站 → 含山南站**：2018 年官方更名。`hx_hsx` 改名，且 `data_hx.js` 换算 ms 地标时**跳过 `ms_hsx`**——那是同一座站的旧点位（`58, 241.4`，窑上北边农田里），不跳会多出一个错位同名站。**别把这个跳过删掉**。
3. **宁马线经开区→姑孰**改按底图「宁安客专线」走廊（x≈218.35→219.95）；原折点先掉到 217.2 再折回 219.5，是个「W」形回勾。
4. **马郑线取消「市经开区」站**（与马鞍山经开区站仅距 1.1 km），全线回到 4 站（马鞍山经开区—马鞍山南—江心洲—郑蒲港），马鞍山南折点改成沿江东大道到底再沿明珠东路西折的连续曲线；文案（史实/设定/任务/briefing）里的站数、站名同步改。

## 三、剩余待办（按优先级）

**v3.37 已全部完成并打包**（zip + 单文件版 + 交付目录 + 文档）。当前无阻塞待办。

已确认的口径与已完成项：
1. ✅ **商合杭站名保留「含山南站」**（2026-11-20 用户明确）：不要改 `data_hx.js` 的 `hx_hsx`。
2. ✅ 马鞍山南 / 当涂东的双标签已在 v3.37 去掉（枢纽设施优先、普通地标让位站名、地名库同步去重）。

可选后续（非必需）：
- 若后续再出现「同一地点两个标签」，检查顺序是：`hubShown`（枢纽设施）→ `labeledSt`（站名）→ 地名标签层
  `siteNames`，三处都按「去『站』后相同 + 4 格内」判定，加新来源时记得同步。
- 渲染类改动不需要重建 `SIM_STAMP`（`render.js` 不在其文件列表），但**必须** `verify-game.mjs --write`
  重写 `game-manifest.json`，否则 verify 报「资源与发布清单不同」。

## 四、必读技术知识（踩坑沉淀）

### 4.1 坐标系口径（最常犯错的地方）
- 底图 `geo_hx.js`（places/rail/roads）与 OSM 同源，**是唯一正确取值来源**。
- 高德 POI 是 GCJ-02，即使转成 WGS-84，在本图仍**系统性偏东 1~2.5 格（250~600 m）**。不要用高德坐标直接填点位；要用，先和底图同名地物比对偏移。
- 两图换算（ms → hx）：`SX=0.9697652389851771, SY=1.008472073954619, TX=-39.774, TY=-10.368`，`ax(x)=x*SX+TX`、`ay(y)=y*SY+TY`。

### 4.2 数据结构速记
- 地图注册：`CM.MAP_LIST` + `CM.GEOS[id]` + `CM.MAP_ORDER`；2027 剧本（`data_hx2027.js`）复用 `data_hx.js` 的 `d.towns/regions/districtLabels`。
- 开局线网 `data.initialNetwork.lines[].stations` 行格式：
  `[name, x, y, size, year, type?, bends?, spanType?]`。
  **`st[6]` 是「前一站→本站」的折点；`st[7]` 是该区间的敷设方式**（缺省回退 `st[5]` 再 `L.type`）。
  注意 `js/rail-concessions.js` 的 `R.overlay.bends` 语义相反（「本站→下一站」）。
- 同名车站自动合并为换乘站（byName）——郑蒲港站就是这么把宁和线、马郑线接起来的。
- 底图铁路 `Geo.rail` 行：`[nameIdx, flags, path, year]`。`flags&2` 隧道（现画虚线）、`&16` 高铁（按 `D.hsrYear` 出现）、`&1` 高架。
- 受保护建筑豁免 `M.protExempt`：campus/factory/rail 三类；祠庙（temple）不许地面/高架穿越，heritage 只能地下。

### 4.3 校验流程（顺序敏感，错序会反复报错）
```
改了 geo_*.js → node scripts/rebuild-geo-index.mjs      （先重建地理索引）
改了模拟相关源码 → node -e "import('./scripts/sim-stamp.mjs').then(m=>m.simulationStamp(true))"
最后 → node scripts/verify-game.mjs --write             （写清单）
出 dist → node scripts/build.mjs && node scripts/verify-game.mjs --dist
```

### 4.4 探查/验证工具（`tools/`，全部经 CDP 连真实 Chrome 页面）
- `game-eval.mjs <地图id> "<JS表达式>"`——在真实游戏页面里取运行时数据，**最万能**。
- `verify-v335.mjs hx|hx27`——站序/换乘/设施/建成格/开局冲突一览。
- `shotclean.mjs <id> <cx> <cy> <out.png> <zoom>`——无 UI 干净截图（DOM 遮罩先清）；`shotmap.mjs` 带界面版。
- `find-place.mjs <名>`、`roads.mjs` / `road-pts.mjs`（底图道路）、`rail-seg.mjs` / `rail-line.mjs`（底图铁路）。
- `crop-img.mjs`（canvas 裁剪放大规划图，本机无 PIL，python 脚本多被沙箱拦，**图片处理走 Node+Chrome**）。
- 注意：用户环境曾把会话目录从 `2026-11-15-15-18-24` 换成 `2026-11-17-17-51-44` 又切回；所有脚本按相对路径写，先 `pwd` 确认根目录再跑。

### 4.5 测试与出包
- 回归脚本（`city-and-metro-bus/scripts/`）：`test-netlayout / test-netmap-route / test-station-names / test-place-labels / test-bus / test-rail-concession / test-save-storage / test-map-migrations`。逐个跑，合在一个 for 循环里会超时。
- 出包五步：`build.mjs` → `verify-game.mjs --dist` → `tools/build-single.mjs`（产出单文件 HTML）→ 把 dist 产物 `cp -r` 进交付目录的 `city-and-metro-bus/` → `make-zip.py` 打 zip。
- 历史交付包都在根目录（v3.32~v3.36），每个含 `说明.md` + `交接文档.md` 副本。

## 五、用户协作偏好（务必遵守）

1. **对标真实**：规划走线、站址、站名都要有依据（批复规划图、OSM、官方通稿），改前先查证、改后在注释里写明出处与年份。
2. **先诊断后修复**：用户会直接指出方案误区并要求返工（例：「扩半径换优先级」这类表面修补不行）。别急着改数据，先找根因。
3. 用户熟悉本图坐标系与真实地理，**别用模糊表述糊弄**（「大概在这附近」不行，要给格坐标与依据）。
4. 每轮改动要闭环：改完跑校验+截图自查，再汇报；交付要出 zip 并同步 `说明.md`/`交接文档.md`。
5. 站名口径：正式名**含山南站**（非含山西站）；马郑线江北端是**郑蒲港站**（非镇淮路）。

## 六、快速上手清单

```bash
cd /c/Users/zuni/WorkBuddy/2026-11-15-15-18-24
python serve.py &                     # 起服务（8123+）
node tools/game-eval.mjs hx27 "CM.game.clock.y"   # 探页面
node tools/verify-v335.mjs hx27                   # 线网体检
# 打包 zip（待办第 1 项）
CM_ZIP_SRC="马鞍山地图-公交版-v3.36-规划修正" CM_ZIP_OUT="马鞍山地图-公交版-v3.36-规划修正.zip" python tools/make-zip.py
```
