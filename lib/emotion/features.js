// 情绪模块 · 表层特征（2026-11-08）
// 这些是"看字面就知道"的信号：表情包、反问、感叹、重复、否定、语气词。
// 判定器拿它们调档——这正是词表里不该手写「语境档」的那部分。

// 表情包/标记 → 倾向
//   irony: 阴阳/调侃，会把正负往负推，且提强度
//   pos:   明确正面
//   strong: 强情绪标记
const MARKS = {
  doge: { re: /\[(doge|狗头)\]/i, irony: 0.5, strong: 0.4 },
  huaji: { re: /\[滑稽\]/i, irony: 0.5, strong: 0.3 },
  chigua: { re: /\[吃瓜\]/i, irony: 0.3, strong: 0.2 },
  weixiao: { re: /\[微笑\]/i, irony: 0.6, strong: 0.3 },
  layanjing: { re: /\[辣眼睛\]/i, irony: 0.4, strong: 0.3 },
  canghu: { re: /\[藏狐\]/i, irony: 0.4, strong: 0.2 },
  xiaoku: { re: /\[笑哭\]/i, pos: 0.4, strong: 0.4 },
  daku: { re: /\[(大哭|泪崩)\]/i, strong: 0.6, valence: -0.3 },
  qd: { re: /\[(舔屏|色)\]/i, pos: 0.3, strong: 0.3 },
}

const PARTICLES = /(啊|啦|嘛|哦|呀|呐|咯|呗|呢|吧)/
const NEGATION = /(不|没|别|甭|无|非)/
const QUESTION = /(吗|呢|么)\s*[？?]?\s*$|[？?]\s*$|难道|岂|怎么会/
const EXCLAIM = /[！!]/
const REPEAT = /(.)\1{2,}/ // 同一字连打 3 次以上
const INTENSIFIER = /(特别|非常|太|极其|真的|实在|简直|超级|巨)/
const SOFTENER = /(可能|好像|稍微|有点|大概|也许|感觉)/
const SELF_DEPRECATE = /(不算|没资格|不敢|不至于吧)/

export function extractFeatures(text) {
  const t = String(text || '')
  const marks = []
  let irony = 0
  let markPos = 0
  let markStrong = 0
  let markValence = 0
  for (const [name, def] of Object.entries(MARKS)) {
    if (def.re.test(t)) {
      marks.push(name)
      irony += def.irony || 0
      markStrong += def.strong || 0
      markPos += def.pos || 0
      markValence += def.valence || 0
    }
  }
  const exclaims = (t.match(/[！!]/g) || []).length
  const questions = QUESTION.test(t.trim())
  const negated = NEGATION.test(t)
  const hasParticle = PARTICLES.test(t)
  const repeated = REPEAT.test(t)
  const intensifier = INTENSIFIER.test(t)
  const softener = SOFTENER.test(t)
  const selfDeprecate = SELF_DEPRECATE.test(t)
  const len = t.length

  return {
    marks,
    irony,
    markPos,
    markStrong,
    markValence,
    exclaims,
    questions,
    negated,
    hasParticle,
    repeated,
    intensifier,
    softener,
    selfDeprecate,
    len,
    // 是否"表面客气里带刺"——反讽最典型的组合
    sarcasmLike: irony > 0 && (markPos > 0 || /厉害|行|可以|挺好|恭喜/.test(t)),
    // 2026-11-08 加：强反讽标记（doge/微笑/滑稽/藏狐/辣眼睛）本身就够翻正负，不必等夸赞词
    strongIrony: /\[(doge|狗头|微笑|滑稽|藏狐|辣眼睛)\]/i.test(t),
    // 去掉标记后没剩几个字 = 只有表情/纯符号，这种别给高置信度
    bareMark: t.replace(/\[[^\]]+\]/g, '').trim().length <= 1,
    // 重复否定（不不不 / 不不）= 抗拒，不是单纯的音量
    repeatedNegation: /(不|没|别)\1{1,}/.test(t),
    // 2026-11-08 加：不能用表情包也要认出来的反讽句式
    // "这也叫招牌""就这还吹""亏你说得出口"——这类没有 emoji，靠句式
    // 2026-11-08 外部反馈修：「就这?」只写了半角问号，中文里几乎都是全角「？」→ 之前漏判
    sarcasmPhrase: /(这也叫|这也算|这也配|就这还|就这[？?]|亏你|好意思|还真敢|也是绝了)/.test(t),
    // 2026-11-08 加：「什么」本身是疑问词（词表已改中性），但「什么鬼/什么玩意」是实打实的负面。
    // 这类情绪靠语境档表达，不该再让它污染「沈照野的邮箱是什么」这种事实问句。
    cursePhrase: /(什么鬼|什么玩意|搞什么|什么东西[？?！!]|什么破)/.test(t),
  }
}

export function describeFeatures(f) {
  const out = []
  if (f.marks.length) out.push('标记 ' + f.marks.join('/'))
  if (f.questions) out.push('反问/疑问')
  if (f.exclaims) out.push(`感叹×${f.exclaims}`)
  if (f.repeated) out.push('重复强调')
  if (f.intensifier) out.push('程度词')
  if (f.softener) out.push('留白词')
  if (f.negated) out.push('含否定')
  if (f.sarcasmLike) out.push('反讽特征')
  return out
}
