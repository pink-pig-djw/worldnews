// News sources. Only organisations with editorial accountability: wire services, public
// broadcasters, newspapers of record, UN agencies. `kind` is shown in the UI so readers know
// what they are reading (state-run outlets are labelled as such).
//
// kind: broadcaster | newspaper | agency | un | state
// State media (Chinese, Russian): fewer items, and less weight on stories about other countries,
// so their framing doesn't dominate international coverage. `weight` scales a story's importance on
// the map and in rankings (home = located in `homeCc`); `foreignCap` limits how many stories
// located elsewhere are kept in the rolling window.
const STATE = { limit: 15, foreignCap: 20, weight: { home: 0.8, foreign: 0.45 } };
// All state outlets together keep at most this many stories located in any one foreign country.
export const STATE_PER_COUNTRY = 3;
const CN_STATE = { ...STATE, homeCc: ['CN', 'HK', 'MO'] };
// Local outlets: how a country covers itself. `local` lets the geoparser use the outlet's country to
// tell same-named places apart; `national` feeds are domestic news, so a story naming no place is
// put in that country. Their uncategorised items (sport, entertainment) are skipped, and each keeps
// at most `keep` stories in the rolling window (every source keeps at most DEFAULT_KEEP).
const REGIONAL = { limit: 15, keep: 30, skipOther: true }; // regional outlets: no home-country bias
const LOCAL = { ...REGIONAL, local: true };
const NATIONAL = { ...LOCAL, national: true };

export const DEFAULT_KEEP = 60;

// Independence: outlets of one organisation (BBC and BBC Chinese, France 24 and RFI, Euronews and
// Africanews) or one state's media count as one source when counting who reports an event.
export const orgOf = (src) => src?.org || src?.id;

// Where an outlet is based, for "how widely is this covered" (attention spread).
const REGION = {
  GB: 'eu', DE: 'eu', FR: 'eu', IT: 'eu', RS: 'eu', UA: 'eu', RU: 'eu',
  US: 'na', CA: 'na',
  MX: 'la', AR: 'la', BR: 'la', CR: 'la', CO: 'la',
  QA: 'me',
  CN: 'ea', HK: 'ea', TW: 'ea', JP: 'ea', KR: 'ea',
  SG: 'sea', TH: 'sea', PH: 'sea', MM: 'sea',
  IN: 'sa', PK: 'sa',
  CG: 'af', NG: 'af', ZA: 'af', KE: 'af', SD: 'af',
  AU: 'oc', NZ: 'oc',
  XO: 'int',
};
export const regionOf = (src) => REGION[src?.country] || 'int';

export const NEWS_SOURCES = [
  // ---- English ----
  { id: 'bbc', name: 'BBC News', zh: 'BBC', lang: 'en', kind: 'broadcaster', country: 'GB', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'aljazeera', name: 'Al Jazeera', zh: '半岛电视台', lang: 'en', kind: 'broadcaster', country: 'QA', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'guardian', name: 'The Guardian', zh: '卫报', lang: 'en', kind: 'newspaper', country: 'GB', url: 'https://www.theguardian.com/world/rss' },
  { id: 'nyt', name: 'The New York Times', zh: '纽约时报', lang: 'en', kind: 'newspaper', country: 'US', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
  { id: 'npr', name: 'NPR', zh: 'NPR', lang: 'en', kind: 'broadcaster', country: 'US', url: 'https://feeds.npr.org/1004/rss.xml' },
  { id: 'dw', name: 'DW', zh: '德国之声', lang: 'en', kind: 'broadcaster', country: 'DE', url: 'https://rss.dw.com/xml/rss-en-world' },
  { id: 'france24', name: 'France 24', zh: '法国24', lang: 'en', kind: 'broadcaster', country: 'FR', org: 'fmm', url: 'https://www.france24.com/en/rss' },
  { id: 'sky', name: 'Sky News', zh: '天空新闻', lang: 'en', kind: 'broadcaster', country: 'GB', url: 'https://feeds.skynews.com/feeds/rss/world.xml' },
  { id: 'euronews', name: 'Euronews', zh: '欧洲新闻台', lang: 'en', kind: 'broadcaster', country: 'FR', url: 'https://www.euronews.com/rss?level=theme&name=news' },
  { id: 'scmp', name: 'South China Morning Post', zh: '南华早报', lang: 'en', kind: 'newspaper', country: 'HK', url: 'https://www.scmp.com/rss/91/feed' },
  { id: 'toi', name: 'Times of India', zh: '印度时报', lang: 'en', kind: 'newspaper', country: 'IN', url: 'https://timesofindia.indiatimes.com/rssfeeds/296589292.cms' },
  { id: 'africanews', name: 'Africanews', zh: '非洲新闻台', lang: 'en', kind: 'broadcaster', country: 'CG', org: 'euronews', url: 'https://www.africanews.com/feed/rss' },
  { id: 'un', name: 'UN News', zh: '联合国新闻', lang: 'en', kind: 'un', country: 'XO', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
  { id: 'cgtn', name: 'CGTN', zh: '中国国际电视台', lang: 'en', kind: 'state', country: 'CN', org: 'cn-state', url: 'https://www.cgtn.com/subscribe/rss/section/world.xml', ...CN_STATE },
  { id: 'tass', name: 'TASS', zh: '塔斯社', lang: 'en', kind: 'state', country: 'RU', url: 'https://tass.com/rss/v2.xml', ...STATE, homeCc: ['RU'] },
  // ---- 中文 ----
  { id: 'bbc-zh', name: 'BBC 中文', zh: 'BBC 中文', lang: 'zh', kind: 'broadcaster', country: 'GB', org: 'bbc', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml' },
  { id: 'dw-zh', name: 'DW 中文', zh: '德国之声中文网', lang: 'zh', kind: 'broadcaster', country: 'DE', org: 'dw', url: 'https://rss.dw.com/xml/rss-chi-all' },
  { id: 'rfi-zh', name: 'RFI 华语', zh: '法广华语', lang: 'zh', kind: 'broadcaster', country: 'FR', org: 'fmm', url: 'https://www.rfi.fr/cn/rss' },
  { id: 'un-zh', name: '联合国新闻', zh: '联合国新闻', lang: 'zh', kind: 'un', country: 'XO', org: 'un', url: 'https://news.un.org/feed/subscribe/zh/news/all/rss.xml' },
  { id: 'chinanews', name: '中国新闻网', zh: '中国新闻网', lang: 'zh', kind: 'state', country: 'CN', org: 'cn-state', url: 'https://www.chinanews.com.cn/rss/world.xml', tz: '+08:00', ...CN_STATE },
  { id: 'nyt-zh', name: '纽约时报中文网', zh: '纽约时报中文网', lang: 'zh', kind: 'newspaper', country: 'US', org: 'nyt', url: 'https://cn.nytimes.com/rss/', limit: 20 },
  { id: 'ft-zh', name: 'FT中文网', zh: 'FT中文网', lang: 'zh', kind: 'newspaper', country: 'GB', url: 'https://www.ftchinese.com/rss/news', limit: 20 },

  // ---- Local media, by region (feeds checked from GitHub's runners) ----
  // East Asia
  { id: 'kyodo-zh', name: 'Kyodo News 共同网', zh: '共同网', lang: 'zh', kind: 'agency', country: 'JP', url: 'https://china.kyodonews.net/rss/news.xml', ...LOCAL },
  { id: 'japantimes', name: 'The Japan Times', zh: '日本时报', lang: 'en', kind: 'newspaper', country: 'JP', url: 'https://www.japantimes.co.jp/news/feed/', ...NATIONAL },
  { id: 'yonhap-zh', name: 'Yonhap 韩联社', zh: '韩联社', lang: 'zh', kind: 'agency', country: 'KR', url: 'https://cn.yna.co.kr/RSS/news.xml', ...LOCAL },
  { id: 'cna-tw', name: 'Central News Agency 中央社', zh: '中央社', lang: 'zh', kind: 'agency', country: 'TW', url: 'https://feeds.feedburner.com/rsscna/politics', ...NATIONAL },
  { id: 'pts', name: 'PTS 公视新闻', zh: '公视新闻', lang: 'zh', kind: 'broadcaster', country: 'TW', url: 'https://news.pts.org.tw/xml/newsfeed.xml', ...LOCAL },
  { id: 'rthk', name: 'RTHK 香港电台', zh: '香港电台', lang: 'zh', kind: 'broadcaster', country: 'HK', url: 'https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml', ...NATIONAL },
  { id: 'hkfp', name: 'Hong Kong Free Press', zh: '香港自由新闻', lang: 'en', kind: 'newspaper', country: 'HK', url: 'https://hongkongfp.com/feed/', ...NATIONAL },
  // Southeast & South Asia
  { id: 'cna-sg', name: 'CNA (Singapore)', zh: '亚洲新闻台', lang: 'en', kind: 'broadcaster', country: 'SG', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511', ...REGIONAL },
  { id: 'bangkokpost', name: 'Bangkok Post', zh: '曼谷邮报', lang: 'en', kind: 'newspaper', country: 'TH', url: 'https://www.bangkokpost.com/rss/data/topstories.xml', ...NATIONAL },
  { id: 'rappler', name: 'Rappler', zh: 'Rappler', lang: 'en', kind: 'newspaper', country: 'PH', url: 'https://www.rappler.com/feed/', ...NATIONAL },
  { id: 'irrawaddy', name: 'The Irrawaddy', zh: '伊洛瓦底', lang: 'en', kind: 'newspaper', country: 'MM', url: 'https://www.irrawaddy.com/feed', ...NATIONAL },
  { id: 'thehindu', name: 'The Hindu', zh: '印度教徒报', lang: 'en', kind: 'newspaper', country: 'IN', url: 'https://www.thehindu.com/news/national/feeder/default.rss', ...NATIONAL },
  { id: 'dawn', name: 'Dawn', zh: '黎明报', lang: 'en', kind: 'newspaper', country: 'PK', url: 'https://www.dawn.com/feeds/home', ...NATIONAL },
  // Middle East & Africa
  { id: 'mee', name: 'Middle East Eye', zh: '中东之眼', lang: 'en', kind: 'newspaper', country: 'GB', url: 'https://www.middleeasteye.net/rss', ...REGIONAL },
  { id: 'premiumtimes', name: 'Premium Times', zh: '尼日利亚优质时报', lang: 'en', kind: 'newspaper', country: 'NG', url: 'https://www.premiumtimesng.com/feed', ...NATIONAL },
  { id: 'dailymaverick', name: 'Daily Maverick', zh: '南非独行者日报', lang: 'en', kind: 'newspaper', country: 'ZA', url: 'https://www.dailymaverick.co.za/dmrss/', ...NATIONAL },
  { id: 'nation-ke', name: 'Nation (Kenya)', zh: '肯尼亚民族日报', lang: 'en', kind: 'newspaper', country: 'KE', url: 'https://nation.africa/kenya/rss.xml', ...NATIONAL },
  { id: 'dabanga', name: 'Radio Dabanga', zh: '达班加电台', lang: 'en', kind: 'broadcaster', country: 'SD', url: 'https://www.dabangasudan.org/en/feed', ...NATIONAL },
  // Europe
  { id: 'meduza', name: 'Meduza', zh: '美杜莎（俄罗斯独立媒体）', lang: 'en', kind: 'newspaper', country: 'RU', url: 'https://meduza.io/rss/en/all', ...NATIONAL },
  { id: 'ukrinform', name: 'Ukrinform', zh: '乌克兰国家通讯社', lang: 'en', kind: 'state', country: 'UA', url: 'https://www.ukrinform.net/rss/block-lastnews', ...STATE, homeCc: ['UA'], local: true },
  { id: 'lemonde', name: 'Le Monde (English)', zh: '世界报', lang: 'en', kind: 'newspaper', country: 'FR', url: 'https://www.lemonde.fr/en/rss/une.xml', ...LOCAL },
  { id: 'ansa', name: 'ANSA', zh: '安莎社', lang: 'en', kind: 'agency', country: 'IT', url: 'https://www.ansa.it/english/news/english_nr_rss.xml', ...LOCAL },
  { id: 'balkaninsight', name: 'Balkan Insight', zh: '巴尔干洞察', lang: 'en', kind: 'newspaper', country: 'RS', url: 'https://balkaninsight.com/feed/', ...REGIONAL },
  // Americas & Oceania
  { id: 'mexiconews', name: 'Mexico News Daily', zh: '墨西哥每日新闻', lang: 'en', kind: 'newspaper', country: 'MX', url: 'https://mexiconewsdaily.com/feed/', ...NATIONAL },
  { id: 'batimes', name: 'Buenos Aires Times', zh: '布宜诺斯艾利斯时报', lang: 'en', kind: 'newspaper', country: 'AR', url: 'https://www.batimes.com.ar/feed', ...NATIONAL },
  { id: 'agenciabrasil', name: 'Agência Brasil', zh: '巴西通讯社', lang: 'en', kind: 'state', country: 'BR', url: 'https://agenciabrasil.ebc.com.br/en/rss/ultimasnoticias/feed.xml', ...STATE, homeCc: ['BR'], local: true, national: true },
  { id: 'ticotimes', name: 'The Tico Times', zh: '蒂科时报', lang: 'en', kind: 'newspaper', country: 'CR', url: 'https://ticotimes.net/feed', ...NATIONAL },
  { id: 'insightcrime', name: 'InSight Crime', zh: 'InSight Crime', lang: 'en', kind: 'newspaper', country: 'CO', url: 'https://insightcrime.org/feed/', ...REGIONAL },
  { id: 'abc-au', name: 'ABC News (Australia)', zh: '澳大利亚广播公司', lang: 'en', kind: 'broadcaster', country: 'AU', url: 'https://www.abc.net.au/news/feed/51120/rss.xml', ...NATIONAL },
  { id: 'rnz-pacific', name: 'RNZ Pacific', zh: '新西兰广播电台·太平洋', lang: 'en', kind: 'broadcaster', country: 'NZ', url: 'https://www.rnz.co.nz/rss/pacific.xml', ...REGIONAL },
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
