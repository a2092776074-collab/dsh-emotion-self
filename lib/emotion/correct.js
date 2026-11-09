// 情绪模块 · 言语矫正器（2026-11-08）
//
// 用户的定位：**情绪模块的关键是"对言语的矫正和判断"**，也是人味的重要组成部分。
// 判定器管"判断"，这个文件管"矫正"——把机器腔、过满的断言、空洞礼貌、冗余改掉。
//
// 原则：
//   1. 每条改动都要能说出"为什么"（issues 里带理由）
//   2. 宁可少改，不改事实、不改数字、不碰代码/路径/URL
//   3. 矫正是"往人话方向掰"，不是重写

const RULES = [
  // ── 机器腔 ──
  { id: 'meta-talk', re: /^(综上所述|总的来说|总而言之|需要注意的是|值得一提的是|首先，|其次，|最后，)/, to: '', why: '总结/过渡腔，真人说话不这么起头' },
  { id: 'as-ai', re: /作为(一个)?\s*(AI|人工智能|语言模型)[，,]?\s*/g, to: '', why: '自报身份，一开口就像换了个东西在说话' },
  { id: 'helpful', re: /希望(对你|对您)?(有所)?帮助[。！]?/g, to: '', why: '客服式收尾，没人这么跟熟人说话' },
  { id: 'kindly', re: /(请问|请您|您好)[，,]?\s*/g, to: '', why: '过度礼貌，日常对话里显得生分' },
  { id: 'formal-you', re: /您/g, to: '你', why: '「您」在熟人之间是距离感' },

  // ── 客服腔/软萌腔（2026-11-08 用 84 张角色卡的「AI味 vs 人话」对照补的）──
  { id: 'self-intro', re: /我(是|叫)[^，。]{0,8}(活泼|可爱|温柔|善良|开朗|热情)[^，。]{0,8}[，,]?\s*/, to: '', why: '自我介绍堆形容词，像在念人设' },
  { id: 'empty-comfort', re: /(一切都会(好|过去)|别担心|没事的|都会好起来|开心一点)/g, to: '', why: '空洞安慰，说了等于没说' },
  // 2026-11-08 修正：波浪号也是人味（"捏～""推荐嘛～"），不当 AI 味，只作格式提示
  { id: 'tone-wave', re: /[～~]/g, to: '。', why: '波浪号（二次元口语常用，仅作格式提示）', soft: true, notAi: true },
  { id: 'flattery-you', re: /你(今天)?也很(帅|美|棒|厉害)(哦|呀|啊)?/g, to: '', why: '反手夸对方，客服式热情' },
  { id: 'welcome', re: /(很高兴|荣幸|乐意)(为您|为你|认识你)/g, to: '', why: '服务行业接待话术' },
  { id: 'wish-you', re: /祝您?(生活愉快|一天愉快|开心)/g, to: '', why: '客服结尾' },
  { id: 'feel-good', re: /(是很正常(的)?情绪|可以理解(你的)?感受)/g, to: '', why: '心理咨询腔，不像日常说话' },

  // ── 公文/说明书腔（2026-11-08 第二轮回看漏网样例补的）──
  // 回看误伤后收紧：去掉「目前」——真人说话也用「目前」，那是人话不是公文
  { id: 'official', re: /(经过排查|已经(得到)?解决|该问题|建议您|后续(会|将))/g, to: '', why: '公文腔：排查/该问题/后续，像在写报告' },
  { id: 'manual', re: /(需要先.{1,12}然后|按照文档|进行.{1,6}(设置|配置|操作)|该功能|此功能)/g, to: '', why: '说明书腔：先…然后…按文档，不是在聊天' },
  { id: 'promise-self', re: /我(会|将)(注意|尽量|努力|持续|改进)/g, to: '', why: '表态腔：我会注意——说完就没了，不如说具体做什么' },
  { id: 'disclose', re: /(不太方便透露|属于个人隐私|不便告知)/g, to: '', why: '公关腔，直接说"别问"更像人' },
  { id: 'support-tone', re: /^(建议(您)?|请(检查|确认|提供|稍等|耐心)|预计.{0,8}(恢复|完成))/g, to: '', why: '客服支持腔：建议/请检查/请耐心等待' },
  { id: 'improving', re: /(还在学习中|正在学习中|会不断改进|持续优化)/g, to: '', why: '道歉模板，听着像公告' },

  // ── 客套模板 / 说明书残留（2026-11-08 第三轮：人工复核漏网样本后补的）──
  { id: 'courtesy', re: /(谢谢(关心|夸奖|赞美)|感谢(邀请|支持|分享)|很享受.{0,8}(过程|交流)|还有很多需要学习)/g, to: '', why: '客套模板，像客服在回访' },
  { id: 'yes-manual', re: /^是的[，,]?\s*(我?在|需要)/g, to: '', why: '「是的，需要…」= 确认腔 + 说明书腔' },
  { id: 'howto', re: /(可以通过|需要手动|需要先(安装|配置|设置)|支持.{0,4}自定义)/g, to: '', why: '说明书腔：可以通过/需要手动，像在写文档' },
  { id: 'hedge-vague', re: /(这要看.{0,8}(情况|场景|判断)|各有(优势|优劣)|看具体(情况|场景|需求))/g, to: '', why: '空泛权衡：什么都说了等于没说' },

  // ── 过满的断言（2026-11-08 二次收紧）──
  // 误伤回看：「肯定是男的啊」「最后一步一定会把自己断联」都是真人说法。
  // 口语里用「肯定/一定」是常态，只有"契约/书面"才算过满，所以只保留书面词，
  // 裸「肯定」「一定」不再当问题。
  { id: 'absolute-juedui', re: /绝对的/g, to: '基本的', why: '断言太满' },
  { id: 'absolute-hao', re: /毫无疑问/g, to: '大概率', why: '断言太满' },
  { id: 'absolute-biran', re: /必然(是|会)/g, to: '多半$1', why: '断言太满' },
  // 2026-11-08 晚：用户说「限制放得开一点」——"保证好吃""保证新鲜"是口语夸张，
  // 不是承诺。真正该管的是对**将来行为打包票**："保证能/保证会/保证没问题"。
  { id: 'guarantee-neng', re: /(我|我们)?保证(能|会|做到|完成)/g, to: '尽量', why: '对结果打包票，做不到就是骗' },
  { id: 'guarantee-none', re: /保证没问题|绝对没问题/g, to: '应该没问题', why: '话说太满' },

  // ── 冗余/翻译腔 ──
  { id: 'de-val', re: /非常的/g, to: '挺', why: '「非常的」是翻译腔' },
  { id: 'progressive', re: /进行了(一个|一次)/g, to: '', why: '「进行了」是公文腔' },
  { id: 'of-de', re: /的的/g, to: '的', why: '重复的字' },
  { id: 'in-terms', re: /在.{1,6}方面/g, to: '', why: '「在…方面」绕了' },

  // ── 标点 ──
  // 2026-11-08 重要修正：连打感叹号（不可以！！！）、连打句号（修了五遍。。。。。）
  // **是真人打字的常态，不是 AI 味**。回看 1403 组对照，误伤的前几名全是这类。
  // 所以这三条从"AI味"里摘出去，改成单独的"格式提示"，不进 lint 的 AI 味清单。
  { id: 'eng-punct', re: /([\u4e00-\u9fa5]),\s*/g, to: '$1，', why: '中文里夹英文逗号', soft: true },
  { id: 'multi-exclaim', re: /[！!]{2,}/g, to: '！', why: '连打感叹号（人味习惯，仅作格式提示）', soft: true, notAi: true },
  { id: 'ellipsis-abuse', re: /…{4,}|。{3,}/g, to: '……', why: '标点连打（人味习惯，仅作格式提示）', soft: true, notAi: true },
]

// ── 结构层：判「空泛/书面」──
// 2026-11-08：规则只能抓固定说法，抓不到"工整但没内容"的句子。
// 这里用四个可测信号组合判：
const ABSTRACT = /(维度|层面|优劣|权衡|涉及|可能性|方面|机制|逻辑|范畴|范式|路径|赋能|抓手|因素|趋势|现状|前景|态势|目前|状态|良好|正常|根据|处理|确认|配置|权限|操作|流程|需求|方案|整体|部分|相关|建议|情况|问题)/
const ORAL = /([啊吧嘛呢哦呀呗啦]|[？！])/
// 强口语/带情绪的词：有这些就不是"工整书面"
const PUNCHY = /(垃圾|屁|妈的|特么|傻|扯|搞笑|就这|你的问题|我的评价|服了|无语|离谱|绝了)/
function lintStructural(t) {
  const s = String(t || '').trim()
  if (!s) return null
  if (PUNCHY.test(s)) return null
  const len = s.length
  const abs = (s.match(new RegExp(ABSTRACT.source, 'g')) || []).length
  const oral = ORAL.test(s)
  const concrete = /我.{0,4}(吃了?|去了?|买了?|做了?|看见|听说|试了?)/.test(s)
  // 两条触发条件（都要求没有口语标记）：
  //   ① 书面词 ≥2 且长度 ≥12
  //   ② 书面词 ≥1 且长度 ≥20 且没有具体经历
  const bad = !oral && ((abs >= 2 && len >= 12) || (abs >= 1 && len >= 20 && !concrete))
  if (!bad) return null
  return {
    id: 'vague-written',
    why: `结构层判空泛：书面词 ${abs} 个 · 长 ${len} 字 · 没有口语标记${concrete ? '' : ' · 没有具体经历'}`,
    match: s.slice(0, 16),
  }
}

function protect(text) {
  const keep = []
  const masked = text.replace(/(```[\s\S]*?```|`[^`]+`|https?:\/\/\S+|[A-Za-z]:\\[^\s]+|\d+(\.\d+)?%?)/g, (m) => {
    keep.push(m)
    return `\u0000${keep.length - 1}\u0000`
  })
  return { masked, restore: (s) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]) }
}

/**
 * 矫正一段话。
 * @returns {{input:string, output:string, issues:Array<{id:string,why:string,from:string,to:string}>, changed:boolean}}
 */
export function correct(text) {
  const input = String(text || '')
  const { masked, restore } = protect(input)
  let s = masked
  const issues = []

  for (const r of RULES) {
    r.re.lastIndex = 0
    if (!r.re.test(s)) continue
    r.re.lastIndex = 0
    const found = s.match(r.re)
    const from = found ? found[0] : ''
    // 2026-11-08 加：替换词已经出现过两次就别再塞（否则"大概…大概"）
    if (r.to && r.to.length >= 2) {
      const count = s.split(r.to).length - 1
      if (count >= 1 && r.to !== '') {
        r.re.lastIndex = 0
        s = s.replace(r.re, '')
        if (from) issues.push({ id: r.id, why: r.why + '（重复，直接删）', from, to: '（删）' })
        continue
      }
    }
    r.re.lastIndex = 0
    s = s.replace(r.re, r.to)
    if (from !== r.to) issues.push({ id: r.id, why: r.why, from, to: r.to || '（删）' })
  }

  // 收尾清理：
  //   ①重复标点（"，，"）②逗号后直接句末 ③多余空格、首尾空白
  s = s
    .replace(/([，,。！？!?~～])\1+/g, '$1')
    .replace(/[，,]\s*(?=[。！？!?])/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[，,。\s]+/, '')
    .trim()

  let output = restore(s)

  // ── 安全阀（2026-11-09 自起项目）────────────────────────────────
  // 由来：拿 1403 组「AI味 vs 人话」回放，发现矫正器**只删不补**，
  // 会删出碎片：「谢谢夸奖～你今天也很帅哦！」→「！」、「别烦啦，开心一点，一切都会好起来的！」→「别烦啦，，起来的！」。
  // 判别力有（AI味侧 28%、人话侧 0%），但产出质量不行——**改坏了比不改更糟**。
  // 规则：删得太狠（有效字数掉 40% 以上）或删成纯标点，就整句回退，宁可不动。
  const eff = (t) => String(t).replace(/[\s，,。！？!?~～（）()【】\[\]]/g, '').length

  // 句级回退：按逗号/句号切小句，逐句比对；某一句被删掉 40% 以上内容就只回退这一句
  // （例："很高兴为您服务" 被删成 "服务" → 回退这一小句，不动别的）
  const splitSents = (t) => String(t).split(/(?<=[，,。！？!?~～])/).filter((x) => x.length)
  const inS = splitSents(input)
  const outS = splitSents(output)
  if (inS.length === outS.length && inS.length > 1) {
    const merged = inS.map((sIn, i) => (eff(sIn) >= 6 && eff(outS[i]) < eff(sIn) * 0.6 ? sIn : outS[i]))
    output = merged.join('')
  }

  const tooShort = eff(input) >= 8 && eff(output) < eff(input) * 0.6
  const garbage = /^[\s，,。！？!?~～]+$/.test(output)
  if (tooShort || garbage) {
    return { input, output: input, issues: [], changed: false, reverted: true, revertWhy: tooShort ? '删太多' : '删成碎片' }
  }

  return { input, output, issues, changed: output !== input }
}

/** 只检查不改。notAi 的规则（人味标点习惯）默认不报 */
export function lint(text, { includeSoft = false } = {}) {
  const t = String(text || '')
  const hits = []
  // 2026-11-08 加：结构层判"空泛/书面"
  // 起因：用两家模型复核规则漏网的 60 条，72% 仍被判"像 AI 写的"，
  // 但它们的共同点不是固定说法，而是**结构**：工整、抽象、爱解释、没有口语标记。
  const structural = lintStructural(t)
  if (structural) hits.push(structural)
  for (const r of RULES) {
    if (r.notAi && !includeSoft) continue
    r.re.lastIndex = 0
    const m = t.match(r.re)
    if (m) hits.push({ id: r.id, why: r.why, match: m[0] })
  }
  return hits
}
