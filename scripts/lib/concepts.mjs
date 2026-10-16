// Language-independent "concepts" for matching reports of the same event across outlets and
// languages: people, groups, organisations, diseases, kinds of incident and the things they happen
// to. "Houthi missiles strike Yemen presidential palace" and "胡塞武装导弹袭击也门总统府" share
// houthi + missile + palace (+ the place, from the gazetteer). How much a shared concept counts is
// decided by how rare it is in the current news (see events.mjs), so "Trump" weighs little.
//
// [id, English regex source, Chinese regex source, flags]  — flags: 'c' = case-sensitive English
const C = [
  'actor',
  // ---- people (Chinese: mainland and Taiwan/Hong Kong spellings, after conversion to simplified) ----
  ['trump', 'Trump', '特朗普|川普'],
  ['biden', 'Biden', '拜登'],
  ['vance', 'J\\.? ?D\\.? Vance|Vance', '万斯|范斯'],
  ['rubio', 'Rubio', '鲁比奥|卢比欧'],
  ['hegseth', 'Hegseth', '赫格塞斯|赫格塞思|海格塞斯'],
  ['witkoff', 'Witkoff', '威特科夫'],
  ['musk', 'Musk', '马斯克'],
  ['epstein', 'Epstein', '爱泼斯坦|艾普斯坦|艾普斯汀'],
  ['xi', 'Xi Jinping|Xi(?= (?:says|said|meets|met|tells|told|calls|urges|warns|and|to|in|visits|hosts))', '习近平'],
  ['liqiang', 'Li Qiang', '李强'],
  ['wangyi', 'Wang Yi', '王毅'],
  ['putin', 'Putin', '普京|普丁'],
  ['lavrov', 'Lavrov', '拉夫罗夫'],
  ['peskov', 'Peskov', '佩斯科夫'],
  ['medvedev', 'Medvedev', '梅德韦杰夫'],
  ['zelensky', 'Zelensk(?:y|yy|iy|i)', '泽连斯基|泽伦斯基'],
  ['netanyahu', 'Netanyahu', '内塔尼亚胡|纳坦雅胡|尼坦雅胡'],
  ['khamenei', 'Khamenei', '哈梅内伊|哈米尼'],
  ['pezeshkian', 'Pezeshkian', '佩泽希齐扬|裴瑟斯基安'],
  ['araghchi', 'Araghchi', '阿拉格齐|阿拉格奇'],
  ['erdogan', 'Erdo[gğ]an', '埃尔多安|艾尔多安'],
  ['modi', 'Modi', '莫迪'],
  ['sharif', 'Shehbaz|Sharif', '谢里夫|夏立夫|夏巴兹'],
  ['munir', 'Asim Munir|Munir', '穆尼尔'],
  ['imrankhan', 'Imran Khan', '伊姆兰·汗|伊姆兰汗'],
  ['macron', 'Macron', '马克龙|马克宏'],
  ['starmer', 'Starmer', '斯塔默|施凯尔|史塔默'],
  ['merz', 'Merz', '默茨|梅尔茨'],
  ['meloni', 'Meloni', '梅洛尼'],
  ['sanchez', 'Pedro S[aá]nchez', '桑切斯'],
  ['vonderleyen', 'von der Leyen', '冯德莱恩|范德赖恩'],
  ['rutte', 'Rutte', '吕特'],
  ['guterres', 'Guterres', '古特雷斯'],
  ['tedros', 'Tedros', '谭德塞'],
  ['grossi', 'Grossi', '格罗西'],
  ['pope', 'Pope|pontiff|Vatican', '教宗|教皇|梵蒂冈'],
  ['kimjongun', 'Kim Jong[- ]?[Uu]n', '金正恩'],
  ['kimyojong', 'Kim Yo[- ]?[Jj]ong', '金与正'],
  ['leejaemyung', 'Lee Jae[- ]?[Mm]yung', '李在明'],
  ['yoon', 'Yoon Suk[- ]?[Yy]eol|Yoon', '尹锡悦'],
  ['takaichi', 'Takaichi', '高市早苗|高市'],
  ['ishiba', 'Ishiba', '石破茂|石破'],
  ['laichingte', 'Lai Ching[- ]te|William Lai', '赖清德'],
  ['chengliwun', 'Cheng Li[- ]wun', '郑丽文'],
  ['johnlee', 'John Lee', '李家超'],
  ['jimmylai', 'Jimmy Lai', '黎智英'],
  ['lula', 'Lula', '卢拉'],
  ['bolsonaro', 'Bolsonaro', '博索纳罗|波索纳洛'],
  ['milei', 'Milei', '米莱|米雷'],
  ['sheinbaum', 'Sheinbaum', '辛鲍姆|薛恩鲍姆'],
  ['maduro', 'Maduro', '马杜罗'],
  ['machado', 'Machado', '马查多'],
  ['petro', 'Gustavo Petro|Petro(?= (?:says|said|accuses|calls))', '佩特罗|裴卓'],
  ['bukele', 'Bukele', '布克尔|布格磊'],
  ['carney', 'Carney', '卡尼'],
  ['albanese', 'Albanese', '阿尔巴尼斯|艾班尼斯'],
  ['prabowo', 'Prabowo', '普拉博沃'],
  ['anwar', 'Anwar', '安瓦尔'],
  ['marcos', 'Marcos', '马科斯|马可仕'],
  ['duterte', 'Duterte', '杜特尔特|杜特蒂'],
  ['hunsen', 'Hun Sen|Hun Manet', '洪森|洪玛奈'],
  ['anutin', 'Anutin', '阿努廷|阿努丁'],
  ['thaksin', 'Thaksin|Paetongtarn', '他信|塔信|佩通坦|贝东丹'],
  ['minaunghlaing', 'Min Aung Hlaing', '敏昂莱'],
  ['suukyi', 'Suu Kyi', '昂山素季|翁山苏姬'],
  ['ramaphosa', 'Ramaphosa', '拉马福萨|拉马佛沙'],
  ['ruto', 'Ruto', '鲁托'],
  ['tinubu', 'Tinubu', '提努布'],
  ['abiy', 'Abiy', '阿比'],
  ['burhan', 'Burhan', '布尔汉'],
  ['hemedti', 'Hemedti|Dagalo', '达加洛|赫梅蒂'],
  ['tshisekedi', 'Tshisekedi', '齐塞克迪'],
  ['kagame', 'Kagame', '卡加梅'],
  ['sisi', 'Sisi', '塞西'],
  ['mbs', 'Mohammed bin Salman|MBS', '穆罕默德·本·萨勒曼|萨勒曼'],
  ['sharaa', 'Sharaa|Jolani', '沙拉|朱拉尼'],
  ['assad', 'Assad', '阿萨德'],
  ['abbas', 'Mahmoud Abbas|Abbas', '阿巴斯'],
  ['lukashenko', 'Lukashenko', '卢卡申科'],
  ['orban', 'Orb[aá]n', '欧尔班|奥尔班'],
  ['fico', 'Fico', '菲佐|菲科'],
  ['vucic', 'Vu[cč]i[cć]', '武契奇'],
  ['rama', 'Edi Rama|Rama(?= (?:says|said|government))', '拉马'],
  ['tusk', 'Tusk', '图斯克'],
  ['pashinyan', 'Pashinyan', '帕希尼扬'],
  ['aliyev', 'Aliyev', '阿利耶夫'],
  ['mamdani', 'Mamdani', '曼达尼|马姆达尼'],
  ['newsom', 'Newsom', '纽森|纽松'],
  ['powell', 'Jerome Powell|Powell', '鲍威尔'],
  ['bessent', 'Bessent', '贝森特'],
  ['lagarde', 'Lagarde', '拉加德'],

  // ---- armed groups and movements ----
  ['hamas', 'Hamas', '哈马斯'],
  ['hezbollah', 'Hezbollah', '真主党'],
  ['houthi', 'Houthis?', '胡塞'],
  ['taliban', 'Taliban', '塔利班'],
  ['isis', 'ISIS|ISIL|Islamic State|IS group', '伊斯兰国'],
  ['alqaeda', 'al[- ]Qaeda|al[- ]Qaida', '基地组织'],
  ['shabaab', 'al[- ]Shabaab?', '青年党'],
  ['bokoharam', 'Boko Haram', '博科圣地'],
  ['rsf', 'RSF|Rapid Support Forces', '快速支援部队|快速支援部队|快支部队'],
  ['m23', 'M23', 'M23'],
  ['wagner', 'Wagner', '瓦格纳'],
  ['pkk', 'PKK', '库尔德工人党'],
  ['irgc', 'IRGC|Revolutionary Guards?', '革命卫队'],
  ['palestineaction', 'Palestine Action', '巴勒斯坦行动'],
  ['ttp', 'TTP|Pakistani Taliban|Tehreek-e-Taliban', '巴基斯坦塔利班'],
  ['baloch', 'Baloch|Balochistan Liberation', '俾路支'],
  ['arakanarmy', 'Arakan Army', '阿拉干军'],
  ['cartel', 'cartels?|Sinaloa|CJNG|Tren de Aragua', '贩毒集团|毒枭|锡那罗亚|阿拉瓜火车'],
  ['sdf', 'SDF|Syrian Democratic Forces', '叙利亚民主力量'],

  // ---- organisations, institutions, companies ----
  ['un', 'UN|United Nations', '联合国', 'c'],
  ['unsc', 'Security Council', '安理会|安全理事会'],
  ['who', 'WHO|World Health Organi[sz]ation', '世卫组织|世界卫生组织', 'c'],
  ['unhcr', 'UNHCR|UN refugee agency', '难民署'],
  ['unicef', 'UNICEF', '儿童基金会'],
  ['wfp', 'WFP|World Food Programme', '粮食计划署|粮食署'],
  ['unrwa', 'UNRWA', '近东救济工程处'],
  ['iaea', 'IAEA|atomic watchdog|nuclear watchdog', '国际原子能机构'],
  ['icc', 'ICC|International Criminal Court', '国际刑事法院', 'c'],
  ['icj', 'ICJ|International Court of Justice|World Court', '国际法院'],
  ['nato', 'NATO|Nato', '北约'],
  ['eu', 'EU|European Union|Brussels', '欧盟', 'c'],
  ['imf', 'IMF|International Monetary Fund', '国际货币基金组织|IMF'],
  ['worldbank', 'World Bank', '世界银行|世行'],
  ['wto', 'WTO|World Trade Organi[sz]ation', '世贸组织|世界贸易组织'],
  ['opec', 'OPEC\\+?|Opec', '欧佩克|石油输出国组织'],
  ['asean', 'ASEAN|Asean', '东盟|东协'],
  ['au', 'African Union', '非洲联盟|非盟'],
  ['g7', 'G7|G-7', '七国集团|G7'],
  ['g20', 'G20|G-20', '二十国集团|G20'],
  ['brics', 'BRICS|Brics', '金砖'],
  ['sco', 'SCO|Shanghai Cooperation', '上合组织|上海合作组织', 'c'],
  ['apec', 'APEC|Apec', '亚太经合组织|APEC'],
  ['redcross', 'Red Cross|ICRC|Red Crescent', '红十字|红新月'],
  ['fed', 'Federal Reserve|the Fed|Fed (?:chair|rate)', '美联储|联储局'],
  ['ecb', 'ECB|European Central Bank', '欧洲央行'],
  ['boj', 'Bank of Japan|BOJ|BoJ', '日本央行|日银|日本银行'],
  ['pentagon', 'Pentagon', '五角大楼'],
  ['fbi', 'FBI', '联邦调查局|FBI', 'c'],
  ['cia', 'CIA', '中央情报局|中情局|CIA', 'c'],
  ['supremecourt', 'Supreme Court', '最高法院'],
  ['osce', 'OSCE', '欧安组织|欧洲安全与合作组织'],
  ['interpol', 'Interpol', '国际刑警'],
  ['msf', 'MSF|Doctors Without Borders|M[ée]decins Sans Fronti[èe]res', '无国界医生'],
  ['amnesty', 'Amnesty', '国际特赦|国际特赦组织'],
  ['hrw', 'Human Rights Watch', '人权观察'],
  ['cop', 'COP ?\\d\\d|climate summit|climate talks', '气候大会|气候峰会|COP ?\\d\\d'],
  ['olympics', 'Olympics?|Olympic Games', '奥运|奥林匹克'],
  ['worldcup', 'World Cup', '世界杯'],
  ['nobel', 'Nobel', '诺贝尔'],
  ['spacex', 'SpaceX|Starship', 'SpaceX|星舰|太空探索技术公司'],
  ['starlink', 'Starlink|Starshield', '星链|星盾'],
  ['tesla', 'Tesla', '特斯拉'],
  ['nvidia', 'Nvidia', '英伟达|辉达'],
  ['tiktok', 'TikTok', 'TikTok|抖音'],
  ['huawei', 'Huawei', '华为'],
  ['tsmc', 'TSMC', '台积电'],
  ['boeing', 'Boeing', '波音'],
  ['airbus', 'Airbus', '空客|空中客车'],
  ['openai', 'OpenAI|ChatGPT', 'OpenAI|ChatGPT'],
  ['google', 'Google|Alphabet', '谷歌'],
  ['microsoft', 'Microsoft', '微软'],
  ['meta', 'Meta|Facebook|Instagram|WhatsApp', '脸书|Meta|Instagram'],
  ['samsung', 'Samsung', '三星'],
  ['toyota', 'Toyota', '丰田'],
  ['byd', 'BYD', '比亚迪'],

  'topic',
  // ---- diseases ----
  ['ebola', 'Ebola', '埃博拉|伊波拉'],
  ['cholera', 'cholera', '霍乱'],
  ['mpox', 'mpox|monkeypox', '猴痘'],
  ['measles', 'measles', '麻疹'],
  ['dengue', 'dengue', '登革热'],
  ['malaria', 'malaria', '疟疾'],
  ['polio', 'polio', '脊髓灰质炎|小儿麻痹'],
  ['birdflu', 'bird flu|avian (?:flu|influenza)|H5N1', '禽流感|H5N1'],
  ['marburg', 'Marburg', '马尔堡'],
  ['covid', 'Covid|COVID|coronavirus', '新冠'],
  ['nipah', 'Nipah', '尼帕'],
  ['chikungunya', 'chikungunya', '基孔肯雅'],
  ['plague', 'plague', '鼠疫'],
  ['anthrax', 'anthrax', '炭疽'],
  ['tb', 'tuberculosis', '结核'],
  ['hiv', 'HIV|AIDS', '艾滋', 'c'],
  ['lassa', 'Lassa', '拉沙热'],
  ['yellowfever', 'yellow fever', '黄热病'],
  ['meningitis', 'meningitis', '脑膜炎'],
  ['diphtheria', 'diphtheria', '白喉'],
  ['swinefever', 'swine fever', '猪瘟'],
  ['footmouth', 'foot[- ]and[- ]mouth', '口蹄疫'],
  ['cancer', 'cancer', '癌'],
  ['surgery', 'surgery|operation on', '手术'],

  // ---- what happened ----
  ['quake', 'earthquakes?|quakes?|tremors?|aftershocks?|magnitude', '地震|震级|余震'],
  ['tsunami', 'tsunamis?', '海啸'],
  ['flood', 'floods?|flooding|flash floods?|inundat\\w+', '洪水|洪灾|水灾|淹水|水患|洪涝'],
  ['rain', 'rainfall|downpours?|torrential|heavy rains?', '暴雨|豪雨|强降雨|大雨|降雨'],
  ['cyclone', 'typhoons?|hurricanes?|cyclones?|tropical storms?', '台风|飓风|气旋|热带风暴'],
  ['tornado', 'tornado(?:es)?', '龙卷风'],
  ['wildfire', 'wildfires?|bushfires?|forest fires?', '山火|野火|森林火灾|林火'],
  ['fire', 'fires?|blazes?|ablaze|inferno', '火灾|大火|起火|失火|着火|火警'],
  ['volcano', 'volcano(?:es)?|volcanic|eruptions?|erupts?', '火山|喷发'],
  ['landslide', 'landslides?|mudslides?', '山体滑坡|泥石流|滑坡|土石流'],
  ['avalanche', 'avalanches?', '雪崩'],
  ['heatwave', 'heat ?waves?|extreme heat', '热浪|高温'],
  ['drought', 'droughts?', '干旱|旱灾|旱情'],
  ['snow', 'snowstorms?|blizzards?|heavy snow', '暴雪|暴风雪'],
  ['haze', 'haze|smog', '烟霾|雾霾'],
  ['collapse', 'collaps\\w+|caves? in|caved in', '坍塌|倒塌|塌陷|崩塌|塌方'],
  ['explosion', 'explosions?|blasts?|explodes?|exploded', '爆炸|爆燃'],
  ['shooting', 'shootings?|shooters?|gunm[ae]n|gunfire|shot dead|opens? fire|opened fire|gun attack', '枪击|枪杀|开枪|枪手|枪案|枪战'],
  ['stabbing', 'stabbings?|stabbed|knife attack|knifeman', '持刀|刺伤|砍人|刀伤|捅伤'],
  ['bombing', 'bombings?|car bombs?|bombers?|IEDs?', '炸弹|爆炸袭击|汽车炸弹'],
  ['suicide', 'suicide (?:bomb|attack)\\w*', '自杀式'],
  ['airstrike', 'air ?strikes?|air ?raids?|warplanes?', '空袭|空中打击'],
  ['drone', 'drones?|UAVs?|Shaheds?', '无人机'],
  ['missile', 'missiles?|ballistic', '导弹|飞弹'],
  ['rocket', 'rockets?(?! launch)', '火箭弹'],
  ['shelling', 'shelling|shelled|artillery', '炮击|炮火'],
  ['ceasefire', 'cease-?fires?|truces?|armistice', '停火|休战|停战'],
  ['peacetalks', 'peace (?:talks|deal|plan|agreement|process|summit|negotiations)', '和谈|和平谈判|和平协议|和平计划|和平进程'],
  ['hostage', 'hostages?', '人质'],
  ['prisonerswap', 'prisoner (?:swap|exchange)|POW', '换俘|交换战俘|战俘交换|囚犯交换'],
  ['invasion', 'invasion|invades?|invaded', '入侵|侵略'],
  ['coup', 'coups?|putsch|mutiny', '政变|兵变'],
  ['protest', 'protests?|protesters?|demonstrat\\w+|rall(?:y|ies)|marches', '抗议|示威|游行|集会'],
  ['riot', 'riots?|rioting|unrest|looting', '骚乱|暴乱|暴动|动乱'],
  ['labourstrike', '(?:general|national|nationwide|workers|labou?r|teachers|doctors|nurses|rail|port) strikes?|walkouts?|on strike', '罢工|罢课'],
  ['election', 'elections?|electoral|polls?|vote|voters|ballots?', '选举|大选|投票|选战|选民'],
  ['referendum', 'referendum', '公投|全民公决'],
  ['runoff', 'run-?offs?|second round', '第二轮|决选'],
  ['impeach', 'impeach\\w*', '弹劾'],
  ['resign', 'resign\\w*|steps? down|quits?', '辞职|下台|请辞|辞去'],
  ['assassination', 'assassinat\\w+', '暗杀|刺杀|遇刺'],
  ['arrest', 'arrest\\w*|detain\\w*|detention|custody', '逮捕|拘留|被捕|扣押|羁押|拘押|拘捕'],
  ['extradition', 'extradit\\w+', '引渡'],
  ['execution', 'execut(?:ion|ions|ed|e)|firing squad|death penalty|death sentence|death row', '处决|死刑|行刑|枪决'],
  ['sentence', 'sentenced|sentences?|verdict|convicted|convictions?|acquitted|guilty', '判处|判决|定罪|裁决|宣判|判刑|无罪'],
  ['charged', 'charged|charges|indicted|indictment|prosecut\\w+', '起诉|指控|控告|公诉'],
  ['trial', 'trials?|court|judge|courtroom', '审判|庭审|受审|法院|法官|出庭'],
  ['torture', 'tortur\\w+', '酷刑|虐待'],
  ['kidnap', 'kidnap\\w*|abduct\\w*', '绑架|劫持|掳走'],
  ['spy', 'spy|spies|spying|espionage', '间谍|谍报|刺探'],
  ['sanctions', 'sanctions?|embargo\\w*|blacklist\\w*', '制裁|禁运|黑名单'],
  ['tariff', 'tariffs?|duties|levies', '关税'],
  ['tradedeal', 'trade (?:deal|agreement|pact|talks)', '贸易协议|贸易协定|贸易谈判'],
  ['summit', 'summits?', '峰会|高峰会'],
  ['phonecall', 'phone call|calls? with|spoke by phone', '通话|通电话'],
  ['visit', 'visits?|visited|trip to', '访问|访华|到访|出访|造访'],
  ['nucleartest', 'nuclear tests?', '核试验|核试爆'],
  ['nuclearplant', 'nuclear (?:power )?plants?|nuclear reactors?|nuclear power station', '核电站|核电厂|核反应堆'],
  ['nucleardeal', 'nuclear (?:deal|talks|programme|program|agreement)', '核协议|核谈判|核计划|核问题'],
  ['nuclear', 'nuclear', '核武|核弹'],
  ['missiletest', 'missile tests?|test-fir\\w+|test launch', '试射'],
  ['launch', 'launch(?:es|ed)? (?:a |an |its )?(?:rocket|satellite|spacecraft|probe)', '发射'],
  ['satellite', 'satellites?', '卫星'],
  ['crash', 'crash(?:es|ed)?|collisions?|collides?|collided', '坠毁|坠机|空难|失事|相撞|撞车|碰撞'],
  ['plane', 'planes?|aircraft|airliners?|flights?|jets?(?! ski)', '飞机|客机|航班|班机|战机|喷气机'],
  ['helicopter', 'helicopters?|choppers?', '直升机'],
  ['train', 'trains?|railways?|rail line|metro|subway', '火车|列车|铁路|地铁'],
  ['derail', 'derail\\w*', '脱轨|出轨'],
  ['bus', 'bus(?:es)?|minibus(?:es)?|coach(?:es)?', '巴士|大巴|客车|公交|旅游车|中巴'],
  ['boat', 'boats?|ferr(?:y|ies)|ships?|vessels?|tankers?|cargo ship', '渡轮|轮渡|船只|船舶|轮船|油轮|货轮|船'],
  ['sank', 'sinks?|sank|sunk|capsiz\\w+|shipwrecks?', '沉船|翻船|倾覆|沉没'],
  ['stampede', 'stampedes?|crowd crush', '踩踏'],
  ['mine', 'mines?|mining|miners?|coal ?mine', '矿难|矿井|煤矿|金矿|矿场|矿工'],
  ['roof', 'roofs?|ceilings?', '屋顶|天花板|顶棚'],
  ['dam', 'dams?', '大坝|水坝|堤坝'],
  ['bridge', 'bridges?', '大桥|桥梁'],
  ['tunnel', 'tunnels?|Eurotunnel', '隧道'],
  ['school', 'schools?|pupils|schoolchildren|students|classrooms?|kindergarten', '学校|校园|小学|中学|学童|学生|幼儿园|教室'],
  ['university', 'universit(?:y|ies)|campus', '大学|校园'],
  ['hospital', 'hospitals?', '医院'],
  ['airport', 'airports?', '机场'],
  ['refinery', 'refiner(?:y|ies)', '炼油厂|炼厂|炼化厂'],
  ['oil', 'oil|crude', '石油|原油|油价'],
  ['gas', 'natural gas|LNG|gas field|gas supplies', '天然气|液化天然气'],
  ['pipeline', 'pipelines?|Nord Stream', '管道|输油管|管线|北溪'],
  ['power', 'power plants?|power stations?|power grid|blackouts?|power cuts?|outages?', '电站|发电厂|电网|停电|断电|供电'],
  ['palace', 'presidential palace|palace', '总统府|王宫|宫殿'],
  ['embassy', 'embass(?:y|ies)|consulates?', '大使馆|使馆|领事馆|领馆'],
  ['parliament', 'parliament|congress|senate|lawmakers|legislature', '议会|国会|参议院|众议院|立法会|立法院'],
  ['prison', 'prisons?|jail|inmates', '监狱|狱中|囚犯'],
  ['church', 'church(?:es)?|cathedral', '教堂'],
  ['mosque', 'mosques?', '清真寺'],
  ['temple', 'temples?|shrines?', '寺庙|神庙|神社|庙宇'],
  ['market', 'markets?|supermarkets?|shopping (?:mall|centre|center)|mall', '市场|超市|商场|集市'],
  ['camp', 'refugee camps?|displacement camps?', '难民营|营地'],
  ['border', 'borders?|frontier', '边境|边界|国界'],
  ['livestream', 'live-?stream\\w*|broadcast live', '直播'],
  ['journalist', 'journalists?|reporters?|correspondents?', '记者'],
  ['children', 'children|child|kids|teens?|teenagers?|boys?|girls?|minors', '儿童|孩子|学童|小孩|少年|未成年|男童|女童'],
  ['teacher', 'teachers?', '教师|老师'],
  ['police', 'police|officers?|cops?', '警方|警察|员警'],
  ['civilians', 'civilians?', '平民'],
  ['aid', 'aid|humanitarian|relief', '援助|人道|救援物资|赈灾'],
  ['famine', 'famine|starvation|hunger', '饥荒|饥饿'],
  ['vaccine', 'vaccin\\w+', '疫苗|接种'],
  ['ai', 'AI|artificial intelligence', '人工智能|AI', 'c'],
  ['chip', 'chips?|semiconductors?', '芯片|半导体'],
  ['cyber', 'cyber-?attacks?|hack\\w*|ransomware|data breach', '网络攻击|黑客|勒索软件|数据泄露'],
  ['rareearth', 'rare earths?', '稀土'],
  ['crypto', 'bitcoin|crypto\\w*', '比特币|加密货币|虚拟货币'],
  ['stocks', 'stocks?|shares|markets? (?:fall|rise|slump|rally)|Wall Street|Nikkei|Dow', '股市|股票|股价|日经|华尔街'],
  ['rates', 'interest rates?|rate cut|rate hike|cuts? rates|raises? rates', '利率|降息|加息|升息'],
  ['inflation', 'inflation|prices', '通胀|通货膨胀|物价'],
  ['budget', 'budget', '预算'],
  ['workweek', 'work ?week|working hours|working week|6x1', '工时|工作周|工作时间|工作日'],
  ['wage', 'minimum wage|wages|pay rise', '最低工资|工资|薪资'],
  ['pension', 'pensions?', '养老金|退休金'],
  ['visa', 'visas?', '签证'],
  ['deport', 'deport\\w*|expel\\w*|ordered to leave', '驱逐|遣返|递解|出境'],
  ['asylum', 'asylum|refugees?|migrants?', '庇护|难民|移民'],
  ['settlement', 'settlements?|settlers?', '定居点|定居者'],
  ['ambassador', 'ambassadors?|envoys?|summon\\w*', '大使|特使|召见'],
  ['warcrimes', 'war crimes?|genocide', '战争罪|种族灭绝'],
  ['militaryexercise', 'military (?:drills?|exercises?)|war games|drills', '军演|军事演习|演习'],

  'place',
  // ---- named places the gazetteer doesn't have ----
  ['yalu', 'Yalu', '鸭绿江'],
  ['channeltunnel', 'Channel Tunnel|Eurotunnel', '英法海底隧道|海峡隧道|英吉利海峡隧道'],
  ['hormuz', 'Hormuz', '霍尔木兹'],
  ['blacksea', 'Black Sea', '黑海'],
  ['southchinasea', 'South China Sea', '南海|南中国海'],
  ['taiwanstrait', 'Taiwan Strait', '台湾海峡|台海'],
  ['golan', 'Golan', '戈兰'],
  ['donbas', 'Donbas|Donbass', '顿巴斯'],
  ['zaporizhzhia', 'Zaporizhzhia', '扎波罗热'],
  ['chernobyl', 'Chernobyl', '切尔诺贝利'],
  ['fukushima', 'Fukushima', '福岛'],
  ['flotilla', 'flotilla', '船队'],
  ['panamacanal', 'Panama Canal', '巴拿马运河'],
  ['suez', 'Suez', '苏伊士'],
  ['forthood', 'Fort Hood', '胡德堡'],
];

const EN_NUM = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
const ZH_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const ZH_UNIT = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
// Chinese numerals count only before a measure word, so 五角大楼 (Pentagon), 三星 or 四川 are not numbers
const ZH_MEASURE = '人|名|死|伤|级|岁|天|年|个|架|艘|枚|次|座|所|家|起|宗|具|辆|吨|公里|千米|米|度|倍|周|小时|分钟|轮|项|条|间|栋|户|位|只|头|万|亿|%';
const ZH_NUM_RE = new RegExp(`([零〇一二两三四五六七八九十百千]+)(?=多?(?:${ZH_MEASURE}))`, 'g');

// entries are grouped: everything after an 'actor' / 'topic' / 'place' marker is of that kind
const KIND = new Map();
const ENTRIES = [];
{
  let kind = 'topic';
  for (const e of C) {
    if (typeof e === 'string') kind = e;
    else {
      KIND.set(e[0], kind);
      ENTRIES.push(e);
    }
  }
}
/** 'actor' (people, groups, organisations), 'topic' (what happened, to what) or 'place'. */
export const conceptKind = (id) => KIND.get(id) || 'topic';

function compile([id, en, zh, flags = '']) {
  return {
    id,
    en: en ? new RegExp(`(?<![\\w-])(?:${en})(?![\\w-])`, flags.includes('c') ? 'u' : 'iu') : null,
    zh: zh ? new RegExp(zh) : null,
  };
}
const COMPILED = ENTRIES.map(compile);

/** Concept ids found in a text. */
export function concepts(text, lang) {
  const out = new Set();
  if (!text) return out;
  const zh = lang.startsWith('zh');
  for (const c of COMPILED) {
    const re = zh ? c.zh : c.en;
    if (re && re.test(text)) out.add(c.id);
  }
  return out;
}

function zhNumber(s) {
  if (/^[零〇一二两三四五六七八九]+$/.test(s) && s.length > 1) return Number([...s].map((c) => ZH_DIGIT[c]).join(''));
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const ch of s) {
    if (ch in ZH_DIGIT) digit = ZH_DIGIT[ch];
    else if (ch === '万') {
      total += (section + digit) * 10000;
      section = 0;
      digit = 0;
    } else if (ch in ZH_UNIT) {
      section += (digit || 1) * ZH_UNIT[ch];
      digit = 0;
    }
  }
  return total + section + digit;
}

/**
 * Numbers that identify an event ("kills 28", "19 injured", "magnitude 7.1", "致5死16伤"). 0–2 say
 * too little, years too much of nothing; both are left out.
 */
export function numbers(text, lang) {
  const out = new Set();
  if (!text) return out;
  const add = (n) => {
    if (!Number.isFinite(n) || n < 3 || (n >= 1990 && n <= 2035 && Number.isInteger(n))) return;
    out.add(String(n));
  };
  const zh = lang.startsWith('zh');
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?![\d])\s*(万|亿|日|月|号|时|点)?/g)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (!zh || !m[2]) add(n);
    else if (m[2] === '万') add(Math.round(n * 1e4));
    else if (m[2] === '亿') add(Math.round(n * 1e8));
    // dates and clock times (10月15日, 8时) are not about the event
  }
  if (zh) {
    for (const m of text.matchAll(ZH_NUM_RE)) add(zhNumber(m[1]));
  } else {
    for (const m of text.toLowerCase().matchAll(/\b(three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](one|two|three|four|five|six|seven|eight|nine))?\b/g)) {
      const units = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
      add(EN_NUM[m[1]] + (m[2] ? units[m[2]] : 0));
    }
  }
  return out;
}

export const CONCEPT_IDS = ENTRIES.map((c) => c[0]);
