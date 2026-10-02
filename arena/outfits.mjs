// Names come from verified clothing descriptions. Artwork is a commissioned chibi reinterpretation.
const costumes = [
 ['zhouyi','轴伊·冬装','冬装',2,3,4,'armor','开战：获得 4 点护盾。','长发、围巾、小兔子挎包；百科另列眼镜差分。','https://moegirl.icu/zh-hans/轴伊'],
 ['aza','AZA·打歌服','打歌服',3,4,4,'support','前方最近友军攻击：对随机敌人造成 2 点伤害，每战三次。','打歌服用于唱歌与联动，带 LED 猫耳耳机、尾饰，并拆除原编发。','https://moegirl.icu/zh-hans/阿萨'],
 ['yuji','雨纪·JK兔女郎','JK制服兔女郎',2,3,3,'doubleSummon','退场：召唤两位 1/1 伴舞。','JK 制服结合兔女郎主题的首件新衣装。','https://moegirl.icu/雨纪'],
 ['lianshiye','恋诗夜·制服初日','制服-初日',1,2,3,'levelGift','升级：给另外两位随机友军永久 +1/+1。','百科列名「制服-初日」，2022 年发布的制服新衣。','https://moegirl.uk/index.php?title=恋诗夜&variant=zh-hant'],
 ['sumi','礼墨·海风泳装','海风泳装',3,3,5,'foodGrow','自己获得道具：永久 +1 生命。','2023 年海风泳装新衣；黑发、金瞳。','https://moegirl.uk/index.php?title=礼墨&variant=zh-hans'],
 ['diansu','点酥·日常服','日常服',1,3,2,'rollIncome','刷新商店：返还 1 金，每回合一次。','2025 年发布日常服形象，胸前有八卦镜。','https://moegirl.icu/zh-hant/点酥'],
 ['miyue','弥月·地雷装','地雷装',4,5,5,'retaliate','受伤且存活：对前排敌人造成 1 点伤害，每战三次。','2025 年发布地雷装；机械兔耳、亚麻发、红紫异色瞳。','https://moegirl.icu/兔川弥月'],
 ['shengge','笙歌·宫廷款','4.0新衣宫廷款',5,5,7,'teamShield','开战：给另外两位友军 2 点护盾。','4.0 新衣的宫廷款，金发、琥珀金瞳，中国风主题。','https://moegirl.uk/index.php?title=笙歌&variant=zh-hant'],
 ['yukie','桃濑雪绘·礼裙','礼裙',4,4,6,'allGrow','回合结束：给另外两位友军永久 +1/+1。','新衣装索引记载首次新衣发表的礼裙；金发、蓝瞳。','https://wikiwiki.jp/nijisanji/衣装等まとめ/VirtuaReal/2020年デビュー'],
 ['ruiya','瑞娅·时空日常服','日常服',4,4,6,'buyBuff','招募：给另一个随机友军永久 +1 攻击。','胸前紫色沙漏、手腕金色法阵、裙上的罗马数字与齿轮；银白长发内侧有星空。','https://moegirl.uk/index.php?title=瑞娅&variant=zh-sg'],
 ['mumu','沐霂·东风团服','麻将主题团服',3,3,6,'summonBuff','友军召唤：给其 +1 攻击，每战三次。','第二套团服有蝴蝶挂饰、翠绿吊穗和「东风」麻将牌发饰。','https://moegirl.icu/zh-cn/沐霂'],
 ['nana7mi','七海·白紫护士服','护士服',5,4,8,'heal','退场：给所有友军恢复 3 点生命。','白紫护士服搭配绷带、药膏等医疗小物，并有口罩与发型差分。','https://moegirl.uk/index.php?title=七海(虚拟UP主)&variant=zh-sg'],
 ['youyi','又一·一筒团服','麻将主题团服',2,3,4,'selfGrow','回合结束：自己永久 +1/+1。','一束蓝色挑染、腿环和裙上的「一筒」麻将牌图案。','https://moegirl.uk/index.php?title=又一&variant=zh-hant'],
 ['liAn','梨安·红中团服','麻将主题团服',3,4,4,'splashGift','退场：给所有友军 +1 攻击。','扇子配饰、中国结领结，腰间有「红中」麻将牌挂饰。','https://moegirl.uk/index.php?title=梨安&variant=zh-hk'],
 ['lianshiye','恋诗夜·修女倒计时','修女-倒计时',6,6,9,'grow','回合结束：给另一个最低生命友军永久 +1/+1。','百科列名「修女-倒计时」，2023 年发布的修女新衣。','https://moegirl.uk/index.php?title=恋诗夜&variant=zh-hant'],
 ['shengge','笙歌·棉袄款','4.0新衣棉袄款',2,2,5,'gift','退场：给后方最近友军 +2/+2。','4.0 新衣的棉袄款，与宫廷款、舞者款同次公开。','https://moegirl.uk/index.php?title=笙歌&variant=zh-hant'],
];
const sources={lianshiye:'https://moegirl.icu/zh-my/恋诗夜',sumi:'https://moegirl.uk/index.php?title=礼墨&variant=zh-hans',shengge:'https://moegirl.uk/index.php?title=笙歌&variant=zh-hant',yukie:'https://wikiwiki.jp/nijisanji/衣装等まとめ/VirtuaReal/2020年デビュー',ein:'https://moegirl.icu/艾因(虚拟UP主)',goutan:'https://moegirl.icu/勾檀',suiji:'https://moegirl.icu/岁己',tiandou:'https://moegirl.icu/恬豆',agari:'https://moegirl.icu/东爱璃',nana7mi:'https://moegirl.uk/index.php?title=七海(虚拟UP主)&variant=zh-sg',youyi:'https://moegirl.uk/index.php?title=又一&variant=zh-hant',liAn:'https://moegirl.uk/index.php?title=梨安&variant=zh-hk',ruiya:'https://moegirl.uk/index.php?title=瑞娅&variant=zh-sg',seki:'https://moegirl.uk/index.php?title=星汐&variant=zh-cn',haruka:'https://moegirl.uk/index.php?title=白神遥&variant=zh-sg',mahiru:'https://moegirl.uk/index.php?title=真绯瑠&variant=zh-cn',azi:'https://moegirl.uk/index.php?title=阿梓&variant=zh-sg',taodai:'https://moegirl.icu/水鸟川桃代',miki:'https://moegirl.uk/index.php?title=弥希&variant=zh-cn',rei:'https://moegirl.uk/index.php?title=病院坂灵&variant=zh-sg'};
// Source-confirmed outfit names; missing visual details are creative interpretations.
const additions=[
 ['lianshiye','恋诗夜·居家慵懒','居家服-慵懒',1,'foodGrow','2021 年居家服新衣，百科未说明版型与配色。'],
 ['sumi','礼墨·周年纪念','一周年纪念新衣',4,'allGrow','2022 年一周年纪念新衣，百科仅列名称与日期。'],
 ['sumi','礼墨·生日新衣','生日回新衣',3,'levelGift','2023 年生日回新衣，百科未说明外观细节。'],
 ['sumi','礼墨·瓜咪','瓜咪形象',1,'sellBuff','2024 年瓜咪形象，百科仅确认形象名称。'],
 ['shengge','笙歌·舞者款','4.0新衣舞者款',3,'support','2022 年 4.0 舞者款新衣，百科未说明剪裁与配色。'],
 ['shengge','笙歌·泳装外套','泳装（含外套）',2,'armor','2022 年泳装含外套版本，另有粉发差分。'],
 ['shengge','笙歌·2023生日','23年生日新衣',5,'splashGift','2023 年生日新衣，百科未说明具体衣型。'],
 ['shengge','笙歌·现代装','现代装',2,'income','2023 年现代装，另列去外套及黑裙版本。'],
 ['shengge','笙歌·2024生日','24年生日新衣',6,'teamShield','2024 年生日新衣，百科仅列名称与日期。'],
 ['yukie','桃濑雪绘·猫衣装','猫衣装',1,'summon','猫耳双猫团子发型，有尖牙和表情差分。'],
 ['yukie','桃濑雪绘·街头常服','普段着',2,'rollIncome','双马尾日常服，可拆圆框太阳镜与黑口罩。'],
 ['ein','艾因·熊哥披肩','居家服（熊哥披肩）',2,'gift','居家服的熊哥披肩差分，百科未说明衣服颜色。'],
 ['goutan','勾檀·万圣新衣','万圣节新衣装',3,'doubleSummon','2021 年万圣节新衣，百科未说明具体配色。'],
 ['suiji','岁己·夏日新衣','夏日新衣',1,'buyBuff','2024 年夏日新衣；常设白发、红瞳。'],
 ['tiandou','恬豆·青蛙睡衣','青蛙睡衣',1,'selfGrow','百科记载青蛙睡衣；常设蓝发、蓝瞳。'],
 ['agari','东爱璃·旗袍','旗袍',4,'cleave','百科记载旗袍形象；常设棕发、蓝瞳。'],
 ['nana7mi','七海·仙侠师姐','仙侠道士服',6,'cleave','2025 年蓝白道士服，搭配佩剑与发型差分。'],
 ['nana7mi','七海·牛仔常服','六周年常服',2,'buyBuff','淡蓝外套内搭牛仔连衣裙，贝雷帽、卷刘海差分。'],
 ['youyi','又一·禧运警官','禧运警官形态',4,'armor','十万粉纪念 2D 新衣，百科未说明服装配色。'],
 ['youyi','又一·怪盗','怪盗风3D形象',5,'backSnipe','生日会公布怪盗风格 3D 新形象，外观细节由画面补充。'],
 ['youyi','又一·韩系打歌服','韩系打歌服',3,'summonBuff','百科独立列出韩系打歌服，未说明配色。'],
 ['liAn','梨安·2D睡衣','2D睡衣',1,'grow','百科列出的 2D 睡衣形象，未说明版型与颜色。'],
 ['ruiya','瑞娅·国风','国风立绘',4,'heal','2023 年国风立绘，百科未描述具体服饰细节。'],
 ['ruiya','瑞娅·王女','王女新衣',6,'teamShield','2023 年王女新衣，另列法杖；配色由画面创作。'],
 ['ruiya','瑞娅·嗜血蔷薇','嗜血蔷薇',6,'retaliate','2024 年嗜血蔷薇形象，百科未说明衣服细节。'],
 ['seki','星汐·赛博猪猪','赛博猪猪',5,'doubleSummon','2022 年赛博猪猪新衣；常设蓝发、粉色挑染、紫瞳。'],
 ['seki','星汐·侠客','侠客风新衣',5,'cleave','2024 年侠客风新衣，百科未说明衣服配色。'],
 ['haruka','白神遥·蓝白长裙','新夏装',3,'grow','2020 年新夏装为大小姐风格的蓝白长裙。'],
 ['mahiru','真绯瑠·单马尾校服','校服',2,'levelGift','2021 年校服配单马尾发型；制服配色未说明。'],
 ['azi','阿梓·忍梓','22年生日回忍者',6,'backSnipe','紫色长发、面具、猫耳差分，另有黑长发差分。'],
 ['taodai','桃代·带刀JK','带刀JK',5,'snipe','2025 年带刀 JK 新形象；常设银发、蓝瞳。'],
 ['miki','弥希·夏装','夏装',4,'foodGrow','2020 年夏装发表；常设蓝黑发、紫瞳。'],
 ['rei','病院坂灵·草莓甜心','草莓甜心',3,'splashGift','百科列名草莓甜心，具体衣服配色由画面设计。'],
 ['rei','病院坂灵·暖冬圣诞','暖冬圣诞新衣',5,'heal','2023 年暖冬圣诞新衣，百科未说明具体版型。'],
];
const descriptions=Object.fromEntries(costumes.map(x=>[x[6],x[7]]));
Object.assign(descriptions,{income:'回合开始：额外获得 1 金。',sellBuff:'出售：给另一个随机友军永久 +1/+1。',summon:'退场：召唤一只 2/2 伴舞。',cleave:'攻击：对敌方第二位造成 2 点伤害。',backSnipe:'开战：对最后方敌人造成 2 点伤害。',snipe:'开战：对最低生命敌人造成 3 点伤害。'});
const statsByTier=[[2,3],[3,4],[4,5],[5,6],[6,7],[7,8]];
for(const [baseId,name,outfit,tier,kind,description] of additions){const [atk,hp]=statsByTier[tier-1];costumes.push([baseId,name,outfit,tier,atk,hp,kind,descriptions[kind],description,sources[baseId]]);}
export const OUTFITS=costumes.map(([baseId,name,outfit,tier,atk,hp,kind,ability,description,source],index)=>({
 id:`${baseId}__costume${index}`,baseId,name,outfit,tier,atk,hp,kind,ability,description,source,
 art:index<16?{atlas:'assets/arena/outfit-atlas-v1.png',columns:4,rows:4,index}:index<32?{atlas:'assets/arena/outfit-atlas-v2.png',columns:4,rows:4,index:index-16}:{atlas:'assets/arena/outfit-atlas-v3.png',columns:6,rows:3,index:index-32},
 artNote:'根据衣装介绍重新绘制；原文未指定的服装颜色由画面设计补充。',
}));
