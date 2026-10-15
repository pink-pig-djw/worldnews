# 全球脉动 · World Pulse

实时 3D 地球新闻态势网站：在地球上直接点击热点，飞近放大查看当地的冲突、灾害、政治、经济等最新报道。
A live 3D globe of world news — tap any hotspot to zoom in and read the latest reports from that place.

## 功能

| 模块 | 说明 |
| --- | --- |
| 写实地球 | 按**真实太阳位置**实时计算的昼夜分布（低太阳暖光、民用晨昏蒙影、夜半球城市灯光随黄昏亮起）、虚线晨昏线与太阳直射点、海面太阳反光、漂移的云层与云影、大气光晕、星空与银河带 |
| 当地时间 | 国家/地点详情显示**实时走秒的当地时间**、UTC 偏移、白天/黄昏/夜间；跨多个时区的国家注明首都时间与时区范围（IANA 时区数据库） |
| 新闻热点 | 约 20 家媒体/机构的 RSS 自动**定位**到城市/地区/海域并**分类**（冲突、动荡、灾害、政治、外交、经济、社会、科技），按严重度、多源报道数与时效计算热度 |
| 点击即放大 | 点击标记 → 镜头飞近；邻近热点按缩放级别**自动聚合/拆分**，聚合点再点一次继续放大；详情面板列出报道、来源数、48 小时趋势、相关国家 |
| 国家视图 | 点击任意国家查看在该国发生及涉及该国的全部报道 |
| 关系弧线 | 同一条新闻中同时出现的国家之间画出动态弧线（如“美国 → 伊朗”） |
| 实时更新 | 服务器每 5 分钟抓取一次；网页每分钟自动检查，有新数据就**无刷新载入**：新报道所在地闪光并标上“新”，顶部弹出可点击的提示，后台标签页标题显示新增条数；正在阅读的列表和详情保持原位置 |
| 中文界面 | 灾害预警、地震地点按固定格式**直接生成中文**（数字、名称不经机器翻译）；英文报道由浏览器**在本机离线翻译**（电脑版 Chrome 138+ 内置 Translator API，不上传内容），详情页附原文；不支持的浏览器显示原文 |
| 自然灾害 | USGS 地震（M4.5+，浏览器端**每分钟**直连更新）、GDACS 灾害预警（红/橙/绿）、NASA EONET 风暴轨迹、山火、火山 |
| 空间站 | 由 CelesTrak 轨道根数用 SGP4 实时推算国际空间站与天宫空间站位置及星下点轨迹 |
| 其他 | 热点排行与升/降温趋势、滚动快讯、全局搜索、热点自动巡览、中/英双语、写实/暗夜两种地球风格、图层开关、可分享链接、手机底部抽屉 + 桌面侧栏双布局 |

## 工作原理

```
GitHub Actions（每 5 分钟）
  ├─ scripts/fetch-data.mjs   抓取 RSS / USGS / GDACS / EONET / CelesTrak
  │    ├─ lib/geo.mjs         基于 Natural Earth 的中英文地名库（约 5300 个地点）做地名识别与定位
  │    ├─ lib/classify.mjs    关键词规则分类 + 伤亡人数识别 → 严重度
  │    └─ lib/cluster.mjs     合并不同媒体对同一事件的报道
  ├─ scripts/build-site.mjs   esbuild 打包前端（three.js + globe.gl）
  └─ 发布到 GitHub Pages（data/latest.json 为滚动 48 小时数据，data/status.json 为版本号）
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
npm test             # 定位 / 分类 / 解析 / 聚合 单元测试
```

需要 Node.js 20+。`tools/` 下的 Python 脚本用于重新生成贴图和地名库（一般不需要运行）。

## 数据来源

| 类型 | 来源 |
| --- | --- |
| 英文媒体 | BBC、Al Jazeera、The Guardian、The New York Times、NPR、DW、France 24、Sky News、Euronews、SCMP、Times of India、Africanews |
| 联合国机构 | UN News（英文、中文） |
| 官方媒体（界面中标注） | CGTN、塔斯社、中国新闻网（条数减半，报道他国新闻时权重降至 45%） |
| 中文媒体 | BBC 中文、DW 中文、RFI 华语 |
| 灾害与空间 | USGS 地震、GDACS（欧盟委员会/联合国）、NASA EONET、CelesTrak |
| 底图与边界 | NASA Blue Marble / Black Marble（经 three-globe 示例）、Natural Earth |
| 时区 | IANA 时区数据库（tz database，公有领域） |

新闻源在 `scripts/lib/sources.mjs` 中增删即可；某个源抓取失败不会影响其他源，失败情况会显示在网站“设置 → 新闻来源”和 Actions 日志里。

## 已知局限

- 地点识别与分类基于关键词规则，可能出错（例如人名与地名重名）；请以“阅读原文”的原始报道为准。只提到国家的报道显示在国家中心；提到克里姆林宫、白宫等或“在首都”的报道显示在相应城市；小城镇只有在报道同时提到其国家时才会被识别。
- 只展示标题、摘要和原文链接，版权归各媒体所有；部分网站在某些地区可能无法打开。
- 国界采用 Natural Earth 的实际控制线数据，克里米亚按联合国大会第 68/262 号决议标注为乌克兰。
- “实时”的上限取决于各媒体 RSS 的更新速度（通常比网站首页晚几分钟）和 GitHub 定时任务：后者在高峰期可能推迟数分钟到数十分钟。地震和空间站不受影响。

## English summary

Static site + scheduled GitHub Action. Every 5 minutes the Action pulls ~20 RSS feeds plus USGS/GDACS/EONET/CelesTrak, geolocates headlines with a bilingual Natural-Earth gazetteer, classifies them with transparent keyword rules, clusters multi-outlet coverage and publishes `data/latest.json` with the esbuild-bundled three.js/globe.gl front-end to GitHub Pages. Open pages check the tiny `data/status.json` every minute and load new data in place (new reports flash on the globe and are tagged NEW); earthquakes come straight from USGS every minute. Enable Pages with *Source: GitHub Actions*, then run the workflow.
