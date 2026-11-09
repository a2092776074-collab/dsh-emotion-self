// 情绪模块 · 模型判定（可选增强，2026-11-08）
// 本地规则判不准（confidence < 0.4）时，才调模型。默认不调——离线也能跑。
// 两家一致才收；不一致就返回两家原始值并标 lowAgreement，交上层决定。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// 2026-11-08 加：支持上下文。带了上文时要提醒模型"以当前这句为准"，否则会把上文情绪算进来
const PROMPT = (t, ctx) =>
  ctx
    ? `下面是几句对话，请**只给最后那句（当前这句）**打情绪标签，前面只作上下文参考。
只输出一行 JSON：{"intensity":0-3,"valence":-1到1,"arousal":0-1}
不要解释。

${ctx}
当前这句：${t}`
    : `给下面这句话打情绪标签，只输出一行 JSON：
{"intensity":0-3 的整数,"valence":-1 到 1 的小数,"arousal":0 到 1 的小数}
不要解释。

句子：${t}`

// 2026-11-08 议会指出：评估脚本自己抄了一份 prompt，和生产的已经不一致了。
// 以后评估一律 import 这个，别再抄第二份。
export const buildPrompt = PROMPT

function keys() {
  try {
    const t = readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8')
    const g = (n) => (t.match(new RegExp(n + '\\s*[:=]\\s*([A-Za-z0-9_.\\-]{10,})')) || [])[1]
    return { deepseek: g('DEEPSEEK_API_KEY'), glm: g('ZHIPU_API_KEY') }
  } catch {
    return {}
  }
}

const PROVIDERS = [
  { name: 'deepseek', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  { name: 'glm', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
]

export async function judgeWithModel(text, { timeoutMs = 30000, context = '' } = {}) {
  const k = keys()
  const active = PROVIDERS.filter((p) => k[p.name])
  if (!active.length) return { ok: false, reason: '没有可用的模型 key', labels: {} }

  const labels = {}
  await Promise.all(
    active.map(async (p) => {
      try {
        const r = await fetch(p.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k[p.name] },
          body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: PROMPT(text, context) }], temperature: 0, max_tokens: 60 }),
          signal: AbortSignal.timeout(timeoutMs),
        })
        const j = await r.json()
        const c = j.choices?.[0]?.message?.content || ''
        const m = c.match(/\{[\s\S]*?\}/)
        if (!m) return
        const v = JSON.parse(m[0])
        const i = Number(v.intensity)
        const va = Number(v.valence)
        const ar = Number(v.arousal)
        if (![i, va, ar].every(Number.isFinite)) return
        labels[p.name] = {
          intensity: Math.max(0, Math.min(3, i)),
          valence: Math.max(-1, Math.min(1, va)),
          arousal: Math.max(0, Math.min(1, ar)),
        }
      } catch {}
    }),
  )

  const vals = Object.values(labels)
  if (!vals.length) return { ok: false, reason: '模型都没返回', labels: {} }
  const mean = (f) => vals.reduce((s, v) => s + v[f], 0) / vals.length
  const sameSign = vals.every((v) => Math.sign(v.valence) === Math.sign(vals[0].valence))
  const agree = vals.length === 1 || sameSign
  // 2026-11-08：正负不一致时**不取平均**——平均会把反讽抹成中性（这是之前就写下的原则）。
  // 只给强度/唤醒的均值，正负留 null，让上层决定要不要人工看。
  return {
    ok: true,
    labels,
    consensus: {
      intensity: Number(mean('intensity').toFixed(2)),
      valence: agree ? Number(mean('valence').toFixed(2)) : null,
      arousal: Number(mean('arousal').toFixed(2)),
      ambiguous: !agree,
    },
    models: Object.keys(labels),
  }
}
