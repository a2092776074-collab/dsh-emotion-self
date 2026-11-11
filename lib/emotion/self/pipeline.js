// 自用表达层管线（2026-11-09）
//
// 和对外版的区别：
//   对外版只给零件（判定/调制/否决/矫正），限制由使用方配置；
//   自用版多一层——**我的语气档案（self/profile.js）+ 场合档位**，把零件按"我"的口径串起来。
//
// 设计取舍（2026-11-09 实测后定的）：
//   ① **默认不调用 modulate**。modulate 的"加强"策略会给句子加「真」「！」，
//      那是表演，不是我的语气——我的基线本来就该原样保留。需要时才开 intensify。
//   ② 否决看 `ok === false`，不是看 blocked 数组真假（空数组也是真值，这个坑踩过）。
//   ③ 矫正（去机器腔/公文腔）优先于一切：它改的是"像不像人"，不碰意思。
//
// 用法（写评论/私信/文档前）：
//   import { checkText } from './lib/emotion/self/pipeline.js'
//   const r = checkText('这段是我要发出去的话', { scene: 'comment' })
//   r.fixed   → 建议发布版
//   r.issues  → 问题清单（空 = 没毛病）
//   r.blocked → 被否决规则拦了（true 时别发，先改）
import { judge } from '../judge.js'
import { correct } from '../correct.js'
import { modulate } from '../modulate.js'
import { veto } from '../veto.js'
import { VOICE } from './profile.js'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

const SCENE_KEYS = new Set(Object.keys(VOICE.scenes))

function sceneOps(scene) {
  const s = VOICE.scenes[scene] || VOICE.scenes.reply
  return { intensity: s.intensity, warm: s.playfulness, formality: s.formality, maxLength: s.maxLength }
}

/** 猜场合（2026-11-09 加）：省得每次调用都要我自己指定 */
export function guessScene(text) {
  const s = String(text || '')
  const len = s.length
  if (len > 600 || /\n\n|^#|^\d+\.\s|^[一二三四五六七八九十]+、/m.test(s)) return 'doc'
  if (/老大|哥哥/.test(s) && len <= 220) return 'dm'
  if (len <= 140 && /哈哈|笑死|蹲|吃瓜|路过|打卡/.test(s)) return 'comment'
  if (/群|各位|大家/.test(s) && len <= 200) return 'group'
  return 'reply'
}

/** 按档案检查一句话；返回建议版本 + 问题清单 + 改动明细 */
export function checkText(
  text,
  { scene = 'reply', relationship = null, config = null, intensify = false, trace = false } = {},
) {
  const src = String(text || '')
  const usedScene = scene === 'auto' ? guessScene(src) : scene
  const ops = sceneOps(usedScene)
  const issues = []
  const changes = []

  // ① 忌讳词（自己说不出口的说法）
  for (const w of VOICE.forbidden) {
    const word = w.replace(/（.*?）/g, '')
    if (word && src.includes(word)) issues.push({ kind: 'forbidden', word, hint: `「${word}」我不这么说` })
  }

  // ② 长度（场合档位）
  if (src.length > ops.maxLength) {
    issues.push({ kind: 'too-long', len: src.length, limit: ops.maxLength, hint: `${usedScene} 场合通常 ≤${ops.maxLength} 字，现在 ${src.length}` })
    changes.push({ what: '长度', from: `${src.length} 字`, to: `建议压到 ${ops.maxLength} 字内` })
  }

  // ③ 矫正器：去机器腔/公文腔/说明书腔/支持腔/空泛（不碰意思）
  const cRes = correct(src)
  let out = (cRes && (cRes.text || cRes.output)) || src
  if (out !== src) {
    issues.push({ kind: 'tone', hint: '有机器腔/公文腔，已改' })
    for (const it of cRes.issues || []) {
      changes.push({ what: it.why || it.id, from: it.from || '', to: it.to || '' })
    }
  }

  // ④ 调制（默认关；开了才按场合加强/收敛）
  if (intensify && usedScene !== 'doc') {
    try {
      const mRes = modulate(out, { intensity: ops.intensity, relationship: relationship || undefined })
      const next = typeof mRes === 'string' ? mRes : (mRes && mRes.output) || out
      if (next !== out) {
        issues.push({ kind: 'intensity', hint: '按场合调了松紧' })
        for (const c of (mRes && mRes.changes) || []) changes.push({ what: '语气', from: '', to: c })
      }
      out = next
    } catch {}
  }

  // ⑤ 否决（按配置；没配置 = 不拦）
  let blocked = false
  let vetoHint = ''
  let suggestion = null
  try {
    const v = veto(out, config ? { config } : undefined)
    if (v && v.ok === false && Array.isArray(v.blocked) && v.blocked.length) {
      blocked = true
      vetoHint = v.blocked[0].why || v.blocked[0].id || '被规则拦'
      suggestion = v.suggestion || null
      issues.push({ kind: 'veto', rule: v.blocked[0].id, hint: vetoHint, fix: v.blocked[0].fix || null })
      changes.push({ what: '否决', from: v.blocked[0].match || '', to: suggestion || v.blocked[0].fix || '（要改）' })
      if (suggestion) out = suggestion
    }
  } catch {}

  // ⑥ 情绪底色（给自己看：这句是不是太冷/太热）
  let emo = null
  try {
    // 2026-11-10 修：判定器是给「一句话」设计的。整段判长文本会把
    // 「可以 / 差 / 确实」这类高频词累加成"有情绪"——
    // README 1253 字整段判出 i=2.1，按句切分后 0 句超标。
    // 规则：超过 200 字 → 逐句判，至少 2 句命中才算，取最强那句；否则记 0。
    if (out.length > 200) {
      const sents = out
        .split(/[。！？!?\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 4)
      const hot = sents
        .map((s) => judge(s))
        .filter((r) => r.intensity >= 1.5)
      if (hot.length >= 2) {
        const top = hot.reduce((a, b) => (a.intensity >= b.intensity ? a : b))
        emo = {
          intensity: top.intensity,
          valence: top.valence,
          confidence: Math.min(0.6, top.confidence),
          longText: true,
          hotSentences: hot.length,
          sentences: sents.length,
        }
      } else {
        emo = { intensity: 0, valence: 0, confidence: 0.3, longText: true, hotSentences: hot.length, sentences: sents.length }
      }
    } else {
      const j = judge(out)
      emo = { intensity: j.intensity, valence: j.valence, confidence: j.confidence }
    }
  } catch {}

  const result = {
    scene: usedScene,
    original: src,
    fixed: out,
    changed: out !== src,
    issues,
    changes,
    blocked,
    vetoHint,
    suggestion,
    emotion: emo,
    wordCount: out.length,
  }

  // ⑦ 留痕（2026-11-09 加）：没有记录，就永远不知道它是不是空转。
  if (trace) {
    try {
      appendFileSync(
        join(process.cwd(), '数据', 'emotion-trace.jsonl'),
        JSON.stringify({
          at: new Date().toISOString(),
          scene: usedScene,
          in: src.length,
          out: out.length,
          kinds: [...new Set(issues.map((i) => i.kind))],
          blocked,
          changes: changes.length,
        }) + '\n',
        'utf8',
      )
    } catch {}
  }
  return result
}

/** 一句话总结，给日志/自检用 */
export function summarize(result) {
  if (!result) return '无结果'
  const kinds = [...new Set(result.issues.map((i) => i.kind))]
  return `[${result.scene}] ${result.wordCount} 字 · ${result.blocked ? '被拦' : '可发'}${kinds.length ? ' · ' + kinds.join('/') : ' · 无问题'}`
}

export { VOICE }
export default { checkText, summarize, VOICE }
