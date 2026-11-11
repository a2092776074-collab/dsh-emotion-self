// 情绪模块 · 调制器（2026-11-08）
// 输入：一句话 + 目标档位；输出：改过的说法 + 改了什么。
//
// 只做"小幅、可解释"的改动——像人一样松紧一点，不做文案重写。
// 不碰代码块、数字、路径、URL。
import { judge } from './judge.js'

const SOFTENERS = ['啊', '啦', '嘛', '好像', '估计']
const INTENSIFIERS = ['真', '挺', '实在']

function protect(text) {
  // 把不该动的片段先摘出来
  const keep = []
  const masked = text.replace(/(```[\s\S]*?```|`[^`]+`|https?:\/\/\S+|[A-Za-z]:\\[^\s]+|\d+(\.\d+)?%?)/g, (m) => {
    keep.push(m)
    return `\u0000${keep.length - 1}\u0000`
  })
  return { masked, restore: (s) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]) }
}

export function modulate(text, target = {}) {
  const cur = judge(text)
  const wantI = target.intensity ?? cur.intensity
  const wantV = target.valence ?? cur.valence
  // 2026-11-08 加：关系档位。熟不熟决定"能多随便"：
  //   客气度高 → 不加语气词、不抖机灵；玩笑度低 → 不挂梗；话量低 → 不加料
  const rel = target.relationship || null
  const { masked, restore } = protect(String(text || ''))
  let s = masked
  const changes = []

  if (rel) {
    const formal = (rel.formality ?? 0.2) > 0.35
    const playful = (rel.playfulness ?? 0.3) > 0.3
    // 2026-11-08 修顺序：先摘梗标记，再收语气词。
    // 反过来的话「不错啊[doge]」里的「啊」因为后面跟着标记，匹配不到句尾。
    if (!playful) {
      const before = s
      s = s.replace(/\[(doge|狗头|滑稽|吃瓜)\]/gi, '')
      if (s !== before) changes.push('关系档位：不够熟，去掉梗标记')
    }
    if (formal) {
      const before = s
      s = s.replace(/(啊|啦|嘛|哦|呀|呗)(?=[。！？!?]?$)/g, '')
      if (s !== before) changes.push('关系档位：刚认识，收掉语气词尾巴')
    }
    // 2026-11-08 晚（老大说限制放开）：熟人反而要能"多给一点温度"。
    // 之前只会收，不会给——现在玩笑度够高、句子又没有语气词时，补一个。
    if (!formal && (rel.playfulness ?? 0) > 0.45 && wantI >= 1) {
      const bare = s.replace(/[。！？!?]+$/, '')
      // 「好吃吗」后面再挂「啊」就成了病句；问句/已有语气词的都不补
      if (!/[啊啦嘛哦呀呗呢吧吗么]$/.test(bare) && !/[？?]$/.test(s)) {
        // wantI 可能是小数（1.5），取整再取模，否则下标是浮点 → undefined
        const tail = ['啊', '啦', '嘛'][(bare.length + Math.round(wantI)) % 3]
        s = bare + tail
        changes.push(`关系档位：熟了，补个「${tail}」`)
      }
    }
  }


  // ── 降强度 ──
  if (wantI < cur.intensity - 0.4) {
    const before = s
    s = s.replace(/[！!]{1,}/g, '。')
    if (s !== before) changes.push('感叹号→句号')
    // 拆掉程度词
    for (const w of ['特别', '非常', '极其', '简直', '超级']) {
      if (s.includes(w)) {
        s = s.replace(w, '挺')
        changes.push(`「${w}」→「挺」`)
      }
    }
    // 句尾挂一个软化尾巴（一句话只挂一个）
    // 2026-11-08 修：「好吃吗」+「啊」= 病句。问句和已有语气词/疑问词结尾都不挂
    const stem = s.replace(/[。！？?]+$/, '')
    const isQuestion = /[？?]$/.test(s) || /[吗呢么]$/.test(stem)
    if (!isQuestion && !/[啊啦嘛哦呀呗呢吧]$/.test(stem)) {
      const tail = SOFTENERS[0]
      s = s.replace(/([。！？]?)$/, `${tail}$1`)
      changes.push(`句尾加「${tail}」`)
    }
  }

  // ── 升强度 ──
  if (wantI > cur.intensity + 0.4) {
    // 2026-11-08 修：原来用 /^(.{1,6})/ 替换成 "$1真"，实际是把「真」插到第 6 个字后面
    // （"还可以吧" → "还可以吧真"），既没加到句首也没加感叹号。改成直接拼接。
    if (!/[！!]/.test(s)) {
      s = /[。？]$/.test(s) ? s.replace(/[。？]$/, '！') : s + '！'
      changes.push('句末加强成感叹')
    }
    if (!/真|挺|实在/.test(s)) {
      s = '真' + s
      changes.push('句首加「真」')
    }
  }

  // ── 调正负 ──
  if (wantV > cur.valence + 0.3 && cur.valence < 0) {
    // 不做"强行变好"，只把过重的否定削一档
    if (/一点都不|根本|完全/.test(s)) {
      s = s.replace(/一点都不|根本|完全/g, '有点')
      changes.push('强否定→「有点」')
    }
  }

  const out = restore(s)
  const after = judge(out)
  return {
    input: String(text || ''),
    output: out,
    target: { intensity: wantI, valence: wantV },
    before: { intensity: cur.intensity, valence: cur.valence },
    after: { intensity: after.intensity, valence: after.valence },
    changes,
  }
}
