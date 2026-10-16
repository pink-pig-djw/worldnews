# 全球脉动 · World Pulse

实时 3D 地球新闻态势网站：在地球上直接点击热点，飞近放大查看当地的冲突、灾害、政治、经济等最新报道。
A live 3D globe of world news — tap any hotspot to zoom in and read the latest reports from that place.

## 功能

| 模块 | 说明 |
| --- | --- |
| 写实地球 | 按**真实太阳位置**实时计算的昼夜分布（低太阳暖光、民用晨昏蒙影、夜半球城市灯光随黄昏亮起）、虚线晨昏线与太阳直射点、海面太阳反光、漂移的云层与云影、大气光晕、星空与银河带 |
| 当地时间 | 国家/地点详情显示**实时走秒的当地时间**、UTC 偏移、白天/黄昏/夜间；跨多个时区的国家注明首都时间与时区范围（IANA 时区数据库） |
| 新闻事件 | 地图上的每个点是一件**现实中的事件**，不同媒体（中英文）对同一事件的报道归在它下面。50 余家媒体/机构的 RSS（含各地当地媒体）自动**定位**到城市/地区/海域并**分类**（冲突、动荡、灾害、政治、外交、经济、社会、科技）；事件跨抓取周期保持同一编号，链接可长期分享 |
| 可信度 | 每个事件显示**独立来源数**（同一机构的不同语种、转载同一通讯社稿件的只算一家）、来源类型（通讯社/广播/报纸/联合国/官方媒体）、**定位可信度**（标题点名地点 / 只提到国家 / 按媒体所在国推断）和最近更新时间；只有一家来源、仅官方媒体或仅当地媒体报道时明确提示。地图上空心点＝单一来源，虚线圈＝位置为估计 |
| 此刻世界 | 首屏右上角（手机为底部细条，点开是列表）列出**当前最重要的 3–5 个全球事件**：按严重度与独立来源综合排序，至少两家来源证实（极严重事件除外），每个国家最多一条；附过去 24 小时的事件数、多源事件数和“严重但关注少”的数量 |
| 自上次访问以来 | 浏览器在本机记住上次看到的事件状态（不上传）；离开半小时以上再回来时，列出**新事件**、**重大变化**（死亡人数上升、获得更多独立来源报道、严重度或预警级别上升）和**正在升温**的事件；离开两天以上还会从 15 天事件档案中列出期间发生并已结束的重要事件。电脑版显示在“此刻世界”卡片顶部，手机版打开时弹出一次提示 |
| 事件时间线 | 多家媒体报道的事件自动生成**时间线**：首次报道、死亡人数变化、报道扩散（3/5/10/20 家媒体）、关联预警级别变化、每隔数小时的新进展与最新报道；较长的时间线折叠中间部分 |
| 严重度与关注度 | 两个指标分开计算：**严重度**看事件本身（伤亡人数、事件类型、GDACS 预警级别、地震震级），不随报道多少变化；**关注度**看报道（独立来源数、覆盖地区、报道增速）。圆点大小＝严重度，光柱高度＝关注度；“热点”页单列**严重但关注少**的事件与官方预警 |
| 点击即放大 | 点击标记 → 镜头飞近并打开事件详情；邻近事件按缩放级别**自动聚合/拆分**，聚合点再点一次继续放大；同一地点有多个事件时列出全部事件 |
| 国家视图 | 点击任意国家查看在该国发生及涉及该国的全部事件 |
| 关系弧线 | 事件涉及的其他国家与事发地之间画出动态弧线（如“美国 → 伊朗”） |
| 实时更新 | 服务器每 5 分钟抓取一次；网页每分钟自动检查，有新数据就**无刷新载入**：新报道所在地闪光并标上“新”，顶部弹出可点击的提示，后台标签页标题显示新增条数；正在阅读的列表和详情保持原位置 |
| 中文界面 | 灾害预警、地震地点按固定格式**直接生成中文**（数字、名称不经机器翻译）；英文报道由浏览器**在本机离线翻译**（电脑版 Chrome 138+ 内置 Translator API，不上传内容），详情页附原文；不支持的浏览器显示原文 |
| 自然灾害 | USGS 地震（M4.5+，浏览器端**每分钟**直连更新）、GDACS 灾害预警（红/橙/绿）、NASA EONET 风暴轨迹、山火、火山 |
| 空间站 | 由 CelesTrak 轨道根数用 SGP4 实时推算国际空间站与天宫空间站位置及星下点轨迹 |
| 其他 | 事件排行（综合 / 严重度 / 关注度）与升/降温趋势、滚动快讯、全局搜索、重要事件自动巡览、中/英双语、写实/暗夜两种地球风格、图层开关、可分享链接、手机底部抽屉（拖动标题栏调整高度、下滑或返回键关闭）+ 桌面侧栏双布局 |

## 工作原理

```
GitHub Actions（每 5 分钟）
  ├─ scripts/fetch-data.mjs   抓取 RSS / USGS / GDACS / EONET / CelesTrak
  │    ├─ lib/geo.mjs         基于 Natural Earth 的中英文地名库（约 5300 个地点）做地名识别与定位
  │    ├─ lib/classify.mjs    关键词规则分类 + 伤亡人数识别
  │    ├─ lib/concepts.mjs    中英文对照的人物、组织、疾病、事件类型、数字（跨语言比对用）
  │    └─ lib/events.mjs      报道 → 事件：同语种比对标题用词，跨语种比对概念/数字/地点；
  │                           事件编号跨周期保持，计算严重度、关注度、可信度、时间线
  ├─ scripts/build-site.mjs   esbuild 打包前端（three.js + globe.gl）
  └─ 发布到 GitHub Pages
       data/latest.json   滚动 48 小时的报道与事件
       data/events.json   最近 15 天已结束的重要事件档案（标题、时间、关键数字）
       data/state.json    流水线自己的记忆（事件累计信息），供下一次运行使用
       data/status.json   版本号
浏览器
  ├─ 每分钟请求很小的 status.json，版本变化时才下载 latest.json（带版本号的网址，可被 CDN 缓存）
  ├─ 地震每分钟直连 USGS
  └─ 空间站位置、昼夜晨昏线每秒本地推算
```

## 部署（一次性设置）

1. 打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
2. 打开 **Actions → Update news & deploy site → Run workflow**（之后会每 5 分钟自动运行）。
3. 网址为 `https://<用户名>.github.io/<仓库名>/`，本仓库即 `https://pink-pig-djw.github.io/worldnews/`。

> 只有默认分支会发布到 Pages；其他分支只做构建和测试。GitHub 会暂停 60 天没有提交的公开仓库的定时任务，工作流每天会自动续期一次；如果仍被暂停，到 Actions 页面点 **Enable workflow** 即可。公开仓库使用 GitHub Actions 免费。

## 本地开发

```bash
npm install
npm run data         # 抓取真实数据到 dist/data（需要能访问各新闻网站）
npm run data:sample  # 或：使用离线示例数据（界面会显示“示例数据”横幅）
npm run dev          # http://localhost:8080
npm test             # 定位 / 分类 / 解析 / 事件合并与评分 / 回访对比 单元测试
```

需要 Node.js 20+。`tools/` 下的 Python 脚本用于重新生成贴图和地名库（一般不需要运行）。

## 数据来源

| 类型 | 来源 |
| --- | --- |
| 国际媒体（英文） | BBC、Al Jazeera、The Guardian、The New York Times、NPR、DW、France 24、Sky News、Euronews、SCMP、Times of India、Africanews |
| 国际媒体（中文） | BBC 中文、DW 中文、RFI 华语、纽约时报中文网、FT中文网 |
| 联合国机构 | UN News（英文、中文） |
| 各地当地媒体 | 日本：共同网（中文）、The Japan Times · 韩国：韩联社（中文）· 台湾：中央社、公视 · 香港：香港电台、Hong Kong Free Press · 东南亚：CNA、Bangkok Post、Rappler、The Irrawaddy · 南亚：The Hindu、Dawn · 中东：Middle East Eye · 非洲：Premium Times、Daily Maverick、Nation、Radio Dabanga · 欧洲：Meduza、Le Monde、ANSA、Balkan Insight · 拉美：Mexico News Daily、Buenos Aires Times、Tico Times、InSight Crime · 大洋洲：ABC、RNZ Pacific |
| 官方媒体（界面中标注） | CGTN、塔斯社、中国新闻网、乌克兰国家通讯社、巴西通讯社（条数减半；报道他国新闻时权重降至 45%；所有官方媒体合计在任一外国最多保留 3 条） |
| 灾害与空间 | USGS 地震、GDACS（欧盟委员会/联合国）、NASA EONET、CelesTrak |
| 底图与边界 | NASA Blue Marble / Black Marble（经 three-globe 示例）、Natural Earth |
| 时区 | IANA 时区数据库（tz database，公有领域） |

新闻源在 `scripts/lib/sources.mjs` 中增删即可；某个源抓取失败不会影响其他源，失败情况会显示在网站“设置 → 新闻来源”和 Actions 日志里。

## 已知局限

- 地点识别与分类基于关键词规则，可能出错（例如人名与地名重名）；请以“阅读原文”的原始报道为准。
- 事件合并靠规则判断，不是人工编辑：宁可把同一事件拆成两个点，也尽量不把两件事混在一起。严重度来自标题中的伤亡数字、事件类型与官方预警级别，是**近似估计**；关注度只统计本站的 50 余家来源。只提到国家的报道显示在国家中心；提到克里姆林宫、白宫等或“在首都”的报道显示在相应城市；小城镇只有在报道同时提到其国家时才会被识别。
- 只展示标题、摘要和原文链接，版权归各媒体所有；部分网站在某些地区可能无法打开。
- 国界采用 Natural Earth 的实际控制线数据，克里米亚按联合国大会第 68/262 号决议标注为乌克兰。
- “实时”的上限取决于各媒体 RSS 的更新速度（通常比网站首页晚几分钟）和 GitHub 定时任务。GitHub 文档说明定时任务在高负载时会推迟、甚至被丢弃；本仓库实测 5 分钟的计划实际每 2–4 小时才运行一次，因此改由外部定时服务 cron-job.org 每 5 分钟调用 GitHub 的 workflow_dispatch 接口触发（使用只能操作本仓库 Actions 的细粒度令牌，令牌保存在 cron-job.org，需在到期前更换），GitHub 自带的定时任务保留作备用。地震（浏览器每分钟直连 USGS）和空间站不受影响。

## English summary

Static site + scheduled GitHub Action. Every 5 minutes the Action pulls 50+ RSS feeds plus USGS/GDACS/EONET/CelesTrak, geolocates headlines with a bilingual Natural-Earth gazetteer, classifies them with transparent keyword rules and groups reports into persistent **events** (matching wording within a language and shared concepts, numbers and places across languages). Each event gets a severity score (deaths, type, official alert levels — independent of coverage), an attention score (independent outlets, regions, momentum) and a reliability summary (independent sources, source types, location confidence). The Action publishes `data/latest.json` with the esbuild-bundled three.js/globe.gl front-end to GitHub Pages. Open pages check the tiny `data/status.json` every minute and load new data in place (new reports flash on the globe and are tagged NEW); earthquakes come straight from USGS every minute. Enable Pages with *Source: GitHub Actions*, then run the workflow.
