// Temporary: try candidate local-media feeds with the pipeline's own fetcher and parser.
import { fetchText } from '../../scripts/lib/http.mjs';
import { parseFeed } from '../../scripts/lib/rss.mjs';

const C = [
  // Japan
  ['nhk-zh', 'zh', 'https://www3.nhk.or.jp/nhkworld/zh/news/feeds/'],
  ['nhk-zh', 'zh', 'https://www3.nhk.or.jp/rj/podcast/rss/chinese.xml'],
  ['nhk-en', 'en', 'https://www3.nhk.or.jp/nhkworld/en/news/feeds/'],
  ['nhk-en', 'en', 'https://www3.nhk.or.jp/rss/news/cat0.xml'],
  ['kyodo-zh', 'zh', 'https://china.kyodonews.net/rss/news.xml'],
  ['kyodo-zh', 'zh', 'https://china.kyodonews.net/rss/all.xml'],
  ['kyodo-en', 'en', 'https://english.kyodonews.net/rss/news.xml'],
  ['kyodo-en', 'en', 'https://english.kyodonews.net/rss/all.xml'],
  ['japantimes', 'en', 'https://www.japantimes.co.jp/feed/'],
  ['japantimes', 'en', 'https://www.japantimes.co.jp/news/feed/'],
  ['nikkei', 'en', 'https://asia.nikkei.com/rss/feed/nar'],
  ['mainichi', 'en', 'https://mainichi.jp/rss/etc/english_latest.rss'],
  ['nippon-zh', 'zh', 'https://www.nippon.com/cn/feed/'],
  ['asahi-en', 'en', 'https://www.asahi.com/rss/asahi/ajw.rdf'],
  // Korea
  ['yonhap-zh', 'zh', 'https://cn.yna.co.kr/RSS/news.xml'],
  ['yonhap-zh', 'zh', 'https://cn.yna.co.kr/rss/news.xml'],
  ['yonhap-en', 'en', 'https://en.yna.co.kr/RSS/news.xml'],
  ['koreaherald', 'en', 'https://www.koreaherald.com/common/rss_xml.php?ct=102'],
  ['koreatimes', 'en', 'https://www.koreatimes.co.kr/www/rss/nation.xml'],
  // Taiwan
  ['cna-zh', 'zh', 'https://feeds.feedburner.com/rsscna/politics'],
  ['cna-zh', 'zh', 'https://www.cna.com.tw/rss/aall.xml'],
  ['cna-en', 'en', 'https://focustaiwan.tw/rss'],
  ['cna-en', 'en', 'https://feeds.feedburner.com/rsscna/engnews'],
  ['taipeitimes', 'en', 'https://www.taipeitimes.com/xml/index.rss'],
  ['pts-zh', 'zh', 'https://news.pts.org.tw/xml/newsfeed.xml'],
  // Hong Kong
  ['rthk-zh', 'zh', 'https://rthk.hk/rthk/news/rss/c_expressnews_clocal.xml'],
  ['rthk-zh-intl', 'zh', 'https://rthk.hk/rthk/news/rss/c_expressnews_cinternational.xml'],
  ['rthk-en', 'en', 'https://rthk.hk/rthk/news/rss/e_expressnews_elocal.xml'],
  ['hkfp', 'en', 'https://hongkongfp.com/feed/'],
  ['mingpao', 'zh', 'https://news.mingpao.com/rss/pns/s00001.xml'],
  // Singapore / SE Asia
  ['zaobao', 'zh', 'https://www.zaobao.com.sg/realtime/world/rss.xml'],
  ['zaobao', 'zh', 'https://www.zaobao.com.sg/rss/realtime/world'],
  ['zaobao', 'zh', 'https://www.zaobao.com.sg/realtime/china/rss.xml'],
  ['zaobao-sea', 'zh', 'https://www.zaobao.com.sg/realtime/sea/rss.xml'],
  ['cna-sg', 'en', 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511'],
  ['cna-sg', 'en', 'https://www.channelnewsasia.com/rssfeeds/8395986'],
  ['straitstimes', 'en', 'https://www.straitstimes.com/news/asia/rss.xml'],
  ['bangkokpost', 'en', 'https://www.bangkokpost.com/rss/data/topstories.xml'],
  ['vnexpress', 'en', 'https://e.vnexpress.net/rss/news.rss'],
  ['rappler', 'en', 'https://www.rappler.com/feed/'],
  ['inquirer', 'en', 'https://newsinfo.inquirer.net/feed'],
  ['jakartaglobe', 'en', 'https://jakartaglobe.id/rss'],
  ['jakartapost', 'en', 'https://www.thejakartapost.com/feed'],
  ['fmt', 'en', 'https://www.freemalaysiatoday.com/feed/'],
  ['irrawaddy', 'en', 'https://www.irrawaddy.com/feed'],
  // South Asia
  ['thehindu', 'en', 'https://www.thehindu.com/news/national/feeder/default.rss'],
  ['indianexpress', 'en', 'https://indianexpress.com/section/india/feed/'],
  ['dawn', 'en', 'https://www.dawn.com/feeds/home'],
  ['dailystar-bd', 'en', 'https://www.thedailystar.net/frontpage/rss.xml'],
  ['kathmandupost', 'en', 'https://kathmandupost.com/rss'],
  ['tolonews', 'en', 'https://tolonews.com/rss.xml'],
  // Middle East
  ['timesofisrael', 'en', 'https://www.timesofisrael.com/feed/'],
  ['haaretz', 'en', 'https://www.haaretz.com/srv/htz---all-articles'],
  ['arabnews', 'en', 'https://www.arabnews.com/rss.xml'],
  ['thenational', 'en', 'https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml'],
  ['middleeasteye', 'en', 'https://www.middleeasteye.net/rss'],
  ['hurriyet', 'en', 'https://www.hurriyetdailynews.com/rss'],
  ['lorient', 'en', 'https://today.lorientlejour.com/rss'],
  ['iranintl', 'en', 'https://www.iranintl.com/en/feed'],
  ['rudaw', 'en', 'https://www.rudaw.net/english/rss'],
  // Africa
  ['premiumtimes', 'en', 'https://www.premiumtimesng.com/feed'],
  ['dailymaverick', 'en', 'https://www.dailymaverick.co.za/dmrss/'],
  ['news24', 'en', 'https://feeds.news24.com/articles/news24/TopStories/rss'],
  ['mg', 'en', 'https://mg.co.za/feed/'],
  ['nation-ke', 'en', 'https://nation.africa/kenya/rss.xml'],
  ['theeastafrican', 'en', 'https://www.theeastafrican.co.ke/tea/rss.xml'],
  ['dabanga', 'en', 'https://www.dabangasudan.org/en/feed'],
  ['allafrica', 'en', 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf'],
  ['ahram', 'en', 'https://english.ahram.org.eg/rss.ashx'],
  // Europe
  ['kyivindependent', 'en', 'https://kyivindependent.com/feed/'],
  ['ukrinform', 'en', 'https://www.ukrinform.net/rss/block-lastnews'],
  ['meduza', 'en', 'https://meduza.io/rss/en/all'],
  ['moscowtimes', 'en', 'https://www.themoscowtimes.com/rss/news'],
  ['rferl', 'en', 'https://www.rferl.org/api/zrqiteuuir'],
  ['notesfrompoland', 'en', 'https://notesfrompoland.com/feed/'],
  ['lemonde-en', 'en', 'https://www.lemonde.fr/en/rss/une.xml'],
  ['elpais-en', 'en', 'https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/portada'],
  ['ansa', 'en', 'https://www.ansa.it/english/news/english_nr_rss.xml'],
  ['balkaninsight', 'en', 'https://balkaninsight.com/feed/'],
  ['politico-eu', 'en', 'https://www.politico.eu/feed/'],
  // Americas
  ['cbc', 'en', 'https://www.cbc.ca/webfeed/rss/rss-topstories'],
  ['mexiconewsdaily', 'en', 'https://mexiconewsdaily.com/feed/'],
  ['batimes', 'en', 'https://www.batimes.com.ar/feed'],
  ['mercopress', 'en', 'https://en.mercopress.com/rss/'],
  ['agenciabrasil', 'en', 'https://agenciabrasil.ebc.com.br/en/rss/ultimasnoticias/feed.xml'],
  ['ticotimes', 'en', 'https://ticotimes.net/feed'],
  ['elpais-america', 'en', 'https://feeds.elpais.com/mrss-s/pages/ep/site/english.elpais.com/section/international/portada'],
  ['insightcrime', 'en', 'https://insightcrime.org/feed/'],
  // Oceania
  ['abc-au', 'en', 'https://www.abc.net.au/news/feed/51120/rss.xml'],
  ['abc-zh', 'zh', 'https://www.abc.net.au/chinese/news/rss.xml'],
  ['rnz', 'en', 'https://www.rnz.co.nz/rss/national.xml'],
  ['rnz-pacific', 'en', 'https://www.rnz.co.nz/rss/pacific.xml'],
  // more Chinese-language
  ['nytimes-zh', 'zh', 'https://cn.nytimes.com/rss/news.xml'],
  ['nytimes-zh', 'zh', 'https://cn.nytimes.com/rss/'],
  ['voa-zh', 'zh', 'https://www.voachinese.com/api/zqyqmeuqiq'],
  ['ftchinese', 'zh', 'https://www.ftchinese.com/rss/news'],
];

const now = Date.now() / 1000;
const pool = [...C];
const out = [];
async function worker() {
  while (pool.length) {
    const [id, lang, url] = pool.shift();
    const t0 = Date.now();
    try {
      const xml = await fetchText(url, { timeoutMs: 15000, retries: 0 });
      const { items } = parseFeed(xml);
      const ages = items.map((i) => (i.date ? (now - i.date) / 3600 : null)).filter((x) => x != null).sort((a, b) => a - b);
      const last24 = ages.filter((a) => a < 24).length;
      out.push(`OK   ${id.padEnd(16)} ${String(items.length).padStart(3)} items, ${String(last24).padStart(3)} <24h, newest ${ages.length ? ages[0].toFixed(1) + 'h' : 'n/a'}, dated ${ages.length}/${items.length}, ${Date.now() - t0}ms | ${url}\n       · ${(items[0]?.title || '').slice(0, 90)}\n       · ${(items[1]?.title || '').slice(0, 90)}${items[0]?.summary ? `\n       ~ ${items[0].summary.slice(0, 100)}` : ''}`);
    } catch (e) {
      out.push(`FAIL ${id.padEnd(16)} ${String(e.message).slice(0, 60)} | ${url}`);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(out.sort().join('\n'));
