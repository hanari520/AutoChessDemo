/* 巡演企划 · 主线叙事数据（纯数据，无 DOM、无 window、可 JSON roundtrip）
 *
 * 用途：主线「巡演企划」（expedition）的全部玩家可见叙事文案。
 * 落地：本文件在 M4 阶段原样移动到 tools/narrative-tour.js（勿改名）。
 * 上游设定：specs/narrative/world-bible.md（术语与角色声音以它为准）
 * 剧本出处：specs/narrative/tour-script-v1.md
 *
 * 硬约束（违反即测试红）：
 *   1) 本文件不含任何战斗/经济数值加成（R1），只是字符串。
 *   2) 全部 text 不得出现 tools/solo-modes.test.js:68 的 12 个禁用术语，
 *      也不得出现 world-bible §9 的禁用词（打败/消灭/邪恶/拯救世界/牺牲/复仇…）。
 *   3) who 必须是 index.html UNITS 中的真实 id，或 null（旁白 / 静默）。
 *   4) sfx 必须是 index.html SFX_DEF 中的键，或 null。
 *   5) COPY 段落在 M1 被逐字内联进 tools/solo-modes.js，由漂移测试守护一致性。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NarrativeTour = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';

  /* =====================================================================
   * 1. COPY —— 面板文案镜像
   * 这些字符串必须在 tools/solo-modes.js 中逐字出现（M1/M2 内联）。
   * 由 narrative-tour.test.js 的「漂移测试」用 fs 读取 solo-modes.js 校验。
   * ===================================================================== */
  const COPY = {
    station: {
      1: { name: '潮声港', venue: '灯塔剧场' },
      2: { name: '霓虹街', venue: '天桥圆形广场' },
      3: { name: '长夜台', venue: '星轨穹顶' }
    },
    objective: {
      1: '把声音送到第三十八步——没人站的地方',
      2: '让围观的人真的开始听',
      3: '把没唱完的那一首唱完'
    },
    show: {
      1: { battle: '潮声港·灯塔夜演', elite: '灯塔剧场·加演场', boss: '灯塔剧场·压轴夜' },
      2: { battle: '霓虹街·天桥快闪', elite: '天桥圆形广场·加演场', boss: '天桥圆形广场·压轴夜' },
      3: { battle: '长夜台·星轨演出', elite: '星轨穹顶·加演场', boss: '星轨穹顶·压轴夜' }
    },
    nodeFlavor: {
      1: {
        battle: '第一夜的票是免费的，来的人比想象中多。',
        elite: '主办方临时加了场次：同一首，只给一次机会。',
        camp: '灯塔的二楼有一张旧沙发，坐下去会响。',
        shop: '灯塔下的临时摊位，老板是本地人，只收现金。'
      },
      2: {
        battle: '没有节目单，只有人流量。路过的每一秒都算数。',
        elite: '围观的人开始排队了。排队的人会变成什么，取决于这一首。',
        camp: '天桥下的便利店，关东煮只卖到两点。',
        shop: '天桥底下的摊子，卖什么取决于今天来了谁。'
      },
      3: {
        battle: '这里没有观众席，只有一片还没有被抹掉的地方。',
        elite: '在长夜里加一场，等于把灯多举十分钟。',
        camp: '穹顶的休息室是上一轮巡演留下来的，杯子还在原处。',
        shop: '穹顶后台的自动贩卖机，只剩最后几样。'
      }
    },
    campTrain: '把今天的段落再过一遍 · 获得巡演收入与团队成长',
    rewardRelicLead: '观众留下的应援 · 随机获得：返场耳返（施放曲目后获得应援屏障）、全息伴舞（首次演绎曲目时召来伴舞）、应援手灯（台前成员承受伤害降低）'
  };

  /* =====================================================================
   * 2. 台词构造器（who=null 时用旁白/静默）
   * ===================================================================== */
  const narr = (text, sfx) => ({ who: null, name: '旁白', text: text, sfx: sfx || null });
  const sil = (text, sfx) => ({ who: null, name: '静默', text: text, sfx: sfx || null });
  const say = (who, name, text, sfx) => ({ who: who, name: name, text: text, sfx: sfx || null });

  /* =====================================================================
   * 3. 三站剧本
   * 结构：opening（站开场）→ nodes{battle|elite|camp|event|shop|boss}
   *       → boss.intro / boss.clear → cleared（站末收束）
   * 说明：节点文案按「站 × 节点类型」书写，与 expeditionOptions 的种子轮换解耦。
   * ===================================================================== */
  const STATIONS = {
    1: {
      id: 1,
      name: '潮声港',
      venue: '灯塔剧场',
      silence: '回声',
      theme: '让声音传到没人站的地方',
      objective: COPY.objective[1],
      cast: ['nana7mi', 'yuji', 'pako', 'zeyin', 'youyu', 'zhijin', 'huali', 'taodai', 'songlv', 'chiharu', 'suiji', 'shiliu'],
      opening: [
        narr('星轨的第一道刻痕落在潮声港。这里只有一座旧灯塔改的剧场——台口到最后一排，三十七步。', 'settle'),
        say('nana7mi', '七海', '灯塔剧场。台口到最远那排，三十七步。'),
        say('agari', '东爱璃', '……三十七步很长吗？'),
        say('nana7mi', '七海', '不长。空着才长。'),
        say('agari', '东爱璃', '那我们把第三十八步也占上——可以吗？'),
        say('nana7mi', '七海', '（看了她一眼）行。')
      ],
      nodes: {
        battle: {
          show: COPY.show[1].battle,
          flavor: COPY.nodeFlavor[1].battle,
          lines: [
            say('huali', '花礼', '台口的风比昨晚小了。'),
            say('yuji', '雨纪', '雨停之前，我先把这一首唱完。'),
            say('chiharu', '初濑', '（调弦）……准备好了。'),
            say('songlv', '小松绿', '根系扎在这里了，别客气。'),
            say('agari', '东爱璃', '我先上去——可以吗？')
          ]
        },
        elite: {
          show: COPY.show[1].elite,
          flavor: COPY.nodeFlavor[1].elite,
          lines: [
            say('nana7mi', '七海', '加演不加价。上。'),
            say('nana7mi', '七海', '唱砸了我就当没听见。唱好了我记住。')
          ]
        },
        camp: {
          flavor: COPY.nodeFlavor[1].camp,
          lines: [
            say('agari', '东爱璃', '沙发响。'),
            say('mumu', '沐霂', '一、二、三——好，都坐下。'),
            say('likou', '莉蔻', '（量体温）嗯，都没事。')
          ]
        },
        event: { pool: [1, 2] },
        shop: {
          flavor: COPY.nodeFlavor[1].shop,
          lines: [say('kouichi', '光一', '这批徽章是手工的，歪的也算正品。')]
        },
        boss: {
          show: COPY.show[1].boss,
          mechanic: 'shield',
          intro: [
            say('nana7mi', '七海', '今晚最后一首。站到最前面来。'),
            say('agari', '东爱璃', '我？'),
            say('nana7mi', '七海', '嗯。你的曲目能罩住所有人。'),
            say('agari', '东爱璃', '……我收到了。'),
            narr('观众席上，先是第三排，然后是第七排，有人把手机举了起来。', 'stShouhu'),
            narr('一点，两点，一整片。灯塔剧场三十七步，全都亮了。'),
            say('nana7mi', '七海', '行。开始。')
          ],
          clear: [
            say('rei', '病院坂灵', '（看了一眼台下）三十七步，全满。'),
            say('nana7mi', '七海', '……行。')
          ]
        }
      },
      cleared: [
        say('miki', '弥希', '点名——深海，在。花语，在。森之国，在。'),
        say('agari', '东爱璃', '（小声）我在。'),
        narr('潮声港的星轨刻痕亮了。第二段在更远的地方等着——那里人更多，也更吵。', 'win')
      ]
    },

    2: {
      id: 2,
      name: '霓虹街',
      venue: '天桥圆形广场',
      silence: '空座',
      theme: '让围观的人真的开始听',
      objective: COPY.objective[2],
      cast: ['goutan', 'yujiu', 'kanban', 'nox', 'quanrong', 'mahiru', 'tiandou', 'mumu', 'liAn', 'youyi', 'likou', 'huize', 'kouichi', 'yukie', 'azi'],
      opening: [
        narr('霓虹街不卖票。舞台搭在天桥底下，谁路过都能听。', 'settle'),
        say('azi', '阿梓', '等等等等——先别开麦，这个返听在嗡。'),
        say('azi', '阿梓', '好，推了 3 格……3dB，算了不重要。'),
        say('mumu', '沐霂', '一、二、三——全场注意，今晚不设座位。'),
        say('azi', '阿梓', '不设座位的意思是，他们站着听。'),
        say('mumu', '沐霂', '或者站着走。'),
        say('mumu', '沐霂', '拍子稳住就行。')
      ],
      nodes: {
        battle: {
          show: COPY.show[2].battle,
          flavor: COPY.nodeFlavor[2].battle,
          lines: [
            say('kouichi', '光一', '灯牌借你，押金不收。'),
            say('tiandou', '恬豆', '点心补给线，第一站到。'),
            say('yukie', '桃濑雪绘', '上勾拳三连——不是，我说的是拍子。'),
            say('nox', '诺莺', '（已经在侧台了）'),
            say('mumu', '沐霂', '一、二、三——好，就这样。')
          ]
        },
        elite: {
          show: COPY.show[2].elite,
          flavor: COPY.nodeFlavor[2].elite,
          lines: [
            say('azi', '阿梓', '人多了我反而听不见自己。'),
            say('mahiru', '真绯瑠', '那就别听自己。听我。')
          ]
        },
        camp: {
          flavor: COPY.nodeFlavor[2].camp,
          lines: [
            say('tiandou', '恬豆', '我买了六个。'),
            say('quanrong', '犬绒', '（已经在吃了）'),
            say('mumu', '沐霂', '数一下人数。')
          ]
        },
        event: { pool: [3, 4] },
        shop: {
          flavor: COPY.nodeFlavor[2].shop,
          lines: [say('kouichi', '光一', '灯牌、耳返、应援色，都有。都是手工的。')]
        },
        boss: {
          show: COPY.show[2].boss,
          mechanic: 'charge',
          intro: [
            narr('全场站满了。手机举起来了，灯牌亮了，人声很大。', 'horn'),
            say('azi', '阿梓', '（忽然停下来）等等。'),
            say('azi', '阿梓', '他们在等下一个节目。'),
            say('rei', '病院坂灵', '问题不大。'),
            say('rei', '病院坂灵', '——只是接下来的十分钟会很难。'),
            say('mumu', '沐霂', '一、二、三——'),
            say('mumu', '沐霂', '（第一次没有数下去）……好。那我们从第一拍开始，重新来。')
          ],
          clear: [
            narr('广场上没有人说话。三秒之后，才有人鼓掌。'),
            say('azi', '阿梓', '……这次听见了。'),
            say('rei', '病院坂灵', '嗯。这次是听你的。')
          ]
        }
      },
      cleared: [
        narr('第二段刻痕亮起。它比第一段亮得多——因为它是从一片安静里被点亮的。', 'win')
      ]
    },

    3: {
      id: 3,
      name: '长夜台',
      venue: '星轨穹顶',
      silence: '长夜',
      theme: '把没唱完的那一首唱完',
      objective: COPY.objective[3],
      cast: ['yua', 'ruiya', 'miki', 'hoshimi', 'zhouyi', 'xuezhu', 'lianshiye', 'miyue', 'ein', 'miting', 'diansu', 'aza', 'sishi', 'sanli', 'agari', 'sumi', 'shengge', 'shadow', 'seki', 'haruka', 'rei', 'rinco'],
      opening: [
        narr('长夜台没有白天。这里曾经是上一轮巡演的最后一场，也是没有唱完的那一场。', 'settle'),
        say('nana7mi', '七海', '台口到最远那排——'),
        say('nana7mi', '七海', '……这一次数不出来了。那边已经没有了。'),
        say('haruka', '白神遥', '左边。'),
        say('nana7mi', '七海', '嗯。左边。'),
        say('miki', '弥希', '点名。深海——在。夜幕——在。P-SP——'),
        say('rei', '病院坂灵', '都在。'),
        say('miki', '弥希', '（停了一秒）好。都到了。')
      ],
      nodes: {
        battle: {
          show: COPY.show[3].battle,
          flavor: COPY.nodeFlavor[3].battle,
          lines: [
            say('xuezhu', '雪烛', '这里冷。我把它冻住一会儿。'),
            say('seki', '星汐', '星蚀之下，声音传得更远。'),
            say('hoshimi', '希侑', '（已经站在侧台了）'),
            say('haruka', '白神遥', '左边。'),
            say('miki', '弥希', '三个人，都有。')
          ]
        },
        elite: {
          show: COPY.show[3].elite,
          flavor: COPY.nodeFlavor[3].elite,
          lines: [
            say('haruka', '白神遥', '灯够。'),
            say('nana7mi', '七海', '那就多举十分钟。')
          ]
        },
        camp: {
          flavor: COPY.nodeFlavor[3].camp,
          lines: [
            say('lianshiye', '恋诗夜', '（哼了一句，没哼完）……忘了后面。'),
            say('huali', '花礼', '（把水放在桌上）不用想起来。')
          ]
        },
        event: { pool: [5, 6] },
        shop: {
          flavor: COPY.nodeFlavor[3].shop,
          lines: [say('sanli', '三理', '三拍子，我买了三罐。')]
        },
        boss: {
          show: COPY.show[3].boss,
          mechanic: 'summon',
          intro: [
            narr('穹顶的灯全部熄了。星轨开始转。'),
            say('nana7mi', '七海', '最后一首。唱完，这一段就刻上去了。'),
            say('haruka', '白神遥', '人不够。'),
            say('nana7mi', '七海', '……我知道。'),
            narr('星轨在她身后折了一下——像有人从另一边敲了敲门。'),
            say('rei', '病院坂灵', '门开着。'),
            say('rei', '病院坂灵', '要走这边的话，跟紧。'),
            narr('投影亮了。台上多了很多人。', 'stPSP'),
            narr('她们不是伴舞。她们是上一轮巡演里，没等到最后那首歌的人。'),
            sil('你也……'),
            say('nana7mi', '七海', '（把麦克风举起来）第二段。从第一拍开始。')
          ],
          clear: [
            sil('——我还在听。'),
            narr('长夜台第一次亮了。', 'finalWin'),
            say('miki', '弥希', '点名。深海——在。夜幕——在。魔道——在。音律——在。P-SP——在。'),
            say('miki', '弥希', '（停了一下）上一轮巡演的各位——'),
            say('miki', '弥希', '也在。'),
            say('nana7mi', '七海', '……行。'),
            say('nana7mi', '七海', '这一次唱完了。')
          ]
        }
      },
      cleared: []
    }
  };

  /* =====================================================================
   * 4. 突发企划事件池（6 条）
   * ⚠ 效果签名不可改：safe → +4 金币；risk → -2 演出体力 & 得巡演纪念章
   *   （断言 tools/solo-modes.test.js:83-87 锁定 id=event:risk 的效果）
   * ===================================================================== */
  const EVENTS = [
    {
      id: 1, station: 1, title: '借来的音响',
      situation: '主办方的音响比设备清单上旧十年。',
      safe: { label: '稳妥合作', action: '用他们那台，稳', description: '用他们那台，稳 · +4 金币' },
      risk: { label: '尝试临时联动', action: '把两台接在一起', description: '把两台接在一起 · -2 点演出体力，获得巡演纪念章' },
      after: [say('azi', '阿梓', '……居然没炸。')]
    },
    {
      id: 2, station: 1, title: '多余的座位',
      situation: '第一排有两个座位始终没人坐。',
      safe: { label: '稳妥合作', action: '空着', description: '空着 · +4 金币' },
      risk: { label: '尝试临时联动', action: '把手灯放上去，唱完一整首', description: '把手灯放上去，唱完一整首 · -2 点演出体力，获得巡演纪念章' },
      after: [say('huali', '花礼', '（把手灯留在座位上）还来得及。')]
    },
    {
      id: 3, station: 2, title: '雨中的天桥',
      situation: '雨来了，主办方建议改到室内。',
      safe: { label: '稳妥合作', action: '转移室内', description: '转移室内 · +4 金币' },
      risk: { label: '尝试临时联动', action: '在雨里唱完', description: '在雨里唱完 · -2 点演出体力，获得巡演纪念章' },
      after: [say('yuji', '雨纪', '雨停之前，我唱完了。')]
    },
    {
      id: 4, station: 2, title: '一位退场者',
      situation: '广场边缘站着一个只剩轮廓的人。她也在跟着哼。',
      safe: { label: '稳妥合作', action: '绕开', description: '绕开 · +4 金币' },
      risk: { label: '尝试临时联动', action: '把麦克风递过去', description: '把麦克风递过去 · -2 点演出体力，获得巡演纪念章' },
      after: [say('rei', '病院坂灵', '她跟完了整首。走的时候是笑着的。')]
    },
    {
      id: 5, station: 3, title: '旧录音带',
      situation: '抽屉里有一盘带子，标签写着上一轮巡演的日期。',
      safe: { label: '稳妥合作', action: '收好', description: '收好 · +4 金币' },
      risk: { label: '尝试临时联动', action: '当场放出来', description: '当场放出来 · -2 点演出体力，获得巡演纪念章' },
      after: [say('nana7mi', '七海', '（把带子收起来）先不听了。')]
    },
    {
      id: 6, station: 3, title: '调音的邻居',
      situation: '隔壁场馆也在排练，两边的声音撞在一起。',
      safe: { label: '稳妥合作', action: '错开时间', description: '错开时间 · +4 金币' },
      risk: { label: '尝试临时联动', action: '一起唱', description: '一起唱 · -2 点演出体力，获得巡演纪念章' },
      after: [say('azi', '阿梓', '隔壁那个高音——不错。')]
    }
  ];

  /* =====================================================================
   * 5. 终场（三种收尾，纯展示，不引入任何数值奖励）
   * 判据只读 state.hp / state.route；不得读取并回写任何战斗字段。
   * ===================================================================== */
  const FINALE = {
    opening: [
      narr('三个刻痕叠在一起的时候，星轨中间出现了一扇门。', 'settle'),
      narr('它一直就在那里。只是之前没有声音够得着它。'),
      narr('终场舞台 · 星域穹顶，开演。')
    ],
    /* 安可：hp 高、路线顺利 */
    encore: [
      narr('唱完了，没有人走。'),
      say('agari', '东爱璃', '我收到了——'),
      say('agari', '东爱璃', '（看了一下台下）收到太多了。'),
      say('nana7mi', '七海', '行。那就再来一首。')
    ],
    /* 谢幕：常规通关 */
    curtain: [
      say('miki', '弥希', '点名——'),
      narr('（逐个念完五十个名字）'),
      say('nana7mi', '七海', '……辛苦了。')
    ],
    /* 继续：体力偏低通关（不写失败） */
    resume: [
      say('nana7mi', '七海', '今天到这里。'),
      say('nana7mi', '七海', '明天照常。')
    ]
  };

  /* =====================================================================
   * 6. 音效提示（全部取自 index.html SFX_DEF 现有键，零新增音频资源）
   * ===================================================================== */
  const SFX_CUES = {
    stationOpen: 'settle',
    battle: 'battleStart',
    station2BossEncounter: 'horn',
    mechanic: { shield: 'stShouhu', charge: 'stOuxiang', summon: 'stPSP' },
    win: 'win',
    finale: 'finalWin',
    settle: 'settle'
  };

  return { version: 1, COPY: COPY, STATIONS: STATIONS, EVENTS: EVENTS, FINALE: FINALE, SFX_CUES: SFX_CUES };
});
