# StrikeScope

**[strikescope.tudiancao.com](https://strikescope.tudiancao.com)**

An interactive globe for exploring nuclear scenarios: browse the world's nuclear power plants, run illustrative reactor-accident and nuclear-detonation reference zones driven by real-time weather, and see an offline population estimate for the affected area. Built as an educational visualization, not an emergency-planning or targeting tool.

## What it does

- **Global plant map** — every nuclear power plant tracked by [Global Energy Monitor](https://globalenergymonitor.org/projects/global-nuclear-power-tracker/)'s Global Nuclear Power Tracker, rendered on a MapLibre globe with day/night shading, filterable by status (operating / under construction / planned / decommissioned), searchable by name or country, bilingual (中文 / English).
- **Reactor accident scenarios** — pick a plant, pick an accident type (equipment leak / core meltdown / catastrophic core dispersal, each with a distinct dominant-isotope profile), and run a simulation. Plume direction, wind force, and rainfall are pulled automatically from live weather at the plant's location (via [Open-Meteo](https://open-meteo.com)) rather than hand-picked, so the reference zone reflects what's actually happening there right now.
- **Nuclear detonation scenarios** — place a detonation point and pick a yield from 23 publicly documented historical and current weapon systems (Hiroshima/Nagasaki, Trinity, Castle Bravo, Tsar Bomba, W76/W87/W88, DF-5/DF-41, and others), spanning fission, staged-thermonuclear, "dirty" thermonuclear, and neutron/enhanced-radiation designs — each with its own fallout-intensity multiplier based on fission fraction. Blast/thermal zones scale with yield; the fallout plume reuses the same live-weather model as the reactor scenarios.
- **Offline population estimates** — population within a scenario's reference zone is computed entirely client-side against a bundled, pre-processed [WorldPop](https://www.worldpop.org) population grid, instead of hitting a live API per request.
- **Sharing** — export a scenario as an image (with an embedded QR code back to the live site) to share outside the app.
- **Custom placements** — add a hypothetical plant or detonation point anywhere on the map.

Every simulation carries an explicit on-screen disclaimer: these are simplified, illustrative reference zones for public understanding, not dose forecasts, targeting data, or emergency instructions.

## Tech stack

- **[React 19](https://react.dev)** + **[Vite](https://vite.dev)** — single-page app, no backend. All data fetches (weather, population grid, plant list) happen client-side in the visitor's own browser.
- **[MapLibre GL JS](https://maplibre.org)** via `react-map-gl` — globe projection, custom raster protocol for the day/night lighting layer.
- **[Turf.js](https://turfjs.org)** — all the geometry: wedge/circle unions for plume shapes, point-in-polygon for the population lookup.
- **[Open-Meteo](https://open-meteo.com)** — free, keyless, CORS-enabled weather API called directly from the browser (rate-limited per calling IP, not per domain, so it scales with visitors rather than against a shared quota).
- **[geotiff.js](https://geotiffjs.github.io/geotiff.js/)** + **[Playwright](https://playwright.dev)** — build-time only, used by the data-sync scripts below (not shipped to the browser bundle).
- **GitHub Pages** — static hosting, deployed via GitHub Actions on every push to `main`.

## Data sources & automation

| Data | Source | Refresh |
|---|---|---|
| Plant locations | GEM Global Nuclear Power Tracker | Annual, automated PR ([`sync-plants.yml`](.github/workflows/sync-plants.yml)) |
| Population grid | WorldPop Global 2015-2030 constrained population mosaic (CC-BY 4.0) | Annual, automated PR ([`sync-population.yml`](.github/workflows/sync-population.yml)) |
| Weather | Open-Meteo | Live, per simulation |

Both sync workflows run on a yearly schedule (and can be triggered manually), regenerate the relevant data file, and open a pull request if anything changed — a human reviews the diff before it merges and deploys. Nothing gets pushed straight to `main` unattended.

- **Population grid**: WorldPop publishes an anonymously-downloadable global 1km population mosaic each year under a release tag with no predictable naming (`R2024A`, `R2024B`, `R2025A`, ...). `scripts/build-population-grid.mjs` discovers the current tag automatically, downloads the mosaic, resamples it to a 0.1° grid, and gzip-compresses it — the script fails loudly rather than silently falling back to stale data if it can't find a mosaic for the current year.
- **Plant data**: GEM's tracker has no anonymous API — the download is gated behind a lead-capture form. `scripts/download-gnpt-xlsx.mjs` drives a real headless browser through that form once a year, using one consistent project identity (configured via repository secrets, not hardcoded) rather than a fabricated one per run.

## Getting started

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build to dist/
npm run lint      # oxlint
```

To manually refresh a data file locally:

```bash
npm run data:sync -- --input <path-to-GNPT-xlsx>
npm run data:population -- --input <path-to-worldpop-tif>   # or omit --input to auto-discover the current year
```

## Disclaimer

StrikeScope is an educational visualization. Reference zones are generated from simplified, publicly documented models (cube-root blast scaling, generic plume dispersion) and real-time weather — they are not dose forecasts, structural damage assessments, targeting data, or emergency-response guidance. Nothing in this project is derived from classified information.

---

# StrikeScope（中文说明）

**[strikescope.tudiancao.com](https://strikescope.tudiancao.com)**

一个用于探索核相关场景的交互式地球仪：浏览全球核电站，基于实时天气自动生成反应堆事故与核爆炸的示意影响区域，并给出受影响区域的离线人口估算。这是一个教育性可视化项目，不是应急规划或军事打击工具。

## 功能

- **全球电站地图** — 收录 [Global Energy Monitor](https://globalenergymonitor.org/projects/global-nuclear-power-tracker/) 全球核电追踪器（Global Nuclear Power Tracker）里的所有核电站，基于 MapLibre 地球仪渲染，带昼夜光影效果，可按状态（运营中／建设中／计划中／已关闭）筛选，支持按名称或国家搜索，中英双语。
- **反应堆事故场景** — 选中一座电站，选择事故类型（设备泄露／堆芯熔毁／灾难性解体，每种对应不同的主导同位素特征），触发模拟。扩散方向、风力、降雨强度不再需要手动选择，而是自动从该电站所在位置的实时天气（通过 [Open-Meteo](https://open-meteo.com)）获取，让示意区域反映"如果此刻真的发生"的情况。
- **核爆炸场景** — 在地图上放置一个爆炸点，从 23 种公开的历史及现役核武器当量中选择（广岛/长崎、三位一体核试验、喝彩城堡、沙皇炸弹、W76/W87/W88、东风-5/东风-41 等），涵盖纯裂变、两级热核、"脏"热核、中子弹/增强辐射弹等不同设计类型——每种类型根据裂变份额有各自的沉降强度系数。冲击波/热辐射范围只随当量变化；放射性沉降羽流复用与反应堆场景相同的实时天气模型。
- **离线人口估算** — 场景影响区域内的人口完全在浏览器本地计算，基于打包好的、预处理过的 [WorldPop](https://www.worldpop.org) 人口栅格数据，而不是每次都请求在线接口。
- **分享** — 把场景导出成一张图片（内嵌指向网站的二维码），方便分享到站外。
- **自定义放置** — 可以在地图任意位置新增一个假设的电站或爆炸点。

每次模拟界面上都会明确标注免责声明：这些只是简化的、示意性的参考区域，用于帮助公众理解，不是剂量预测、结构毁伤评估、军事目标数据或应急指令。

## 技术栈

- **[React 19](https://react.dev)** + **[Vite](https://vite.dev)** — 纯前端单页应用，没有后端。所有数据请求（天气、人口栅格、电站列表）都在访问者自己的浏览器里发起。
- **[MapLibre GL JS](https://maplibre.org)**（通过 `react-map-gl`）— 地球仪投影，自定义栅格协议实现昼夜光照层。
- **[Turf.js](https://turfjs.org)** — 负责所有几何运算：羽流扇形/圆形的合并、人口查询用的点在多边形判断。
- **[Open-Meteo](https://open-meteo.com)** — 免费、无需 API key、支持 CORS 的天气接口，直接从浏览器调用（限流按调用方 IP 计算而非按域名，所以不会因为网站访问量大而共用同一份配额）。
- **[geotiff.js](https://geotiffjs.github.io/geotiff.js/)** + **[Playwright](https://playwright.dev)** — 仅在构建/数据同步脚本中使用，不会打进浏览器端的产物里。
- **GitHub Pages** — 静态托管，每次推送到 `main` 分支后由 GitHub Actions 自动部署。

## 数据来源与自动化

| 数据 | 来源 | 更新频率 |
|---|---|---|
| 电站位置 | GEM 全球核电追踪器 | 每年一次，自动开 PR（[`sync-plants.yml`](.github/workflows/sync-plants.yml)） |
| 人口栅格 | WorldPop Global 2015-2030 约束性人口镶嵌图（CC-BY 4.0） | 每年一次，自动开 PR（[`sync-population.yml`](.github/workflows/sync-population.yml)） |
| 天气 | Open-Meteo | 实时，每次模拟单独请求 |

两个同步 workflow 都是每年定时运行一次（也支持手动触发），跑完后重新生成对应数据文件，如果内容有变化就自动开一个 Pull Request——由人工审核改动内容后再合并、部署。不会有任何改动在无人审核的情况下直接推到 `main`。

- **人口栅格**：WorldPop 每年会发布一份可匿名下载的全球 1km 人口镶嵌图，但版本号（`R2024A`、`R2024B`、`R2025A`……）没有规律可循。`scripts/build-population-grid.mjs` 会自动去发现当前的版本号，下载镶嵌图，重采样成 0.1° 网格并 gzip 压缩——如果找不到当年的数据，脚本会直接报错退出，而不是悄悄地继续使用旧数据。
- **电站数据**：GEM 的追踪器没有匿名可用的接口——下载入口是一个需要填写姓名/邮箱/机构等信息的表单。`scripts/download-gnpt-xlsx.mjs` 用真实的无头浏览器（Playwright）每年跑一次这个表单，使用同一个固定的、真实的项目身份（通过仓库 secrets 配置，而不是写死在代码里），而不是每次伪造一个身份。

## 本地开发

```bash
npm install
npm run dev       # 启动开发服务器
npm run build     # 构建生产版本到 dist/
npm run lint      # oxlint 检查
```

手动刷新某项数据：

```bash
npm run data:sync -- --input <GNPT表格文件路径>
npm run data:population -- --input <WorldPop的tif文件路径>   # 不传 --input 则自动发现当年数据
```

## 免责声明

StrikeScope 是一个教育性可视化项目。所有示意区域都基于简化的、公开的模型（立方根冲击波缩放公式、通用羽流扩散模型）与实时天气生成——它们不是剂量预测、结构毁伤评估、军事目标数据，也不是应急响应指导。本项目不包含、也不基于任何机密信息。
