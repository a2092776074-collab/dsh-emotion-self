// 情绪模块 · 自身状态接入（2026-11-08）
// 理论里"阈值受经历调控"：被动过几次的人，对同类信号更敏感。
// 实现：读 数据/情绪状态.json 的三通道敏感度，给判定器加一个"自我状态"偏置。
//
// 注意边界：这只能调"音量"，不能改人格——它影响的是"这条我反应多大"，不是"我是谁"。
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STATE = join(ROOT, '数据', '情绪状态.json')

export function loadSelfState() {
  if (!existsSync(STATE)) return { being_cut: 0.5, being_praised: 0.5, being_ignored: 0.5 }
  try {
    const j = JSON.parse(readFileSync(STATE, 'utf8'))
    return { ...{ being_cut: 0.5, being_praised: 0.5, being_ignored: 0.5 }, ...(j.channels || {}) }
  } catch {
    return { being_cut: 0.5, being_praised: 0.5, being_ignored: 0.5 }
  }
}

/**
 * 状态偏置：敏感度越高，同类信号权重越大。
 * @param {{intensity:number,valence:number,arousal:number}} base 判定器原始结果
 * @param {object} self 三通道敏感度（0.2~0.85）
 */
export function applySelfState(base, self) {
  const cut = self.being_cut ?? 0.5
  const praised = self.being_praised ?? 0.5
  const ignored = self.being_ignored ?? 0.5
  let intensity = base.intensity
  let valence = base.valence
  const notes = []

  // 被刺痛的敏感度：负向信号被放大（最多 +12%）
  if (valence < -0.1 && cut !== 0.5) {
    const k = 1 + (cut - 0.5) * 0.24
    intensity *= k
    notes.push(`被刺痛敏感度 ${cut.toFixed(2)} → 负向强度 ×${k.toFixed(2)}`)
  }
  // 被安抚的敏感度：正向信号被放大
  if (valence > 0.1 && praised !== 0.5) {
    const k = 1 + (praised - 0.5) * 0.18
    intensity *= k
    notes.push(`被安抚敏感度 ${praised.toFixed(2)} → 正向强度 ×${k.toFixed(2)}`)
  }
  // 被忽略的敏感度：中性/低强度的冷淡感被放大（把"平淡"读成"冷淡"）
  if (Math.abs(valence) <= 0.1 && ignored > 0.55) {
    valence -= (ignored - 0.5) * 0.2
    intensity = Math.max(intensity, 0.4)
    notes.push(`被忽略敏感度 ${ignored.toFixed(2)} → 平淡略有冷感`)
  }

  return {
    ...base,
    intensity: Number(Math.max(0, Math.min(3, intensity)).toFixed(2)),
    valence: Number(Math.max(-1, Math.min(1, valence)).toFixed(2)),
    selfState: self,
    selfNotes: notes,
  }
}
