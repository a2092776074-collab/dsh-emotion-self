// 情绪模块 · 统一入口（2026-11-08）
//
// 三件套：判定器 → 调制器 → 否决器
// 顺序很重要：**先判情绪 → 再调说法 → 最后过否决**。
// 否决必须放在最后：调制器可能改出新的违规说法。
import { judge, shouldAbstain } from './judge.js'
import { modulate } from './modulate.js'
import { veto } from './veto.js'

export { judge, shouldAbstain, modulate, veto }
export { judgeWithProsody, prosodyIntensity } from './prosody.js'
export { judgeWithModel } from './judge-model.js'
export { judgeAuto } from './judge-auto.js'
export { correct, lint } from './correct.js'
export { loadSelfState, applySelfState } from './self-state.js'
// 2026-11-08 加：关系熟悉度（按对象"越聊越开"）+ 前后文
export { getPeer, recordTurn, profileFor } from './relationship.js'
export { recentTurns, contextBlock, needContext } from './context.js'
export { judgeClauses, splitClauses } from './clauses.js'
import { judgeClauses as judgedClauses, splitClauses as splitCls } from './clauses.js'

const splitClausesCached = (t) => splitCls(t)

// 2026-11-08 加：带自我状态的判定（默认读 数据/情绪状态.json）
import { judge as _judgeBase } from './judge.js'
import { loadSelfState as _loadSelf, applySelfState as _applySelf } from './self-state.js'

export function judgeWithSelf(text, opts = {}) {
  const self = opts.self || _loadSelf()
  const base = _judgeBase(text, opts)
  return _applySelf(base, self)
}

/**
 * 一次完整处理。
 * @param {string} text 要处理的话
 * @param {object} opts
 *   - target: {intensity, valence} 目标档位（不给就不调）
 *   - applyModulation: 是否真的改文本（默认 false，只做判定+检查）
 */
export function process(text, opts = {}) {
  // 2026-11-08 加：多子句时同时算"分句聚合"，只用于解释（实测准确率不变）
  const clauses = splitClausesCached(text)
  const judged = clauses.length > 1 ? judgedClauses(text) : judge(text)
  const abstain = shouldAbstain(judged)
  const checked = veto(text)

  let modulated = null
  let final = text
  let finalChecked = checked

  if (opts.target && opts.applyModulation !== false) {
    // 关系档位顺带传给调制器（熟不熟决定收不收语气词/梗）
    modulated = modulate(text, { ...opts.target, relationship: opts.relationship })
    final = modulated.output
    finalChecked = veto(final)
  }

  // 被否决就用建议说法，再查一遍（不能出现"改完还是违规"）
  if (!finalChecked.ok) {
    const suggestion = finalChecked.suggestion || ''
    const recheck = veto(suggestion)
    final = recheck.ok ? suggestion : ''
    finalChecked = recheck
  }

  return {
    input: text,
    judge: judged,
    abstain,
    veto: checked,
    modulated,
    output: final,
    ok: finalChecked.ok && (modulated ? true : checked.ok),
    blocked: finalChecked.blocked,
    flags: finalChecked.flags,
  }
}
