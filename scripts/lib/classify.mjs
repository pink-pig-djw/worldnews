// Keyword classifier: category, subtype and a 0–1 severity score for a headline.
// Rules are deliberately transparent so the UI can explain why a story got its label.

export const CATEGORIES = ['conflict', 'unrest', 'disaster', 'politics', 'diplomacy', 'economy', 'society', 'science', 'other'];

const BASE_SEVERITY = { conflict: 0.55, disaster: 0.5, unrest: 0.45, society: 0.36, diplomacy: 0.34, politics: 0.3, economy: 0.28, science: 0.2, other: 0.2 };

// [category, subtype, weight, englishRegex, chineseRegex]
const RULES = [
  ['conflict', 'airstrike', 3, /\bair ?(?:strikes?|raids?)\b|\bbombard(?:s|ed|ment)?\b|\bwarplanes?\b|\bfighter jets?\b|\bbomb(?:s|ed|ing)\b(?! threat)|\b(?:israeli|russian|us|u\.s\.|ukrainian|deadly|retaliatory|military|pakistani|indian|saudi|turkish) strikes?\b|\bstrikes? (?:kill|hit|target|on)\b|\b\d[\d,]* (?:air ?)?strikes\b|\b(?:refinery|drone|missile|retaliatory|deadly|overnight|cross-border|precision|pre-emptive|preemptive) strikes?\b/i, /空袭|轰炸|战机|空中打击|军事打击/],
  ['conflict', 'clash', 1.5, /\bhouthis?\b|\bhamas\b|\bhezbollah\b|\btaliban\b|\brsf\b|\bal-shabaab?\b|\bboko haram\b|\bm23\b|\bisis\b|\bislamic state\b|\bwagner\b/i, /胡塞|哈马斯|真主党|塔利班|快速支援部队|青年党|博科圣地|伊斯兰国|瓦格纳/],
  // "killed" alone does not make a war story (accidents, crime, zoo attacks): it only tips the balance
  ['conflict', 'clash', 0.7, /\bkill(?:s|ed|ing)\b|\bdead\b|\bcasualties\b/i, /打死|炸死|伤亡/],
  ['conflict', 'missile', 3, /\bmissiles?\b|\brockets?\b(?! launch)|\bballistic\b|\binterceptors?\b|\biron dome\b|\bhypersonic\b/i, /导弹|火箭弹|拦截|弹道/],
  ['conflict', 'drone', 3, /\bdrones?\b|\buavs?\b|\bshahed\b|\bkamikaze\b/i, /无人机/],
  ['conflict', 'shelling', 3, /\bshell(?:ing|ed|s)\b|\bartillery\b|\bmortars?\b/i, /炮击|炮火|炮弹/],
  ['conflict', 'clash', 2.5, /\bclash(?:es|ed)?\b|\bfighting\b|\bbattles?\b|\boffensive\b|\bfront ?line\b|\btroops\b|\bsoldiers?\b|\bmilitias?\b|\brebels?\b|\binsurgen(?:ts?|cy)\b|\bgunfire\b|\bfirefight\b|\bambush(?:ed)?\b|\bsiege\b|\binva(?:sion|ded?|des)\b|\bwar(?:s|fare)?\b|\bparamilitar(?:y|ies)\b|\bjihadists?\b/i, /冲突|交火|战斗|激战|战事|前线|部队|军队|士兵|武装分子|叛军|民兵|围困|入侵|战争|战火|武装/],
  ['conflict', 'attack', 3, /\battack(?:s|ed|ing)?\b|\bbomb(?:ing|er)s?\b|\bsuicide\b|\bexplosions?\b|\bblasts?\b|\bgunmen\b|\bterror(?:ist|ism|ists)?\b|\bmilitants?\b|\bied\b|\bcar bomb\b|\bmassacre\b|\bassassinat(?:ed|ion)\b/i, /袭击|恐袭|恐怖|爆炸|枪手|自杀式|屠杀|暗杀/],
  ['conflict', 'naval', 2, /\bwarships?\b|\bnav(?:y|al)\b|\bdestroyers?\b|\bfrigates?\b|\bsubmarines?\b|\baircraft carriers?\b|\bcoast ?guard\b|\b(?:tanker|vessel|ship)s? (?:seized|attacked|hit)\b/i, /军舰|海军|驱逐舰|护卫舰|潜艇|航母|海警/],
  ['conflict', 'ceasefire', 4, /\bcease-?fire\b|\btruce\b|\bpeace (?:talks|deal|plan|agreement|process|summit|negotiations)\b|\barmistice\b|\bhostages?\b|\bprisoner (?:swap|exchange)\b|\bdemilitari[sz]ed\b/i, /停火|休战|和谈|和平协议|和平计划|和平进程|人质|换俘|停战/],
  ['conflict', 'military', 1.2, /\bmilitary\b|\barmy\b|\bdefen[cs]e (?:ministry|minister|spending|forces)\b|\bdrills?\b|\bmilitary exercises?\b|\bmobili[sz]ation\b|\bconscription\b|\bweapons?\b|\barms (?:deal|sales|shipments?|supplies)\b|\bammunition\b|\bair defen[cs]e\b/i, /军事|军演|演习|国防|武器|军售|弹药|征兵|动员|防空/],
  ['conflict', 'nuclear', 2, /\bnuclear (?:weapons?|warheads?|tests?|programme|program|talks|deal|sites?|facilit(?:y|ies)|bomb)\b|\buranium\b|\benrichment\b/i, /核武|核试验|核计划|浓缩铀|核设施|核协议|核谈判/],

  ['disaster', 'quake', 4, /\bearthquakes?\b|\bquakes?\b|\btremors?\b|\baftershocks?\b|\bmagnitude[- ]\d|\bseismic\b|\btsunamis?\b/i, /地震|余震|震级|海啸/],
  ['disaster', 'flood', 4, /\bfloods?\b|\bflooding\b|\bflash floods?\b|\bdeluge\b|\btorrential\b|\bmonsoon\b|\binundat/i, /洪水|洪灾|水灾|暴雨|内涝|洪涝/],
  ['disaster', 'storm', 4, /\bhurricanes?\b|\btyphoons?\b|\bcyclones?\b|\btropical (?:storm|depression)\b|\b[Ss]torm (?!Shadow)[A-Z][a-z]+\b|\btornado(?:es)?\b|\bblizzards?\b|\bsevere weather\b/i, /台风|飓风|气旋|风暴|龙卷风|暴风雪|热带风暴/],
  ['disaster', 'fire', 3.5, /\bwildfires?\b|\bbushfires?\b|\bforest fires?\b|\bblazes?\b|\bfire (?:kills|breaks out|engulfs|rages|destroys)\b|\b(?:deadly|huge|massive) fire\b/i, /山火|野火|森林火灾|大火|火灾|起火/],
  ['disaster', 'volcano', 4, /\bvolcano(?:es)?\b|\bvolcanic\b|\beruptions?\b|\blava\b|\bash (?:cloud|plume)\b/i, /火山|喷发|岩浆/],
  ['disaster', 'heat', 3, /\bheat ?waves?\b|\bextreme heat\b|\bdroughts?\b|\brecord (?:temperatures|heat)\b|\bscorching\b/i, /热浪|高温|干旱|旱灾|酷热/],
  ['disaster', 'landslide', 3.5, /\blandslides?\b|\bmudslides?\b|\bavalanches?\b/i, /山体滑坡|滑坡|泥石流|雪崩/],
  ['disaster', 'accident', 3, /\b(?:plane|helicopter|jet|bus|train|boat|ferry|car|road) (?:crash|accident|collision)\b|\bcrash(?:es|ed)? (?:kills?|killing)\b|\bderail(?:ed|ment|s)?\b|\b(?:roof|building|bridge|mine|dam|school|stadium|tower|wall|house|hotel|church|mosque|apartment|block|structure)s? (?:collapse[sd]?|caves? in)\b|\bcollapsed\b|\bcapsiz(?:e|ed|es)\b|\bshipwreck\b|\bsank\b|\bstampede\b|\bcrush\b|\bmine (?:blast|accident)\b/i, /坠机|空难|失事|脱轨|坍塌|倒塌|沉船|翻船|矿难|踩踏|事故|撞车/],

  ['disaster', 'accident', 1.5, /\bdisasters?\b/i, /灾难|惨剧/],
  ['unrest', 'protest', 3, /\bprotest(?:s|ers|ors|ing|ed)?\b|\bdemonstrat(?:ions?|ors|ed|ing)\b|\brall(?:y|ies)\b|\bmarch(?:ed|ers|es)\b|\bsit-ins?\b/i, /抗议|示威|游行|集会/],
  ['unrest', 'riot', 3.5, /\briots?\b|\brioting\b|\bunrest\b|\blooting\b|\btear ?gas\b|\bcrackdown\b|\bcurfew\b|\bmartial law\b|\bstate of emergency\b/i, /骚乱|暴乱|动荡|催泪弹|镇压|宵禁|戒严|紧急状态/],
  ['unrest', 'coup', 5, /\bcoup\b|\bjunta\b|\bmutiny\b|\boverthrow(?:n)?\b|\bputsch\b|\bseize[sd]? power\b/i, /政变|军政府|兵变|夺权/],
  ['unrest', 'strike', 2.5, /\b(?:general|national|nationwide|workers'?|labou?r|teachers'?|doctors'?|nurses'?|rail|transport|port|dock) strikes?\b|\bwalkouts?\b|\bon strike\b|\bstrike action\b/i, /罢工|罢课/],
  ['unrest', 'arrests', 1.5, /\barrest(?:ed|s)?\b|\bdetain(?:ed|s)?\b|\bdetention\b|\bdissidents?\b|\bjailed\b|\bpolitical prisoners?\b/i, /逮捕|拘留|拘押|异见|被捕/],

  ['politics', 'election', 3, /\belections?\b|\belectoral\b|\bvot(?:e|es|ed|ers|ing)\b|\bballots?\b|\breferendum\b|\bcandidates?\b|\bcampaign(?:ing)?\b|\brun-?off\b|\binaugurat/i, /选举|大选|投票|公投|候选人|竞选|当选|选民|就职/],
  ['politics', 'government', 1.5, /\bgovernment\b|\bparliament(?:ary)?\b|\bprime minister\b|\bpresident(?:ial)?\b|\bcabinet\b|\bministers?\b|\bsenate\b|\bcongress\b|\blawmakers?\b|\blegislat(?:ure|ion|ive|ors?)\b|\bimpeach(?:ment|ed)?\b|\bresign(?:s|ed|ation)?\b|\bopposition\b|\bcoalition\b|\bpolicy\b|\bchancellor\b|\bbudget\b/i, /政府|议会|国会|总理|总统|首相|内阁|部长|法案|弹劾|辞职|执政|反对党|联合政府|政策|政坛|预算/],
  ['politics', 'court', 2, /\bcourts?\b|\bjudges?\b|\b(?:on|stands?|faces?|murder|fraud|criminal|corruption|treason|war crimes|genocide) trials?\b|\btrials? (?:of|over|begins|opens|starts|verdict)\b|\bruling\b|\bsentenced?\b|\bverdict\b|\bconvicted\b|\bacquitted\b|\blawsuits?\b|\bsue[sd]?\b/i, /法院|法官|审判|判决|判处|裁决|起诉|上诉|庭审|裁定|开庭/],
  ['politics', 'corruption', 2, /\bcorruption\b|\bbriber?y?\b|\bembezzle(?:ment|d)?\b|\bgraft\b/i, /腐败|贪腐|受贿|贪污|行贿/],

  ['diplomacy', 'summit', 2.5, /\bsummits?\b|\bG7\b|\bG20\b|\bBRICS\b|\bstate visit\b|\bvisits?\b|\bmeets?\b|\bmeeting with\b|\btalks\b|\bbilateral\b|\bdiplomat(?:ic|s|cy)?\b|\benvoys?\b|\bambassadors?\b|\bforeign ministers?\b|\bsecretary of state\b|\bforeign policy\b/i, /峰会|会晤|会谈|访问|外交|外长|大使|特使|双边|首脑|通话|磋商/],
  ['diplomacy', 'sanctions', 3, /\bsanctions?\b|\bembargo(?:es)?\b|\bexport controls?\b|\bblacklist(?:ed|s)?\b|\basset freezes?\b/i, /制裁|禁运|出口管制|实体清单/],
  ['diplomacy', 'treaty', 2.2, /\btreat(?:y|ies)\b|\bagreements?\b|\baccords?\b|\bpacts?\b|\bmemorandum\b|\bsigned\b/i, /协议|条约|协定|公约|备忘录|签署/],
  ['diplomacy', 'relations', 1.3, /\brelations\b|\bties\b|\balliances?\b|\ballies\b|\bpartnership\b|\bcooperation\b|\btensions?\b|\bcondemn(?:s|ed)?\b|\bwarns?\b|\burges?\b|\baccuses?\b|\bdenounces?\b/i, /关系|合作|盟友|同盟|伙伴|紧张|谴责|警告|敦促|指责|抗议照会/],

  ['economy', 'markets', 3, /\bstocks?\b|\bshares\b|\bmarkets?\b|\bwall street\b|\bdow\b|\bnasdaq\b|\bs&p\b|\bbonds?\b|\byields?\b|\binvestors?\b|\bcurrenc(?:y|ies)\b|\bdollar\b|\byuan\b|\byen\b|\brupee\b|\bcrypto(?:currency)?\b|\bbitcoin\b/i, /股市|股票|市场|指数|债券|收益率|投资者|汇率|美元|人民币|欧元|日元|加密货币|比特币/],
  ['economy', 'trade', 3, /\btrade\b|\btariffs?\b|\bexports?\b|\bimports?\b|\bduties\b|\bcustoms\b|\bsupply chains?\b|\bWTO\b/i, /贸易|关税|出口|进口|供应链|贸易战/],
  ['economy', 'energy', 3, /\boil\b|\bgas\b|\bOPEC\b|\bcrude\b|\bLNG\b|\bfuel\b|\benergy\b|\belectricity\b|\bpower grid\b|\bpipelines?\b|\bpetrol\b|\bgasoline\b/i, /石油|原油|天然气|欧佩克|能源|电力|电网|油价|管道|燃油/],
  ['economy', 'macro', 2.5, /\beconom(?:y|ic|ies)\b|\bGDP\b|\bgrowth\b|\brecession\b|\binflation\b|\binterest rates?\b|\bcentral bank\b|\bfederal reserve\b|\bthe fed\b|\bECB\b|\bunemployment\b|\bjobs\b|\bdebt\b|\bdeficit\b|\bIMF\b|\bworld bank\b|\binvestment\b|\bprices\b|\bcost of living\b/i, /经济|增长|衰退|通胀|利率|央行|美联储|失业|就业|债务|赤字|投资|物价|生活成本/],
  ['economy', 'business', 1.5, /\bcompan(?:y|ies)\b|\bfirms?\b|\bbanks?\b|\bearnings\b|\bprofits?\b|\blayoffs?\b|\bmerger\b|\bacquisition\b|\bCEO\b|\bstartups?\b|\bbillion\b/i, /公司|企业|银行|利润|裁员|并购|收购|亿美元|营收/],

  ['society', 'health', 3.5, /\boutbreaks?\b|\bepidemics?\b|\bpandemics?\b|\bvirus(?:es)?\b|\bdiseases?\b|\bcholera\b|\bmeasles\b|\bmpox\b|\bebola\b|\bmarburg\b|\bdengue\b|\bmalaria\b|\bpolio\b|\bbird flu\b|\bavian (?:flu|influenza)\b|\bH5N1\b|\bcovid(?:-19)?\b|\bvaccin(?:e|es|ation)\b|\bhealth (?:crisis|emergency|system|care|workers)\b/i, /疫情|疫病|病毒|传染病|霍乱|麻疹|猴痘|埃博拉|登革热|疟疾|禽流感|新冠|疫苗|公共卫生/],
  ['society', 'health', 0.8, /\bWHO\b|\bhospitals?\b|\bhealth\b|\bmedical\b/i, /卫生|医院|健康|医疗/],
  ['society', 'humanitarian', 3, /\bhumanitarian\b|\bfamine\b|\bhunger\b|\bstarv(?:ation|ing)\b|\bmalnutrition\b|\baid (?:convoy|workers?|trucks?|agenc(?:y|ies)|deliveries)\b|\brefugees?\b|\bdisplaced\b|\bdisplacement\b|\bevacuat(?:e|ed|ion|ions)\b|\brelief\b/i, /人道|饥荒|饥饿|营养不良|援助|难民|流离失所|撤离|救援|救济/],
  ['society', 'migration', 3, /\bmigrants?\b|\bmigration\b|\basylum\b|\bdeport(?:ed|ation|ations|s)?\b|\bborder crossings?\b|\bsmuggl(?:ing|ers)\b/i, /移民|庇护|驱逐出境|遣返|偷渡/],
  ['society', 'crime', 3, /\brape\b|\bsexual (?:assault|abuse|misconduct)\b|\bchild abuse\b/i, /性侵|强奸|猥亵/],
  ['society', 'crime', 2.5, /\bcharged\b|\bindicted\b|\bpolice\b|\bmurder(?:ed|s)?\b|\bshootings?\b|\bstabbing\b|\brobbery\b|\bkidnap(?:ped|ping|pings)?\b|\babduct(?:ed|ion)\b|\bgangs?\b|\bcartels?\b|\bdrugs?\b|\btrafficking\b|\bfraud\b|\bscams?\b|\bprisons?\b/i, /警方|谋杀|凶杀|枪击|持刀|抢劫|绑架|帮派|贩毒|毒品|走私|诈骗|监狱/],
  ['society', 'rights', 2, /\bhuman rights\b|\brights groups?\b|\bcensorship\b|\bjournalists?\b|\bpress freedom\b|\bLGBT\w*\b|\bwomen'?s rights\b|\bdiscrimination\b|\bracism\b/i, /人权|审查|记者|新闻自由|歧视|种族/],
  ['society', 'culture', 1, /\bschools?\b|\buniversit(?:y|ies)\b|\bstudents?\b|\beducation\b|\bculture\b|\bmuseums?\b|\bfestivals?\b|\bfootball\b|\bolympics?\b|\bworld cup\b|\bfilm\b|\bmusic\b/i, /学校|大学|学生|教育|文化|博物馆|节日|体育|足球|奥运|世界杯|电影|音乐/],

  ['science', 'space', 3.5, /\bspace(?:craft|flight|walk| station| agency)?\b|\brocket launch\b|\bsatellites?\b|\bNASA\b|\bSpaceX\b|\bastronauts?\b|\bmoon\b|\bmars\b|\borbit(?:al)?\b|\btelescope\b/i, /航天|太空|卫星|火箭发射|宇航员|航天员|月球|火星|轨道|空间站|望远镜|飞船|探测器/],
  ['science', 'tech', 3, /\bAI\b|\bartificial intelligence\b|\bchips?\b|\bsemiconductors?\b|\btech(?:nology)?\b|\bcyber(?:attack|security|attacks)?\b|\bhack(?:ers|ed|ing)?\b|\bdata breach\b|\binternet\b|\bsocial media\b|\bTikTok\b|\bOpenAI\b|\bNvidia\b|\bsmartphones?\b|\brobots?\b/i, /人工智能|芯片|半导体|科技|网络攻击|黑客|数据泄露|互联网|社交媒体|机器人/],
  ['science', 'climate', 3, /\bclimate\b|\bemissions\b|\bcarbon\b|\bnet zero\b|\bCOP\d*\b|\bglobal warming\b|\brenewables?\b|\bsolar\b|\bwind (?:power|farms?)\b|\bpollution\b|\benvironment(?:al)?\b|\bbiodiversity\b|\bdeforestation\b|\bglaciers?\b|\bsea levels?\b/i, /气候|排放|碳|净零|全球变暖|可再生能源|太阳能|风能|污染|环境|生物多样性|毁林|冰川|海平面/],
  ['science', 'research', 2, /\bscientists?\b|\bresearch(?:ers)?\b|\bstudy\b|\bdiscover(?:y|ed)\b|\bfossils?\b|\bspecies\b|\barchaeolog\w*\b/i, /科学家|研究|发现|化石|物种|考古/],
];

const SPECIFIC_SUB = new Set(['airstrike', 'missile', 'drone', 'shelling', 'naval']);

// Phrases that would otherwise trip the conflict rules
const NOT_WAR = /\b(?:trade|price|tariff|currency|chip|culture|bidding|tech) (?:wars?|truce)\b|\bwar on (?:drugs|crime|terror)\b|\bwar chest\b|\bunder fire\b|\bopen(?:s|ed)? fire on (?:critics|plan)\b|\bfight(?:s|ing)? (?:the )?(?:wild|bush|forest )?(?:fires?|blazes?|floods?)\b|\bfirefight(?:er|ers|ing)\b|\binvasive\b/i;
const ZH_NOT_WAR = /贸易战|价格战|关税战|货币战|芯片战|科技战|贸易休战|关税休战/;

const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, dozens: 24, dozen: 12, scores: 40, hundreds: 200, thousands: 2000 };
const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|dozens|a dozen|scores|hundreds|thousands)`;
const DEATH_EN = [
  new RegExp(`${NUM}\\s+(?:[\\w-]+\\s+){0,3}?(?:killed|dead|die[ds]?|deaths|fatalities|lives lost|bodies)\\b`, 'i'),
  new RegExp(`\\bkill(?:s|ed|ing)?\\s+(?:at least |more than |over |nearly |about |some |around )?${NUM}\\b`, 'i'),
  new RegExp(`\\bdeath toll (?:rises |climbs |jumps |reaches |hits |tops |passes )?(?:to |past |above )?(?:at least |more than |over )?${NUM}`, 'i'),
];
const DEATH_ZH = [/(\d+)\s*(?:多)?(?:人|名[一-鿿]{0,4})?(?:死亡|遇难|丧生|身亡|罹难|被打死|被炸死|死|殒命)/, /死亡人数(?:已)?(?:升至|达到|达|增至|上升至|超过)(\d+)/, /(数十|数百|上百|上千|数千|逾百|近百)(?:人|名)/];
const ZH_FUZZY = { 数十: 30, 数百: 200, 上百: 100, 上千: 1000, 数千: 2000, 逾百: 100, 近百: 90 };

function toNumber(s) {
  if (!s) return 0;
  const k = s.toLowerCase().replace(/^a /, '');
  if (k in WORD_NUM) return WORD_NUM[k];
  if (s in ZH_FUZZY) return ZH_FUZZY[s];
  return Number(s.replace(/,/g, '')) || 0;
}

export function extractDeaths(text, zh) {
  let best = 0;
  for (const re of zh ? DEATH_ZH : DEATH_EN) {
    const m = re.exec(text);
    if (!m) continue;
    const n = toNumber(m[1]);
    if (n >= 1900 && n <= 2100 && /^\d{4}$/.test(m[1])) continue; // a year, not a toll
    best = Math.max(best, n);
  }
  return best > 100000 ? 0 : best; // guard against large unrelated numbers
}

/** Death toll of a report: from the title, or from the summary when the title is about deaths. */
export function reportDeaths(title, summary, zh) {
  const t = extractDeaths(title, zh);
  // a vague title ("dozens killed") gives way to the summary's exact figure
  if ((t && !VAGUE.test(title)) || !summary) return t;
  return (zh ? DEATH_WORD_ZH : DEATH_WORD_EN).test(title) ? Math.max(t, extractDeaths(summary, zh)) : t;
}
const VAGUE = /\b(?:dozens|scores|hundreds|thousands)\b|数十|数百|上百|上千|数千|逾百|近百/i;

const ESCALATORS = /\b(?:killed|dead|deaths|death toll|fatalities|massacre|genocide|famine|catastroph\w*|deadliest|invasion|nuclear (?:weapons?|warheads?|strikes?|attack|war|test|threat)|martial law|state of emergency|evacuat\w+)\b/i;
const ZH_ESCALATORS = /死亡|遇难|丧生|屠杀|种族灭绝|饥荒|灾难|入侵|核武|核弹|核战|核打击|核攻击|戒严|紧急状态|撤离/;
// Death tolls are read from the title; the summary only counts when the title is about deaths too
// (summaries often give background: "the 2022 war left thousands dead", "in October 2025 she died").
const DEATH_WORD_EN = /\b(?:kill\w*|dead|deaths?|dies|died|dying|deadly|deadliest|toll|fatal\w*|massacre\w*|bodies|lives)\b/i;
const DEATH_WORD_ZH = /死|亡|遇难|丧生|罹难|殒命/;

export function classify(title, summary = '', lang = 'en') {
  const zh = lang.startsWith('zh');
  const scores = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const subs = {};
  const t = title || '';
  const s = summary || '';
  const notWar = zh ? ZH_NOT_WAR.test(t + s) : NOT_WAR.test(t + ' ' + s);
  for (const [cat, sub, w, en, zhRe] of RULES) {
    const re = zh ? zhRe : en;
    if (!re) continue;
    let gain = 0;
    if (re.test(t)) gain += w * 2;
    if (s && re.test(s)) gain += w * 0.6;
    if (!gain) continue;
    if (notWar && cat === 'conflict' && (sub === 'clash' || sub === 'ceasefire')) continue;
    scores[cat] += gain;
    subs[cat] ??= {};
    subs[cat][sub] = (subs[cat][sub] || 0) + gain;
  }
  if (notWar) scores.economy += 2;

  let cat = 'other';
  let best = 0;
  for (const c of CATEGORIES) {
    if (scores[c] > best + 1e-9) { best = scores[c]; cat = c; }
  }
  if (best < 1.5) cat = 'other';
  let sub = null;
  if (subs[cat]) {
    const ranked = Object.entries(subs[cat]).sort((a, b) => b[1] - a[1]);
    sub = ranked[0][0];
    // prefer a concrete weapon/mode over the generic "attack"/"clash" when both fire
    if (cat === 'conflict' && (sub === 'attack' || sub === 'clash')) {
      const specific = ranked.find(([k, v]) => SPECIFIC_SUB.has(k) && v >= ranked[0][1] * 0.6);
      if (specific) sub = specific[0];
    }
  }

  // severity
  const text = `${t} ${s}`;
  let sev = BASE_SEVERITY[cat];
  if (cat === 'conflict' && (sub === 'ceasefire' || sub === 'military')) sev -= 0.1;
  if (cat === 'disaster' && sub === 'quake') sev += 0.05;
  const deaths = reportDeaths(t, s, zh);
  if (deaths >= 1000) sev += 0.38;
  else if (deaths >= 100) sev += 0.3;
  else if (deaths >= 50) sev += 0.25;
  else if (deaths >= 10) sev += 0.18;
  else if (deaths >= 1) sev += 0.1;
  else if ((zh ? ZH_ESCALATORS : ESCALATORS).test(text)) sev += 0.1;
  if (/\bbreaking\b|突发|快讯/i.test(t)) sev += 0.05;
  if (cat !== 'other' && best > 8) sev += 0.05;
  sev = Math.max(0.1, Math.min(1, sev));
  return { cat, sub, sev: Math.round(sev * 100) / 100, deaths: deaths || undefined };
}
