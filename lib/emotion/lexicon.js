// 情绪模块 · 词表加载（2026-11-08）
// 只读 数据/情绪基准-v2.json 里 state=validated 的词（多模型复核过的那批）。
// 未验证的词不进判定器——这是"地基要稳"的直接后果。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const V2 = join(ROOT, '数据', '情绪基准-v2.json')

let cache = null
let cacheAll = null

// 2026-11-08：判定器不只认 validated，也吃 model-labeled（双模型一致自动收的词），
// 但降权——人工确认过的比模型一致的可信。trust 会被判定器拿去当权重。
// model-mined 是"从没命中的句子里挖出来的"，证据更薄，权重再降一档。
// phrase 是外部反馈指出的"语义辖区"型短语（不太合适/差点意思），整条记、权重高。
const TRUST = { validated: 1.0, phrase: 0.9, 'model-labeled': 0.6, 'model-mined': 0.4 }

export function loadLexicon({ includeUnvalidated = false } = {}) {
  if (!includeUnvalidated && cache) return cache
  if (includeUnvalidated && cacheAll) return cacheAll
  const raw = JSON.parse(readFileSync(V2, 'utf8'))
  const words = (raw.words || [])
    .filter((w) => w.default && (includeUnvalidated || w.state in TRUST))
    .map((w) => ({
      w: w.w,
      default: w.default,
      contexts: w.contexts || [],
      state: w.state,
      trust: TRUST[w.state] ?? 0.5,
    }))
  if (includeUnvalidated) cacheAll = words
  else cache = words
  return words
}

// 2026-11-08 加（外部反馈修）：短词在常见搭配里不该单独算命中。
// 「差不多可以」「差点忘了」「好像」里的 差/行/好，逐字命中的话整句就判反了。
// 处理：先圈出这些搭配占用的区间，落在里面的短词命中一律丢弃。
const COMPOUND_GUARD = [
  '差不多', '差点', '差一点', '不差', '出差', '差异', '差别', '差距',
  '好像', '好几', '正好', '还好', '好事', '好久', '好家伙', '好友',
  '不行', '行不行', '行了吧', '不划算',
  '不好意思', '不得了', '了不起', '不得不',
  '差不多可以', '不太合适', '不太行', '也可以',
]

function guardSpans(text) {
  const spans = []
  for (const c of COMPOUND_GUARD) {
    let i = 0
    while (true) {
      const at = text.indexOf(c, i)
      if (at < 0) break
      spans.push([at, at + c.length])
      i = at + c.length
    }
  }
  return spans
}

// 最长匹配优先：避免「可以」吃掉「可以啊」、避免单字词乱命中
export function matchWords(text, lexicon = loadLexicon()) {
  const sorted = [...lexicon].sort((a, b) => b.w.length - a.w.length)
  const used = new Array(text.length).fill(false)
  const guarded = guardSpans(text)
  const inGuard = (i, len) => guarded.some(([s, e]) => i < e && i + len > s)
  const hits = []
  for (const entry of sorted) {
    let idx = 0
    while (true) {
      const i = text.indexOf(entry.w, idx)
      if (i < 0) break
      let free = true
      for (let k = i; k < i + entry.w.length; k++) if (used[k]) free = false
      // 短词（≤2 字）落在搭配里 → 不算命中；长词不受影响
      if (free && entry.w.length <= 2 && inGuard(i, entry.w.length)) free = false
      if (free) {
        for (let k = i; k < i + entry.w.length; k++) used[k] = true
        hits.push({ ...entry, at: i })
      }
      idx = i + entry.w.length
    }
  }
  return hits.sort((a, b) => a.at - b.at)
}
