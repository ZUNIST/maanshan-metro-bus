# 城市与地铁 · 马鞍山地图（公交独立版）

一款纯前端的城市轨道交通模拟游戏，在 [VinsonFung/city-and-metro](https://github.com/VinsonFung/city-and-metro) v2.7.1 的基础上，
新增**马鞍山**地图（含山、和县、花山、雨山、博望、当涂全域，416 × 328 格 / 约 104 × 82 km），并加入**公共汽车**制式。

> **这是社区修改版，不是官方版本。严禁商业使用。**
>
> 当前版本 **v3.43.0**（沪武高速马鞍山段整段按 2013 年通车；公交可过江但只走已有桥）。

## 快速开始

**只想直接玩**：到 [Releases](https://github.com/ZUNIST/maanshan-metro-bus/releases/latest) 下载 `maanshan-metro-bus-v3.43.0.zip`，解压后双击 `启动游戏.bat` 即可（含 `dist/` 与单文件版 HTML）。

**从源码运行**：

双击**仓库根目录**的 `启动游戏.bat`，脚本会自动：

1. 逐个实测可用的 Python（跳过 Windows 商店的占位程序）；
2. 没有 Python 时改用 Windows 自带的 PowerShell 静态服务器；
3. 从 8123–8130 挑一个空闲端口，确认返回 HTTP 200 后打开浏览器。

也可以手动起服务：

```bash
cd city-and-metro-bus
python -m http.server 8123
# 浏览器打开 http://127.0.0.1:8123/index.html
```

进入后：**开始游戏 → 选择地图 → 马鞍山 · 2000 / 马鞍山 · 2027**。

常用按键：`空格` 开始/暂停 · `B` 建站 · `L` 绘线 · `.` 推进一月 · `4` 最高速 · `T` 切换 2D/2.5D。

## 这版有什么

| 项 | 内容 |
|---|---|
| 地图 | 416 × 328 格（每格 250 m），含山县、和县、花山区、雨山区、博望区、当涂县全域 |
| 剧本 | 马鞍山 · 2000（从零起步）、马鞍山 · 2027（接管宁马线 + 跨省通勤） |
| 制式 | 地铁 / 市域铁路 / 有轨电车 / **公交**（B1 普通、B2 专用道、B3 BRT） |
| 车站档位 | 公交：小 400 / 中 1000 / **BRT 站台 3000** 人次每时；电车：小 2000 / 中 4000 / **大型 6000** |
| 平交规则 | 公交与任何轨道（含地铁地面段）可平面交叉；电车/地铁之间仍须立体交叉 |
| 公交虚拟性 | 不拆迁、不计景区/古建保护费、可穿景区与历史城区、路口 90° 拐弯；地铁/电车仍受实体约束 |
| 公交过江 | 只能走已通车的桥梁（120 m 内需有跨水桥面），离开桥面即报错；过桥按桥面改造费计价 |
| 国铁运营权 | 巢马城际、宁安城际马鞍山段，可在任务页签约接管（虚拟线路 + 固定班次） |
| 地名 | 7600+ 条（OSM + 高德 + 卫星核对），放大到 z≥15 显示村镇/社区/小区名 |
| 建成区 | OSM 地块栅格化 + 按乡镇人口权重生长，2027 剧本含 35 处城镇组团 |
| 路网 | 按史实逐年通车；高德 style=8 路网瓦片补密度（当涂/和县/博望） |
| 纪事 | 25 条史实（含山和县划归、长江大桥、宁安高铁、商合杭、宁马线通车等） |
| 任务 | 11 个历史任务 + 动态任务 + 策略难题 |

详细版本沿革见 [说明.md](说明.md)。

## 目录结构

```
city-and-metro-bus/     游戏本体（index.html + js/ + css/ + img/）
  js/geo_*.js           地理数据（OSM，delta+zigzag 编码）
  js/data_*.js          剧本数据（片区、地标、设施、事件、任务）
  scripts/              回归测试与构建脚本
tools/                  地图数据生成与诊断工具（Node 脚本）
说明.md                 面向玩家的完整说明与更新记录
交接文档.md             技术交接（架构、机制、流程、踩坑）
```

## 开发与校验

```bash
cd city-and-metro-bus

# 改了模拟相关源码后重建指纹（否则存档校验报错）
node --input-type=module -e "import { simulationStamp } from './scripts/sim-stamp.mjs'; await simulationStamp(true);"

# 重建发布清单并校验
node scripts/verify-game.mjs --write
node scripts/verify-game.mjs

# 回归测试
node scripts/test-netlayout.mjs
node scripts/test-station-names.mjs
```

诊断工具示例（输出指定地点的建成格 / 连通块 / 最近锚点）：

```bash
node tools/diag-hx-areas.mjs hx
node tools/diag-hx-areas.mjs hx27
```

## 数据与许可

- 地理数据 © OpenStreetMap 贡献者，[ODbL](https://opendatacommons.org/licenses/odbl/)。
- 原始游戏引擎 © VinsonFung，见 `city-and-metro-bus/LICENSE.txt` 与 `THIRD_PARTY_NOTICES.txt`。
- 本仓库的地图数据、剧本与修改均为社区制作，**仅供学习与个人娱乐，严禁商业使用**。

## 已知限制

- 路网密度受 OSM 数据源限制：含山、主城较密，当涂/和县/博望的乡村道路较稀（已用高德路网瓦片部分补齐）。
- 江北（和县、含山）的 OSM 城镇用地掩膜稀疏，小集镇建成区由人口权重生成，形状为模拟值而非实测。
- 浏览器自动化截图在超过 10 MiB 时不可用，几何正确性靠数据解码与自动化断言保证。
