// 情绪模块 · 判定器（2026-11-08）
// 输入：一句话（可选上下文）。输出：{intensity, valence, arousal, confidence, evidence}
//
// 三层，按顺序叠加：
//   1) 词表命中（只认 validated 的词，取词本身的固有倾向）
//   2) 表层特征（表情包/反问/感叹/重复/程度词/留白词）调档
//   3) 反讽判定（标记 + 夸赞词 同现 → 正负翻转）
//
// 设计原则：宁漏不误。判不准就给低 confidence，让上层决定要不要问。
import { loadLexicon, matchWords } from './lexicon.js'
import { extractFeatures, describeFeatures } from './features.js'

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

export function judge(text, { lexicon } = {}) {
  const lex = lexicon || loadLexicon()
  const t = String(text || '').trim()
  const feats = extractFeatures(t)
  const hits = matchWords(t, lex)
  const evidence = []

  // ── 1) 词表基线 ──
  let intensity = 0
  let valence = 0
  let arousal = 0
  let weight = 0
  // 2026-11-08 加：同一个词重复出现只算一次。
  // 反例：「[吃瓜][吃瓜][吃瓜]」被当成命中三次，把强度/置信度都顶上去了。
  const seenWord = new Set()
  for (const h of hits) {
    if (seenWord.has(h.w)) continue
    seenWord.add(h.w)
    // 越靠前的词权重略高；长词权重更高（"不好意思"比"好"信息量大）
    // trust：人工标注/复核过的词权重满，模型一致自动收的降权（0.6）
    const w = (1 + Math.min(1, h.w.length * 0.25)) * (h.trust ?? 1)
    intensity += h.default.intensity * w
    valence += h.default.valence * w
    arousal += h.default.arousal * w
    weight += w
    evidence.push(`词「${h.w}」→ ${h.default.intensity}/${h.default.valence}`)
  }
  if (weight > 0) {
    intensity /= weight
    valence /= weight
    arousal /= weight
  }

  // ── 2) 表层特征调档 ──
  if (feats.exclaims) {
    intensity += Math.min(1, feats.exclaims * 0.3)
    arousal += Math.min(0.4, feats.exclaims * 0.15)
    evidence.push(`感叹号 ×${feats.exclaims}`)
  }
  if (feats.questions) {
    intensity += 0.2
    arousal += 0.1
    evidence.push('疑问/反问')
  }
  if (feats.repeated) {
    intensity += 0.4
    arousal += 0.2
    evidence.push('重复强调')
  }
  if (feats.intensifier) {
    intensity += 0.4
    evidence.push('程度词')
  }
  if (feats.softener) {
    intensity -= 0.3
    evidence.push('留白词（压低断言）')
  }
  intensity += feats.markStrong * 0.5
  valence += feats.markPos * 0.3
  valence += feats.markValence
  if (feats.marks.length) evidence.push('标记：' + feats.marks.join('/'))
  // 2026-11-08 加：「什么鬼/什么玩意」这种骂句，靠语境词给负面（「什么」本身已改中性）
  if (feats.cursePhrase) {
    valence = Math.min(valence, -0.5)
    intensity = Math.max(intensity, 1.8)
    evidence.push('骂句短语')
  }

  // ── 3) 反讽：表面夸 + 阴阳标记 → 正负翻转 ──
  let ironyFlip = false
  if (feats.sarcasmLike) {
    ironyFlip = true
    valence = -Math.abs(valence) - feats.irony * 0.4
    intensity = Math.max(intensity, 1.2)
    evidence.push('反讽：先按夸，再翻成负')
  } else if (feats.strongIrony && valence > 0.15) {
    // 2026-11-08 加：doge/微笑/滑稽 这类标记本身就够翻，
    // 不用等"厉害/可以"这种夸赞词同现（"好吃[doge]"之前被漏掉了）
    ironyFlip = true
    valence = -Math.abs(valence) * 0.8 - 0.25
    intensity = Math.max(intensity, 1.2)
    evidence.push('强反讽标记：正负翻转')
  }

  // 2026-11-08 加：重复否定（不不不）是抗拒，不是音量
  if (feats.repeatedNegation) {
    valence -= 0.25
    intensity += 0.3
    evidence.push('重复否定（抗拒）')
  }

  // 2026-11-08 加：[吃瓜] 是弱反讽——看热闹式的调侃，削正不翻负
  if (feats.marks.includes('chigua') && valence > 0.2) {
    valence -= 0.35
    intensity += 0.2
    evidence.push('[吃瓜]：看热闹式调侃，削正')
  }

  // 2026-11-08 加：反讽句式（没有表情包也能认）
  // "笑死 这也叫招牌" → 之前判 0/0，现在必须判负
  if (feats.sarcasmPhrase) {
    ironyFlip = true
    valence = -Math.max(Math.abs(valence), 0.35)
    intensity = Math.max(intensity, 1.2)
    evidence.push('反讽句式（这也叫/就这还…）')
  }

  // ── 收尾 ──
  intensity = clamp(intensity, 0, 3)
  valence = clamp(valence, -1, 1)
  arousal = clamp(arousal, 0, 1)

  // 置信度：命中越多越自信；反讽和否定会降（这类最容易判错）
  let confidence = 0.35
  confidence += Math.min(0.4, hits.length * 0.12)
  confidence += feats.marks.length ? 0.1 : 0
  if (feats.sarcasmLike) confidence -= 0.2
  if (feats.negated) confidence -= 0.1
  if (!hits.length && !feats.marks.length) confidence = Math.min(confidence, 0.3)
  // 2026-11-08 加：只有表情/单字时不该自信（" [微笑] "之前给了 0.57）
  if (feats.bareMark) {
    confidence = Math.min(confidence, 0.35)
    intensity = Math.min(intensity, 1.2)
  }
  confidence = clamp(Number(confidence.toFixed(2)), 0.05, 0.95)

  return {
    text: t,
    intensity: Number(intensity.toFixed(2)),
    valence: Number(valence.toFixed(2)),
    arousal: Number(arousal.toFixed(2)),
    confidence,
    irony: ironyFlip,
    evidence,
    features: describeFeatures(feats),
    hits: hits.map((h) => h.w),
  }
}

// 给上层用的"要不要表态"判断：不清楚就别装懂
export function shouldAbstain(res, { minConfidence = 0.4, minIntensity = 0.8 } = {}) {
  if (res.confidence < minConfidence) return { abstain: true, why: '置信度低' }
  if (res.intensity < minIntensity) return { abstain: true, why: '情绪强度低，不值得专门回应' }
  return { abstain: false, why: '' }
}
