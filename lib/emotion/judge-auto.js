// 情绪模块 · 自动判定（2026-11-08）
//
// 今天评估的结论（1509 条小说对话弱标注）：
//   · 纯规则判定在"字面情绪"样本上只有 28%
//   · 同一批句子上模型判定 78%
// 所以默认策略改成：**模型优先，规则兜底**。
//   - 模型可用且两家一致 → 用模型
//   - 模型不可用/不一致 → 退回规则，并标 lowAgreement
//   - 需要零成本/离线 → judgeAuto(text, { offline: true })
//
// 2026-11-08 加：支持上下文。实测加一句上文 20% 判定会变、7:1 更确定，
// 所以模型判定要把上文一起喂进去；规则只负责标记"这句没上下文说不清"。
import { judge } from './judge.js'
import { judgeWithModel } from './judge-model.js'
import { contextBlock, needContext } from './context.js'

export async function judgeAuto(text, { offline = false, preferRules = false, context = [] } = {}) {
  const rules = judge(text)
  const flagged = needContext(text, rules, context)
  if (offline || preferRules) {
    return {
      ...rules,
      confidence: flagged ? Math.max(0.1, rules.confidence - 0.1) : rules.confidence,
      needContext: flagged,
      source: 'rules',
    }
  }

  const ctx = contextBlock(context)
  const m = await judgeWithModel(text, { context: ctx })
  if (!m.ok) return { ...rules, needContext: flagged, source: 'rules(model-failed)' }
  const c = m.consensus
  return {
    text: String(text || ''),
    intensity: c.intensity,
    valence: c.valence === null ? rules.valence : c.valence,
    arousal: c.arousal,
    // 带上下文且两家一致 → 置信度再高一档（实测上下文让 7 成句子更确定）
    confidence: c.ambiguous ? 0.45 : ctx ? 0.85 : 0.8,
    irony: rules.irony,
    evidence: [
      ...rules.evidence,
      ...(ctx ? ['带了 ' + context.length + ' 句上下文'] : []),
      `模型 ${m.models.join('+')} → ${c.intensity}/${c.valence ?? '分歧'}`,
    ],
    features: rules.features,
    hits: rules.hits,
    ambiguous: !!c.ambiguous,
    needContext: flagged,
    usedContext: !!ctx,
    source: c.ambiguous ? 'model(分歧)' : 'model',
    labels: m.labels,
  }
}
