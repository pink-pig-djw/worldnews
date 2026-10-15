// News sources. Only organisations with editorial accountability: wire services, public
// broadcasters, newspapers of record, UN agencies. `kind` is shown in the UI so readers know
// what they are reading (state-run outlets are labelled as such).
//
// kind: broadcaster | newspaper | agency | un | state
// Chinese state media: fewer items, and less weight on stories about other countries, so their
// framing doesn't dominate international coverage. `weight` scales a story's importance on the map
// and in rankings (home = located in `homeCc`); `foreignCap` limits how many stories located
// elsewhere are kept in the rolling window.
const CN_STATE = { limit: 15, foreignCap: 20, homeCc: ['CN', 'HK', 'MO'], weight: { home: 0.8, foreign: 0.45 } };

export const NEWS_SOURCES = [
  // ---- English ----
  { id: 'bbc', name: 'BBC News', zh: 'BBC', lang: 'en', kind: 'broadcaster', country: 'GB', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'aljazeera', name: 'Al Jazeera', zh: '半岛电视台', lang: 'en', kind: 'broadcaster', country: 'QA', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'guardian', name: 'The Guardian', zh: '卫报', lang: 'en', kind: 'newspaper', country: 'GB', url: 'https://www.theguardian.com/world/rss' },
  { id: 'nyt', name: 'The New York Times', zh: '纽约时报', lang: 'en', kind: 'newspaper', country: 'US', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { id: 'npr', name: 'NPR', zh: 'NPR', lang: 'en', kind: 'broadcaster', country: 'US', url: 'https://feeds.npr.org/1004/rss.xml' },
  { id: 'dw', name: 'DW', zh: '德国之声', lang: 'en', kind: 'broadcaster', country: 'DE', url: 'https://rss.dw.com/xml/rss-en-world' },
  { id: 'france24', name: 'France 24', zh: '法国24', lang: 'en', kind: 'broadcaster', country: 'FR', url: 'https://www.france24.com/en/rss' },
  { id: 'sky', name: 'Sky News', zh: '天空新闻', lang: 'en', kind: 'broadcaster', country: 'GB', url: 'https://feeds.skynews.com/feeds/rss/world.xml' },
  { id: 'euronews', name: 'Euronews', zh: '欧洲新闻台', lang: 'en', kind: 'broadcaster', country: 'FR', url: 'https://www.euronews.com/rss?level=theme&name=news' },
  { id: 'scmp', name: 'South China Morning Post', zh: '南华早报', lang: 'en', kind: 'newspaper', country: 'HK', url: 'https://www.scmp.com/rss/91/feed' },
  { id: 'toi', name: 'Times of India', zh: '印度时报', lang: 'en', kind: 'newspaper', country: 'IN', url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms' },
  { id: 'africanews', name: 'Africanews', zh: '非洲新闻台', lang: 'en', kind: 'broadcaster', country: 'CG', url: 'https://www.africanews.com/feed/rss' },
  { id: 'un', name: 'UN News', zh: '联合国新闻', lang: 'en', kind: 'un', country: 'XO', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
  { id: 'cgtn', name: 'CGTN', zh: '中国国际电视台', lang: 'en', kind: 'state', country: 'CN', url: 'https://www.cgtn.com/subscribe/rss/section/world.xml', ...CN_STATE },
  { id: 'tass', name: 'TASS', zh: '塔斯社', lang: 'en', kind: 'state', country: 'RU', url: 'https://tass.com/rss/v2.xml', limit: 25 },
  // ---- 中文 ----
  { id: 'bbc-zh', name: 'BBC 中文', zh: 'BBC 中文', lang: 'zh', kind: 'broadcaster', country: 'GB', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml' },
  { id: 'dw-zh', name: 'DW 中文', zh: '德国之声中文网', lang: 'zh', kind: 'broadcaster', country: 'DE', url: 'https://rss.dw.com/xml/rss-chi-all' },
  { id: 'rfi-zh', name: 'RFI 华语', zh: '法广华语', lang: 'zh', kind: 'broadcaster', country: 'FR', url: 'https://www.rfi.fr/cn/rss' },
  { id: 'un-zh', name: '联合国新闻', zh: '联合国新闻', lang: 'zh', kind: 'un', country: 'XO', url: 'https://news.un.org/feed/subscribe/zh/news/all/rss.xml' },
  { id: 'chinanews', name: '中国新闻网', zh: '中国新闻网', lang: 'zh', kind: 'state', country: 'CN', url: 'https://www.chinanews.com.cn/rss/world.xml', tz: '+08:00', ...CN_STATE },
];

export const HAZARD_SOURCES = {
  usgs: { name: 'USGS', zh: '美国地质调查局', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson' },
  gdacs: { name: 'GDACS', zh: '全球灾害预警与协调系统', url: 'https://www.gdacs.org/xml/rss.xml' },
  eonet: { name: 'NASA EONET', zh: 'NASA 地球观测事件', url: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=21&limit=400' },
};

export const SATELLITES = [
  { id: 'iss', name: 'ISS', zh: '国际空间站', norad: 25544 },
  { id: 'css', name: 'Tiangong', zh: '天宫空间站', norad: 48274 },
];
