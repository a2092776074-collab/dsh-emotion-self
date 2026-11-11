// 情绪模块 · 韵律接入（2026-11-08）
// 把音频侧的特征折算成一个「强度提示」，喂给判定器。
//
// 依据今天的实验：
//   · f0_mean 不能当情绪特征（音色间/文本间方差比 978，它测的是"谁在说"）
//   · f0_iqr / energy_sd 才是"表现力"的代理
//   · 跨演播者必须先按说话人基线 z-score
import { judge } from './judge.js'

/**
 * 把一次韵律测量折算成 0~1 的强度提示。
 * @param {{f0_iqr:number, energy_sd:number}} p 本次测量
 * @param {{f0_iqr:number, energy_sd:number}} baseline 该演播者的基线（均值）
 */
export function prosodyIntensity(p, baseline) {
  const z = (x, b, scale) => {
    if (!Number.isFinite(x) || !Number.isFinite(b) || !b) return 0
    return (x - b) / (scale || b * 0.3 || 1)
  }
  const zi = z(p.f0_iqr, baseline.f0_iqr)
  const ze = z(p.energy_sd, baseline.energy_sd)
  const raw = (zi + ze) / 2 // 大致在 -2..2
  return Math.max(0, Math.min(1, (raw + 1) / 2))
}

/**
 * 文本 + 韵律联合判定。
 * 文本判定为准，韵律只在"文本判不准"时加权——避免把"这人嗓门大"误当"这句情绪强"。
 */
export function judgeWithProsody(text, prosody, baseline, { weight = 0.35 } = {}) {
  const t = judge(text)
  if (!prosody || !baseline) return { ...t, source: 'text-only' }
  const hint = prosodyIntensity(prosody, baseline)
  const conf = t.confidence
  // 文本越不确定，越信韵律
  const w = weight * (1 - conf)
  const intensity = Math.max(0, Math.min(3, t.intensity * (1 - w) + hint * 3 * w))
  const arousal = Math.max(0, Math.min(1, t.arousal * (1 - w) + hint * w))
  return {
    ...t,
    intensity: Number(intensity.toFixed(2)),
    arousal: Number(arousal.toFixed(2)),
    prosodyHint: Number(hint.toFixed(2)),
    prosodyWeight: Number(w.toFixed(2)),
    source: 'text+prosody',
    evidence: [...t.evidence, `韵律提示 ${hint.toFixed(2)}（权重 ${w.toFixed(2)}）`],
  }
}
