// 分句与聚合（2026-11-08）
//
// 问题：一句话里可能有两三个情绪单元（"味道不错，就是太咸了，下次不来了"）。
// 整句判会把它们平均掉。做法：按标点/连接词切成子句，逐句判，再按强度加权聚合。
import { judge } from './judge.js'

const SPLIT = /[，,。！？!?；;、\n]+/
// 转折后权重更高：但/不过/可是/然而 后面往往是真实态度
const TURN = /^(但|不过|可是|然而|就是|只是|可惜|问题|槽点)/

export function splitClauses(text) {
  const parts = String(text || '')
    .split(SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
  if (!parts.length) return [String(text || '').trim()].filter(Boolean)
  return parts
}

/**
 * 逐子句判定后聚合。
 * 规则：
 *   · 强度取「最强的那个子句」（人说话时最激烈的部分定调）
 *   · 正负按强度加权平均（避免一句话被一个弱子句拉偏）
 *   · 转折词开头的子句权重 ×1.6（"但…"往往是结论）
 */
export function judgeClauses(text, { lexicon } = {}) {
  const clauses = splitClauses(text)
  if (clauses.length <= 1) return { ...judge(text, { lexicon }), clauses: [] }

  const parts = clauses.map((c, i) => {
    const r = judge(c, { lexicon })
    const turn = TURN.test(c) && i > 0
    return { text: c, ...r, weight: (0.6 + r.intensity * 0.4) * (turn ? 1.6 : 1) }
  })
  const wsum = parts.reduce((s, p) => s + p.weight, 0) || 1
  // 2026-11-08 实测修正：正负不能加权平均——平均会把每句都往 0 拽。
  // 「味道不错，就是太咸了」的结论由**最重子句**决定（转折词权重高）。
  // 强度取最强子句，正负取「|正负|×权重」最大的那个子句，arousal 同样取最大。
  const dominant = parts.reduce((a, b) => (Math.abs(b.valence) * b.weight > Math.abs(a.valence) * a.weight ? b : a), parts[0])
  const valence = dominant.valence
  const intensity = Math.max(...parts.map((p) => p.intensity))
  const arousal = Math.max(...parts.map((p) => p.arousal))
  const strongest = parts.reduce((a, b) => (b.intensity > a.intensity ? b : a), parts[0])
  const hits = [...new Set(parts.flatMap((p) => p.hits))]
  // 子句方向一致 → 置信度略升；互相矛盾 → 略降
  const signs = parts.map((p) => Math.sign(p.valence)).filter((s) => s !== 0)
  const consistent = signs.length < 2 || signs.every((s) => s === signs[0])

  return {
    text: String(text || ''),
    intensity: Number(intensity.toFixed(2)),
    valence: Number(valence.toFixed(2)),
    arousal: Number(arousal.toFixed(2)),
    confidence: Number(Math.min(0.95, judge(text, { lexicon }).confidence + (consistent ? 0.05 : -0.05)).toFixed(2)),
    irony: parts.some((p) => p.irony),
    evidence: [...parts.flatMap((p) => p.evidence), `分句 ${parts.length} 段，最强子句「${strongest.text.slice(0, 10)}」`],
    features: parts.map((p) => p.features).flat(),
    hits,
    clauses: parts.map((p) => ({ text: p.text, intensity: p.intensity, valence: p.valence, weight: Number(p.weight.toFixed(2)) })),
  }
}
